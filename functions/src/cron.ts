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

import { BotConfig } from "./config";
import * as github from "./github";
import * as log from "./log";
import * as util from "./util";
import * as types from "./types";

// Metadata the bot can leave in comments to mark its actions
const EVT_MARK_STALE = "event: mark-stale";
const EVT_CLOSE_STALE = "event: close-stale";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new handler for cron-style tasks.
 * @param {GithubClient} gh_client client for accessing Github.
 */
export class CronHandler {
  gh_client: github.GithubClient;
  config: BotConfig;

  constructor(gh_client: github.GithubClient, config: BotConfig) {
    this.gh_client = gh_client;
    this.config = config;
  }

  async processIssues(org: string, name: string) {
    log.debug(`Processing issues for ${org}/${name}`);

    // Get the configuration for this repo
    const cleanupConfig = this.config.getRepoCleanupConfig(org, name);
    if (!cleanupConfig || !cleanupConfig.issue) {
      log.debug(`No issue cleanup config for ${org}/${name}`);
      return [];
    }
    const issueConfig = cleanupConfig.issue;

    const lockActions = await this.handleClosedIssues(org, name, issueConfig);
    const staleActions = await this.handleStaleIssues(org, name, issueConfig);

    return [...lockActions, ...staleActions];
  }

  async handleClosedIssues(
    org: string,
    name: string,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    if (!issueConfig.lock_days) {
      log.debug(`No issue locking config for ${org}/${name}`);
      return [];
    }

    const lockDays = issueConfig.lock_days;
    const lockMillis = lockDays * 24 * 60 * 60 * 1000;

    const actions: types.Action[] = [];

    const issues = await this.gh_client.getIssuesForRepo(org, name, "closed");
    for (const issue of issues) {
      if (!issue.closed_at) {
        log.warn(
          `Closed issue ${org}/${name}/${issue.number} has no closed_at.`
        );
        continue;
      }

      const closedAtStr = "" + issue.closed_at;
      const closedAtMs = new Date(closedAtStr).getTime();
      const nowMs = new Date().getTime();

      if (nowMs - closedAtMs > lockMillis) {
        actions.push(
          new types.GithubLockAction(
            org,
            name,
            issue.number,
            `Issue was closed at ${closedAtStr} which is more than ${lockDays} ago`
          )
        );
      }
    }

    return actions;
  }

  async handleStaleIssues(
    org: string,
    name: string,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];

    const issues = await this.gh_client.getIssuesForRepo(org, name, "open");
    for (const issue of issues) {
      const issueActions = await this.handleStaleIssue(
        org,
        name,
        issue,
        issueConfig
      );
      actions.push(...issueActions);
    }

    return actions;
  }

  async handleStaleIssue(
    org: string,
    name: string,
    issue: types.internal.Issue,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];

    const needsInfoTime = issueConfig.needs_info_days * DAY_MS;
    const staleTime = issueConfig.stale_days * DAY_MS;

    const number = issue.number;
    const labelNames = issue.labels.map(label => label.name);

    const stateNeedsInfo = labelNames.includes(issueConfig.label_needs_info);
    const stateStale = labelNames.includes(issueConfig.label_stale);

    // If an issue is not labeled with either the stale or needs-info labels
    // then we don't need to do any cron processing on it.
    if (!(stateNeedsInfo || stateStale)) {
      return actions;
    }

    // If the issue has one of the specified labels to ignore, then we
    // never mark it as stale or close it automatically.
    let hasIgnoredLabel = false;
    const ignoredLabels = issueConfig.ignore_labels || [];
    ignoredLabels.forEach(label => {
      hasIgnoredLabel = hasIgnoredLabel || labelNames.includes(label);
    });

    if (hasIgnoredLabel) {
      log.debug(
        `Issue ${name}#${number} is ignored due to labels: ${JSON.stringify(
          labelNames
        )}`
      );
      return actions;
    }

    // We fetch the comments for the issue so we can determine when the last actions were taken.
    // We manually sort the API response by timestamp (newest to oldest) because the API
    // does not guarantee an order.
    let comments = await this.gh_client.getCommentsForIssue(org, name, number);
    comments = comments.sort(util.compareTimestamps).reverse();

    if (stateNeedsInfo) {
      log.debug(
        `Processing ${name}#${number} as needs-info, labels=${JSON.stringify(
          labelNames
        )}`
      );
      // The github webhook handler will automatically remove the needs-info label
      // if the author comments, so we can assume inside the cronjob that this has
      // not happened and just look at the date of the last comment.
      //
      // A comment by anyone in the last 7 days makes the issue non-stale.
      const lastComment = comments[0];
      const lastCommentTime = util.timeAgo(lastComment);
      const shouldMarkStale = lastCommentTime > needsInfoTime;

      if (shouldMarkStale) {
        // We add the 'stale' label and also add a comment. Note that
        // if the issue was labeled 'needs-info' this label is not removed
        // here.
        const addStaleLabel = new types.GithubAddLabelAction(
          org,
          name,
          number,
          issueConfig.label_stale,
          `Last comment was ${lastCommentTime} ago.`
        );
        const addStaleComment = new types.GithubCommentAction(
          org,
          name,
          number,
          this.getMarkStaleComment(
            issue.user.login,
            issueConfig.needs_info_days,
            issueConfig.stale_days
          ),
          false,
          `Comment that goes alongside the stale label.`
        );
        actions.push(addStaleLabel, addStaleComment);
      }
    }

    if (stateStale) {
      log.debug(
        `Processing ${name}#${number} as stale, labels=${JSON.stringify(
          labelNames
        )}`
      );

      // When the issue was marked stale, the bot will have left a comment with certain metadata
      const markStaleComment = comments.find(comment => {
        return comment.body.includes(EVT_MARK_STALE);
      });

      if (!markStaleComment) {
        log.warn(
          `Issue ${name}/${number} is stale but no relevant comment was found.`
        );
      }

      if (markStaleComment && util.timeAgo(markStaleComment) > staleTime) {
        const addClosingComment = new types.GithubCommentAction(
          org,
          name,
          number,
          this.getCloseComment(issue.user.login),
          false,
          `Comment after closing issue for being stale.`
        );
        const closeIssue = new types.GithubCloseAction(
          org,
          name,
          number,
          `Closing issue for being stale.`
        );
        actions.push(addClosingComment, closeIssue);
      }
    }

    return actions;
  }

  getMarkStaleComment(
    author: string,
    needsInfoDays: number,
    staleDays: number
  ): string {
    return `<!-- ${EVT_MARK_STALE} -->
Hey @${author}. We need more information to resolve this issue but there hasn't been an update in ${needsInfoDays} days. I'm marking the issue as stale and if there are no new updates in the next ${staleDays} days I will close it automatically.

If you have more information that will help us get to the bottom of this, just add a comment!`;
  }

  getCloseComment(author: string) {
    return `<!-- ${EVT_CLOSE_STALE} -->
Since there haven't been any recent updates here, I am going to close this issue.

@${author} if you're still experiencing this problem and want to continue the discussion just leave a comment here and we are happy to re-open this.`;
  }
}
