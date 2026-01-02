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

import * as assert from "assert";

import * as config from "../config.js";
import * as cron from "../cron.js";
import * as github from "../github.js";
import * as log from "../log.js";
import * as issues from "../issues.js";
import * as types from "../types.js";
import * as util from "./test-util.js";
import { workingDaysAgo, getDateWorkingDaysBefore } from "../util.js";

// Stale issue from iOS SDK
import issue_stale_ios_sdk from "./mock_data/stale_issue.json" with { type: "json" };
import issue_stale_comments from "./mock_data/stale_issue_comments.json" with { type: "json" };

// Bot configuration
import config_json from "./mock_data/config.json" with { type: "json" };
const bot_config = new config.BotConfig(config_json);

const NOW_TIME = new Date();

const JUST_NOW = new Date(NOW_TIME.getTime() - 1000).toISOString();
const SEVEN_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 7).toISOString();
const FOURTEEN_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 14).toISOString();
const NINETY_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 90).toISOString();
const HUNDREDTWENTY_WKD_AGO = getDateWorkingDaysBefore(
  NOW_TIME,
  120,
).toISOString();

const DEFAULT_CONFIG: types.IssueCleanupConfig = {
  label_needs_info: "needs-info",
  label_needs_attention: "needs-attention",
  label_stale: "stale",
  auto_close_labels: {
    add: ["closed-by-bot", "add-on-close"],
    remove: ["remove-on-close"],
  },
  ignore_labels: ["feature-request"],
  needs_info_days: 7,
  stale_days: 3,
};

const LOCKING_CONFIG = Object.assign({}, DEFAULT_CONFIG);
LOCKING_CONFIG.lock_days = 60;

const STALE_ISSUE: types.internal.Issue = {
  number: 1,
  state: "open",
  title: "Some Issue",
  body: "Body of my issue",
  user: { login: "some-user" },
  labels: [{ name: "stale" }],
  created_at: FOURTEEN_WKD_AGO,
  updated_at: FOURTEEN_WKD_AGO,
  locked: false,
};

const NEEDS_INFO_ISSUE: types.internal.Issue = {
  number: 2,
  state: "open",
  title: "Some Issue",
  body: "Body of my issue",
  user: { login: "some-user" },
  labels: [{ name: "needs-info" }],
  created_at: SEVEN_WKD_AGO,
  updated_at: SEVEN_WKD_AGO,
  locked: false,
};

const NEW_CLOSED_ISSUE: types.internal.Issue = {
  number: 3,
  state: "closed",
  title: "Some Issue",
  body: "Body of my issue",
  user: { login: "some-user" },
  labels: [],
  created_at: FOURTEEN_WKD_AGO,
  updated_at: FOURTEEN_WKD_AGO,
  closed_at: SEVEN_WKD_AGO,
  locked: false,
};

const OLD_CLOSED_ISSUE: types.internal.Issue = {
  number: 4,
  state: "closed",
  title: "Some Issue",
  body: "Body of my issue",
  user: { login: "some-user" },
  labels: [],
  created_at: HUNDREDTWENTY_WKD_AGO,
  updated_at: HUNDREDTWENTY_WKD_AGO,
  closed_at: NINETY_WKD_AGO,
  locked: false,
};

