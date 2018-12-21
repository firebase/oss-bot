/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as util from "./util";
import * as GithubApi from "@octokit/rest";

/**
 * Get a new client for interacting with Github.
 * @param {string} token Github API token.
 */
export class GithubClient {
  private token: string;
  private api: GithubApi;

  constructor(token: string) {
    // Github API token
    this.token = token;

    // Underlying Github API client
    this.api = new GithubApi({
      timeout: 5000
    });
  }

  /**
   * Authenticate with Github as the bot. This function should be called before
   * each use of the Github API.
   */
  auth() {
    this.api.authenticate({
      type: "oauth",
      token: this.token
    });
  }

  /**
   * Add a label to a github issue, returns a promise.
   */
  addLabel(
    org: string,
    name: string,
    number: number,
    label: string
  ): Promise<any> {
    this.auth();

    return this.api.issues.addLabels({
      owner: org,
      repo: name,
      number: number,
      labels: [label]
    });
  }

  /**
   * Add a comment to a github issue, returns a promise.
   */
  addComment(
    org: string,
    name: string,
    number: number,
    body: string
  ): Promise<any> {
    this.auth();

    return this.api.issues.createComment({
      owner: org,
      repo: name,
      number: number,
      body: body
    });
  }

  /**
   * Gets issue template from a github repo.
   */
  getIssueTemplate(org: string, name: string, file: string) {
    this.auth();

    console.log(`GithubClient.getIssueTemplate: ${org}/${name}, file=${file}`);
    return this.getFileContent(org, name, file);
  }

  /**
   * Gets file content from a github repo.
   */
  getFileContent(org: string, name: string, file: string) {
    this.auth();

    return this.api.repos
      .getContents({
        owner: org,
        repo: name,
        path: file
      })
      .then(function(res) {
        // Content is encoded as base64, we need to decode it
        return new Buffer(res.data.content, "base64").toString();
      });
  }

  /**
   * Closes an issue on a github repo.
   */
  closeIssue(org: string, name: string, number: number): Promise<any> {
    this.auth();

    // Add the closed-by-bot label
    const add_label = this.api.issues.addLabels({
      owner: org,
      repo: name,
      number: number,
      labels: ["closed-by-bot"]
    });

    // Close the issue
    const close_issue = this.api.issues.update({
      owner: org,
      repo: name,
      number: number,
      state: "closed"
    });

    return Promise.all([add_label, close_issue]);
  }

  /**
   * Get open PRs not modified in the last "expiry" ms.
   */
  getStalePullRequests(org: string, name: string, expiry: number) {
    this.auth();

    // TODO: Paginate
    return this.api.pulls
      .list({
        owner: org,
        repo: name,
        state: "open",
        sort: "updated",
        direction: "asc"
      })
      .then(res => {
        const prs = res.data;
        const results = [];

        // For each PR, check if it was updated recently enough.
        for (const pr of prs) {
          const nowTime = new Date().getTime();
          const updatedTime = new Date(pr.updated_at).getTime();

          if (nowTime - updatedTime > expiry) {
            results.push(pr);
          }
        }

        return results;
      });
  }

  /**
   * TODO
   */
  async getStaleIssues(org: string, name: string) {
    this.auth();

    const openIssues = await this.getIssuesForRepo(org, name);
    const staleIssues = openIssues.filter(async issue => {
      return await this.isIssueStale(org, name, issue);
    });

    return staleIssues;
  }

  // TODO: Docs
  // TODO: Tests
  private async isIssueStale(
    owner: string,
    repo: string,
    issue: GithubApi.IssuesListForRepoResponseItem
  ) {
    // Closed issues can't be stale
    if (issue.state !== "open") {
      return false;
    }

    // TODO: Label configuration
    const labels = issue.labels.map(label => label.name);
    if (labels.includes("some-special-label")) {
      return false;
    }

    let lastResponseTime: Date = new Date(issue.created_at);
    let googlerCommented = false;

    // If the issue has more than one comment, we can check if Googlers
    // have responded.
    if (issue.comments >= 1) {
      // TODO: This should probably come from RTDB (we need more caching)
      const comments = await this.getCommentsForIssue(
        owner,
        repo,
        issue.number
      );

      // See if a Googler ever commented
      // TODO: DEFINITELY need to cache this
      const googlers = await this.getCollaboratorsForRepo(owner, repo);

      for (const comment of comments) {
        const user = comment.user.login;
        if (googlers.indexOf(user) >= 0) {
          googlerCommented = true;
        }
      }

      // Get the time of the last comment
      const lastComment = comments[comments.length - 1];
      lastResponseTime = new Date(lastComment.created_at);
    }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = new Date();

    const tooOld = now.getTime() - lastResponseTime.getTime() > thirtyDays;
    if (tooOld && googlerCommented) {
      return true;
    }

    return false;
  }

  getCommentsForIssue(owner: string, repo: string, number: number) {
    return paginate(this.api.issues.listComments, {
      owner,
      repo,
      number
    });
  }

  /**
   * Get information about a GitHub organization.
   */
  getOrg(org: string) {
    this.auth();

    return this.api.orgs.get({
      org
    });
  }

  /**
   * List all the repos in a GitHub organization.
   */
  getReposInOrg(org: string) {
    this.auth();

    return paginate(this.api.repos.listForOrg, {
      org
    });
  }

  /**
   * List all the issues (open or closed) on a GitHub repo.
   */
  getIssuesForRepo(owner: string, repo: string, state?: IssueState) {
    this.auth();

    state = state || "all";
    return paginate(this.api.issues.listForRepo, {
      owner,
      repo,
      state
    });
  }

  /**
   * List Github logins of all collaborators on a repo, direct or otherwise.
   */
  getCollaboratorsForRepo(owner: string, repo: string) {
    this.auth();

    return paginate(this.api.repos.listCollaborators, {
      owner,
      repo,
      affiliation: "all"
    }).then(collabs => {
      return collabs.map(c => c.login);
    });
  }
}

type IssueState = "open" | "closed" | "all";

/**
 * Interface for a Github API call.
 */
interface GithubFn<S, T> {
  (args: S): Promise<GithubApi.Response<T>>;
}

/**
 * Interface for the parameters to a call to the GitHub API
 * that can be paginated.
 */
interface PageParams {
  // Results per page (max 100)
  per_page?: number;

  // Page number of the results to fetch.
  page?: number;

  // Ignore extra properties
  [others: string]: any;
}

/**
 * Read all pages of a Github API call and return them all as an
 * array.
 */
async function paginate<S extends PageParams, T>(
  fn: GithubFn<S, Array<T>>,
  options: S
) {
  const per_page = 100;
  let pagesRemaining = true;
  let page = 0;

  let allData = [] as T[];
  while (pagesRemaining) {
    page++;

    // Merge pagination options with the options passed in
    const pageOptions = Object.assign(
      {
        per_page,
        page
      },
      options
    );

    const res = await fn(pageOptions);
    allData = allData.concat(res.data);

    // We assume another page remaining if we got exactly as many
    // issues as we asked for.
    pagesRemaining = res.data.length == per_page;

    // Wait 0.5s between pages
    await util.delay(0.5);
  }

  return allData;
}
