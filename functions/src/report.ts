import { format } from "date-fns";
import { readFileSync } from "fs";
import * as functions from "firebase-functions";
import * as path from "path";
import * as mustache from "mustache";

import { database } from "./database";
import * as email from "./email";
import * as snap from "./snapshot";
import * as util from "./util";
import { DataSnapshot } from "firebase-functions/lib/providers/database";

/**
 * Used for duck-typing objects for calculating a SAM Score.
 */
interface SAMScoreable {
  open_issues_count: number;
  closed_issues_count: number;
}

/**
 * Function that filters issues.
 */
interface IssueFilter {
  (issue: snapshot.Issue): boolean
}

/**
 * Types for data as it is stored in the 'snapshots' tree
 * in the RTDB.
 */
namespace snapshot {
  export interface Org {
    name: string;
    public_repos: number;

    repos: {
      [repo: string]: snapshot.Repo;
    };
  }

  export interface Repo {
    private: boolean;
    open_issues_count: number;
    closed_issues_count: number;
    stargazers_count: number;

    issues: {
      [id: string]: Issue;
    };
  }

  export interface Issue {
    comments: number;
    pull_request: boolean;
  }
}

/**
 * Types for data as it is reported.
 */
namespace report {
  export class Diff {
    before: number;
    after: number;
    diff: number;

    constructor(before: number, after: number) {
      this.before = before;
      this.after = after;

      this.diff = after - before;
    }
  }

  export interface ClosedIssue {
    number: number;
    title: string;
    link: string;
  }

  export interface Repo {
    start: string;
    end: string;

    open_issues: Diff;
    stars: Diff;
    forks: Diff;

    closed_issues: ClosedIssue[];
  }
}

const snapshotsRef = database.ref("snapshots/github");

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
  const recentEntry = (await recentEntrySnapshot.val()) as snapshot.Org;

  // Compute interesting metrics
  const topSAMs = GetHighestSam(recentEntry);
  const bottomSAMs = GetLowestSam(recentEntry);
  const topStars = GetTopStars(recentEntry);
  const topIssues = GetTopIssues(recentEntry);

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

function GetTotalOpenIssues(snapshot: snapshot.Org) {
  if (!snapshot) {
    return 0;
  }

  return GetIssuesWithFilter(snapshot, (issue: snapshot.Issue) => {
    return !issue.pull_request;
  });
}

function GetTotalStars(org: snapshot.Org) {
  if (!org) return 0;

  return Object.keys(org.repos).reduce((sum, key) => {
    return sum + org.repos[key].stargazers_count;
  }, 0);
}

function GetTotalSamScore(org: snapshot.Org) {
  const sumOfRepos = Object.keys(org.repos)
    .map((repoName: string) => {
      const repo = org.repos[repoName];
      return {
        open_issues_count: repo.open_issues_count,
        closed_issues_count: repo.closed_issues_count
      };
    })
    .reduce((a: SAMScoreable, b: SAMScoreable) => {
      return {
        open_issues_count: a.open_issues_count + b.open_issues_count,
        closed_issues_count: a.closed_issues_count + b.closed_issues_count
      };
    });

  return ComputeSAMScore(sumOfRepos);
}

function GetIssuesWithFilter(org: snapshot.Org, filter: IssueFilter) {
  let matchingIssues = 0;

  Object.keys(org.repos).forEach(repoName => {
    const repo = org.repos[repoName];

    if (repo.private) {
      return;
    }

    matchingIssues += Object.keys(repo.issues || {}).reduce(
      (sum, issue_id: string) => {
        const issue = repo.issues[issue_id];

        if (filter(issue)) {
          return sum + 1;
        } else {
          return sum;
        }
      },
      0
    );
  });

  return matchingIssues;
}

function GetTotalOpenIssuesWithNoComments(snapshot: snapshot.Org) {
  if (!snapshot) {
    return 0;
  }

  return GetIssuesWithFilter(snapshot, (issue: snapshot.Issue) => {
    return !issue.pull_request && !issue.comments;
  });
}

function GetTotalOpenPullRequests(snapshot: snapshot.Org) {
  if (!snapshot) {
    return 0;
  }

  return GetIssuesWithFilter(snapshot, (issue: snapshot.Issue) => {
    return issue.pull_request;
  });
}

