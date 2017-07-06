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
import * as marked from "marked";

import * as github from "./github";
import * as template from "./template";
import * as config from "./config";
import * as email from "./email";
import * as types from "./types";

// Event: issues
// https://developer.github.com/v3/activity/events/types/#issuesevent
// Keys:
//   * issue - the issue itself
//   * changes - the changes to the issue if the action was edited
//   * assignee - the optional user who was assigned or unassigned
//   * label - the optional label that was added or removed
enum IssueAction {
  ASSIGNED = "assigned",
  UNASSIGNED = "unassigned",
  LABELED = "labeled",
  UNLABELED = "unlabeled",
  OPENED = "opened",
  EDITED = "edited",
  CLOSED = "closed",
  REOPENED = "reopened"
}
// Event: issue_comment
// https://developer.github.com/v3/activity/events/types/#issuecommentevent
// Keys:
//   * changes - changes to the comment if it was edited
//   * issue - the issue the comment belongs to
//   * comment - the comment itself
enum CommentAction {
  CREATED = "created",
  EDITED = "edited",
  DELETED = "deleted"
}

enum IssueStatus {
  CLOSED = "closed",
  OPEN = "open"
}

interface SendIssueUpdateEmailOpts {
  header: string;
  body: string;
  label?: string;
}

class CheckMatchesTemplateResult {
  matches = true;
  message: string;
}

// Label for issues that confuse the bot
const LABEL_NEEDS_TRIAGE = "needs-triage";

// Label for feature requests
const LABEL_FR = "feature-request";

/**
 * Construct a new issue handler.
 * @param {GithubClient} gh_client client for interacting with Github.
 * @param {EmaiClient} email_client client for sending emails.
 * @param {BotConfig} config bot configuration.
 */
export class IssueHandler {
  gh_client: github.GithubClient;
  email_client: email.EmailClient;
  config: config.BotConfig;

  constructor(
    gh_client: github.GithubClient,
    email_client: email.EmailClient,
    config: config.BotConfig
  ) {
    // Client for interacting with github
    this.gh_client = gh_client;

    // Client for sending emails
    this.email_client = email_client;

    // Configuration
    this.config = config;
  }

  /**
   * Handle an event associated with a Github issue.
   */
  handleIssueEvent(
    event: types.WebhookEvent,
    action: IssueAction,
    issue: types.Issue,
    repo: types.Repository,
    sender: types.Sender
  ) {
    switch (action) {
      case IssueAction.OPENED:
        return this.onNewIssue(repo, issue);
      case IssueAction.ASSIGNED:
        return this.onIssueAssigned(repo, issue);
      case IssueAction.CLOSED:
        return this.onIssueStatusChanged(repo, issue, IssueStatus.CLOSED);
      case IssueAction.REOPENED:
        return this.onIssueStatusChanged(repo, issue, IssueStatus.OPEN);
      case IssueAction.LABELED:
        return this.onIssueLabeled(repo, issue, event.label.name);
      case IssueAction.UNASSIGNED:
      /* falls through */
      case IssueAction.UNLABELED:
      /* falls through */
      case IssueAction.EDITED:
      /* falls through */
      default:
        console.log("Unsupported issue action: " + action);
        console.log("Issue: " + issue.title);
        break;
    }

    return Promise.resolve();
  }

  /**
   * Handle an event associated with a Github issue comment.
   */
  handleIssueCommentEvent(
    event: types.WebhookEvent,
    action: CommentAction,
    issue: types.Issue,
    comment: types.Comment,
    repo: types.Repository,
    sender: types.Sender
  ) {
    switch (action) {
      case CommentAction.CREATED:
        return this.onCommentCreated(repo, issue, comment);
      case CommentAction.EDITED:
      /* falls through */
      case CommentAction.DELETED:
      /* falls through */
      default:
        console.log("Unsupported comment action: " + action);
        console.log("Issue: " + issue.title);
        console.log("Comment: " + comment.body);
        break;
    }

    return Promise.resolve();
  }

