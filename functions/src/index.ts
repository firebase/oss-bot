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

// Local includes
import * as github from "./github";
import * as email from "./email";
import * as issues from "./issues";
import * as pullrequests from "./pullrequests";
import * as cron from "./cron";
import * as config from "./config";
import * as types from "./types";
import * as util from "./util";
import * as log from "./log";

import { database } from "./database";
import { sendPubSub } from "./pubsub";

// This makes console.log() work as it used to in Node 8
// See: https://firebase.google.com/docs/functions/writing-and-viewing-logs#console-log
require("firebase-functions/lib/logger/compat");

export { SaveOrganizationSnapshot, SaveRepoSnapshot } from "./snapshot";

export {
  RepoIssueStatistics,
  GetRepoReport,
  GetRepoReportHTML,
  GetRepoTimeSeries,
  GetWeeklyReport,
  SaveWeeklyReport,
  GetWeeklyEmail,
  SendWeeklyEmail,
  SendWeeklyRepoEmails
} from "./report";

// Config
const bot_config = config.BotConfig.getDefault();

// GitHub events
enum GitHubEvent {
  ISSUE = "issues",
  ISSUE_COMMENT = "issue_comment",
  PULL_REQUEST = "pull_request"
}

// 15 days, in milliseconds
const PR_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

// GitHub API client
const gh_client: github.GitHubClient = new github.GitHubClient(
  config.getFunctionsConfig("github.token")
);

// Mailgun Email client
const email_client: email.EmailClient = new email.EmailClient(
  config.getFunctionsConfig("mailgun.key"),
  config.getFunctionsConfig("mailgun.domain")
);

// Handler for GitHub issues
const issue_handler = new issues.IssueHandler(gh_client, bot_config);

// Handler for GitHub pull requests
const pr_handler = new pullrequests.PullRequestHandler(bot_config);

// Handler for Cron jobs
const cron_handler = new cron.CronHandler(gh_client, bot_config);

/**
 * Function that responds to GitHub events (HTTP webhook).
 */
