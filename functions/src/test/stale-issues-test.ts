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
import * as simple from "simple-mock";

import * as config from "../config";
import * as cron from "../cron";
import * as github from "../github";
import * as log from "../log";
import * as issues from "../issues";
import * as types from "../types";
import * as util from "./test-util";
import { workingDaysAgo, getDateWorkingDaysBefore } from "../util";
import { get } from "https";

// Bot configuration
const config_json = require("./mock_data/config.json");
const bot_config = new config.BotConfig(config_json);

// GitHub client
const gh_client = new github.GitHubClient("fake-token");

// Cron handler
const cron_handler = new cron.CronHandler(gh_client, bot_config);

// Issue event handler
const issue_handler = new issues.IssueHandler(gh_client, bot_config);

const NOW_TIME = new Date();

const JUST_NOW = new Date(NOW_TIME.getTime() - 1000).toISOString();
const SEVEN_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 7).toISOString();
const FOURTEEN_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 14).toISOString();
const NINETY_WKD_AGO = getDateWorkingDaysBefore(NOW_TIME, 90).toISOString();
const HUNDREDTWENTY_WKD_AGO = getDateWorkingDaysBefore(
  NOW_TIME,
  120
).toISOString();

const DEFAULT_CONFIG: types.IssueCleanupConfig = {
  label_needs_info: "needs-info",
  label_needs_attention: "needs-attention",
  label_stale: "stale",
  auto_close_labels: {
    add: ["closed-by-bot", "add-on-close"],
    remove: ["remove-on-close"]
  },
  ignore_labels: ["feature-request"],
  needs_info_days: 7,
  stale_days: 3
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
  locked: false
};

const READY_TO_CLOSE_ISSUE: types.internal.Issue = {
  number: 1,
  state: "open",
  title: "Issue that is stale",
  body: "foo bar",
  user: {
    login: "some-user"
  },
  labels: [{ name: "stale" }, { name: "needs-info" }],
  created_at: FOURTEEN_WKD_AGO,
  updated_at: FOURTEEN_WKD_AGO,
  locked: false
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
  locked: false
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
  locked: false
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
  locked: false
};