  /**
   * Handles new issues, should do the following tasks:
   *   1. Label the issue (if possible).
   *   2. Notify the appropriate team (if possible).
   */
  onNewIssue(repo: types.Repository, issue: types.Issue) {
    // Get basic issue information
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    // Check for FR
    const isFR = this.isFeatureRequest(issue);

    // Choose new label
    let new_label;
    if (isFR) {
      console.log("Matched feature request template.");
      new_label = LABEL_FR;
    } else {
      new_label = this.getRelevantLabel(org, name, issue) || LABEL_NEEDS_TRIAGE;
    }

    // Add the label
    console.log(`Adding label: ${new_label}`);
    const addLabelPromise = this.gh_client.addLabel(
      org,
      name,
      number,
      new_label
    );

    // Add a comment, if necessary
    let addCommentPromise;
    if (new_label == LABEL_NEEDS_TRIAGE) {
      console.log("Needs triage, adding friendly comment");
      const msg = `Hey there! I couldn't figure out what this issue is about, so I've labeled it for a human to triage. Hang tight.`;
      addCommentPromise = this.gh_client.addComment(org, name, number, msg);
    } else {
      console.log(`Not commenting, label is ${new_label}`);
      addCommentPromise = Promise.resolve();
    }

    // Check if it matches the template
    const checkTemplatePromise = this.checkMatchesTemplate(
      org,
      name,
      issue
    ).then(res => {
      console.log(`Check template result: ${JSON.stringify(res)}`);

      // Don"t act if this issue is a feature request
      if (isFR) {
        console.log("Feature request, ignoring template matching");
        return;
      }

      if (!res.matches) {
        // If it does not match, add the suggested comment and close the issue
        const comment = this.gh_client.addComment(
          org,
          name,
          number,
          res.message
        );

        // TODO(samstern): Re-enable when we have further discussed closing behavior.
        // const close = this.gh_client.closeIssue(org, name, number);
        const close = Promise.resolve();

        return Promise.all([comment, close]);
      }
    });

    // Wait for all actions to finish
    return Promise.all([
      addLabelPromise,
      addCommentPromise,
      checkTemplatePromise
    ]);
  }

  /**
   * Send an email update when an issue has a new assignee.
   */
  onIssueAssigned(repo: types.Repository, issue: types.Issue) {
    const assignee = issue.assignee.login;
    const body = "Assigned to " + assignee;

    return this.sendIssueUpdateEmail(repo, issue, {
      header: "Changed: Assignee",
      body: body
    });
  }

  /**
   * Send an email update when the overall status of an issue changes,
   * such as open to closed or closed to reopened.
   */
  onIssueStatusChanged(
    repo: types.Repository,
    issue: types.Issue,
    new_status: IssueStatus
  ) {
    const body = "New status: " + new_status;

    return this.sendIssueUpdateEmail(repo, issue, {
      header: "Changed: Status",
      body: body
    });
  }

  /**
   * Send an email update if an issue was labeled with a new label that has email configured.
   */
  onIssueLabeled(repo: types.Repository, issue: types.Issue, label: string) {
    // Basic info
    const org = repo.owner.login;
    const name = repo.name;

    // Render the issue body
    const body_html = marked(issue.body);

    // Send a new issue email
    return this.sendIssueUpdateEmail(repo, issue, {
      header: `New Issue in label ${label}`,
      body: body_html,
      label: label
    });
  }

  /**
   * Send an email when a new comment is added to an issue.
   */
  onCommentCreated(
    repo: types.Repository,
    issue: types.Issue,
    comment: types.Comment
  ) {
    // Trick for testing
    if (comment.body == "eval") {
      console.log("HANDLING SPECIAL COMMENT: eval");
      return this.onNewIssue(repo, issue);
    }

    const comment_html = marked(comment.body);
    const body = `
      <div>
        <p>@${comment.user.login}:</p>
        ${comment_html}
      </div>`;

    return this.sendIssueUpdateEmail(repo, issue, {
      header: "New Comment",
      body: body
    });
  }

