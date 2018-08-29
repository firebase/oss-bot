import * as functions from "firebase-functions";
import { database } from "./database";
import * as github from "./github";
import { format } from "date-fns";

const gh_client = new github.GithubClient(functions.config().github.token);
gh_client.auth();

export async function GetOrganizationSnapshot(org: string) {
  let res = await gh_client.api.orgs.get({
    org
  });

  const orgData = scrubObject(res.data, ["owner", "organization", "url"]);
  const fullReposData: { [s: string]: any } = {};

  for (let p = 1; p <= 2; p++) {
    res = await gh_client.api.repos.getForOrg({
      org,
      per_page: 1000,
      page: p
    });

    const reposData = scrubArray(res.data, ["owner", "organization", "url"]);

    for (const key in reposData) {
      await delay(0.5);
      const repoData = reposData[key];
      const fullRepoData = await GetRepoSnapshot(org, repoData.name, repoData);

      const cleanName = cleanRepoName(fullRepoData.name);
      fullReposData[cleanName] = fullRepoData;
    }
  }

  orgData.repos = fullReposData;
  return orgData;
}

async function GetRepoSnapshot(owner: string, repo: string, repoData?: any) {
  let res;

  if (!repoData) {
    res = await gh_client.api.repos.get({
      owner: "firebase",
      repo: "oss-bot"
    });
    repoData = res.data;
    repoData = scrubObject(repoData, ["owner", "organization", "url"]);
  }

  repoData.closed_issues_count = 0;
  repoData.closed_pull_requests_count = 0;

  let pagesRemaining = true;
  let page = 0;

  const keyed_issues: { [s: string]: any } = {};
  while (pagesRemaining) {
    page += 1;
    res = await gh_client.api.issues.getForRepo({
      owner,
      repo,
      state: "all",
      per_page: 100,
      page
    });

    let issuesData = res.data;
    issuesData = scrubArray(issuesData, ["organization", "url"]);

    issuesData.forEach((issue: any) => {
      issue.user = scrubObject(issue.user, ["url"]);
      issue.pull_request = !!issue.pull_request;

      if (issue.state !== "open") {
        if (!issue.pull_request) repoData.closed_issues_count += 1;
        else repoData.closed_pull_requests_count += 1;
      } else {
        keyed_issues["id_" + issue.number] = issue;
      }
    });
    await delay(0.5);

    pagesRemaining = issuesData.length == 100;
  }

  repoData.issues = keyed_issues;

  return repoData;
}

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

async function delay(seconds: number) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export const SaveOrganizationSnapshot = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
  })
  .pubsub.topic("cleanup")
  .onPublish(async event => {
    const snapshot = await GetOrganizationSnapshot("firebase");
    return database
      .ref("snapshots/github")
      .child(format(new Date(), "YY-MM-DD"))
      .set(snapshot);
  });
