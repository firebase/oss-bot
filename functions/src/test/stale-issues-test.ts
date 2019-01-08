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

import * as github from "../github";
import * as cron from "../cron";
import * as config from "../config";
import * as types from "../types";

// Bot configuration
const config_json = require("./mock_data/config.json");
const bot_config = new config.BotConfig(config_json);

// Github client
const gh_client = new github.GithubClient("fake-token");

// Cron handler
const cron_handler = new cron.CronHandler(gh_client, bot_config);

const NOW_TIME = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

const JUST_NOW = new Date(NOW_TIME.getTime() - 1000).toISOString();
const FOUR_DAYS_AGO = new Date(NOW_TIME.getTime() - 4 * DAY_MS).toISOString();
const EIGHT_DAYS_AGO = new Date(NOW_TIME.getTime() - 8 * DAY_MS).toISOString();

const DEFAULT_CONFIG: types.IssueCleanupConfig = {
  label_needs_info: "needs-info",
  label_needs_attention: "needs-attention",
  label_stale: "stale",
  ignore_labels: ["feature-request"],
  needs_info_days: 7,
  stale_days: 3
};

describe("Stale issue handler", async () => {
  afterEach(() => {
    simple.restore();
  });

  it("should do nothing to a needs-info issue that is fresh", async () => {
    const needsInfo: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that needs info",
      user: {
        login: "some-user"
      },
      labels: [{ name: "needs-info" }],
      created_at: JUST_NOW,
      updated_at: JUST_NOW
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
      "firebase",
      "some-repo",
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
      user: {
        login: "some-user"
      },
      labels: [{ name: "needs-info" }],
      created_at: EIGHT_DAYS_AGO,
      updated_at: EIGHT_DAYS_AGO
    };

    const issueComments: types.internal.Comment[] = [
      {
        body: "My comment",
        user: { login: "some-user" },
        created_at: EIGHT_DAYS_AGO,
        updated_at: EIGHT_DAYS_AGO
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.handleStaleIssue(
      "firebase",
      "some-repo",
      needsInfo,
      DEFAULT_CONFIG
    );
    assert.deepEqual(
      actions[0],
      new types.GithubAddLabelAction(
        "firebase",
        "some-repo",
        needsInfo.number,
        DEFAULT_CONFIG.label_stale
      )
    );
  });

  it("should comment and close a stale issue after {X} days", async () => {
    const staleIssue: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that is stale",
      user: {
        login: "some-user"
      },
      labels: [{ name: "stale" }],
      created_at: FOUR_DAYS_AGO,
      updated_at: FOUR_DAYS_AGO
    };

    const issueComments: types.internal.Comment[] = [
      {
        body: "My original comment",
        user: { login: "some-user" },
        created_at: FOUR_DAYS_AGO,
        updated_at: FOUR_DAYS_AGO
      },
      {
        body: cron_handler.getMarkStaleComment("some-user", 7, 3),
        user: { login: "firebase-oss-bot" },
        created_at: FOUR_DAYS_AGO,
        updated_at: FOUR_DAYS_AGO
      }
    ];

    simple
      .mock(cron_handler.gh_client, "getCommentsForIssue")
      .callFn(async () => {
        return issueComments;
      });

    const actions = await cron_handler.handleStaleIssue(
      "firebase",
      "some-repo",
      staleIssue,
      DEFAULT_CONFIG
    );

    assert.deepEqual(actions, [
      new types.GithubCommentAction(
        "firebase",
        "some-repo",
        staleIssue.number,
        cron_handler.getCloseComment("some-user"),
        false
      ),
      new types.GithubCloseAction("firebase", "some-repo", staleIssue.number)
    ]);
  });

  it("should ignore cron processing on an issue with certain labels", async () => {
    const toIgnore: types.internal.Issue = {
      number: 1,
      state: "open",
      title: "Issue that should be ignored",
      user: {
        login: "some-user"
      },
      labels: [
        { name: "feature-request" },
        { name: "needs-info" },
        { name: "stale" }
      ],
      created_at: EIGHT_DAYS_AGO,
      updated_at: EIGHT_DAYS_AGO
    };

    const actions = await cron_handler.handleStaleIssue(
      "firebase",
      "some-repo",
      toIgnore,
      DEFAULT_CONFIG
    );

    assert.deepEqual(actions, []);
  });

  it("should move a stale issue to needs-attention after an author comment", async () => {
    assert.ok(false);
  });

  it("should move a stale issue to needs-info after a non-author comment", async () => {
    assert.ok(false);
  });
});
