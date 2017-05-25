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
var request = require('request');
var GithubApi = require('github');

/**
 * Get a new client for interacting with Github.
 * @param {string} token Github API token.
 */
function GithubClient(token) {
  // Github API token
  this.token = token;

  // Underlying Github API client
  this.api = new GithubApi({
    debug: true,
    Promise: Promise,
    timeout: 5000
  });
}

/**
 * Authenticate with Github as the bot. This function should be called before
 * each use of the Github API.
 */
GithubClient.prototype.auth = function() {
  this.api.authenticate({
    type: 'oauth',
    token: this.token
  });
};

/**
 * Add a label to a github issue, returns a promise.
 */
GithubClient.prototype.addLabel = function(org, name, number, label) {
  this.auth();

  return this.api.issues.addLabels({
    owner: org,
    repo: name,
    number: number,
    labels: [label]
  });
};

/**
 * Add a comment to a github issue, returns a promise.
 */
GithubClient.prototype.addComment = function(org, name, number, body) {
  this.auth();

  return this.api.issues.createComment({
    owner: org,
    repo: name,
    number: number,
    body: body
  });
};

/**
 * Gets issue template from a github repo.
 */
GithubClient.prototype.getIssueTemplate = function(org, name, config) {
  var repo_config = config.getRepoConfig(org, name);

  var issue_file = 'ISSUE_TEMPLATE.md';
  if (repo_config && repo_config.templates && repo_config.templates.issue) {
    issue_file = repo_config.templates.issue;
  }
  return this.getFileContent(org, name, issue_file);
};

/**
 * Gets file content from a github repo.
 */
GithubClient.prototype.getFileContent = function(org, name, file) {
  this.auth();

  return this.api.repos
    .getContent({
      owner: org,
      repo: name,
      path: file
    })
    .then(function(res) {
      // Content is encoded as base64, we need to decode it
      return new Buffer(res.data.content, 'base64').toString();
    });
};

/** */
GithubClient.prototype.closeIssue = function(org, name, number) {
  this.auth();

  // Add the closed-by-bot label
  var add_label = this.api.issues.addLabels({
    owner: org,
    repo: name,
    number: number,
    labels: ['closed-by-bot']
  });

  // Close the issue
  var close_issue = this.api.issues.edit({
    owner: org,
    repo: name,
    number: number,
    state: 'closed'
  });

  return Promise.all([add_label, close_issue]);
};

/**
 * Get open PRs not modified in the last 'expiry' ms.
 */
GithubClient.prototype.getOldPullRequests = function(org, name, expiry) {
  this.auth();

  return this.api.pullRequests
    .getAll({
      owner: org,
      repo: name,
      state: 'open',
      sort: 'updated',
      direction: 'asc'
    })
    .then(res => {
      var prs = res.data;
      var results = [];

      // For each PR, check if it was updated recently enough.
      for (var pr of prs) {
        var nowTime = new Date().getTime();
        var updatedTime = new Date(pr.updated_at).getTime();

        if (nowTime - updatedTime > expiry) {
          results.push(pr);
        }
      }

      return results;
    });
};

// Exports
exports.GithubClient = GithubClient;
