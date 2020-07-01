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

import * as fs from "fs";
import * as path from "path";
import * as assert from "assert";
import * as simple from "simple-mock";

import * as log from "../log";
import * as issues from "../issues";
import * as pullrequests from "../pullrequests";
import * as config from "../config";
import * as types from "../types";
import * as mocks from "./mocks";
import * as snapshot from "../snapshot";

class SimpleIssue extends types.github.Issue {
  constructor(opts: any) {
    super();

    this.title = opts.title;
    this.user = opts.user;
    this.body = opts.body;
  }
}

class SimplePullRequest extends types.github.PullRequest {
  constructor(opts: any) {
    super();

    this.title = opts.title;
    this.body = opts.body;
    this.user = opts.user;
  }
}

class SimpleUser extends types.github.User {
  constructor(opts: any) {
    super();

    this.login = opts.login;
  }
}

class SimpleRepo extends types.github.Repository {
  constructor(opts: any) {
    super();

    this.name = opts.name;
    this.owner = new SimpleUser(opts.owner);
  }
}

// Bot configuration
const config_json = require("./mock_data/config.json");
const bot_config = new config.BotConfig(config_json);

// Issue event handler
const issue_handler = new issues.IssueHandler(
  new mocks.MockGitHubClient("abc1234"),
  bot_config
);

// Issue event handler
const pr_handler = new pullrequests.PullRequestHandler(bot_config);

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
  user: {
    login: "samtstern"
  },
  body: fs
    .readFileSync(path.join(__dirname, "mock_data", "issue_template_filled.md"))
    .toString()
});

// Good issue with headers slightly modified
const good_issue_no_required = new SimpleIssue({
  title: "A good issue",
  user: {
    login: "samtstern"
  },
  body: fs
    .readFileSync(
      path.join(__dirname, "mock_data", "issue_template_filled_no_required.md")
    )
    .toString()
});

