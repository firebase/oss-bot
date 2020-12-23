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
import * as log from "./log";
import * as util from "./util";
import { Octokit } from "@octokit/rest";
import { OctokitResponse } from "@octokit/types";

const OctokitRetry = require("@octokit/plugin-retry");
const GitHubApi = Octokit.plugin(OctokitRetry);

/**
 * Get a new client for interacting with GitHub.
 * @param {string} token GitHub API token.
 */
export class GitHubClient {
  private token: string;
  private api: Octokit;

  constructor(token: string) {
    // GitHub API token
    this.token = token;

    // Underlying GitHub API client
    this.api = new GitHubApi({
      auth: this.token,
      timeout: 10000
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
    return this.api.issues.addLabels({
      owner: org,
      repo: name,
      issue_number: number,
      labels: [label]
    });
  }

  /**
   * Remove a label from github issue, returns a promise.
   */
  removeLabel(
    org: string,
    name: string,
    number: number,
    label: string
  ): Promise<any> {
    return this.api.issues.removeLabel({
      owner: org,
      repo: name,
      issue_number: number,
      name: label
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
    return this.api.issues.createComment({
      owner: org,
      repo: name,
      issue_number: number,
      body: body
    });
  }

  /**
   * Gets issue template from a github repo.
   */
  getIssueTemplate(org: string, name: string, file: string) {
    log.debug(`GitHubClient.getIssueTemplate: ${org}/${name}, file=${file}`);
    return this.getFileContent(org, name, file);
  }

  /**
   * Gets file content from a github repo.
   */
  getFileContent(org: string, name: string, file: string) {
    return this.api.repos
      .getContent({
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
  closeIssue(org: string, name: string, issue_number: number): Promise<any> {
    return this.api.issues.update({
      owner: org,
      repo: name,
      issue_number,
      state: "closed"
    });
  }

  /**
   * Get all comments on a GitHUb issue.
   */
  getCommentsForIssue(owner: string, repo: string, issue_number: number) {
    return paginate(this.api.issues.listComments, {
      owner,
      repo,
      issue_number
    });
  }

  /**
   * Get information about a GitHub organization.
   */
  getOrg(org: string) {
    return this.api.orgs.get({
      org
    });
  }

  /**
   * Gets information about a GitHub repo.
   */
  async getRepo(org: string, repo: string) {
    const res = await this.api.repos.get({
      owner: org,
      repo
    });

    return res.data;
  }

  /**
   * List all the repos in a GitHub organization.
   */
  getReposInOrg(org: string) {
    return paginate(this.api.repos.listForOrg, {
      org
    });
  }

  /**
   * List all the issues (open or closed) on a GitHub repo.
   */
  getIssuesForRepo(
    owner: string,
    repo: string,
    state?: IssueState,
    labels?: string[]
  ) {
    const opts: any = {
      owner,
      repo,
      state: state || "all"
    };

    if (labels && labels.length > 0) {
      opts.labels = labels.join(",");
    }

    return paginate(this.api.issues.listForRepo, opts);
  }

  /**
   * List GitHub logins of all collaborators on a repo, direct or otherwise.
   */
  getCollaboratorsForRepo(owner: string, repo: string) {
    return paginate(this.api.repos.listCollaborators, {
      owner,
      repo,
      affiliation: "all"
    }).then(collabs => {
      return collabs.map(c => c.login);
    });
  }

  /**
   * Lock a GitHub issue.
   */
  lockIssue(owner: string, repo: string, issue_number: number) {
    return this.api.issues.lock({
      owner,
      repo,
      issue_number
    });
  }
}

type IssueState = "open" | "closed" | "all";

/**
 * Interface for a GitHub API call.
 */
interface GitHubFn<S, T> {
  (params?: S): Promise<OctokitResponse<T>>;
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
  [others: string]: unknown;
}

/**
 * Read all pages of a GitHub API call and return them all as an
 * array.
 */
async function paginate<S extends PageParams, T>(
  fn: GitHubFn<S, Array<T>>,
  options: S
): Promise<T[]> {
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
