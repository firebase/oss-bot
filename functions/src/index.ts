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
export const githubWebhook = functions
  .runWith(util.FUNCTION_OPTS)
  .https.onRequest(async (request, response) => {
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
          new types.GithubCommentAction(
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
      // If we're in the ossbot-test project we don't want to do any cron processing
      // on prod repos.
      // TODO: Make this less hardcoded
      const isTestBot = process.env.GCLOUD_PROJECT === "ossbot-test";
      const isTestRepo = repo.org === "samtstern" && repo.name === "bottest";
      if (isTestBot && !isTestRepo) {
        console.log(`Test bot, skipping ${repo.name}`);
        continue;
      }

      const actions = await cron_handler.processIssues(repo.org, repo.name);

      console.log(
        `Taking ${actions.length} actions when cleaning up ${repo.name}`
      );

      // Run each action in order but don't explode on failure.
      for (const action of actions) {
        try {
          await executeAction(action);
        } catch (e) {
          console.warn(`Failed to execute action ${action.toString()}`, e);
        }
      }
    }

    return true;
  });

async function executeAction(action: types.Action): Promise<any> {
  log.logData({
    event: "github_action",
    type: action.type,
    action: action,
    message: `Executing: ${action.toString()}}`
  });

  let actionPromise: Promise<any> | undefined;
  if (action.type == types.ActionType.GITHUB_COMMENT) {
    const commentAction = action as types.GithubCommentAction;
    actionPromise = gh_client.addComment(
      commentAction.org,
      commentAction.name,
      commentAction.number,
      commentAction.message
    );
  } else if (action.type == types.ActionType.GITHUB_ADD_LABEL) {
    const addLabelAction = action as types.GithubAddLabelAction;
    actionPromise = gh_client.addLabel(
      addLabelAction.org,
      addLabelAction.name,
      addLabelAction.number,
      addLabelAction.label
    );
  } else if (action.type == types.ActionType.GITHUB_REMOVE_LABEL) {
    const removeLabelAction = action as types.GithubRemoveLabelAction;
    actionPromise = gh_client.removeLabel(
      removeLabelAction.org,
      removeLabelAction.name,
      removeLabelAction.number,
      removeLabelAction.label
    );
  } else if (action.type == types.ActionType.GITHUB_CLOSE) {
    const closeAction = action as types.GithubCloseAction;
    actionPromise = gh_client.closeIssue(
      closeAction.org,
      closeAction.name,
      closeAction.number
    );
  } else if (action.type == types.ActionType.GITHUB_LOCK) {
    const lockAction = action as types.GithubLockAction;
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
    const ghAction = action as types.GithubIssueAction;
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