function GetSortedSam(
  org: snapshot.Org,
  sortFn: (x: any, y: any) => number,
  count?: number
) {
  let sortedSAM = Object.keys(org.repos)
    .map((repoName: string) => {
      const repo = org.repos[repoName];
      const sam = ComputeSAMScore(repo);
      return { name: repoName, sam };
    })
    .sort(sortFn)
    .filter(repo => {
      return repo.sam > 0;
    });

  if (count) sortedSAM = sortedSAM.slice(0, count);
  return sortedSAM;
}

function GetLowestSam(org: snapshot.Org, count?: number) {
  return GetSortedSam(
    org,
    (a, b) => {
      return a.sam - b.sam;
    },
    count
  );
}

function GetHighestSam(org: snapshot.Org, count?: number) {
  return GetSortedSam(
    org,
    (a, b) => {
      return b.sam - a.sam;
    },
    count
  );
}

function GetTopStars(org: snapshot.Org, count?: number) {
  let topStars = Object.keys(org.repos)
    .map((repoName: string) => {
      const repo = org.repos[repoName];
      const stars = repo.stargazers_count;
      return { name: repoName, stars };
    })
    .sort((a, b) => {
      return b.stars - a.stars;
    });

  if (count) topStars = topStars.slice(0, count);
  return topStars;
}

function GetTopIssues(org: snapshot.Org, count?: number) {
  let topIssues = Object.keys(org.repos)
    .map((repoName: string) => {
      const repo = org.repos[repoName];
      const issues = repo.open_issues_count;
      return { name: repoName, issues };
    })
    .sort((a, b) => {
      return b.issues - a.issues;
    });

  if (count) topIssues = topIssues.slice(0, count);
  return topIssues;
}

export function ComputeSAMScore(repo: SAMScoreable) {
  const open_issues = repo.open_issues_count || 0;
  const closed_issues = repo.closed_issues_count || 0;

  if (!closed_issues) return 0;

  return (
    (open_issues / (open_issues + closed_issues)) *
    Math.log(Math.E + open_issues + closed_issues)
  );
}

export async function MakeRepoReport(repo: string): Promise<report.Repo> {
  // Get two snapshots
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();

  // Use yesterday and 7 days ago in case today's snapshot job
  // has not run yet.
  const startDate = new Date(now.getTime() - dayMs);
  const endDate = new Date(startDate.getTime() - 7 * dayMs);

  const after = await snap.FetchRepoSnapshot(repo, startDate);
  const before = await snap.FetchRepoSnapshot(repo, endDate);

  // TODO: Handle holes in the data
  if (!after) {
    throw `Couldn't get snapshot for ${startDate}`;
  }

  if (!before) {
    throw `Couldn't get snapshot for ${endDate}`;
  }

  // Simple counting stats
  const open_issues = new report.Diff(
    before.open_issues_count,
    after.open_issues_count
  );
  const stars = new report.Diff(
    before.stargazers_count,
    after.stargazers_count
  );
  const forks = new report.Diff(before.forks_count, after.forks_count);

  // Check for difference in issues
  const closed_issues: report.ClosedIssue[] = [];
  Object.keys(before.issues).forEach((id: string) => {
    const issue = before.issues[id];

    // Any issue that's in before and not after must have been
    // closed in the intermediate time.
    if (!after.issues[id]) {
      closed_issues.push({
        number: issue.number,
        title: issue.title,
        link: `https://github.com/firebase/${repo}/issues/${issue.number}`
      });
    }
  });

  return {
    start: util.DateSlug(startDate),
    end: util.DateSlug(endDate),

    open_issues,
    stars,
    forks,

    closed_issues
  };
}

/**
 * HTTP Function to get a JSON report on a repo.
 */
export const GetRepoReport = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
  })
  .https.onRequest(async (req, res) => {
    const repo = req.param("repo");
    if (repo === undefined) {
      res.status(500).send("Must specify 'repo' param");
      return;
    }

    try {
      const report = await MakeRepoReport(repo);
      res.status(200).send(JSON.stringify(report));
    } catch (e) {
      res.status(500).send(e);
    }
  });

/**
 * PubSub function that saves the weekly report to RTDB.
 */
export const SaveWeeklyReport = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "2GB"
  })
  .pubsub.topic("save_weekly_report")
  .onPublish(async (message: functions.pubsub.Message) => {
    const now = new Date();

    // Save report to the DB
    const report = await GetWeeklyReport("firebase");
    return database
      .ref("reports/github")
      .child(util.DateSlug(now))
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
