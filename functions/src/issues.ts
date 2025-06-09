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
import * as types from "./types";
import * as log from "./log";
import * as email from "./email";
import * as snapshot from "./snapshot";

export const MSG_FOLLOW_TEMPLATE =
  "This issue does not seem to follow the issue template. " +
  "Make sure you provide all the required information.";

export const MSG_MISSING_INFO =
  "This issue does not have all the information required by the template.  " +
  "Looks like you forgot to fill out some sections.  " +
  "Please update the issue with more information.";

export const MSG_NEEDS_TRIAGE =
  "I couldn't figure out how to label this issue, " +
  "so I've labeled it for a human to triage. Hang tight.";

// Event: issues
// https://developer.github.com/v3/activity/events/types/#issuesevent
// Keys:
//   * issue - the issue itself
//   * changes - the changes to the issue if the action was edited
//   * assignee - the optional user who was assigned or unassigned
//   * label - the optional label that was added or removed
export enum IssueAction {
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
export enum CommentAction {
  CREATED = "created",
  EDITED = "edited",
  DELETED = "deleted"
}

export enum IssueStatus {
  CLOSED = "closed",
  OPEN = "open"
}

class CheckMatchesTemplateResult {
  skipped: boolean = false;
  matches: boolean = true;

  templatePath: string;
  message: string;
  failure?: {
    missingSections?: string[];
    emptySections?: string[];
    otherError?: string;
  };
}

interface CategorizeIssueResult {
  is_fr: boolean;
  needs_triage: boolean;
  actions: types.Action[];
  matched_label?: string;
}

// Label for issues that confuse the bot
const LABEL_NEEDS_TRIAGE = "needs-triage";

// Label for feature requests
const LABEL_FR = "type: feature request";

/**
 * Construct a new issue handler.
 * @param {GitHubClient} gh_client client for interacting with GitHub.
 * @param {BotConfig} config bot configuration.
 */
export class IssueHandler {
  gh_client: github.GitHubClient;
  config: config.BotConfig;
  emailer: email.EmailUtils;

  constructor(gh_client: github.GitHubClient, config: config.BotConfig) {
    // Client for interacting with github
    this.gh_client = gh_client;

    // Configuration
    this.config = config;

    // Email utiltity
    this.emailer = new email.EmailUtils(this.config);
  }

  /**
   * Handle an event associated with a GitHub issue.
   */
  async handleIssueEvent(
    event: types.github.WebhookEvent,
    action: IssueAction,
    issue: types.internal.Issue,
    repo: types.internal.Repository,
    sender: types.github.Sender
  ): Promise<types.Action[]> {
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
        log.debug("Unsupported issue action: " + action);
        log.debug("Issue: " + issue.title);
        break;
    }

    // Return empty action array if no action to be taken.
    return Promise.resolve([]);
  }

  /**
   * Handle an event associated with a GitHub issue comment.
   */
  async handleIssueCommentEvent(
    event: types.github.WebhookEvent,
    action: CommentAction,
    issue: types.internal.Issue,
    comment: types.internal.Comment,
    repo: types.internal.Repository,
    sender: types.github.Sender
  ): Promise<types.Action[]> {
    switch (action) {
      case CommentAction.CREATED:
        return this.onCommentCreated(repo, issue, comment);
      case CommentAction.EDITED:
      /* falls through */
      case CommentAction.DELETED:
      /* falls through */
      default:
        log.debug("Unsupported comment action: " + action);
        log.debug("Issue: " + issue.title);
        log.debug("Comment: " + comment.body);
        break;
    }

    // Return empty action array if no action to be taken.
    return Promise.resolve([]);
  }

  /**
   * Handles new issues, should do the following tasks:
   *   1. Label the issue (if possible).
   *   2. Notify the appropriate team (if possible).
   */
  async onNewIssue(
    repo: types.internal.Repository,
    issue: types.internal.Issue
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];
    const org = repo.owner.login;
    const name = repo.name;

    // When an issue is transferred from one repo to another GitHub uses the new-issue
    // event but we shouldn't process it like that, a human has already looked at it.
    if (issue.changes && issue.changes.old_issue) {
      log.debug(
        `onNewIssue: ignoring issue transferred from ${issue.changes.old_issue.url}`
      );
      return actions;
    }

    const repoFeatures = this.config.getRepoFeatures(org, name);
    log.debug(
      `onNewIssue: ${name} has features ${JSON.stringify(repoFeatures)}`
    );

    // Basic issue categorization, which involves adding labels
    // based on matching configuration.
    const categorization = this.categorizeNewIssue(repo, issue);
    if (repoFeatures.issue_labels) {
      actions.push(...categorization.actions);
    }

