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

/**
 * Create a new handler for github pull requests.
 * @param {GithubClient} github_client client for interacting with Github.
 */
function PullRequestHandler(github_client) {
  this.github_client = github_client;
}

/**
 * Handle an issue associated with a Github pull request.
 */
PullRequestHandler.prototype.handlePullRequestEvent = (
  action,
  pr,
  repo,
  sender
) => {
  switch (action) {
    case PR_OPENED:
      return this.onNewPullRequest(repo, pr);
    case PR_ASSIGNED:
    /* falls through */
    case PR_UNASSIGNED:
    /* falls through */
    case PR_REVIEW_REQUESTED:
    /* falls through */
    case PR_REVIEW_REQUEST_REMOVED:
    /* falls through */
    case PR_LABELED:
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

  // Check to see if the pull request has an issue associated
  // TODO(samstern): Implement

  // Decide on a relevant label
  // TODO(samstern): Implement

  // Send emails?
  // TODO(samstern): Implement

  // TODO(samstern): Implement
  return Promise.resolve();
};

// Exports
exports.PullRequestHandler = PullRequestHandler;