describe("Stale issue handler", async () => {
  beforeEach(() => {
    log.setLogLevel(log.Level.WARN);
  });

  afterEach(() => {
    log.setLogLevel(log.Level.ALL);
  });

  it("properly calculates working days", async () => {
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      assert.equal(workingDaysAgo(getDateWorkingDaysBefore(now, i), now), i);
    }
  });

  it("should do nothing to a needs-info issue that is fresh", async () => {
    const needsInfo: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that needs info",
      body: "foo bar",
      user: {
        login: "some-user",
      },
      labels: [{ name: "needs-info" }],
      created_at: JUST_NOW,
      updated_at: JUST_NOW,
      locked: false,
    };

    const issueComments = [
      {
        body: "My comment",
        user: { login: "some-user" },
        created_at: JUST_NOW,
        updated_at: JUST_NOW,
      },
    ];

    class MockClient extends github.GitHubClient {
      constructor() {
        super("fake-token");
      }
      getCommentsForIssue(): Promise<any[]> {
        return Promise.resolve(issueComments);
      }
    }
    const cron_handler = new cron.CronHandler(new MockClient(), bot_config);

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      needsInfo,
      DEFAULT_CONFIG,
    );
    assert.deepEqual(actions, []);
  });

  it("should mark a needs-info issue stale after {X} days", async () => {
    const needsInfo: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that needs info",
      body: "foo bar",
      user: {
        login: "some-user",
      },
      labels: [{ name: "needs-info" }],
      created_at: FOURTEEN_WKD_AGO,
      updated_at: FOURTEEN_WKD_AGO,
      locked: false,
    };

    const issueComments = [
      {
        body: "My comment",
        user: { login: "some-user" },
        created_at: FOURTEEN_WKD_AGO,
        updated_at: FOURTEEN_WKD_AGO,
      },
    ];

    class MockClient extends github.GitHubClient {
      constructor() {
        super("fake-token");
      }
      getCommentsForIssue(): Promise<any[]> {
        return Promise.resolve(issueComments);
      }
    }
    const cron_handler = new cron.CronHandler(new MockClient(), bot_config);

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      needsInfo,
      DEFAULT_CONFIG,
    );

    util.actionsEqual(
      actions[0],
      new types.GitHubAddLabelAction(
        "samtstern",
        "bottest",
        needsInfo.number,
        DEFAULT_CONFIG.label_stale,
      ),
    );
  });

  it("should comment and close a stale issue after {X} days", async () => {
    const issue = issue_stale_ios_sdk;
    const issueComments = issue_stale_comments;

    const config = DEFAULT_CONFIG;
    config.auto_close_labels = {
      add: ["closed-by-bot", "add-on-close"],
      remove: ["needs-info"],
    };
    config.label_stale = "no-recent-activity";

    class MockClient extends github.GitHubClient {
      constructor() {
        super("fake-token");
      }
      getCommentsForIssue(): Promise<any[]> {
        return Promise.resolve(issueComments as any);
      }
      closeIssue() {
        return Promise.resolve(undefined);
      }
      addLabel() {
        return Promise.resolve(undefined);
      }
      removeLabel() {
        return Promise.resolve(undefined);
      }
      addComment() {
        return Promise.resolve(undefined);
      }
    }
    const cron_handler = new cron.CronHandler(new MockClient(), bot_config);

    const actions = await cron_handler.handleStaleIssue(
      "firebase",
      "firebase-ios-sdk",
      issue as types.internal.Issue,
      DEFAULT_CONFIG,
    );

    util.actionsListEqual(actions, [
      new types.GitHubCommentAction(
        "firebase",
        "firebase-ios-sdk",
        issue.number,
        cron_handler.getCloseComment(issue.user.login),
        false,
      ),
      new types.GitHubCloseAction("firebase", "firebase-ios-sdk", issue.number),
      new types.GitHubAddLabelAction(
        "firebase",
        "firebase-ios-sdk",
        issue.number,
        "closed-by-bot",
      ),
      new types.GitHubAddLabelAction(
        "firebase",
        "firebase-ios-sdk",
        issue.number,
        "add-on-close",
      ),
      new types.GitHubRemoveLabelAction(
        "firebase",
        "firebase-ios-sdk",
        issue.number,
        "remove-on-close",
      ),
    ]);
  });

  it("should ignore cron processing on an issue with certain labels", async () => {
    const toIgnore: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that should be ignored",
      body: "foo bar",
      user: {
        login: "some-user",
      },
      labels: [
        { name: "feature-request" },
        { name: "needs-info" },
        { name: "stale" },
      ],
      created_at: FOURTEEN_WKD_AGO,
      updated_at: FOURTEEN_WKD_AGO,
      locked: false,
    };

    const cron_handler = new cron.CronHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      toIgnore,
      DEFAULT_CONFIG,
    );

    assert.deepEqual(actions, []);
  });

  it("should move a stale issue to needs-attention after an author comment", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" } as types.github.User,
      name: "bottest",
    };

    const comment: types.internal.Comment = {
      user: STALE_ISSUE.user as types.internal.User,
      body: "New comment by the author",
      created_at: SEVEN_WKD_AGO,
      updated_at: SEVEN_WKD_AGO,
    };

    const issue_handler = new issues.IssueHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await issue_handler.onCommentCreated(
      repo,
      STALE_ISSUE,
      comment,
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "stale",
      ),
      new types.GitHubAddLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "needs-attention",
      ),
    ]);
  });

  it("should not add needs-attention label if not specified", async () => {
    // This repo does not have a label_needs_attention config
    const repo: types.internal.Repository = {
      owner: { login: "google" } as types.github.User,
      name: "exoplayer",
    };

    const comment: types.internal.Comment = {
      user: NEEDS_INFO_ISSUE.user as types.internal.User,
      body: "New comment by the author",
      created_at: JUST_NOW,
      updated_at: JUST_NOW,
    };

    const issue_handler = new issues.IssueHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await issue_handler.onCommentCreated(
      repo,
      NEEDS_INFO_ISSUE,
      comment,
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        NEEDS_INFO_ISSUE.number,
        "needs-info",
      ),
    ]);
  });

  it("should move a stale issue to needs-info after a non-author comment", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" } as types.github.User,
      name: "bottest",
    };

    const comment: types.internal.Comment = {
      user: { login: "someone-else" },
      body: "New comment by someone else",
      created_at: SEVEN_WKD_AGO,
      updated_at: SEVEN_WKD_AGO,
    };

    const issue_handler = new issues.IssueHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await issue_handler.onCommentCreated(
      repo,
      STALE_ISSUE,
      comment,
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "stale",
      ),
      new types.GitHubAddLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "needs-info",
      ),
    ]);
  });

  it("should lock a very old closed issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" } as types.github.User,
      name: "bottest",
    };

    const cron_handler = new cron.CronHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await cron_handler.handleClosedIssue(
      repo.owner.login,
      repo.name,
      OLD_CLOSED_ISSUE,
      LOCKING_CONFIG,
    );

    util.actionsListEqual(actions, [
      new types.GitHubLockAction(
        repo.owner.login,
        repo.name,
        OLD_CLOSED_ISSUE.number,
      ),
    ]);
  });

  it("should not lock a newly closed issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" } as types.github.User,
      name: "bottest",
    };

    const cron_handler = new cron.CronHandler(
      new github.GitHubClient("fake-token"),
      bot_config,
    );

    const actions = await cron_handler.handleClosedIssue(
      repo.owner.login,
      repo.name,
      NEW_CLOSED_ISSUE,
      LOCKING_CONFIG,
    );

    util.actionsListEqual(actions, []);
  });
});
