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
 * @param {GitHubClient} gh_client client for accessing GitHub.
 */
export class CronHandler {
  gh_client: github.GitHubClient;
  config: BotConfig;

  constructor(gh_client: github.GitHubClient, config: BotConfig) {
    this.gh_client = gh_client;
    this.config = config;
  }

  async preProcessIssues(
    org: string,
    name: string,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    log.debug(`preProcessIssues(${org}/${name})`);

    const actions: types.Action[] = [];

    if (!issueConfig.label_needs_attention) {
      log.debug(`No label_needs_attention for ${org}/${name}`);
      return [];
    }

    // Go through every open "needs-info" issue and make sure it shouldn't be "needs-attention"
    const needsInfoIssues = await this.gh_client.getIssuesForRepo(
      org,
      name,
      "open",
      [issueConfig.label_needs_info]
    );

    log.debug(
      `preProcessIssues: ${needsInfoIssues.length} issues witth label ${issueConfig.label_needs_info}`
    );
    for (const issue of needsInfoIssues) {
      const issueActions = await this.doubleCheckNeedsInfo(
        org,
        name,
        issue,
        issueConfig
      );
      actions.push(...issueActions);
    }

    return actions;
  }

  async doubleCheckNeedsInfo(
    org: string,
    name: string,
    issue: types.internal.Issue,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];

    // If the very last comment is by the author then we likely have a mistake
    const comments = await this.gh_client.getCommentsForIssue(
      org,
      name,
      issue.number
    );

    if (comments.length === 0) {
      return [];
    }

    const lastComment = comments.sort(util.compareTimestamps).reverse()[0];
    if (lastComment.user.login === issue.user.login) {
      const reason = `Last comment was by ${issue.user.login} implying that this issue should not be needs-info`;
      actions.push(
        new types.GitHubRemoveLabelAction(
          org,
          name,
          issue.number,
          issueConfig.label_needs_info,
          reason
        )
      );

      if (issueConfig.label_needs_attention) {
        actions.push(
          new types.GitHubAddLabelAction(
            org,
            name,
            issue.number,
            issueConfig.label_needs_attention,
            reason
          )
        );
      }
    }

