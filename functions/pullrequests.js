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

// Event: pull_request
// https://developer.github.com/v3/activity/events/types/#pullrequestevent
// Keys
//  * number - the pull request number.
//  * changes - the changes to the comment if the action was 'edited'
//  * pull_request - the pull request itself.
const PR_ASSIGNED = 'assigned';
const PR_UNASSIGNED = 'unassigned';
const PR_REVIEW_REQUESTED = 'review_requested';
const PR_REVIEW_REQUEST_REMOVED = 'review_request_removed';
const PR_LABELED = 'labeled';
const PR_UNLABLED = 'unlabeled';
const PR_OPENED = 'opened';
const PR_EDITED = 'edited';
const PR_CLOSED = 'closed';
const PR_REOPENED = 'reopened';

// Label for issues that confuse the bot
const LABEL_NEEDS_TRIAGE = 'needs-triage';

/**
 * Create a new handler for github pull requests.
 * @param {GithubClient} gh_client client for interacting with Github.
 */
function PullRequestHandler(gh_client, email_client, config) {
  // Client for interacting with github
  this.gh_client = gh_client;

  // Client for sending emails
  this.email_client = email_client;

  // Configuration
  this.config = config;
}

/**
 * Handle an issue associated with a Github pull request.
 */
PullRequestHandler.prototype.handlePullRequestEvent = function(
  action,
  pr,
  repo,
  sender
) {
  switch (action) {
    case PR_OPENED:
      return this.onNewPullRequest(repo, pr);
    case PR_LABELED:
      return this.onPullRequestLabeled(repo, pr);
    case PR_ASSIGNED:
    /* falls through */
    case PR_UNASSIGNED:
    /* falls through */
    case PR_REVIEW_REQUESTED:
    /* falls through */
    case PR_REVIEW_REQUEST_REMOVED:
    /* falls through */
    case PR_UNLABLED:
    /* falls through */
    case PR_EDITED:
    /* falls through */
    case PR_CLOSED:
    /* falls through */
    case PR_REOPENED:
    /* falls through */
    default:
      console.log('Unsupported pull request action: ' + action);
      console.log('Pull Request: ' + pr.title);
      break;
  }

  return Promise.resolve();
};

/**
 * Handle a newly opened pull request.
 */
PullRequestHandler.prototype.onNewPullRequest = function(repo, pr) {
  // Get basic issue information
  var org = repo.owner.login;
  var name = repo.name;
  var number = pr.number;

  var promises = [];

  // Check to see if the pull request has an issue associated
  if (!this.hasIssueLink(repo, pr)) {
    msg =
      "I couldn't find a link to an issue in your pull request. Please make sure this PR addresses an open issue.";
    var addCommentPromise = this.gh_client.addComment(org, name, number, msg);
    promises.push(addCommentPromise);
  }

  // Add a needs triage label
  var addLabelPromise = this.gh_client.addLabel(
    org,
    name,
    number,
    LABEL_NEEDS_TRIAGE
  );
  promises.push(addLabelPromise);

  return Promise.resolve(promises);
};

PullRequestHandler.prototype.onPullRequestLabeled = function(repo, pr) {
  // TODO(samstern): Send a an email to the right peopl
  return Promise.resolve();
};

/**
 * Determine if the pull request links to a github issue (fuzzy).
 */
PullRequestHandler.prototype.hasIssueLink = function(repo, pr) {
  // Match either /issues/NUM or #NUM
  var issueRegex = new RegExp('(\/issues\/|#)[0-9]+');

  return issueRegex.test(pr.body);
};

// Exports
exports.PullRequestHandler = PullRequestHandler;