// Issue that is just the empty template
const empty_issue = new SimpleIssue({
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

// Issue with options, empty
const issue_with_opts_empty = new SimpleIssue({
  body: fs
    .readFileSync(
      path.join(__dirname, "mock_data", "issue_template_empty_with_opts.md")
    )
    .toString()
});

// Issue with options, bad
const issue_with_opts_bad = new SimpleIssue({
  body: fs
    .readFileSync(path.join(__dirname, "mock_data", "issue_with_opts_bad.md"))
    .toString()
});

// Issue that is really a feature request
const fr_issue = new SimpleIssue({
  title: "FR: I want to change the Firebase",
  body: empty_issue.body
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
const whEvent = new types.github.WebhookEvent();
whEvent.action = "foo";

// Fake Sender
const sender = new types.github.Sender();
sender.login = "johndoe";

function assertSameActions(actual: types.Action[], expected: any[]) {
  assert.equal(
    actual.length,
    expected.length,
    `Actions array has the same length (${actual.length}) as expected (${
      expected.length
    }): ${JSON.stringify(actual)}`
  );

  for (const e of expected) {
    assertMatchingAction(actual, e);
  }
}

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

    if (props[key] && props[key] != val) {
      return false;
    }
  }

  return true;
}

describe("The OSS Robot", () => {
  before(() => {
    log.setLogLevel(log.Level.WARN);
  });

  after(() => {
    log.setLogLevel(log.Level.ALL);
  });

  beforeEach(() => {
    // TODO(samstern): Could use the emulators so I don't need this.
    simple.mock(snapshot, "userIsCollaborator").resolveWith(false);
  });

  afterEach(() => {
    // Reset the standard config.
    issue_handler.setConfig(bot_config);
  });

  it("should have a valid production config", () => {
    if (process.env["CI"] == "true") {
      log.debug("On Travis, skipping config test.");
      return;
    }

    const valid_keys = [
      "labels",
      "cleanup",
      "templates",
      "reports",
      "validation"
    ];
    const prod_config = require("../../config/config.json");

    for (const org in prod_config) {
      for (const repo in prod_config[org]) {
        log.debug(`Config for ${org}/${repo}`);
        const repo_config = prod_config[org][repo];

        // Make sure each key in the repo config is valid
        for (const key in repo_config) {
          assert.ok(
            valid_keys.indexOf(key) >= 0,
            `${key} is not a valid key, repo ${repo} has config ${JSON.stringify(
              repo_config
            )}`
          );
        }
      }
    }
  });

  it("should handle issue opened, take action", async () => {
    const actions = await issue_handler.handleIssueEvent(
      whEvent,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_full.issue,
      issue_opened_bot_test_full.repository,
      issue_opened_bot_test_full.sender
    );

    assert.equal(actions.length, 1, "Should be one action");

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_ADD_LABEL,
      label: "database"
    });
  });

  it("should handle comment created, take no action", async () => {
    const actions = await issue_handler.handleIssueCommentEvent(
      whEvent,
      issues.CommentAction.CREATED,
      comment_created_bot_test.issue,
      comment_created_bot_test.comment,
      comment_created_bot_test.repository,
      comment_created_bot_test.sender
    );

    assert.equal(actions.length, 0, "Should be no actions.");
  });

  it("should take no action on an unsupported event", async () => {
    // Note: this test is not a good black box because we are assuming
    // that certain events are not handled. It's possible that expanded event
    // support in the future could make this test fail, in which case we can
    // just delete it.

    const commentActions = await issue_handler.handleIssueCommentEvent(
      whEvent,
      issues.CommentAction.EDITED,
      comment_created_bot_test.issue,
      comment_created_bot_test.comment,
      comment_created_bot_test.repository,
      comment_created_bot_test.sender
    );

    const issueActions = await issue_handler.handleIssueEvent(
      whEvent,
      issues.IssueAction.UNASSIGNED,
      comment_created_bot_test.issue,
      comment_created_bot_test.repository,
      comment_created_bot_test.sender
    );

    assert.equal(commentActions.length, 0, "Should be no comment actions.");
    assert.equal(issueActions.length, 0, "Should be no issue actions.");
  });

  it("should check a good issue against the template", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", good_issue)
      .then((res: any) => {
        assert.ok(res.matches, `Matches template: ${JSON.stringify(res)}`);
      });
  });

  it("should not care if the section headers don't contain [REQUIRED], etc", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", good_issue_no_required)
      .then((res: any) => {
        assert.ok(res.matches, `Matches template: ${JSON.stringify(res)}`);
      });
  });

  it("should check a bad issue against the template", () => {
    return issue_handler
      .checkMatchesTemplate("foo", "bar", empty_issue)
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
      sender
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
      type: types.ActionType.GITHUB_ADD_LABEL,
      label: "needs-triage"
    });
  });

  it("should let a collaborator file a totally crap issue", async () => {
    // Make everyone a collaborator
    simple.mock(snapshot, "userIsCollaborator").resolveWith(true);

    const actions = await issue_handler.handleIssueEvent(
      issue_opened_bot_test_empty,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_empty.issue,
      test_repo,
      sender
    );

    assert.equal(actions.length, 1, "Should be one action");

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_NO_OP
    });
  });

  it("should label failed validation issues, if specified", async () => {
    const newConfig = new config.BotConfig({
      samtstern: {
        bottest: {
          templates: {
            issue: ".github/ISSUE_TEMPLATE.md"
          },
          validation: {
            templates: {
              ".github/ISSUE_TEMPLATE.md": {
                validation_failed_label: "validation-failed"
              }
            }
          }
        }
      }
    });

    issue_handler.setConfig(newConfig);

    const actions = await issue_handler.handleIssueEvent(
      issue_opened_bot_test_empty,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_empty.issue,
      test_repo,
      sender
    );

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_ADD_LABEL,
      label: "validation-failed"
    });
  });

  it("should handle 'relaxed' required section validation", async () => {
    // With a 'relaxed' config the bot should accept the issue because at least one required
    // section was filled out.
    const relaxedConfig = new config.BotConfig({
      samtstern: {
        bottest: {
          templates: {
            issue: ".github/ISSUE_TEMPLATE.md"
          },
          validation: {
            templates: {
              ".github/ISSUE_TEMPLATE.md": {
                required_section_validation: "relaxed"
              }
            }
          }
        }
      }
    });

    issue_handler.setConfig(relaxedConfig);
    const relaxedActions = await issue_handler.handleIssueEvent(
      issue_opened_bot_test_partial,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_partial.issue,
      test_repo,
      sender
    );
    assertSameActions(relaxedActions, []);

    // With a strict config, the bot should get angry about the exact same issue.
    const strictConfig = new config.BotConfig({
      samtstern: {
        bottest: {
          templates: {
            issue: ".github/ISSUE_TEMPLATE.md"
          },
          validation: {
            templates: {
              ".github/ISSUE_TEMPLATE.md": {
                required_section_validation: "strict"
              }
            }
          }
        }
      }
    });

    issue_handler.setConfig(strictConfig);
    const strictActions = await issue_handler.handleIssueEvent(
      issue_opened_bot_test_partial,
      issues.IssueAction.OPENED,
      issue_opened_bot_test_partial.issue,
      test_repo,
      sender
    );
    assertMatchingAction(strictActions, {
      type: types.ActionType.GITHUB_COMMENT
    });
  });

  it("should handle a partially correct issue", () => {
    const issue = issue_opened_bot_test_partial.issue;

    // Should match the auth issue
    const labelRes = issue_handler.config.getRelevantLabel(
      "samtstern",
      "BotTest",
      issue
    );
    assert.equal(labelRes.label, "auth", "Label is auth.");

    // Should fail the tempalte check for not filling out all sections
    return issue_handler.checkMatchesTemplate("foo", "bar", issue).then(res => {
      assert.ok(!res.matches, "Does not fully match template.");
      assert.equal(res.message, issues.MSG_MISSING_INFO);
    });
  });

  it("should get the right template config when unspecified", () => {
    const issue = good_issue;

    const opts = issue_handler.parseIssueOptions("samtstern", "BotTest", issue);
    const path = bot_config.getRepoTemplateConfig(
      "samtstern",
      "BotTest",
      "issue"
    );

    assert.ok(opts.validate, "Default is to validate.");
    assert.equal(opts.path, path);
  });

  it("should get the right template config when specified", () => {
    const issue = issue_with_opts_empty;

    const opts = issue_handler.parseIssueOptions("samtstern", "BotTest", issue);

    assert.ok(!opts.validate, "Validate false is specified");
    assert.equal(opts.path, "issue_template_empty_with_opts.md");
  });

  it("should ignore validation when the opts say not to", () => {
    const issue = issue_with_opts_empty;

    return issue_handler.checkMatchesTemplate("foo", "bar", issue).then(res => {
      assert.ok(res.matches, "Matches because there was no validation");
    });
  });

  it("should validate against the right template", () => {
    const issue = issue_with_opts_bad;

    return issue_handler.checkMatchesTemplate("foo", "bar", issue).then(res => {
      assert.ok(!res.matches, "Matches because there was no validation");
      assert.equal(
        res.message,
        issues.MSG_MISSING_INFO,
        `Message contains required: ${res.message}`
      );
    });
  });

  it("should correctly identify a feature request", () => {
    assert.ok(issue_handler.isFeatureRequest(fr_issue), "Is a feature request");
    assert.ok(
      !issue_handler.isFeatureRequest(empty_issue),
      "Is not a feature request"
    );
  });

  it("should correctly identify a real auth issue", async () => {
    const issue = issue_opened_js_sdk_auth.issue;
    const actions = await issue_handler.onNewIssue(test_repo, issue);

    assertMatchingAction(actions, {
      type: types.ActionType.GITHUB_ADD_LABEL,
      label: "auth"
    });
  });

  it("should correctly label a real database issue", () => {
    const issue = issue_opened_js_sdk_db.issue;
    const labelRes = issue_handler.config.getRelevantLabel(
      "samtstern",
      "BotTest",
      issue
    );
    assert.ok(labelRes.label == "database", "Is a database issue");
  });

  it("should correctly label a real messaging issue", () => {
    const issue = issue_opened_js_sdk_messaging.issue;
    const labelRes = issue_handler.config.getRelevantLabel(
      "samtstern",
      "BotTest",
      issue
    );
    assert.ok(labelRes.label == "messaging", "Is a messaging issue");
  });

  it("should correctly deal with upper/lower case labels", () => {
    const issue = new types.github.Issue();
    const dbLabel = new types.github.Label();
    dbLabel.name = "DatabaSe";
    issue.labels = [dbLabel];

    const labelRes = issue_handler.config.getRelevantLabel(
      "samtstern",
      "BotTest",
      issue
    );
    assert.equal(labelRes.label, dbLabel.name, "Is a database issue");
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

  it("should send emails when a recognized label is added to an issue", async () => {
    const actions = await issue_handler.onIssueLabeled(
      test_repo,
      good_issue,
      "auth"
    );

    assertMatchingAction(actions, {
      type: types.ActionType.EMAIL_SEND
    });
  });

  it("should send emails when a recognized label is added to a pull request", async () => {
    const actions = await pr_handler.onPullRequestLabeled(
      test_repo,
      new SimplePullRequest({
        body: "Hey this is an auth issue!",
        user: {
          login: "samtstern"
        }
      }),
      "auth"
    );

    assertMatchingAction(actions, {
      type: types.ActionType.EMAIL_SEND
    });
  });

  it("should not send emails when a random label is added", async () => {
    const actions = await issue_handler.onIssueLabeled(
      test_repo,
      good_issue,
      "foo"
    );

    assert.equal(actions.length, 0, "Should take no action.");
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
