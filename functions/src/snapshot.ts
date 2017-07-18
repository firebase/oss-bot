import * as functions from "firebase-functions";
import * as github from "./github";
import { format } from "date-fns";

const gh_client = new github.GithubClient(functions.config().github.token);

export async function GetOrganizationSnapshot(org: string) {
  let res = await gh_client.api.orgs.get({
    org
  });

  const orgData = res.data;

  res = await gh_client.api.repos.getForOrg({
    org
  });

  const reposData = scrubArray(res.data, ["owner", "organization", "url"]);
  const fullReposData = [];

  for (const key in reposData) {
    await delay(3);
    const repoData = reposData[key];
    const fullRepoData = await GetRepoSnapshot(org, repoData.name, repoData);
    fullReposData.push(fullRepoData);
  }

  orgData.repos = reposData;
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

  issuesData.forEach((entry: any) => {
    entry.user = scrubObject(entry.user, ["url"]);
  });

  repoData.issues = issuesData;

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
