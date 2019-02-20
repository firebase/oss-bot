import * as functions from "firebase-functions";
import { database } from "./database";
import * as github from "./github";
import * as util from "./util";
import { snapshot } from "./types";
import * as config from "./config";

const gh_client = new github.GithubClient(
  config.getFunctionsConfig("github.token")
);
gh_client.auth();

// Just #pubsubthings
const PubSub = require("@google-cloud/pubsub");
const pubsubClient = new PubSub({
  projectId: process.env.GCLOUD_PROJECT
});

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

function OrgSnapshotPath(org: string) {
  if (org === "firebase") {
    return "/snapshots/github";
  }

  return `/snapshots/${org}`;
}

function DateSnapshotPath(org: string, date: Date) {
  return `${OrgSnapshotPath(org)}/${util.DateSlug(date)}`;
}

function RepoSnapshotPath(org: string, repo: string, date: Date) {
  return `${DateSnapshotPath(org, date)}/repos/${repo}`;
}

/**
 * Get a point-in-time snapshot of a GitHub org.
 *
 * Must be followed up by a job to snap each repo.
 */
export async function GetOrganizationSnapshot(org: string) {
  // Get basic data about the org
  const orgRes = await gh_client.getOrg(org);
  const orgData = scrubObject(orgRes.data, ["owner", "organization", "url"]);

  // Fill in repos data
  const repos: { [s: string]: any } = {};
  let reposData: any[] = await gh_client.getReposInOrg(org);
  reposData = scrubArray(reposData, ["owner", "organization", "url"]);

  for (const key in reposData) {
    const repoData = reposData[key];
    const cleanName = cleanRepoName(repoData.name);
    repos[cleanName] = repoData;
  }

  orgData.repos = repos;
  return orgData;
}

/**
 * Get a point-in-time snapshot for a Github repo.
 *
 * repoData is the base data retrieved by GetOrganizationSnapshot.
 * Yes, I know this is ugly.
 */
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
  org: string,
  repo: string,
  date: Date
): Promise<snapshot.Repo | undefined> {
  const path = RepoSnapshotPath(org, repo, date);
  const snap = await database.ref(path).once("value");
  const data = snap.val();
  return data;
}

export const SaveRepoSnapshot = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.topic("repo_snapshot")
  .onPublish(async event => {
    // TODO: Enable retry, using retry best practices
    const data = event.json;
    const org = data.org;

    const repoName = data.repo;
    const repoKey = cleanRepoName(repoName);

    if (!(org && repoName)) {
      console.log(
        `PubSub message must include 'org' and 'repo': ${event.data}`
      );
    }

    console.log(`SaveRepoSnapshot(${org}/${repoName})`);
    const orgRef = database.ref(DateSnapshotPath(org, new Date()));
    const repoSnapRef = orgRef.child("repos").child(repoKey);

    // Get the "base" data that was retriebed during the org snapshot
    const baseRepoData = (await repoSnapRef.once("value")).val();
    if (!baseRepoData) {
      console.warn(`Couldn't get base repo data for ${org}/${repoName}.`);
    }

    // Store the repo snapshot under the proper path
    util.startTimer("GetRepoSnapshot");
    const fullRepoData = await GetRepoSnapshot(org, repoName, baseRepoData);
    util.endTimer("GetRepoSnapshot");
    await repoSnapRef.set(fullRepoData);

    // Store non-date-specific repo metadata
    // TODO: This should probably be broken out into a function like GetRepoSnapshot
    //       and then only saved/timed here.
    const repoMetaRef = database
      .ref("repo-metadata")
      .child(org)
      .child(repoKey);

    // Store collaborators as a map of name --> true
    const collabNames = await gh_client.getCollaboratorsForRepo(org, repoName);
    const collabMap: { [s: string]: boolean } = {};
    collabNames.forEach((name: string) => {
      collabMap[name] = true;
    });

    await repoMetaRef.child("collaborators").set(collabMap);
  });

export const SaveOrganizationSnapshot = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.topic("cleanup")
  .onPublish(async event => {
    // TODO: Make this a parameter
    const org = "firebase";

    const snapshot = await GetOrganizationSnapshot(org);
    await database.ref(DateSnapshotPath(org, new Date())).set(snapshot);

    const repos = Object.keys(snapshot.repos);
    for (const repoKey of repos) {
      util.delay(1.0);

      const repoName = snapshot.repos[repoKey].name;

      // Fan out for each repo
      const publisher = pubsubClient.topic("repo_snapshot").publisher();
      const data = {
        org: "firebase",
        repo: repoName
      };
      console.log(JSON.stringify(data));
      await publisher.publish(Buffer.from(JSON.stringify(data)));
    }
  });
