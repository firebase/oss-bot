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

import * as config from "./config";
import * as log from "./log";
import * as types from "./types";

// Event: pull_request
// https://developer.github.com/v3/activity/events/types/#pullrequestevent
// Keys
//  * number - the pull request number.
//  * changes - the changes to the comment if the action was "edited"
//  * pull_request - the pull request itself.
enum PullRequestAction {
  ASSIGNED = "assigned",
  UNASSIGNED = "unassigned",
  REVIEW_REQUESTED = "review_requested",
  REVIEW_REQUEST_REMOVED = "review_request_removed",
  LABELED = "labeled",
  UNLABLED = "unlabeled",
  OPENED = "opened",
  EDITED = "edited",
  CLOSED = "closed",
  REOPENED = "reopened"
}

// Label for issues that confuse the bot
const LABEL_NEEDS_TRIAGE = "needs-triage";

/**
 * Create a new handler for github pull requests.
 */
export class PullRequestHandler {
  config: config.BotConfig;

  constructor(config: config.BotConfig) {
    // Configuration
    this.config = config;
  }

  /**
   * Handle an issue associated with a Github pull request.
   */
  async handlePullRequestEvent(
    event: types.github.WebhookEvent,
    action: PullRequestAction,
    pr: types.github.PullRequest,
    repo: types.github.Repository,
    sender: types.github.Sender
  ): Promise<types.Action[]> {
    switch (action) {
      case PullRequestAction.OPENED:
        return this.onNewPullRequest(repo, pr);
      case PullRequestAction.LABELED:
        return this.onPullRequestLabeled(repo, pr);
      case PullRequestAction.ASSIGNED:
      /* falls through */
      case PullRequestAction.UNASSIGNED:
      /* falls through */
      case PullRequestAction.REVIEW_REQUESTED:
      /* falls through */
      case PullRequestAction.REVIEW_REQUEST_REMOVED:
      /* falls through */
      case PullRequestAction.UNLABLED:
      /* falls through */
      case PullRequestAction.EDITED:
      /* falls through */
      case PullRequestAction.CLOSED:
      /* falls through */
      case PullRequestAction.REOPENED:
      /* falls through */
      default:
        log.debug("Unsupported pull request action: " + action);
        log.debug("Pull Request: " + pr.title);
        break;
    }

    // Return empty action array if no action to be taken.
    return Promise.resolve([]);
  }

  /**
   * Handle a newly opened pull request.
   */
  async onNewPullRequest(
    repo: types.github.Repository,
    pr: types.github.PullRequest
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];

    // Get basic issue information
    const org = repo.owner.login;
    const name = repo.name;
    const number = pr.number;

    // Check for skip
    if (this.hasSkipTag(repo, pr)) {
      return actions;
    }

    // Check to see if the pull request has an issue associated
    // TODO(samstern): Decide if we should re-enable checking for an issue link
    // if (!this.hasIssueLink(repo, pr)) {
    //   msg =
    //     "I couldn"t find a link to an issue in your pull request. Please make sure this PR addresses an open issue.";
    //   const addCommentPromise = this.gh_client.addComment(org, name, number, msg);
    //   promises.push(addCommentPromise);
    // }

    // const features = this.config.getRepoFeatures(org, name);
    // if (features.issue_labels) {
    //   // Add a needs triage label
    //   const labelAction = new types.GithubAddLabelAction(
    //     org,
    //     name,
    //     number,
    //     LABEL_NEEDS_TRIAGE
    //   );

    //   actions.push(labelAction);
    // }

    return actions;
  }

  async onPullRequestLabeled(
    repo: types.github.Repository,
    pr: types.github.PullRequest
  ): Promise<types.Action[]> {
    // TODO(samstern): Send a an email to the right peopl
    return [];
  }

  /**
   * Determine if a PR has the [triage-skip] tag.
   */
  hasSkipTag(repo: types.github.Repository, pr: types.github.PullRequest) {
    return pr.title.indexOf("[triage-skip]") >= 0;
  }

  /**
   * Determine if the pull request links to a github issue (fuzzy).
   */
  hasIssueLink(repo: types.github.Repository, pr: types.github.PullRequest) {
    // Match either /issues/NUM or #NUM
    const issueRegex = new RegExp("(/issues/|#)[0-9]+");

    return issueRegex.test(pr.body);
  }
}
