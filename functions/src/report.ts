import * as functions from "firebase-functions";
import { database } from "./database";
import { format } from "date-fns";
import * as mustache from "mustache";
import { readFileSync } from "fs";
import * as path from "path";

const snapshotsRef = database.ref("snapshots/github");
const reportsRef = database.ref("reports/github");

export async function GetWeeklyReport(org: string) {
  // Grab daily snapshots
  const weeklyEntriesSnapshot = await snapshotsRef.limitToLast(7).once("value");
  const weeklyEntries = weeklyEntriesSnapshot.val();

  // Grab previous week's report
  const previousReportSnapshot = await reportsRef.limitToLast(1).once("value");
  const previousReport = previousReportSnapshot.val();

  const recentEntry = weeklyEntries[Object.keys(weeklyEntries)[6]];
  const topSAMs = GetTopSam(recentEntry.repos);
  const topStars = GetTopStars(recentEntry.repos);
  const topIssues = GetTopIssues(recentEntry.repos);

  const totalOpenPullRequests = GetTotalOpenPullRequests(recentEntry);
  const totalOpenIssues = GetTotalOpenIssues(recentEntry);
  const totalOpenIssuesWithNoComments = GetTotalOpenIssuesWithNoComments(
    recentEntry
  );

  const totalStars = GetTotalStars(recentEntry);

  const totalPublicRepos = recentEntry.public_repos;
  const averageIssuesPerRepo = Math.floor(totalOpenIssues / totalPublicRepos);

  return {
    topSAMs,
    topStars,
    topIssues,
    totalOpenIssues,
    totalOpenIssuesWithNoComments,
    totalOpenPullRequests,
    totalPublicRepos,
    totalStars,
    averageIssuesPerRepo
  };
}

function GetTotalOpenIssues(snapshot: any) {
  if (!snapshot) return 0;

  return GetIssuesWithFilter(snapshot.repos, (issue: any) => {
    return !issue.pull_request;
  });
}

function GetTotalStars(snapshot: any) {
  if (!snapshot) return 0;

  return Object.keys(snapshot.repos).reduce((sum, key) => {
    return sum + snapshot.repos[key].stargazers_count;
  }, 0);
}

function GetIssuesWithFilter(repos: { [s: string]: any }, filter: Function) {
  let matchingIssues = 0;

  Object.keys(repos).forEach(repoName => {
    const repo = repos[repoName];

    if (repo.private) return;

    matchingIssues += Object.keys(
      repo.issues || {}
    ).reduce((sum, issue_id: string) => {
      const issue = repo.issues[issue_id];

      if (filter(issue)) return sum + 1;
      else return sum;
    }, 0);
  });

  return matchingIssues;
}

function GetTotalOpenIssuesWithNoComments(snapshot: any) {
  if (!snapshot) return 0;

  return GetIssuesWithFilter(snapshot.repos, (issue: any) => {
    return !issue.pull_request && !issue.comments;
  });
}

function GetTotalOpenPullRequests(snapshot: any) {
  if (!snapshot) return 0;

  return GetIssuesWithFilter(snapshot.repos, (issue: any) => {
    return issue.pull_request;
  });
}

function GetRepoSAM(repo: any) {
  const open_issues = repo.open_issues_count || 0;
  const closed_issues = repo.closed_issues_count || 0;

  if (!closed_issues) return 0;

  return (
    open_issues /
    (open_issues + closed_issues) *
    Math.log(Math.E + open_issues + closed_issues)
  );
}

function GetTopSam(repos: { [s: string]: any }, count?: number) {
  let topSAM = Object.keys(repos)
    .map((repoName: string) => {
      const repo = repos[repoName];
      const sam = GetRepoSAM(repo);
      return { name: repoName, sam };
    })
    .sort((a, b) => {
      return b.sam - a.sam;
    });

  if (count) topSAM = topSAM.slice(0, count);
  return topSAM;
}

function GetTopStars(repos: { [s: string]: any }, count?: number) {
  let topStars = Object.keys(repos)
    .map((repoName: string) => {
      const repo = repos[repoName];
      const stars = repo.stargazers_count;
      return { name: repoName, stars };
    })
    .sort((a, b) => {
      return b.stars - a.stars;
    });

  if (count) topStars = topStars.slice(0, count);
  return topStars;
}

function GetTopIssues(repos: { [s: string]: any }, count?: number) {
  let topIssues = Object.keys(repos)
    .map((repoName: string) => {
      const repo = repos[repoName];
      const issues = repo.open_issues_count;
      return { name: repoName, issues };
    })
    .sort((a, b) => {
      return b.issues - a.issues;
    });

  if (count) topIssues = topIssues.slice(0, count);
  return topIssues;
}

export const SaveWeeklyReport = functions.pubsub
  .topic("save_weekly_report")
  .onPublish(async event => {
    const now = new Date();

    if (now.getDay() != 4) return;
    const report = await GetWeeklyReport("firebase");
    return database
      .ref("reports/github")
      .child(format(now, "YY-MM-DD"))
      .set(report);
  });

export async function GetWeeklyEmail(org: string) {
  const reportSnapshot = await database
    .ref("reports/github")
    .limitToLast(1)
    .once("child_added");
  const report = reportSnapshot.val();

  const previousReportSnapshot = await database
    .ref("reports/github")
    .limitToLast(2)
    .once("child_added");
  const previousReport = previousReportSnapshot.val();

  Object.keys(report).forEach(key => {
    if (typeof report[key] !== "number") return;
    const keyDiff = `${key}Diff`;

    report[keyDiff] = report[key] - previousReport[key];

    if (report[keyDiff] >= 0) report[keyDiff] = `+${report[keyDiff]}`;
  });

  report.topSAMs = report.topSAMs.slice(0, 10);
  report.topStars = report.topStars.slice(0, 5);
  report.topIssues = report.topIssues.slice(0, 5);

  report.topSAMs.forEach((entry: any, index: number) => {
    entry.index = index + 1;
    entry.sam = entry.sam.toPrecision(3);
  });

  report.topStars.forEach((entry: any, index: number) => {
    entry.index = index + 1;
  });

  report.topIssues.forEach((entry: any, index: number) => {
    entry.index = index + 1;
  });

  const template = readFileSync(path.join(__dirname, "./weekly.mustache"));
  return mustache.render(template.toString(), report);
}