    // If the issue is filed by a collaborator, we stop here.
    const isCollaborator = await snapshot.userIsCollaborator(
      org,
      name,
      issue.user.login
    );
    if (isCollaborator) {
      actions.push(
        new types.GitHubNoOpAction(
          org,
          name,
          issue.number,
          `No further action taken on this issue because it was filed by repo collaborator: ${issue.user.login}`
        )
      );

      return actions;
    }

    // If the issue needs triage, there's a fixed label and comment
    if (repoFeatures.issue_labels && categorization.needs_triage) {
      actions.push(...this.markNeedsTriage(repo, issue));
    }

    // Check if it matches the template. This feature is implicitly enabled by
    // the template having "matchable" structure so there is no need to check
    // the repo's configuration.
    const templateActions = await this.checkNewIssueTemplate(repo, issue);

    // There are some situations where we don't want to nag about the template
    //  1) This is a feature request
    //  2) We were able to label with some something besides needs_triage
    const shouldValidateTemplate = !(
      categorization.is_fr || categorization.matched_label
    );
    if (shouldValidateTemplate) {
      actions.push(...templateActions);
    }

    // Return a list of actions to do
    return actions;
  }

  /**
   * Send an email update when an issue has a new assignee.
   */
  onIssueAssigned(
    repo: types.internal.Repository,
    issue: types.internal.Issue
  ): types.Action[] {
    if (!issue.assignee) {
      log.warn(
        `onIssueAssigned called for an issue with no assignee: ${repo.name}#${issue.number}`
      );
      return [];
    }

    const assignee = issue.assignee.login;
    const body = "Assigned to " + assignee;

    const action = this.emailer.getIssueUpdateEmailAction(repo, issue, {
      header: "Changed: Assignee",
      body: body
    });

    if (!action) {
      return [];
    }

    return [action];
  }

  /**
   * Send an email update when the overall status of an issue changes,
   * such as open to closed or closed to reopened.
   */
  onIssueStatusChanged(
    repo: types.internal.Repository,
    issue: types.internal.Issue,
    new_status: IssueStatus
  ): types.Action[] {
    const body = "New status: " + new_status;

    const action = this.emailer.getIssueUpdateEmailAction(repo, issue, {
      header: "Changed: Status",
      body: body
    });

    if (!action) {
      return [];
    }

    return [action];
  }

  /**
   * Send an email update if an issue was labeled with a new label that has email configured.
   */
  onIssueLabeled(
    repo: types.internal.Repository,
    issue: types.internal.Issue,
    label: string
  ): types.Action[] {
    // Render the issue body
    const body_html = marked(issue.body || "");

    // Send a new issue email
    const action = this.emailer.getIssueUpdateEmailAction(repo, issue, {
      header: `New Issue from ${issue.user.login} in label ${label}`,
      body: body_html,
      label: label
    });

    if (!action) {
      return [];
    }

    return [action];
  }

  /**
   * Send an email when a new comment is added to an issue.
   */
  async onCommentCreated(
    repo: types.internal.Repository,
    issue: types.internal.Issue,
    comment: types.internal.Comment
  ): Promise<types.Action[]> {
    // Trick for testing
    if (comment.body == "eval") {
      log.debug("HANDLING SPECIAL COMMENT: eval");
      return await this.onNewIssue(repo, issue);
    }

    // Basic info
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    const actions: types.Action[] = [];

    // Send an email to subscribers
    const comment_html = marked(comment.body);
    const emailAction = this.emailer.getIssueUpdateEmailAction(repo, issue, {
      header: `New Comment by ${comment.user.login}`,
      body: comment_html
    });

    if (emailAction) {
      actions.push(emailAction);
    }

    // Check for staleness things
    const cleanupConfig = this.config.getRepoCleanupConfig(
      repo.owner.login,
      repo.name
    );

    const isBotComment = comment.user.login === "google-oss-bot";
    const isClosed = issue.state === "closed";

    if (cleanupConfig && cleanupConfig.issue && !isBotComment && !isClosed) {
      const issueConfig = cleanupConfig.issue;
      const labelNames = issue.labels.map(label => label.name);

      const isNeedsInfo = labelNames.includes(issueConfig.label_needs_info);
      const isStale = labelNames.includes(issueConfig.label_stale);

      const isAuthorComment = comment.user.login === issue.user.login;

      if (isStale) {
        // Any comment on a stale issue removes the stale flag
        actions.push(
          new types.GitHubRemoveLabelAction(
            org,
            name,
            number,
            issueConfig.label_stale,
            `Comment by ${comment.user.login} on stale issues remove the stale state.`
          )
        );

        // An author comment on a stale issue moves this to "needs attention",
        // a comment by someone else moves this to needs-info.
        const labelToAdd = isAuthorComment
          ? issueConfig.label_needs_attention
          : issueConfig.label_needs_info;

        const reason = isAuthorComment
          ? `Comment by the author (${issue.user.login}) on a stale issue moves this to needs_attention`
          : `Comment by a non-author (${comment.user.login}) on a stale issue moves this to needs_info`;

        if (isAuthorComment && !issueConfig.label_needs_attention) {
          log.debug(
            "Not adding 'needs-attention' label because it is not specified."
          );
        }

        if (labelToAdd) {
          actions.push(
            new types.GitHubAddLabelAction(
              org,
              name,
              number,
              labelToAdd,
              reason
            )
          );
        }
      }

      if (isNeedsInfo && isAuthorComment) {
        // An author comment on a needs-info issue moves it to needs-attention.
        const reason = `Comment by the author (${issue.user.login}) moves this from needs_info to needs_attention.`;
        actions.push(
          new types.GitHubRemoveLabelAction(
            org,
            name,
            number,
            issueConfig.label_needs_info,
            reason
          )
        );

        if (issueConfig.label_needs_attention) {
          actions.push(
            new types.GitHubAddLabelAction(
              org,
              name,
              number,
              issueConfig.label_needs_attention,
              reason
            )
          );
        } else {
          log.debug(
            "Config does not specifiy 'label_needs_attention' so not adding any label"
          );
        }
      }
    }

    return actions;
  }

  markNeedsTriage(
    repo: types.internal.Repository,
    issue: types.internal.Issue
  ): types.Action[] {
    log.debug("Issue needs triage, adding label and comment");
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    return [
      new types.GitHubAddLabelAction(
        org,
        name,
        number,
        LABEL_NEEDS_TRIAGE,
        "Issue did not match any label regexes"
      ),
      new types.GitHubCommentAction(
        org,
        name,
        number,
        MSG_NEEDS_TRIAGE,
        true,
        "Friendly comment added when an issue is labeled needs-triage"
      )
    ];
  }

  /**
   * Check a new issue and determine how it should be labeled, adding an
   * explanatory comment if necessary.
   */
  categorizeNewIssue(
    repo: types.internal.Repository,
    issue: types.internal.Issue
  ): CategorizeIssueResult {
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    // Try to label the issue based on configuration
    const labelResult = this.config.getRelevantLabel(org, name, issue);

    // TODO(samstern): Should this include actions at all?
    const result: CategorizeIssueResult = {
      is_fr: this.isFeatureRequest(issue),
      matched_label: labelResult.label,
      needs_triage: false,
      actions: []
    };

    // Choose new label
    if (result.is_fr) {
      log.debug(`Matched feature request template, adding label ${LABEL_FR}`);
      result.actions.push(
        new types.GitHubAddLabelAction(
          org,
          name,
          number,
          LABEL_FR,
          "Matched the template for a feature request"
        )
      );
    } else if (!labelResult.error && labelResult.label) {
      const newLabel = labelResult.label;
      log.debug(`Issue matched configuration for ${newLabel}`);
      result.actions.push(
        new types.GitHubAddLabelAction(
          org,
          name,
          number,
          newLabel,
          `Issue matched regex for label "${newLabel}" (${labelResult.matchedRegex})`
        )
      );
    } else {
      // Mark the issue as needs triage
      result.needs_triage = true;
    }

    return result;
  }

  /**
   * Check a new issue against its template. Requires the result
   * from {@link categorizeNewIssue}.
   */
  async checkNewIssueTemplate(
    repo: types.internal.Repository,
    issue: types.internal.Issue
  ): Promise<types.Action[]> {
    const actions: types.Action[] = [];
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    const res = await this.checkMatchesTemplate(org, name, issue);
    log.debug(`Check template result: ${JSON.stringify(res)}`);

    const validationConfig = this.config.getRepoTemplateValidationConfig(
      repo.owner.login,
      repo.name,
      res.templatePath
    );

    if (!res.matches) {
      // If it does not match:
      //  * Add a comment explaining the probblems.
      //  * If configured, add a label for template validation failure.
      let reason: string;
      if (res.failure && res.failure.emptySections) {
        reason = `Required sections of "${
          res.templatePath
        }" were left empty: ${JSON.stringify(res.failure.emptySections)}`;
      } else if (res.failure && res.failure.missingSections) {
        reason = `Sections of "${
          res.templatePath
        }" were missing: ${JSON.stringify(res.failure.missingSections)}`;
      } else {
        reason =
          "There was an unknown error when trying to match the issue template";
      }

      const template_action = new types.GitHubCommentAction(
        org,
        name,
        number,
        res.message,
        true,
        reason
      );
      actions.push(template_action);

      if (validationConfig && validationConfig.validation_failed_label) {
        const label = validationConfig.validation_failed_label;
        const label_action = new types.GitHubAddLabelAction(
          repo.owner.login,
          repo.name,
          issue.number,
          label,
          "Template validation failed, adding specified label."
        );
        actions.push(label_action);
      }
    }

    return actions;
  }

  /**
   * Check if an issue is a feature request.
   */
  isFeatureRequest(issue: types.internal.Issue): boolean {
    return !!issue.title && issue.title.startsWith("FR");
  }

  /**
   * Check if issue matches the template.
   */
  async checkMatchesTemplate(
    org: string,
    name: string,
    issue: types.internal.Issue
  ): Promise<CheckMatchesTemplateResult> {
    const result = new CheckMatchesTemplateResult();
    const templateOpts = this.parseIssueOptions(org, name, issue);

    const templatePath = templateOpts.path;
    result.templatePath = templatePath;

    log.debug("Template options: ", templateOpts);
    if (!templateOpts.validate) {
      log.debug(`Template optons specify no verification.`);
      result.skipped = true;
      return result;
    }

    const validationConfig = this.config.getRepoTemplateValidationConfig(
      org,
      name,
      templatePath
    );
    log.debug("Validation config: ", validationConfig);

    // Try to get the issue template, but skip validation if we can't.
    let data = undefined;
    try {
      data = await this.gh_client.getIssueTemplate(
        org,
        name,
        templateOpts.path
      );
    } catch (e) {
      const err = `failed to get issue template for ${org}/${name} at ${templateOpts.path};`;
      log.warn(`checkMatchesTemplate: ${err}: ${JSON.stringify(e)}`);

      result.failure = {
        otherError: err
      };
      return result;
    }

    const checker = new template.TemplateChecker("###", "[REQUIRED]", data);
    const issueBody = issue.body;

    const missingSections = checker.matchesTemplateSections(issueBody);
    if (missingSections.invalid.length > 0) {
      log.debug(
        `checkMatchesTemplate: missing ${missingSections.invalid.length} sections from the template.`
      );
      result.matches = false;
      result.message = MSG_FOLLOW_TEMPLATE;
      result.failure = {
        missingSections: missingSections.invalid
      };
      return result;
    }

    const emptySections = checker.getRequiredSectionsEmpty(issueBody);

    let maxEmptySections = 0;
    if (validationConfig && validationConfig.required_section_validation) {
      switch (validationConfig.required_section_validation) {
        case "strict":
          // Any empty required section is a violation
          maxEmptySections = 0;
          break;
        case "relaxed":
          // As long as you fill out one required section, it's ok
          maxEmptySections = emptySections.all.length - 1;
          break;
        case "none":
          maxEmptySections = emptySections.all.length;
          break;
      }
    }

    const numEmptySections = emptySections.invalid.length;
    if (numEmptySections > maxEmptySections) {
      log.debug(
        `checkMatchesTemplate: ${numEmptySections} required sections are empty, which is greater than ${maxEmptySections}.`
      );
      result.matches = false;
      result.message = MSG_MISSING_INFO;
      result.failure = {
        emptySections: emptySections.invalid
      };
    } else if (numEmptySections > 0) {
      log.debug(
        `checkMatchesTemplate: ${numEmptySections} required sections are empty but max was ${maxEmptySections}.`
      );
    }

    return result;
  }

  /**
   * Choose the proper issue template and validation options for a given issue.
   * This is determined by first reading the static config and then looking for
   * options specified in the issue body.
   */
  parseIssueOptions(
    org: string,
    name: string,
    issue: types.internal.Issue
  ): types.TemplateOptions {
    let templatePath = this.config.getRepoTemplateConfig(org, name, "issue");
    if (!templatePath) {
      log.debug(`No "issue" template specified for ${name}, using defaults.`);
      templatePath = config.BotConfig.getDefaultTemplateConfig("issue");
    }

    const options = new types.TemplateOptions(templatePath, true);

    const path_re = /template_path=(.*)/;
    const validate_re = /validate_template=(.*)/;

    const body = issue.body;

    const path_match = body.match(path_re);
    if (path_match) {
      options.path = path_match[1];
      log.debug(`Issue ${issue.number} specified path=${options.path}`);
    }

    const validate_match = body.match(validate_re);
    if (validate_match) {
      options.validate = validate_match[1] == "true";
      log.debug(`Issue ${issue.number} specified validate=${options.validate}`);
    }

    return options;
  }

  /**
   * FOR TESTING ONLY!
   * Sets a new configuration for the robot,
   */
  setConfig(config: config.BotConfig) {
    this.config = config;
  }
}