export const githubWebhook = functions
  .runWith(util.FUNCTION_OPTS)
  .https.onRequest(async (request, response) => {
    // Get event and action;
    const event = request.get("X-GitHub-Event");
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
      case GitHubEvent.ISSUE:
        actions = await issue_handler.handleIssueEvent(
          request.body,
          action,
          issue,
          repo,
          sender
        );
        break;
      case GitHubEvent.ISSUE_COMMENT:
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
      case GitHubEvent.PULL_REQUEST:
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
        const commentAction = action as types.GitHubCommentAction;

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
      let reason = "";
      for (const comment of collapsibleComments) {
        msg += `\n  * ${comment.message}`;
        if (comment.reason.length > 0) {
          reason += `${comment.reason}. `;
        }
      }

      const firstComment = collapsibleComments[0];
      promises.push(
        executeAction(
          new types.GitHubCommentAction(
            firstComment.org,
            firstComment.name,
            firstComment.number,
            msg,
            false,
            reason
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
  });

/**
 * Function that responds to pubsub events sent via an AppEngine crojob.
 */
export const botCleanup = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.schedule("every day 18:00")
  .onRun(async () => {
    console.log("The cleanup job is running!");
    const repos = bot_config.getAllRepos();
    for (const repo of repos) {
      await sendPubSub("bot-cleanup-repo", { org: repo.org, repo: repo.name });
    }

    return true;
  });

export const botCleanupRepo = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.topic("bot-cleanup-repo")
  .onPublish(async (event, ctx) => {
    const data = event.json;

    const org = data.org;
    const repo = data.repo;

    // If we're in the ossbot-test project we don't want to do any cron processing
    // on prod repos.
    // TODO: Make this less hardcoded
    const isTestBot = process.env.GCLOUD_PROJECT === "ossbot-test";
    const isTestRepo = org === "samtstern" && repo === "bottest";
    if (isTestBot && !isTestRepo) {
      console.log(`Test bot, skipping ${repo}`);
      return;
    }

    const cleanupConfig = cron_handler.config.getRepoCleanupConfig(org, repo);
    if (!cleanupConfig || !cleanupConfig.issue) {
      log.debug(`No issue cleanup config for ${org}/${repo}`);
      return;
    }

    // Pre-process issues on the repo to see if we missed any webhooks before moving on.
    const preprocessActions = await cron_handler.preProcessIssues(
      org,
      repo,
      cleanupConfig.issue
    );
    console.log(
      `Taking ${preprocessActions.length} actions before cleaning up ${org}/${repo}`
    );
    await safeExecuteActions(preprocessActions);

    // Process all issues on the repo
    const actions = await cron_handler.processIssues(
      org,
      repo,
      cleanupConfig.issue
    );
    console.log(
      `Taking ${actions.length} actions when cleaning up ${org}/${repo}`
    );
    await safeExecuteActions(actions);

    return true;
  });

async function safeExecuteActions(actions: types.Action[]): Promise<void> {
  for (const action of actions) {
    try {
      await executeAction(action);
    } catch (e) {
      console.warn(`Failed to execute action ${action.toString()}`, e);
    }
  }
}

async function executeAction(action: types.Action): Promise<any> {
  log.logData({
    event: "github_action",
    type: action.type,
    action: action,
    message: `Executing: ${action.toString()}}`
  });

  let actionPromise: Promise<any> | undefined;
  if (action.type == types.ActionType.GITHUB_COMMENT) {
    const commentAction = action as types.GitHubCommentAction;
    actionPromise = gh_client.addComment(
      commentAction.org,
      commentAction.name,
      commentAction.number,
      commentAction.message
    );
  } else if (action.type == types.ActionType.GITHUB_ADD_LABEL) {
    const addLabelAction = action as types.GitHubAddLabelAction;
    actionPromise = gh_client.addLabel(
      addLabelAction.org,
      addLabelAction.name,
      addLabelAction.number,
      addLabelAction.label
    );
  } else if (action.type == types.ActionType.GITHUB_REMOVE_LABEL) {
    const removeLabelAction = action as types.GitHubRemoveLabelAction;
    actionPromise = gh_client.removeLabel(
      removeLabelAction.org,
      removeLabelAction.name,
      removeLabelAction.number,
      removeLabelAction.label
    );
  } else if (action.type == types.ActionType.GITHUB_CLOSE) {
    const closeAction = action as types.GitHubCloseAction;
    actionPromise = gh_client.closeIssue(
      closeAction.org,
      closeAction.name,
      closeAction.number
    );
  } else if (action.type == types.ActionType.GITHUB_LOCK) {
    const lockAction = action as types.GitHubLockAction;
    actionPromise = gh_client.lockIssue(
      lockAction.org,
      lockAction.name,
      lockAction.number
    );
  } else if (action.type == types.ActionType.EMAIL_SEND) {
    const emailAction = action as types.SendEmailAction;
    actionPromise = email_client.sendStyledEmail(
      emailAction.recipient,
      emailAction.subject,
      emailAction.header,
      emailAction.body,
      emailAction.link,
      emailAction.action
    );
  } else if (action.type === types.ActionType.GITHUB_NO_OP) {
    actionPromise = Promise.resolve();
  } else {
    return Promise.reject(`Unrecognized action: ${JSON.stringify(action)}`);
  }

  // Wait for the action to finish
  await actionPromise;

  // Log the data to the admin log
  if (types.GITHUB_ISSUE_ACTIONS.includes(action.type)) {
    const ghAction = action as types.GitHubIssueAction;
    const ref = database()
      .ref("repo-log")
      .child(ghAction.org)
      .child(ghAction.name)
      .push();

    // Swallow errors that are only about the admin log.
    try {
      await ref.set(new types.ActionLog(ghAction));
    } catch (e) {
      console.warn("Failed to write admin log entry", e);
    }
  }

  // Return the original action promise, which should be complete at this point,
  // in case someone wants to chain from it.
  return actionPromise;
}
