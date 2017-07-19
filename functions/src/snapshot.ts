import * as functions from "firebase-functions";
import * as firebase_admin from "firebase-admin";
import * as github from "./github";
import { format } from "date-fns";

const gh_client = new github.GithubClient(functions.config().github.token);
gh_client.auth();

const admin = firebase_admin.initializeApp(functions.config().firebase);

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
      await delay(1);
      const repoData = reposData[key];
      const fullRepoData = await GetRepoSnapshot(org, repoData.name, repoData);
      fullReposData[fullRepoData.name.toLowerCase()] = fullRepoData;
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

  res = await gh_client.api.issues.getForRepo({
    owner,
    repo
  });

  let issuesData = res.data;
  issuesData = scrubArray(issuesData, ["organization", "url"]);
  const keyed_issues: { [s: string]: any } = {};

  issuesData.forEach((issue: any) => {
    issue.user = scrubObject(issue.user, ["url"]);
    issue.pull_request = !!issue.pull_request;
    keyed_issues["id_" + issue.number] = issue;
  });

  repoData.issues = keyed_issues;

  return repoData;
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

export const SaveOrganizationSnapshot = functions.pubsub
  .topic("cleanup")
  .onPublish(async event => {
    const snapshot = await GetOrganizationSnapshot("firebase");
    return admin
      .database()
      .ref("snapshots/github")
      .child(format(new Date(), "YY-MM-DD"))
      .set(snapshot);
  });
