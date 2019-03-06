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
import * as admin from "firebase-admin";

// Local includes
import * as github from "./github";
import * as email from "./email";
import * as issues from "./issues";
import * as pullrequests from "./pullrequests";
import * as cron from "./cron";
import * as config from "./config";
import * as types from "./types";
import * as log from "./log";

import { database } from "./database";

export { SaveOrganizationSnapshot, SaveRepoSnapshot } from "./snapshot";

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
const bot_config = config.BotConfig.getDefault();

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
  config.getFunctionsConfig("github.token")
);

// Mailgun Email client
const email_client: email.EmailClient = new email.EmailClient(
  config.getFunctionsConfig("mailgun.key"),
  config.getFunctionsConfig("mailgun.domain")
);

// Handler for Github issues
const issue_handler = new issues.IssueHandler(gh_client, bot_config);

// Handler for Github pull requests
const pr_handler = new pullrequests.PullRequestHandler(bot_config);

// Handler for Cron jobs
const cron_handler = new cron.CronHandler(gh_client, bot_config);

/**
 * Function that responds to Github events (HTTP webhook).
 */
export const githubWebhook = functions.https.onRequest(
  async (request, response) => {
    // Get event and action;
    const event = request.get("X-Github-Event");
    const action = request.body.action;

    const repo = request.body.repository;
    const sender = request.body.sender;
    const issue = request.body.issue;

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
        console.log(`Repository: ${repo.full_name}`);
      }
      if (sender) {
        console.log(`Sender: ${sender.login}`);
      }
      if (issue) {
        console.log(`Issue: ${issue.number}`);
      }
      console.log(
        "===========================END============================="
      );
    }

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

    const promises: Promise<any>[] = [];

    const collapsibleComments = [];

    for (const action of actions) {
      if (action == undefined) {
        log.warn("Got undefined action.");
        continue;
      }

      if (action.type == types.ActionType.GITHUB_COMMENT) {
        const commentAction = action as types.GithubCommentAction;

        // Special handling for collapsible comment actions at the end
        if (commentAction.collapse == true) {
          collapsibleComments.push(commentAction);
        } else {
          promises.push(executeAction(commentAction));
        }
      } else {
        promises.push(executeAction(action));
      }
    }

    // Handle all collapsible comments together.
    if (collapsibleComments.length == 1) {
      // Only one comment, post it directly.
      const comment = collapsibleComments[0];
      promises.push(executeAction(comment));
    } else if (collapsibleComments.length > 1) {
      // More than one comment, combine them into bullets.
      // TODO: What if the comments are cross-repo or cross-issue?
      let msg = "I found a few problems with this issue:";
      for (const comment of collapsibleComments) {
        msg += `\n  * ${comment.message}`;
      }

      const firstComment = collapsibleComments[0];
      promises.push(
        executeAction(
          // TODO: Collapse reasons
          new types.GithubCommentAction(
            firstComment.org,
            firstComment.name,
            firstComment.number,
            msg,
            false
          )
        )
      );
    }

    // Wait for the promise to resolve the HTTP request
    console.log(`Total actions taken: ${promises.length}`);
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
  .topic("clean_stale")
  .onPublish(async event => {
    console.log("The cleanup job is running!");
    const repos = bot_config.getAllRepos();
    for (const repo of repos) {
      // If we're in the ossbot-test project we don't want to do any cron processing
      // on prod repos.
      // TODO: Make this less hardcoded
      const isTestBot = process.env.GCLOUD_PROJECT === "ossbot-test";
      const isTestRepo = repo.org === "samtstern" && repo.name === "bottest";
      if (isTestBot && !isTestRepo) {
        console.log(`Test bot, skipping ${repo.name}`);
        continue;
      }

      const actions = await cron_handler.handleStaleIssues(repo.org, repo.name);

      console.log(
        `Taking ${actions.length} actions when cleaning up ${repo.name}`
      );
      const promises = actions.map(action => executeAction(action));
      await Promise.all(promises);
    }
  });

function executeAction(action: types.Action): Promise<any> {
  log.logData({
    event: "github_action",
    type: action.type,
    action: action,
    message: `Executing: ${action.toString()}}`
  });

  // Log the data to the admin log
  if (types.GITHUB_ISSUE_ACTIONS.includes(action.type)) {
    const ghAction = action as types.GithubIssueAction;
    const ref = database
      .ref("repo-log")
      .child(ghAction.org)
      .child(ghAction.name)
      .push();

    // TODO: Wait for this to finish?
    ref.set(new types.ActionLog(ghAction));
  }

  if (action.type == types.ActionType.GITHUB_COMMENT) {
    const commentAction = action as types.GithubCommentAction;
    return gh_client.addComment(
      commentAction.org,
      commentAction.name,
      commentAction.number,
      commentAction.message
    );
  }

  if (action.type == types.ActionType.GITHUB_ADD_LABEL) {
    const addLabelAction = action as types.GithubAddLabelAction;

    return gh_client.addLabel(
      addLabelAction.org,
      addLabelAction.name,
      addLabelAction.number,
      addLabelAction.label
    );
  }

  if (action.type == types.ActionType.GITHUB_REMOVE_LABEL) {
    const removeLabelAction = action as types.GithubRemoveLabelAction;

    return gh_client.removeLabel(
      removeLabelAction.org,
      removeLabelAction.name,
      removeLabelAction.number,
      removeLabelAction.label
    );
  }

  if (action.type == types.ActionType.GITHUB_CLOSE) {
    const closeAction = action as types.GithubCloseAction;
    return gh_client.closeIssue(
      closeAction.org,
      closeAction.name,
      closeAction.number
    );
  }

  if (action.type == types.ActionType.EMAIL_SEND) {
    const emailAction = action as types.SendEmailAction;
    return email_client.sendStyledEmail(
      emailAction.recipient,
      emailAction.subject,
      emailAction.header,
      emailAction.body,
      emailAction.link,
      emailAction.action
    );
  }

  return Promise.reject(`Unrecognized action: ${JSON.stringify(action)}`);
}
