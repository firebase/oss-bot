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
import * as functions from "firebase-functions";
import * as path from "path";

// Local includes
import * as github from "./github";
import * as email from "./email";
import * as issues from "./issues";
import * as pullrequests from "./pullrequests";
import * as cron from "./cron";
import * as config from "./config";
import * as types from "./types";
import * as log from "./log";

export { GetOrganizationSnapshot, SaveOrganizationSnapshot } from "./snapshot";

export {
  GetRepoReport,
  GetWeeklyReport,
  SaveWeeklyReport,
  GetWeeklyEmail,
  SendWeeklyEmail,
  SendWeeklyRepoEmails
} from "./report";

export {
  BackfillMetrics,
  UpdateMetricsWebhook,
  UpdateMetrics,
  UpdateAllMetrics
} from "./metrics";

// Config
const config_json = functions.config().runtime.config;
const bot_config = new config.BotConfig(config_json);

// Github events
enum GithubEvent {
  ISSUE = "issues",
  ISSUE_COMMENT = "issue_comment",
  PULL_REQUEST = "pull_request"
}

// 15 days, in milliseconds
const PR_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

// Github API client
const gh_client: github.GithubClient = new github.GithubClient(
  functions.config().github.token
);

// Mailgun Email client
const email_client: email.EmailClient = new email.EmailClient(
  functions.config().mailgun.key,
  functions.config().mailgun.domain
);

// Handler for Github issues
const issue_handler = new issues.IssueHandler(gh_client, bot_config);

// Handler for Github pull requests
const pr_handler = new pullrequests.PullRequestHandler(bot_config);

// Handler for Cron jobs
const cron_handler = new cron.CronHandler(gh_client);

/**
 * Function that responds to Github events (HTTP webhook).
 */
export const githubWebhook = functions.https.onRequest(
  async (request, response) => {
    // Get event and action;
    const event = request.get("X-Github-Event");
    const action = request.body.action;

    // Get repo and sender
    const repo = request.body.repository;
    const sender = request.body.sender;

    // Confirm that there is some event
    if (!event) {
      console.log("No github event");
      response.send("Fail: no event.");
      return;
    } else {
      // Log some basic info
      console.log(
        "===========================START============================"
      );
      console.log(`Event: ${event}/${action}`);
      if (repo) {
        console.log("Repository: " + repo.full_name);
      }
      if (sender) {
        console.log("Sender: " + sender.login);
      }
      console.log(
        "===========================END============================="
      );
    }

    // Handle the event appropriately
    const issue = request.body.issue;

    let actions: types.Action[] = [];

    // Log the GitHub event type
    log.logData({
      event: "github",
      type: event,
      message: `Receiving event type ${event}`
    });

    switch (event) {
      case GithubEvent.ISSUE:
        actions = await issue_handler.handleIssueEvent(
          request.body,
          action,
          issue,
          repo,
          sender
        );
        break;
      case GithubEvent.ISSUE_COMMENT:
        const comment = request.body.comment;
        actions = await issue_handler.handleIssueCommentEvent(
          request.body,
          action,
          issue,
          comment,
          repo,
          sender
        );
        break;
      case GithubEvent.PULL_REQUEST:
        const pr = request.body.pull_request;
        actions = await pr_handler.handlePullRequestEvent(
          request.body,
          action,
          pr,
          repo,
          sender
        );
        break;
      default:
        response.send(`Unknown event: ${event}`);
        return;
    }

    // TODO(samstern): Should not need this
    if (actions == undefined) {
      actions = [];
    }

    // TODO(samstern): Maybe add an "execute" method to each action
    // to clean this up?
    const promises: Promise<any>[] = [];

    const collapsibleComments = [];

    for (const action of actions) {
      if (action == undefined) {
        console.warn("Got undefined action.");
        continue;
      }

      if (action.type == types.ActionType.GITHUB_COMMENT) {
        const commentAction = action as types.GithubCommentAction;

        if (commentAction.collapse == true) {
          collapsibleComments.push(commentAction);
        } else {
          promises.push(
            gh_client.addComment(
              commentAction.org,
              commentAction.name,
              commentAction.number,
              commentAction.message
            )
          );
        }
      }

      if (action.type == types.ActionType.GITHUB_LABEL) {
        const labelAction = action as types.GithubLabelAction;
        promises.push(
          gh_client.addLabel(
            labelAction.org,
            labelAction.name,
            labelAction.number,
            labelAction.label
          )
        );
      }

      if (action.type == types.ActionType.EMAIL_SEND) {
        const emailAction = action as types.SendEmailAction;
        promises.push(
          email_client.sendStyledEmail(
            emailAction.recipient,
            emailAction.subject,
            emailAction.header,
            emailAction.body,
            emailAction.link,
            emailAction.action
          )
        );
      }
    }

    // Handle all collapsible comments together.
    if (collapsibleComments.length == 1) {
      // Only one comment, post it directly.
      const comment = collapsibleComments[0];
      promises.push(
        gh_client.addComment(
          comment.org,
          comment.name,
          comment.number,
          comment.message
        )
      );
    } else if (collapsibleComments.length > 1) {
      // More than one comment, combine them into bullets.
      // TODO: What if the comments are cross-repo or cross-issue?
      let msg = "I found a few problems with this issue:";
      for (const comment of collapsibleComments) {
        msg += `\n  * ${comment.message}`;
      }

      const firstComment = collapsibleComments[0];
      promises.push(
        gh_client.addComment(
          firstComment.org,
          firstComment.name,
          firstComment.number,
          msg
        )
      );
    }

    // Wait for the promise to resolve the HTTP request
    Promise.all(promises)
      .then(res => {
        response.send("OK!");
      })
      .catch(e => {
        response.send("Error!");
      });
  }
);

/**
 * Function that responds to pubsub events sent via an AppEngine crojob.
 */
export const botCleanup = functions.pubsub
  .topic("cleanup")
  .onPublish(async event => {
    console.log("The cleanup job is running!");
    if (1 + 1 == 2) {
      console.log("Cleanup is currently disabled");
      return;
    }

    const that = this;
    return bot_config.getAllRepos().map(function(repo) {
      // Get config for the repo
      const repo_config = that.bot_config.getRepoConfig(repo.org, repo.name);

      // Get expiry from config
      let expiry = PR_EXPIRY_MS;
      if (repo_config.cleanup && repo_config.cleanup.pr) {
        expiry = repo_config.cleanup.pr;
      }

      console.log(`Cleaning up: ${repo.org}/${repo.name}, expiry: ${expiry}`);

      return cron_handler.handleCleanup(repo.org, repo.name, expiry);
    });
  });