describe("Stale issue handler", async () => {
  beforeEach(() => {
    log.setLogLevel(log.Level.WARN);
  });

  afterEach(() => {
    log.setLogLevel(log.Level.ALL);
    simple.restore();
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
        login: "some-user"
      },
      labels: [{ name: "needs-info" }],
      created_at: JUST_NOW,
      updated_at: JUST_NOW,
      locked: false
    };

    const issueComments: types.internal.Comment[] = [
      {
        body: "My comment",
        user: { login: "some-user" },
        created_at: JUST_NOW,
        updated_at: JUST_NOW
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      needsInfo,
      DEFAULT_CONFIG
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
        login: "some-user"
      },
      labels: [{ name: "needs-info" }],
      created_at: FOURTEEN_WKD_AGO,
      updated_at: FOURTEEN_WKD_AGO,
      locked: false
    };

    const issueComments: types.internal.Comment[] = [
      {
        body: "My comment",
        user: { login: "some-user" },
        created_at: FOURTEEN_WKD_AGO,
        updated_at: FOURTEEN_WKD_AGO
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      needsInfo,
      DEFAULT_CONFIG
    );

    util.actionsEqual(
      actions[0],
      new types.GitHubAddLabelAction(
        "samtstern",
        "bottest",
        needsInfo.number,
        DEFAULT_CONFIG.label_stale
      )
    );
  });

  it("should comment and close a stale issue after {X} days", async () => {
    const issue = READY_TO_CLOSE_ISSUE;
    const issueComments: types.internal.Comment[] = [
      {
        body: "My original comment",
        user: issue.user,
        created_at: SEVEN_WKD_AGO,
        updated_at: SEVEN_WKD_AGO
      },
      {
        body: cron_handler.getMarkStaleComment(issue.user.login, 7, 3),
        user: { login: "google-oss-bot" },
        created_at: SEVEN_WKD_AGO,
        updated_at: SEVEN_WKD_AGO
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      issue,
      DEFAULT_CONFIG
    );

    util.actionsListEqual(actions, [
      new types.GitHubCommentAction(
        "samtstern",
        "bottest",
        issue.number,
        cron_handler.getCloseComment(issue.user.login),
        false
      ),
      new types.GitHubCloseAction("samtstern", "bottest", issue.number),
      new types.GitHubAddLabelAction(
        "samtstern",
        "bottest",
        issue.number,
        "closed-by-bot"
      ),
      new types.GitHubAddLabelAction(
        "samtstern",
        "bottest",
        issue.number,
        "add-on-close"
      ),
      new types.GitHubRemoveLabelAction(
        "samtstern",
        "bottest",
        issue.number,
        "remove-on-close"
      )
    ]);
  });

  it("should ignore cron processing on an issue with certain labels", async () => {
    const toIgnore: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that should be ignored",
      body: "foo bar",
      user: {
        login: "some-user"
      },
      labels: [
        { name: "feature-request" },
        { name: "needs-info" },
        { name: "stale" }
      ],
      created_at: FOURTEEN_WKD_AGO,
      updated_at: FOURTEEN_WKD_AGO,
      locked: false
    };

    const actions = await cron_handler.handleStaleIssue(
      "samtstern",
      "bottest",
      toIgnore,
      DEFAULT_CONFIG
    );

    assert.deepEqual(actions, []);
  });

  it("should move a stale issue to needs-attention after an author comment", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const comment: types.internal.Comment = {
      user: STALE_ISSUE.user,
      body: "New comment by the author",
      created_at: SEVEN_WKD_AGO,
      updated_at: SEVEN_WKD_AGO
    };

    const actions = await issue_handler.onCommentCreated(
      repo,
      STALE_ISSUE,
      comment
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "stale"
      ),
      new types.GitHubAddLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "needs-attention"
      )
    ]);
  });

  it("should not add needs-attention label if not specified", async () => {
    // This repo does not have a label_needs_attention config
    const repo: types.internal.Repository = {
      owner: { login: "google" },
      name: "exoplayer"
    };

    const comment: types.internal.Comment = {
      user: NEEDS_INFO_ISSUE.user,
      body: "New comment by the author",
      created_at: JUST_NOW,
      updated_at: JUST_NOW
    };

    const actions = await issue_handler.onCommentCreated(
      repo,
      NEEDS_INFO_ISSUE,
      comment
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        NEEDS_INFO_ISSUE.number,
        "needs-info"
      )
    ]);
  });

  it("should move a stale issue to needs-info after a non-author comment", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const comment: types.internal.Comment = {
      user: { login: "someone-else" },
      body: "New comment by someone else",
      created_at: SEVEN_WKD_AGO,
      updated_at: SEVEN_WKD_AGO
    };

    const actions = await issue_handler.onCommentCreated(
      repo,
      STALE_ISSUE,
      comment
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "stale"
      ),
      new types.GitHubAddLabelAction(
        repo.owner.login,
        repo.name,
        STALE_ISSUE.number,
        "needs-info"
      )
    ]);
  });

  it("should lock a very old closed issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const actions = await cron_handler.handleClosedIssue(
      repo.owner.login,
      repo.name,
      OLD_CLOSED_ISSUE,
      LOCKING_CONFIG
    );

    util.actionsListEqual(actions, [
      new types.GitHubLockAction(
        repo.owner.login,
        repo.name,
        OLD_CLOSED_ISSUE.number
      )
    ]);
  });

  it("should not lock a newly closed issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const actions = await cron_handler.handleClosedIssue(
      repo.owner.login,
      repo.name,
      NEW_CLOSED_ISSUE,
      LOCKING_CONFIG
    );

    util.actionsListEqual(actions, []);
  });

  it("should not do anything when double-checking a good needs-info issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const issueComments: types.internal.Comment[] = [
      {
        body: "Comment by creator",
        user: NEEDS_INFO_ISSUE.user,
        created_at: SEVEN_WKD_AGO,
        updated_at: SEVEN_WKD_AGO
      },
      {
        body: "Comment by Googler",
        user: { login: "some-googler" },
        created_at: JUST_NOW,
        updated_at: JUST_NOW
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.doubleCheckNeedsInfo(
      repo.owner.login,
      repo.name,
      NEEDS_INFO_ISSUE,
      DEFAULT_CONFIG
    );

    util.actionsListEqual(actions, []);
  });

  it("should double-check and fix a bad needs-info issue", async () => {
    const repo: types.internal.Repository = {
      owner: { login: "samtstern" },
      name: "bottest"
    };

    const issue = NEEDS_INFO_ISSUE;

    const issueComments: types.internal.Comment[] = [
      {
        body: "Comment by creator",
        user: issue.user,
        created_at: SEVEN_WKD_AGO,
        updated_at: SEVEN_WKD_AGO
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.doubleCheckNeedsInfo(
      repo.owner.login,
      repo.name,
      issue,
      DEFAULT_CONFIG
    );

    util.actionsListEqual(actions, [
      new types.GitHubRemoveLabelAction(
        repo.owner.login,
        repo.name,
        issue.number,
        DEFAULT_CONFIG.label_needs_info
      ),
      new types.GitHubAddLabelAction(
        repo.owner.login,
        repo.name,
        issue.number,
        DEFAULT_CONFIG.label_needs_attention!
      )
    ]);
  });
});
