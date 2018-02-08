import * as functions from "firebase-functions";
import { database } from "./database";
import { format } from "date-fns";
import * as mustache from "mustache";
import { readFileSync } from "fs";
import * as path from "path";
import * as email from "./email";

const snapshotsRef = database.ref("snapshots/github");
const reportsRef = database.ref("reports/github");

const email_client = new email.EmailClient(
  functions.config().mailgun.key,
  functions.config().mailgun.domain
);

const EMAIL_GROUP = functions.config().email.recipient;

export async function GetWeeklyReport(org: string) {
  // Grab the most recent daily snapshot
  const recentEntrySnapshot = await snapshotsRef
    .limitToLast(1)
    .once("child_added");
  const recentEntry = await recentEntrySnapshot.val();

  // Compute interesting metrics
  const topSAMs = GetHighestSam(recentEntry.repos);
  const bottomSAMs = GetLowestSam(recentEntry.repos);
  const topStars = GetTopStars(recentEntry.repos);
  const topIssues = GetTopIssues(recentEntry.repos);

  const totalOpenPullRequests = GetTotalOpenPullRequests(recentEntry);
  const totalOpenIssues = GetTotalOpenIssues(recentEntry);
  const totalOpenIssuesWithNoComments = GetTotalOpenIssuesWithNoComments(
    recentEntry
  );

  const totalStars = GetTotalStars(recentEntry);
  const totalSAM = GetTotalSamScore(recentEntry);

  const totalPublicRepos = recentEntry.public_repos;
  const averageIssuesPerRepo = Math.floor(totalOpenIssues / totalPublicRepos);

  return {
    topSAMs,
    bottomSAMs,
    topStars,
    topIssues,
    totalOpenIssues,
    totalOpenIssuesWithNoComments,
    totalOpenPullRequests,
    totalPublicRepos,
    totalStars,
    totalSAM,
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

function GetTotalSamScore(snapshot: any) {
  const sumOfRepos = Object.keys(snapshot.repos)
    .map((repoName: string) => {
      const repo = snapshot.repos[repoName];
      return {
        open_issues_count: repo.open_issues_count,
        closed_issues_count: repo.closed_issues_count
      };
    })
    .reduce((a: any, b: any) => {
      return {
        open_issues_count: a.open_issues_count + b.open_issues_count,
        closed_issues_count: a.closed_issues_count + b.closed_issues_count
      };
    });

  return GetRepoSAM(sumOfRepos);
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

function GetSortedSam(
  repos: { [s: string]: any },
  sortFn: (x: any, y: any) => number,
  count?: number
) {
  let sortedSAM = Object.keys(repos)
    .map((repoName: string) => {
      const repo = repos[repoName];
      const sam = GetRepoSAM(repo);
      return { name: repoName, sam };
    })
    .sort(sortFn)
    .filter(repo => {
      return repo.sam > 0;
    });

  if (count) sortedSAM = sortedSAM.slice(0, count);
  return sortedSAM;
}

function GetLowestSam(repos: { [s: string]: any }, count?: number) {
  return GetSortedSam(
    repos,
    (a, b) => {
      return a.sam - b.sam;
    },
    count
  );
}

function GetHighestSam(repos: { [s: string]: any }, count?: number) {
  return GetSortedSam(
    repos,
    (a, b) => {
      return b.sam - a.sam;
    },
    count
  );
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

/**
 * PubSub function that saves the weekly report to RTDB.
 */
export const SaveWeeklyReport = functions.pubsub
  .topic("save_weekly_report")
  .onPublish(async event => {
    const now = new Date();

    // Save report to the DB
    const report = await GetWeeklyReport("firebase");
    return database
      .ref("reports/github")
      .child(format(now, "YY-MM-DD"))
      .set(report);
  });

/**
 * HTTP function that sends the Github email based on the latest weekly report.
 */
export const SendWeeklyEmail = functions.pubsub
  .topic("send_weekly_email")
  .onPublish(async event => {
    const emailText = await GetWeeklyEmail("firebase");
    const now = new Date();

    const dateString = format(now, "DD/MM/YY");
    const subject = `Firebase Github Summary for ${dateString}`;

    await email_client.sendEmail(EMAIL_GROUP, subject, emailText);
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
  report.bottomSAMs = report.bottomSAMs.slice(0, 10);
  report.topStars = report.topStars.slice(0, 5);
  report.topIssues = report.topIssues.slice(0, 5);

  report.topSAMs.forEach((entry: any, index: number) => {
    entry.index = index + 1;
    entry.sam = entry.sam.toPrecision(3);
  });

  report.bottomSAMs.forEach((entry: any, index: number) => {
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
