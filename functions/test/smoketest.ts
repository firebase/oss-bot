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
import "mocha";
import { expect } from "chai";

import * as fs from "fs";
import * as path from "path";
import * as assert from "assert";

import * as issues from "../src/issues";
import * as pullrequests from "../src/pullrequests";
import * as cron from "../src/cron";
import * as config from "../src/config";
import * as types from "../src/types";

import * as mocks from "./mocks";

class SimpleIssue extends types.Issue {
  constructor(opts: any) {
    super();

    this.title = opts.title;
    this.body = opts.body;
  }
}

class SimplePullRequest extends types.PullRequest {
  constructor(opts: any) {
    super();

    this.title = opts.title;
    this.body = opts.body;
  }
}

class SimpleUser extends types.User {
  constructor(opts: any) {
    super();

    this.login = opts.login;
  }
}

class SimpleRepo extends types.Repository {
  constructor(opts: any) {
    super();

    this.name = opts.name;
    this.owner = new SimpleUser(opts.owner);
  }
}

// Label mapping configuration
const config_json = require("./mock_data/config.json");
const bot_config = new config.BotConfig(config_json);

// Issue event handler
const issue_handler = new issues.IssueHandler(
  new mocks.MockGithubClient("abc1234"),
  bot_config
);

// Issue event handler
const pr_handler = new pullrequests.PullRequestHandler(bot_config);

// Cron handler
const cron_handler = new cron.CronHandler(new mocks.MockGithubClient("abc123"));

// Standard repo
const test_repo = new SimpleRepo({
  name: "BotTest",
  owner: {
    login: "samtstern"
  }
});

// Issue with the template properly filled in
const good_issue = new SimpleIssue({
  title: "A good issue",
  body: fs
    .readFileSync(path.join(__dirname, "mock_data", "issue_template_filled.md"))
    .toString()
});

// Issue that is just the empty template
const bad_issue = new SimpleIssue({
  body: fs
    .readFileSync(path.join(__dirname, "mock_data", "issue_template_empty.md"))
    .toString()
});

// Issue that is partially filled out
const partial_issue = new SimpleIssue({
  body: fs
    .readFileSync(
      path.join(__dirname, "mock_data", "issue_template_partial.md")
    )
    .toString()
});

// Issue that is really a feature request
const fr_issue = new SimpleIssue({
  title: "FR: I want to change the Firebase",
  body: bad_issue.body
});

// Issue opened on the BotTest repo
const issue_opened_bot_test_full = require("./mock_data/issue_opened_bot_test_full.json");

// Issue opened on the BotTest repo, empty body
const issue_opened_bot_test_empty = require("./mock_data/issue_opened_bot_test_empty.json");

// Issue opened on the BotTest repo, only product filled in
const issue_opened_bot_test_partial = require("./mock_data/issue_opened_bot_test_partial.json");

// Issue from the JS SDK that was not labeled 'auth' but should have been
const issue_opened_js_sdk_auth = require("./mock_data/issue_opened_js_sdk_22.json");

// Issue from the JS SDK that was not labeled 'database' but should have been
const issue_opened_js_sdk_db = require("./mock_data/issue_opened_js_sdk_35.json");

// Issue from the JS SDK that was not labeled 'messaging' but should have been
const issue_opened_js_sdk_messaging = require("./mock_data/issue_opened_js_sdk_59.json");

// Comment on issue in the BotTest repo
const comment_created_bot_test = require("./mock_data/comment_created_bot_test.json");

// Fake WebhookEvent
const we = {
  action: "foo"
};

function assertMatchingAction(actions: types.Action[], props: any): void {
  assert.ok(
    hasMatchingAction(actions, props),
    `Actions: ${JSON.stringify(actions)}\nExpected: ${JSON.stringify(props)}`
  );
}

function hasMatchingAction(actions: types.Action[], props: any): boolean {
  for (const action of actions) {
    if (actionMatches(action, props)) {
      return true;
    }
  }

  return false;
}

function actionMatches(action: types.Action, props: any): boolean {
  const actionEntries = Object.entries(action);
  for (const ind in actionEntries) {
    const entry = actionEntries[ind];
    const key = entry[0];
    const val = entry[1];

    console.log(`${key} --> ${val}`);

    if (props[key] && props[key] != val) {
      return false;
    }
  }

  return true;
}

