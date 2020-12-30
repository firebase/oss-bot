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
import * as marked from "marked";

import * as config from "./config";
import * as email from "./email";
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
  emailer: email.EmailUtils;

  constructor(config: config.BotConfig) {
    // Configuration
    this.config = config;

    // Email utiltity
    this.emailer = new email.EmailUtils(this.config);
  }

  /**
   * Handle an issue associated with a GitHub pull request.
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
        return this.onPullRequestLabeled(repo, pr, event.label.name);
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

    // Right now we are not doing anything on pull requests...

    return actions;
  }

  async onPullRequestLabeled(
    repo: types.github.Repository,
    pr: types.github.PullRequest,
    label: string
  ): Promise<types.Action[]> {
    // Render the PR body
    const body_html = marked(pr.body || "");

    // Send a new PR email
    const action = this.emailer.getIssueUpdateEmailAction(repo, pr, {
      header: `New Pull Request from ${pr.user.login} in label ${label}`,
      body: body_html,
      label: label
    });

    if (!action) {
      return [];
    }

    return [action];
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
