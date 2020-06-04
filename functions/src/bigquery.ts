import { BigQuery, TableSchema, ViewDefinition } from "@google-cloud/bigquery";
import { snapshot, bigquery } from "./types";
import * as log from "./log";

const ISSUES_DATASET = "github_issues";

const ISSUES_SCHEMA: TableSchema = {
  fields: [
    { name: "repo", type: "STRING" },
    { name: "number", type: "INTEGER" },
    { name: "title", type: "STRING" },
    { name: "state", type: "STRING" },
    { name: "pull_request", type: "BOOLEAN" },
    { name: "locked", type: "BOOLEAN" },
    { name: "comments", type: "INTEGER" },
    {
      name: "user",
      type: "RECORD",
      fields: [{ name: "login", type: "STRING" }]
    },
    { name: "labels", type: "STRING", mode: "REPEATED" },
    { name: "created_at", type: "STRING" },
    { name: "updated_at", type: "STRING" },
    { name: "ingested", type: "TIMESTAMP" }
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
  log.debug(`Inserting ${issues.length} issues into BigQuery`);
  const insertRes = await bqClient
    .dataset("github_issues")
    .table(org)
    .insert(issues);
  log.debug(`Inserted: ${JSON.stringify(insertRes[0])}`);
}

function getIssuesViewSql(org: string) {
  return `SELECT * 
FROM 
  (
    SELECT 
      *, ROW_NUMBER() 
    OVER (PARTITION BY repo, number ORDER BY ingested) as rn 
    FROM github_issues.${org}
  )  
WHERE rn = 1`;
}
