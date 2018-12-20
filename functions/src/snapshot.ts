import * as functions from "firebase-functions";
import { database } from "./database";
import * as github from "./github";
import * as util from "./util";
import { snapshot } from "./types";

const gh_client = new github.GithubClient(functions.config().github.token);
gh_client.auth();

function cleanRepoName(name: string): string {
  let cleanName = name.toLowerCase();
  cleanName = cleanName.replace(".", "_");

  return cleanName;
}

function scrubArray(obj: any[], fieldsToScrub: string[]) {
  return obj.map((item: any) => {
    return scrubObject(item, fieldsToScrub);
  });
}

function scrubObject(obj: any, fieldsToScrub: string[]) {
  Object.keys(obj)
    .filter(key => {
      const isValid = fieldsToScrub.filter(fieldMatch => {
        return key.match(new RegExp(fieldMatch));
      });

      return isValid.length;
    })
    .forEach(key => {
      delete obj[key];
    });

  return obj;
}

function DateSnapshotPath(date: Date) {
  return `/snapshots/github/${util.DateSlug(date)}`;
}

function RepoSnapshotPath(repo: string, date: Date) {
  return `${DateSnapshotPath(date)}/repos/${repo}`;
}

export async function GetOrganizationSnapshot(org: string) {
  const getOrgRes = await gh_client.getOrg(org);

  const orgData = scrubObject(getOrgRes.data, ["owner", "organization", "url"]);
  const fullReposData: { [s: string]: any } = {};

  let reposData = await gh_client.getReposInOrg(org);

  reposData = scrubArray(reposData, ["owner", "organization", "url"]);

  for (const key in reposData) {
    await util.delay(0.5);
    const repoData = reposData[key];

    // TODO: Can I build this into the function somehow?
    util.startTimer("GetRepoSnapshot");
    const fullRepoData = await GetRepoSnapshot(org, repoData.name, repoData);
    util.endTimer("GetRepoSnapshot");

    const cleanName = cleanRepoName(fullRepoData.name);
    fullReposData[cleanName] = fullRepoData;
  }

  orgData.repos = fullReposData;
  return orgData;
}

export async function GetRepoSnapshot(
  owner: string,
  repo: string,
  repoData: any
) {
  if (!repoData) {
    console.warn(`GetRepoSnapshot called with null data for ${owner}/${repo}`);
    repoData = {};
  }

  repoData.closed_issues_count = 0;
  repoData.closed_pull_requests_count = 0;

  const keyed_issues: { [s: string]: any } = {};
  let issuesData = await gh_client.getIssuesForRepo(owner, repo);

  issuesData = scrubArray(issuesData, ["organization", "url"]);

  issuesData.forEach((issue: any) => {
    issue.user = scrubObject(issue.user, ["url"]);
    issue.pull_request = !!issue.pull_request;

    if (issue.state !== "open") {
      if (!issue.pull_request) {
        repoData.closed_issues_count += 1;
      } else {
        repoData.closed_pull_requests_count += 1;
      }
    } else {
      keyed_issues["id_" + issue.number] = issue;
    }
  });

  repoData.issues = keyed_issues;

  return repoData;
}

/**
 * Get the snapshot for a repo on a specific Date.
 */
export async function FetchRepoSnapshot(
  repo: string,
  date: Date
): Promise<snapshot.Repo | undefined> {
  const path = RepoSnapshotPath(repo, date);
  const snap = await database.ref(path).once("value");
  return snap.val();
}

export const SaveOrganizationSnapshot = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.topic("cleanup")
  .onPublish(async event => {
    const snapshot = await GetOrganizationSnapshot("firebase");
    return database.ref(DateSnapshotPath(new Date())).set(snapshot);
  });