    return actions;
  }

  async processIssues(
    org: string,
    name: string,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    log.debug(`processIssues(${org}/${name})`);

    const actions: types.Action[] = [];

    const lockActions = await this.handleClosedIssues(org, name, issueConfig);
    actions.push(...lockActions);

    const now = new Date();
    if (!util.isWorkday(now)) {
      console.log(
        `Not processing stale issues on a weekend: ${now.toDateString()} @ ${now.toLocaleTimeString()} (${
          Intl.DateTimeFormat().resolvedOptions().timeZone
        })`
      );
      return actions;
    }

    const staleActions = await this.handleStaleIssues(org, name, issueConfig);
    actions.push(...staleActions);

    return actions;
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

    const actions: types.Action[] = [];
    const issues = await this.gh_client.getIssuesForRepo(org, name, "closed");

    for (const issue of issues) {
      const issueActions = await this.handleClosedIssue(
        org,
        name,
        issue,
        issueConfig
      );
      actions.push(...issueActions);

      if (actions.length >= 100) {
        console.warn(
          `Found >100 (${actions.length} issues to perform when checking closed issues for ${org}/${name}, will do the rest tomorrow.`
        );
        return actions;
      }
    }

    return actions;
  }

  async handleClosedIssue(
    org: string,
    name: string,
    issue: types.internal.Issue,
    issueConfig: types.IssueCleanupConfig
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];

    // Skip already-locked issues
    if (issue.locked) {
      return actions;
    }

    // We have already verified before calling this function that lock_days is defined, but
    // we default to MAX_NUMBER (aka never lock) just in case.
    const nowMs = new Date().getTime();
    const lockDays = issueConfig.lock_days || Number.MAX_VALUE;
    const lockMillis = lockDays * 24 * 60 * 60 * 1000;

    // This is a "this should never happen" case but the GitHub API
    // is not type-safe enough to ignore the possibility.
    if (!issue.closed_at) {
      log.warn(`Closed issue ${org}/${name}/${issue.number} has no closed_at.`);
      return actions;
    }

    const closedAtStr = "" + issue.closed_at;
    const closedAtMs = new Date(closedAtStr).getTime();

    if (nowMs - closedAtMs > lockMillis) {
      actions.push(
        new types.GitHubLockAction(
          org,
          name,
          issue.number,
          `Issue was closed at ${closedAtStr} which is more than ${lockDays} ago`
        )
      );
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

    if (!comments || comments.length === 0) {
      console.log(`Issue ${name}#${number} has no comments.`);
      return actions;
    }

    // When the issue was marked stale, the bot will have left a comment with certain metadata
    const markStaleComment = comments.find(comment => {
      return comment.body.includes(EVT_MARK_STALE);
    });

    if (stateStale && !markStaleComment) {
      log.warn(
        `Issue ${name}/${number} is stale but no relevant comment was found.`
      );
    }

    if (stateNeedsInfo || stateStale) {
      log.debug(
        `Processing ${name}#${number} as needs-info or stale, labels=${JSON.stringify(
          labelNames
        )}`
      );
    }

    // The github webhook handler will automatically remove the needs-info label
    // if the author comments, so we can assume inside the cronjob that this has
    // not happened and just look at the date of the last comment.
    //
    // A comment by anyone in the last 7 days makes the issue non-stale.
    const lastCommentTime = util.createdDate(comments[0]);
    const shouldMarkStale =
      stateNeedsInfo &&
      util.workingDaysAgo(lastCommentTime) >= issueConfig.needs_info_days;

    const shouldClose =
      stateStale &&
      markStaleComment != undefined &&
      util.workingDaysAgo(util.createdDate(markStaleComment)) >=
        issueConfig.stale_days;

    if (shouldClose) {
      // 1) Add a comment about closing
      const addClosingComment = new types.GitHubCommentAction(
        org,
        name,
        number,
        this.getCloseComment(issue.user.login),
        false,
        `Comment after closing issue for being stale (comment at ${util.createdDate(
          markStaleComment!
        )}).`
      );
      actions.push(addClosingComment);

      // 2) Close the issue
      const closeIssue = new types.GitHubCloseAction(
        org,
        name,
        number,
        `Closing issue for being stale.`
      );
      actions.push(closeIssue);

      // 3) Add and remove labels (according to config)
      if (issueConfig.auto_close_labels) {
        for (const l of issueConfig.auto_close_labels.add) {
          actions.push(new types.GitHubAddLabelAction(org, name, number, l));
        }
        for (const l of issueConfig.auto_close_labels.remove) {
          actions.push(new types.GitHubRemoveLabelAction(org, name, number, l));
        }
      } else {
        // Default is to add 'closed-by-bot'
        actions.push(
          new types.GitHubAddLabelAction(org, name, number, "closed-by-bot")
        );
      }
    } else if (shouldMarkStale) {
      // We add the 'stale' label and also add a comment. Note that
      // if the issue was labeled 'needs-info' this label is not removed
      // here.
      const addStaleLabel = new types.GitHubAddLabelAction(
        org,
        name,
        number,
        issueConfig.label_stale,
        `Last comment was ${util.workingDaysAgo(
          lastCommentTime
        )} working days ago (${lastCommentTime}).`
      );
      const addStaleComment = new types.GitHubCommentAction(
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

    return actions;
  }

  getMarkStaleComment(
    author: string,
    needsInfoDays: number,
    staleDays: number
  ): string {
    return `<!-- ${EVT_MARK_STALE} -->
Hey @${author}. We need more information to resolve this issue but there hasn't been an update in ${needsInfoDays} weekdays. I'm marking the issue as stale and if there are no new updates in the next ${staleDays} days I will close it automatically.

If you have more information that will help us get to the bottom of this, just add a comment!`;
  }

  getCloseComment(author: string) {
    return `<!-- ${EVT_CLOSE_STALE} -->
Since there haven't been any recent updates here, I am going to close this issue.

@${author} if you're still experiencing this problem and want to continue the discussion just leave a comment here and we are happy to re-open this.`;
  }
}
