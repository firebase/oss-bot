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

import * as github from "./github";
import * as types from "./types";

// Message for closing stale issues
const STALE_ISSUE_MSG =
  "It's been a while since anyone updated this pull request so I am going to close it. " +
  "Please @mention a repo owner if you think this is a mistake!";

/**
 * Create a new handler for cron-style tasks.
 * @param {GithubClient} gh_client client for accessing Github.
 */
export class CronHandler {
  gh_client: github.GithubClient;

  constructor(gh_client: github.GithubClient) {
    this.gh_client = gh_client;
  }

  /**
   * Handle a cleanup cycle for a particular repo.
   */
  async handleCleanup(org: string, name: string, expiry: number) {
    const oldPullRequests = await this.gh_client.getStalePullRequests(
      org,
      name,
      expiry
    );
    const promises: Promise<any>[] = [];

    for (const pr of oldPullRequests) {
      console.log("Expired PR: ", pr);

      // TODO: Move this to the "action" model
      // Add a comment saying why we are closing this
      const addComment = this.gh_client.addComment(
        org,
        name,
        pr.number,
        STALE_ISSUE_MSG
      );

      // Close the pull request
      const closePr = this.gh_client.closeIssue(org, name, pr.number);

      promises.push(addComment);
      promises.push(closePr);
    }

    return Promise.all(promises);
  }

  async handleStaleIssues(org: string, name: string): Promise<types.Action[]> {
    console.log(`Processing issues for ${org}/${name}`);

    // Aggregate all the actions we need to perform
    const actions: types.Action[] = [];

    // TODO: Pass in the config
    const labelNeedsInfo = "Needs Info";
    const labelStale = "Stale";

    // TODO: Get this from the databasew
    const contributors = await this.gh_client.getCollaboratorsForRepo(
      org,
      name
    );

    const issues = await this.gh_client.getIssuesForRepo(org, name, "open");
    for (const issue of issues) {
      const number = issue.number;
      const labelNames = issue.labels.map(label => label.name);

      const stateNeedsInfo = labelNames.includes(labelNeedsInfo);
      const stateStale = labelNames.includes(labelStale);

      const needsInfoTime = 7 * 24 * 60 * 60 * 1000;
      const staleTime = 3 * 24 * 60 * 60 * 1000;

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
          // TODO: Remove the needs-info label
          const addStaleLabel = new types.GithubLabelAction(
            org,
            name,
            number,
            labelStale
          );
          const addStaleComment = new types.GithubCommentAction(
            org,
            name,
            number,
            "TODO: Real text",
            false
          );
          actions.push(addStaleLabel, addStaleComment);
        }
      }

      if (stateStale) {
        console.log(`Processing ${name}#${number} as stale`);

        // When the issue was marked stale, the bot will have left a comment with certain metadata
        const markStaleComment = comments.find(comment => {
          // TODO: Standardize
          return comment.body.includes("event: mark-stale");
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
            "TODO: Real text",
            false
          );
          const closeIssue = new types.GithubCloseAction(org, name, number);
          actions.push(addClosingComment, closeIssue);
        }
      }
    }

    return actions;
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