  /**
   * Send an email when an issue has been updated.
   */
  sendIssueUpdateEmail(
    repo: types.Repository,
    issue: types.Issue,
    opts: SendIssueUpdateEmailOpts
  ) {
    // Get basic issue information
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    // See if this issue belongs to any team.
    const label = opts.label || this.getRelevantLabel(org, name, issue);
    if (!label) {
      console.log("Not a relevant label, no email needed.");
      return Promise.resolve();
    }

    // Get label email from mapping
    let recipient;
    const label_config = this.config.getRepoLabelConfig(org, name, label);
    if (label_config) {
      recipient = label_config.email;
    }

    if (!recipient) {
      console.log("Nobody to notify, no email needed.");
      return Promise.resolve();
    }

    // Get email subject
    const subject = this.getIssueEmailSubject(issue.title, org, name, label);

    // Send email update
    return this.email_client.sendStyledEmail(
      recipient,
      subject,
      opts.header,
      opts.body,
      issue.html_url,
      "Open Issue"
    );
  }

  /**
   * Pick the first label from an issue that has a related configuration.
   */
  getRelevantLabel(org: string, name: string, issue: types.Issue) {
    // Make sure we at least have configuration for this repository
    const repo_mapping = this.config.getRepoConfig(org, name);
    if (!repo_mapping) {
      console.log(`No config for ${org}/${name} in: `, this.config);
      return undefined;
    }

    // Get the labeling rules for this repo
    console.log("Found config: ", repo_mapping);

    // Iterate through issue labels, see if one of the existing ones works
    // TODO(samstern): Deal with needs_triage separately
    // TODO(abehaskins): Get clarification here
    // for (const key in repo_mapping.labels) {
    //   const label_mapping = repo_mapping.labels[key];
    //   if (label_mapping && issue.labels.indexOf(key) >= 0) {
    //     return key;
    //   }
    // }

    // Try to match the issue body to a new label
    console.log("No existing relevant label, trying regex");
    console.log("Issue body: " + issue.body);

    for (const label in repo_mapping.labels) {
      const labelInfo = repo_mapping.labels[label];

      // Some labels do not have a regex
      if (!labelInfo.regex) {
        console.log(`Label ${label} does not have a regex.`);
        continue;
      }

      const regex = new RegExp(labelInfo.regex);

      // If the regex matches, choose the label and email then break out
      if (regex.test(issue.body)) {
        console.log("Matched label: " + label, JSON.stringify(labelInfo));
        return label;
      } else {
        console.log(`Did not match regex for ${label}: ${labelInfo.regex}`);
      }
    }

    // Return undefined if none found
    console.log("No relevant label found");
    return undefined;
  }

  /**
   * Check if an issue is a feature request.
   */
  isFeatureRequest(issue: types.Issue) {
    return issue.title && issue.title.startsWith("FR");
  }

  /**
   * Check if issue matches the template.
   */
  checkMatchesTemplate(org: string, name: string, issue: types.Issue) {
    // TODO(samstern): Should I catch inability to get the issue template
    // and handle it here?
    return this.gh_client
      .getIssueTemplate(org, name, this.config)
      .then(data => {
        const checker = new template.TemplateChecker("###", "[REQUIRED]", data);
        const issueBody = issue.body;

        const result = new CheckMatchesTemplateResult();

        if (!checker.matchesTemplateSections(issueBody)) {
          console.log("checkMatchesTemplate: some sections missing");
          result.matches = false;
          result.message =
            "Hmmm this issue does not seem to follow the issue template. " +
            "Make sure you provide all the required information.";
          return result;
        }

        const missing = checker.getRequiredSectionsMissed(issueBody);
        if (missing.length > 0) {
          console.log("checkMatchesTemplate: required sections incompconste");
          result.matches = false;
          result.message =
            "This issues does not have all the required information.  " +
            "Looks like you forgot to fill out some sections: (" +
            missing +
            ").  " +
            "Please update the issue with more information.";
          return result;
        }

        return result;
      });
  }

  /**
   * Make an email subject that"s suitable for filtering.
   * ex: "[firebase/ios-sdk][auth] I have an auth issue!"
   */
  getIssueEmailSubject(
    title: string,
    org: string,
    name: string,
    label: string
  ) {
    return `[${org}/${name}][${label}] ${title}`;
  }
}
