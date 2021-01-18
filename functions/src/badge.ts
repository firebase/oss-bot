import * as functions from "firebase-functions";
import * as fetch from "node-fetch";
import { Octokit } from "@octokit/rest";
import * as util from "./util";

export const SamScoreBadge = functions.https.onRequest(async (req, res) => {
  const org = req.query["org"] as string;
  const repo = req.query["repo"] as string;

  if (!org || !repo) {
    res.status(400).send("Must include both 'org' and 'repo' query params");
    return;
  }

  const api = new Octokit();

  const repoResp = await api.repos.get({ owner: org, repo: repo });
  const openIssues = repoResp.data.open_issues_count;

  const searchResp = await api.search.issuesAndPullRequests({
    q: `repo:${org}/${repo} type:issue state:closed`
  });
  const closedIssues = searchResp.data.total_count;

  const samScore = util.samScore(openIssues, closedIssues);
  const color =
    samScore < 0.5
      ? "brightgreen"
      : samScore < 1.0
      ? "green"
      : samScore < 2.0
      ? "yellow"
      : "red";

  // Construct the Shield URL
  const shieldURL = `https://img.shields.io/static/v1?label=SAM%20Score&message=${samScore}&color=${color}`;

  // Fetch the shield
  const fetchRes = await fetch.default(shieldURL);

  // Set key headers
  res.set("Content-Type", "image/svg+xml;charset=utf-8");
  res.set("Cache-Control", "public, max-age=43200, s-maxage=42300"); // 12h

  // Forward the body
  const text = await fetchRes.text();
  res.status(fetchRes.status).send(text);
});
