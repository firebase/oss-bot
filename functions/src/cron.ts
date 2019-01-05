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
import * as types from "./types";

// Message for closing stale issues
const STALE_ISSUE_MSG =
  "It's been a while since anyone updated this pull request so I am going to close it. " +
  "Please @mention a repo owner if you think this is a mistake!";

// Metadata the bot can leave in comments to mark its actions
const EVT_MARK_STALE = "event: mark-stale";
const EVT_CLOSE_STALE = "event: close-stale";

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

  async handleStaleIssues(org: string, name: string): Promise<types.Action[]> {
    console.log(`Processing issues for ${org}/${name}`);

    // Get the configuration for this repo
    const cleanupConfig = this.config.getRepoCleanupConfig(org, name);
    if (!cleanupConfig || !cleanupConfig.issue) {
      console.log(`No stale issues config for ${org}/${name}`);
      return [];
    }
    const issueConfig = cleanupConfig.issue;

    // Aggregate all the actions we need to perform
    const actions: types.Action[] = [];

    const needsInfoTime = issueConfig.needs_info_days * 24 * 60 * 60 * 1000;
    const staleTime = issueConfig.stale_days * 24 * 60 * 60 * 1000;

    // TODO: Get this from the database
    const contributors = await this.gh_client.getCollaboratorsForRepo(
      org,
      name
    );

    const issues = await this.gh_client.getIssuesForRepo(org, name, "open");
    for (const issue of issues) {
      const number = issue.number;
      const labelNames = issue.labels.map(label => label.name);

      const stateNeedsInfo = labelNames.includes(issueConfig.label_needs_info);
      const stateStale = labelNames.includes(issueConfig.label_stale);

      // If an issue is not labeled with either the stale or needs-info labels
      // then we don't need to do any cron processing on it.
      if (!(stateNeedsInfo || stateStale)) {
        console.log(`Issue ${name}#${number} does not need processing.`);
        continue;
      }

      // We fetch the comments for the issue so we can determine when the last actions were taken.
      // We manually sort the API response by timestamp (newest to oldest) because the API
      // does not guarantee an order.
      let comments = await this.gh_client.getCommentsForIssue(
        org,
        name,
        number
      );
      comments = comments.sort(compareTimestamps).reverse();

      if (stateNeedsInfo) {
        console.log(`Processing ${name}#${number} as needs-info`);
        // The github webhook handler will automatically remove the needs-info label
        // if the author comments, so we can assume inside the cronjob that this has
        // not happened and just look at the date of the last Googler/Author comment.
        const lastGooglerComment = comments.find(comment => {
          return contributors.includes(comment.user.login);
        });

        const lastAuthorComment = comments.find(comment => {
          return comment.user.login === issue.user.login;
        });

        // If a googler ever commented and the last time was 7 days ago, this is now
        // a stale issue. If a googler never commented, it's stale if the
        // last author comment is more than 7 days ago.
        const shouldMarkStale =
          (lastGooglerComment && timeAgo(lastGooglerComment) > needsInfoTime) ||
          (lastAuthorComment && timeAgo(lastAuthorComment) > needsInfoTime);

        if (shouldMarkStale) {
          const removeNeedsInfoLabel = new types.GithubRemoveLabelAction(
            org,
            name,
            number,
            issueConfig.label_needs_info
          );
          const addStaleLabel = new types.GithubAddLabelAction(
            org,
            name,
            number,
            issueConfig.label_stale
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
            false
          );
          actions.push(removeNeedsInfoLabel, addStaleLabel, addStaleComment);
        }
      }

      if (stateStale) {
        console.log(`Processing ${name}#${number} as stale`);

        // When the issue was marked stale, the bot will have left a comment with certain metadata
        const markStaleComment = comments.find(comment => {
          return comment.body.includes(EVT_MARK_STALE);
        });

        if (!markStaleComment) {
          console.warn(
            `Issue ${name}/${number} is stale but no relevant comment was found.`
          );
        }

        if (markStaleComment && timeAgo(markStaleComment) > staleTime) {
          const addClosingComment = new types.GithubCommentAction(
            org,
            name,
            number,
            this.getCloseComment(issue.user.login),
            false
          );
          const closeIssue = new types.GithubCloseAction(org, name, number);
          actions.push(addClosingComment, closeIssue);
        }
      }
    }

    return actions;
  }

  private getMarkStaleComment(
    author: string,
    needsInfoDays: number,
    staleDays: number
  ): string {
    return `<!-- ${EVT_MARK_STALE} -->
Hey @${author}. We need more information to resolve this issue but there hasn't been an update in ${needsInfoDays} days. I'm marking the issue as stale and if there are no new updates in the next ${staleDays} days I will close it automatically.

If you have more information that will help us get to the bottom of this, just add a comment!`;
  }

  private getCloseComment(author: string) {
    return `<!-- ${EVT_CLOSE_STALE} -->
Since there haven't been any recent updates here, I am going to close this issue.
    
@${author} if you're still experiencing this problem and want to continue the discussion just leave a comment here and we are happy to re-open this.`;
  }
}

interface HasTimestamps {
  updated_at: string;
  created_at: string;
}

function timeAgo(obj: HasTimestamps): number {
  return Date.now() - Date.parse(obj.created_at);
}

function compareTimestamps(a: HasTimestamps, b: HasTimestamps) {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);

  if (aTime > bTime) {
    return 1;
  } else if (bTime > aTime) {
    return -1;
  } else {
    return 0;
  }
}
