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
var functions = require('firebase-functions');

// Local includes
var github = require('./github.js');
var email = require('./email.js');
var issues = require('./issues.js');
var pullrequests = require('./pullrequests.js');
var cron = require('./cron.js');

// Config
var config = require('./config/config.json');

// Github events
const EVENT_ISSUE = 'issues';
const EVENT_ISSUE_COMMENT = 'issue_comment';
const EVENT_PULL_REQUEST = 'pull_request';

// 15 days, in milliseconds
const PR_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

// Github API client
var gh_client = new github.GithubClient(functions.config().github.token);

// Mailgun Email client
var email_client = new email.EmailClient(
  functions.config().mailgun.key,
  functions.config().mailgun.domain
);

// Handler for Github issues
var issue_handler = new issues.IssueHandler(gh_client, email_client, config);

// Handler for Github pull requests
var pr_handler = new pullrequests.PullRequestHandler(
  gh_client,
  email_client,
  config
);

// Handler for Cron jobs
var cron_handler = new cron.CronHandler(gh_client);

/**
 * Function that responds to Github events (HTTP webhook).
 */
exports.githubWebhook = functions.https.onRequest((request, response) => {
  // Get event and action;
  var evt = request.get('X-Github-Event');
  var action = request.body.action;

  // Get repo and sender
  var repo = request.body.repository;
  var sender = request.body.sender;

  // Confirm that there is some event
  if (!evt) {
    console.log('No github event');
    response.send('Fail: no event.');
    return;
  } else {
    // Log some basic info
    console.log('Event: ' + evt);
    if (repo) {
      console.log('Repository: ' + repo.full_name);
    }
    if (sender) {
      console.log('Sender: ' + sender.login);
    }
  }

  // Handle the event appropriately
  var handlePromise;
  var issue = request.body.issue;

  switch (evt) {
    case EVENT_ISSUE:
      handlePromise = issue_handler.handleIssueEvent(
        request.body,
        action,
        issue,
        repo,
        sender
      );
      break;
    case EVENT_ISSUE_COMMENT:
      var comment = request.body.comment;
      handlePromise = issue_handler.handleIssueCommentEvent(
        request.body,
        action,
        issue,
        comment,
        repo,
        sender
      );
      break;
    case EVENT_PULL_REQUEST:
      var pr = request.body.pull_request;
      handlePromise = pr_handler.handlePullRequestEvent(
        request.body,
        action,
        pr,
        repo,
        sender
      );
      break;
    default:
      response.send('Unknown event: ' + evt);
      return;
  }

  // Wait for the promise to resolve the HTTP request
  handlePromise
    .then(res => {
      response.send('OK!');
    })
    .catch(e => {
      response.send('Error!');
    });
});

/**
 * Function that responds to pubsub events sent via an AppEngine crojob.
 */
exports.timedCleanup = functions.pubsub.topic('cleanup').onPublish(event => {
  console.log('The cleanup job is running!');

  var promises = [];

  for (var org in config) {
    for (var name in config[org]) {
      // Get config for the repo
      var repo_config = config[org][name];

      // Get expiry from config
      var expiry = PR_EXPIRY_MS;
      if (repo_config.cleanup && repo_config.cleanup.pr) {
        expiry = repo_config.cleanup.pr;
      }

      console.log(`Cleaning up: ${org}/${name}, expiry: ${expiry}`);
      var cleanupPromise = cron_handler.handleCleanup(org, name, expiry);
      promises.push(cleanupPromise);
    }
  }

  return Promise.all(promises);
});
