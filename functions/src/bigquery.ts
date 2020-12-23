import { BigQuery, TableSchema } from "@google-cloud/bigquery";
import { snapshot, bigquery } from "./types";
import * as log from "./log";

const ISSUES_DATASET = "github_issues";

const ISSUES_SCHEMA: TableSchema = {
  fields: [
    { name: "repo", type: "STRING", mode: "NULLABLE" },
    { name: "number", type: "INTEGER", mode: "NULLABLE" },
    { name: "title", type: "STRING", mode: "NULLABLE" },
    { name: "state", type: "STRING", mode: "NULLABLE" },
    { name: "pull_request", type: "BOOLEAN", mode: "NULLABLE" },
    { name: "locked", type: "BOOLEAN", mode: "NULLABLE" },
    { name: "comments", type: "INTEGER", mode: "NULLABLE" },
    {
      name: "user",
      type: "RECORD",
      mode: "NULLABLE",
      fields: [{ name: "login", type: "STRING", mode: "NULLABLE" }]
    },
    {
      name: "assignee",
      type: "RECORD",
      mode: "NULLABLE",
      fields: [{ name: "login", type: "STRING", mode: "NULLABLE" }]
    },
    { name: "labels", type: "STRING", mode: "REPEATED" },
    { name: "created_at", type: "STRING", mode: "NULLABLE" },
    { name: "updated_at", type: "STRING", mode: "NULLABLE" },
    { name: "ingested", type: "TIMESTAMP", mode: "NULLABLE" }
  ]
};

const bqClient = new BigQuery({
  projectId: process.env.GCLOUD_PROJECT
});

export async function listIssuesTables(): Promise<string[]> {
  const [tables] = await bqClient.dataset(ISSUES_DATASET).getTables();
  return tables.map(x => x.id || "");
}

export async function createIssuesTable(org: string): Promise<void> {
  await bqClient.dataset(ISSUES_DATASET).createTable(org, {
    schema: ISSUES_SCHEMA
  });

  await bqClient.dataset(ISSUES_DATASET).createTable(`${org}_view`, {
    view: {
      query: getIssuesViewSql(org),
      useLegacySql: false
    }
  });
}

export async function insertIssues(
  org: string,
  repo: string,
  issueData: snapshot.Issue[],
  ingested: Date
) {
  const issues = Object.values(issueData).map(
    i => new bigquery.Issue(i, repo, ingested)
  );

  if (issues.length === 0) {
    log.debug(`No issues to insert into BigQuery`);
    return;
  }

  log.debug(`Inserting ${issues.length} issues into BigQuery`);
  const insertRes = await bqClient
    .dataset("github_issues")
    .table(org)
    .insert(issues);
  log.debug(`Inserted: ${JSON.stringify(insertRes[0])}`);
}

function getIssuesViewSql(org: string) {
  return `SELECT
  issues.*
FROM (
  SELECT
    *
  FROM
    github_issues.${org}) AS issues
JOIN (
  SELECT
    repo,
    MAX(ingested) AS timestamp
  FROM
    github_issues.${org}
  GROUP BY
    repo) AS max_ingestion
ON
  issues.repo = max_ingestion.repo
  AND issues.ingested = max_ingestion.timestamp`;
}
