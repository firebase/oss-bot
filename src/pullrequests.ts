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

import * as github from "./github";
import * as email from "./email";
import * as config from "./config";
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
 * @param {GithubClient} gh_client client for interacting with Github.
 */
export class PullRequestHandler {
  gh_client: github.GithubClient;
  email_client: email.EmailClient;
  config: config.BotConfig;

  constructor(gh_client: github.GithubClient, email_client: email.EmailClient, config: config.BotConfig) {
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
  handlePullRequestEvent(
    event: types.WebhookEvent,
    action: PullRequestAction,
    pr: types.PullRequest,
    repo: types.Repository,
    sender: types.Sender
  ) {
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
        console.log("Unsupported pull request action: " + action);
        console.log("Pull Request: " + pr.title);
        break;
    }

    return Promise.resolve();
  }

  /**
   * Handle a newly opened pull request.
   */
  onNewPullRequest(repo: types.Repository, pr: types.PullRequest) {
    // Get basic issue information
    const org = repo.owner.login;
    const name = repo.name;
    const number = pr.number;

    const promises = [];

    // Check for skip
    if (this.hasSkipTag(repo, pr)) {
      return Promise.resolve();
    }

    // Check to see if the pull request has an issue associated
    // TODO(samstern): Decide if we should re-enable checking for an issue link
    // if (!this.hasIssueLink(repo, pr)) {
    //   msg =
    //     "I couldn"t find a link to an issue in your pull request. Please make sure this PR addresses an open issue.";
    //   const addCommentPromise = this.gh_client.addComment(org, name, number, msg);
    //   promises.push(addCommentPromise);
    // }

    // Add a needs triage label
    const addLabelPromise = this.gh_client.addLabel(
      org,
      name,
      number,
      LABEL_NEEDS_TRIAGE
    );
    promises.push(addLabelPromise);

    return Promise.resolve(promises);
  }

  onPullRequestLabeled(repo: types.Repository, pr: types.PullRequest) {
    // TODO(samstern): Send a an email to the right peopl
    return Promise.resolve();
  }

  /**
   * Determine if a PR has the [triage-skip] tag.
   */
  hasSkipTag(repo: types.Repository, pr: types.PullRequest) {
    return pr.title.indexOf("[triage-skip]") >= 0;
  }

  /**
   * Determine if the pull request links to a github issue (fuzzy).
   */
  hasIssueLink(repo: types.Repository, pr: types.PullRequest) {
    // Match either /issues/NUM or #NUM
    const issueRegex = new RegExp("(/issues/|#)[0-9]+");

    return issueRegex.test(pr.body);
  }
}