describe("The OSS Robot", () => {
  it("should have a valid production config", () => {
    const valid_keys = ["labels", "cleanup", "templates"];
    const prod_config = require("../config/config.json");

    for (const org in prod_config) {
      for (const repo in prod_config[org]) {
        console.log(`Config for ${org}/${repo}`);
        const repo_config = prod_config[org][repo];

        // Make sure each key in the repo config is valid
        for (const key in repo_config) {
          assert.ok(valid_keys.indexOf(key) >= 0, `${key} is a valid key`);
        }
      }
    }
  });

  it("should handle issue opened, take action", async () => {
    const actions = await issue_handler.handleIssueEvent(
      undefined,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_full.issue,
      issue_opened_bot_test_full.repository,
      issue_opened_bot_test_full.sender
    );

    assert.equal(actions.length, 2, "Should be two actions");

    assertMatchingAction(actions, {
      types: types.ActionType.GITHUB_COMMENT,
      message: issues.MSG_FOLLOW_TEMPLATE
    });

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_LABEL,
      label: "database"
    });
  });

  it("should handle comment created, take no action", async () => {
    const actions = await issue_handler.handleIssueCommentEvent(
      undefined,
      issues.CommentAction.CREATED,
      comment_created_bot_test.issue,
      comment_created_bot_test.comment,
      comment_created_bot_test.repository,
      comment_created_bot_test.sender
    );

    assert.equal(actions.length, 0, "Should be no actions.");
  });

  it("should check a good issue against the template", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", good_issue)
      .then((res: any) => {
        assert.ok(res.matches, "Matches template.");
      });
  });

  it("should check a bad issue against the template", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", bad_issue)
      .then((res: any) => {
        assert.ok(!res.matches, "Does not match template.");
      });
  });

  it("should detect a partially mangled issue", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", partial_issue)
      .then((res: any) => {
        assert.ok(!res.matches, "Does not match template");
      });
  });

  it("should correctly handle a totally empty issue template", async () => {
    const actions = await issue_handler.handleIssueEvent(
      issue_opened_bot_test_empty,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_empty.issue,
      test_repo,
      undefined
    );

    assert.equal(actions.length, 3, "Should be three actions");

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_COMMENT,
      message: issues.MSG_MISSING_INFO
    });

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_COMMENT,
      message: issues.MSG_NEEDS_TRIAGE
    });

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_LABEL,
      label: "needs-triage"
    });
  });

  it("should handle a partially correct issue", () => {
    const issue = issue_opened_bot_test_partial.issue;

    // Should match the auth issue
    const label = issue_handler.getRelevantLabel("samtstern", "BotTest", issue);
    assert.equal(label, "auth", "Label is auth.");

    // Should fail the tempalte check for not filling out all sections
    return issue_handler.checkMatchesTemplate("foo", "bar", issue).then(res => {
      assert.ok(!res.matches, "Does not fully match template.");
      assert.ok(
        res.message.indexOf("Hmmm") == -1,
        "Message does not contain 'Hmm.'"
      );
      assert.ok(
        res.message.indexOf("forgot to") > -1,
        "Message does contain 'forgot to'."
      );
    });
  });

  it("should correctly identify a feature request", () => {
    assert.ok(issue_handler.isFeatureRequest(fr_issue), "Is a feature request");
    assert.ok(
      !issue_handler.isFeatureRequest(bad_issue),
      "Is not a feature request"
    );
  });

  it("should correctly identify a real auth issue", () => {
    const issue = issue_opened_js_sdk_auth.issue;
    issue_handler.onNewIssue(test_repo, issue);
  });

  it("should correctly label a real database issue", () => {
    const issue = issue_opened_js_sdk_db.issue;
    const label = issue_handler.getRelevantLabel("samtstern", "BotTest", issue);
    assert.ok(label == "database", "Is a database issue");
  });

  it("should correctly label a real messaging issue", () => {
    const issue = issue_opened_js_sdk_messaging.issue;
    const label = issue_handler.getRelevantLabel("samtstern", "BotTest", issue);
    assert.ok(label == "messaging", "Is a messaging issue");
  });

  it("should respect template configs", () => {
    const custom = bot_config.getRepoTemplateConfig(
      "samtstern",
      "BotTest",
      "issue"
    );
    assert.ok(
      custom == ".github/ISSUE_TEMPLATE.md",
      "Finds the custom template"
    );

    const regular = bot_config.getRepoTemplateConfig("foo", "bar", "issue");
    assert.ok(regular === undefined, "Does not find an unspecified template");
  });

  it("should send emails when a recognized label is added", () => {
    return issue_handler.onIssueLabeled(test_repo, good_issue, "auth");
  });

  it("should not send emails when a random label is added", () => {
    return issue_handler.onIssueLabeled(test_repo, good_issue, "foo");
  });

  it("should correctly clean up old pull requests", () => {
    return cron_handler.handleCleanup("samtstern", "BotTest", 0);
  });

  it("should detect issue link in a PR", () => {
    const pr_none = new SimplePullRequest({
      body: "Hey this is bad!"
    });

    assert.ok(!pr_handler.hasIssueLink(test_repo, pr_none), "Has no link.");

    const pr_shortlink = new SimplePullRequest({
      body: "Hey this is in reference to #4"
    });

    assert.ok(
      pr_handler.hasIssueLink(test_repo, pr_shortlink),
      "Has short link."
    );

    const pr_longlink = new SimplePullRequest({
      body:
        "Hey this is in reference to https://github.com/samtstern/BotTest/issues/4"
    });

    assert.ok(
      pr_handler.hasIssueLink(test_repo, pr_longlink),
      "Has long link."
    );
  });

  it("should skip some PRs", () => {
    const pr_skip = new SimplePullRequest({
      title: "[triage-skip] Don't triage me"
    });

    assert.ok(pr_handler.hasSkipTag(test_repo, pr_skip), "Has skip tag");

    const pr_triage = new SimplePullRequest({
      title: "Hey whatever"
    });

    assert.ok(
      !pr_handler.hasSkipTag(test_repo, pr_triage),
      "Does not have skip tag"
    );
  });
});
