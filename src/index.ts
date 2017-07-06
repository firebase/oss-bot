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

// Config
const config_json = require("./config/config.json");
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
const gh_client = new github.GithubClient(functions.config().github.token);

// Mailgun Email client
const email_client = new email.EmailClient(
  functions.config().mailgun.key,
  functions.config().mailgun.domain
);

// Handler for Github issues
const issue_handler = new issues.IssueHandler(
  gh_client,
  email_client,
  bot_config
);

// Handler for Github pull requests
const pr_handler = new pullrequests.PullRequestHandler(
  gh_client,
  email_client,
  bot_config
);

// Handler for Cron jobs
const cron_handler = new cron.CronHandler(gh_client);

/**
 * Function that responds to Github events (HTTP webhook).
 */
export const githubWebhook = functions.https.onRequest((request, response) => {
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
    console.log("===========================START============================");
    console.log(`Event: ${event}/${action}`);
    if (repo) {
      console.log("Repository: " + repo.full_name);
    }
    if (sender) {
      console.log("Sender: " + sender.login);
    }
    console.log("===========================END=============================");
  }

  // Handle the event appropriately
  let handlePromise: Promise<any>;
  const issue = request.body.issue;

  switch (event) {
    case GithubEvent.ISSUE:
      handlePromise = issue_handler.handleIssueEvent(
        request.body,
        action,
        issue,
        repo,
        sender
      );
      break;
    case GithubEvent.ISSUE_COMMENT:
      const comment = request.body.comment;
      handlePromise = issue_handler.handleIssueCommentEvent(
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
      handlePromise = pr_handler.handlePullRequestEvent(
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

  // Wait for the promise to resolve the HTTP request
  handlePromise
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
export const timedCleanup = functions.pubsub.topic("cleanup").onPublish(event => {
  console.log("The cleanup job is running!");

  const promises: Promise<any>[] = [];

  bot_config.getAllRepos().forEach(function(repo) {
    // Get config for the repo
    const repo_config = this.bot_config.getRepoConfig(repo.org, repo.name);

    // Get expiry from config
    let expiry = PR_EXPIRY_MS;
    if (repo_config.cleanup && repo_config.cleanup.pr) {
      expiry = repo_config.cleanup.pr;
    }

    console.log(`Cleaning up: ${repo.org}/${repo.name}, expiry: ${expiry}`);
    const cleanupPromise = cron_handler.handleCleanup(
      repo.org,
      repo.name,
      expiry
    );
    promises.push(cleanupPromise);
  });

  return Promise.all(promises);
});
