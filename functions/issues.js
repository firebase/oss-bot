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
var marked = require('marked');
var template = require('./template.js');

// Event: issues
// https://developer.github.com/v3/activity/events/types/#issuesevent
// Keys:
//   * issue - the issue itself
//   * changes - the changes to the issue if the action was edited
//   * assignee - the optional user who was assigned or unassigned
//   * label - the optional label that was added or removed
const ISSUE_ASSIGNED = 'assigned';
const ISSUE_UNASSIGNED = 'unassigned';
const ISSUE_LABELED = 'labeled';
const ISSUE_UNLABELED = 'unlabeled';
const ISSUE_OPENED = 'opened';
const ISSUE_EDITED = 'edited';
const ISSUE_CLOSED = 'closed';
const ISSUE_REOPENED = 'reopened';

// Event: issue_comment
// https://developer.github.com/v3/activity/events/types/#issuecommentevent
// Keys:
//   * changes - changes to the comment if it was edited
//   * issue - the issue the comment belongs to
//   * comment - the comment itself
const COMMENT_CREATED = 'created';
const COMMENT_EDITED = 'edited';
const COMMENT_DELETED = 'deleted';

// Label for issues that confuse the bot
const LABEL_NEEDS_TRIAGE = 'needs-triage';

// Label for feature requests
const LABEL_FR = 'feature-request';

/**
 * Construct a new issue handler.
 * @param {GithubClient} gh_client client for interacting with Github.
 * @param {EmaiClient} email_client client for sending emails.
 * @param {object} config JSON configuration.
 */
function IssueHandler(gh_client, email_client, config) {
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
IssueHandler.prototype.handleIssueEvent = function(
  event,
  action,
  issue,
  repo,
  sender
) {
  // TODO(samstern): when we get ISSUE_LABELED should we re-run the new issue pipeline?
  switch (action) {
    case ISSUE_OPENED:
      return this.onNewIssue(repo, issue);
    case ISSUE_ASSIGNED:
      return this.onIssueAssigned(repo, issue);
    case ISSUE_CLOSED:
      return this.onIssueStatusChanged(repo, issue, 'closed');
    case ISSUE_REOPENED:
      return this.onIssueStatusChanged(repo, issue, 'open');
    case ISSUE_LABELED:
      return this.onIssueLabeled(repo, issue, event.label.name);
    case ISSUE_UNASSIGNED:
    /* falls through */
    case ISSUE_UNLABELED:
    /* falls through */
    case ISSUE_EDITED:
    /* falls through */
    default:
      console.log('Unsupported issue action: ' + action);
      console.log('Issue: ' + issue.title);
      break;
  }

  return Promise.resolve();
};

/**
 * Handle an event associated with a Github issue comment.
 */
IssueHandler.prototype.handleIssueCommentEvent = function(
  event,
  action,
  issue,
  comment,
  repo,
  sender
) {
  switch (action) {
    case COMMENT_CREATED:
      return this.onCommentCreated(repo, issue, comment);
    case COMMENT_EDITED:
    /* falls through */
    case COMMENT_DELETED:
    /* falls through */
    default:
      console.log('Unsupported comment action: ' + action);
      console.log('Issue: ' + issue.title);
      console.log('Comment: ' + comment.body);
      break;
  }

  return Promise.resolve();
};

/**
 * Handles new issues, should do the following tasks:
 *   1. Label the issue (if possible).
 *   2. Notify the appropriate team (if possible).
 */
IssueHandler.prototype.onNewIssue = function(repo, issue) {
  // Get basic issue information
  var org = repo.owner.login;
  var name = repo.name;
  var number = issue.number;

  // Choose new label
  var new_label = this.getRelevantLabel(org, name, issue) || LABEL_NEEDS_TRIAGE;

  // Add the label
  var addLabelPromise = this.gh_client.addLabel(org, name, number, new_label);

  // Add a comment, if necessary
  var addCommentPromise;
  if (new_label == LABEL_NEEDS_TRIAGE) {
    console.log('Needs triage, adding friendly comment');
    msg =
      "Hey there! I couldn't figure out what this issue is about, so I've labeled it for a human to triage. Hang tight.";
    addCommentPromise = this.gh_client.addComment(org, name, number, msg);
  } else {
    console.log('Not commenting');
    addCommentPromise = Promise.resolve();
  }

  // Check if it matches the template
  var checkTemplatePromise = this.checkMatchesTemplate(
    org,
    name,
    issue
  ).then(res => {
    if (!res.matches) {
      // If it does not match, add the suggested comment and close the issue
      var comment = this.gh_client.addComment(org, name, number, res.message);
      var close = this.gh_client.closeIssue(org, name, number);

      return Promise.all([comment, close]);
    } else if (res.label) {
      // If a label was suggested (maybe for a FR) add it
      return this.gh_client.addLabel(org, name, number, res.label);
    }
  });

  // Get email body
  var issue_body = issue.body || 'Issue body empty...';
  var body_html = marked(issue_body);

  // Wait for all actions to finish
  return Promise.all([
    addLabelPromise,
    addCommentPromise,
    checkTemplatePromise
  ]);
};

/**
 * Send an email update when an issue has a new assignee.
 */
IssueHandler.prototype.onIssueAssigned = function(repo, issue) {
  var assignee = issue.assignee.login;
  var body = 'Assigned to ' + assignee;

  return this.sendIssueUpdateEmail(repo, issue, {
    header: 'Changed: Assignee',
    body: body
  });
};

/**
 * Send an email update when the overall status of an issue changes,
 * such as open to closed or closed to reopened.
 */
IssueHandler.prototype.onIssueStatusChanged = function(
  repo,
  issue,
  new_status
) {
  var body = 'New status: ' + new_status;

  return this.sendIssueUpdateEmail(repo, issue, {
    header: 'Changed: Status',
    body: body
  });
};

/**
 * Send an email update if an issue was labeled with a new label that has email configured.
 */
IssueHandler.prototype.onIssueLabeled = function(repo, issue, label) {
  // Basic info
  var org = repo.owner.login;
  var name = repo.name;

  // Render the issue body
  var body_html = marked(issue.body);

  // Send a new issue email
  return this.sendIssueUpdateEmail(repo, issue, {
    header: 'New Issue',
    body: body_html,
    label: label
  });
};

/**
 * Send an email when a new comment is added to an issue.
 */
IssueHandler.prototype.onCommentCreated = function(repo, issue, comment) {
  var comment_html = marked(comment.body);
  var body = `
    <div>
      <p>@${comment.user.login}:</p>
      ${comment_html}
    </div>`;

  return this.sendIssueUpdateEmail(repo, issue, {
    header: 'New Comment',
    body: body
  });
};

/**
 * Send an email when an issue has been updated.
 */
IssueHandler.prototype.sendIssueUpdateEmail = function(repo, issue, opts) {
  // Get basic issue information
  var org = repo.owner.login;
  var name = repo.name;
  var number = issue.number;

  // See if this issue belongs to any team.
  var label = this.getRelevantLabel(org, name, issue) || opts.label;
  if (!label) {
    console.log('Not a relevant label, no email needed.');
    return Promise.resolve();
  }

  // Get label from mapping
  var recipient = this.config[org][name].labels[label].email;
  if (!recipient) {
    console.log('Nobody to notify, no email needed.');
    return Promise.resolve();
  }

  // Get email subject
  var subject = this.getIssueEmailSubject(issue.title, org, name, label);

  // Send email update
  return this.email_client.sendStyledEmail(
    recipient,
    subject,
    opts.header,
    opts.body,
    issue.html_url,
    'Open Issue'
  );
};

/**
 * Pick the first label from an issue that has a related configuration.
 */
IssueHandler.prototype.getRelevantLabel = function(org, name, issue) {
  // Get the labeling rules for this repo
  var repo_mapping = this.config[org][name];

  // Iterate through issue labels, see if one of the existing ones works
  for (var i = 0; i < issue.labels.length; i++) {
    var label_name = issue.labels[i].name;
    var label_props = repo_mapping.labels[label_name];
    if (label_props) {
      return label_name;
    }
  }

  // Try to match the issue body to a new label
  for (var label in repo_mapping.labels) {
    var labelInfo = repo_mapping.labels[label];

    // Some labels do not have a regex
    if (!labelInfo.regex) {
      continue;
    }

    var regex = new RegExp(labelInfo.regex);

    // If the regex matches, choose the label and email then break out
    if (regex.test(issue.body)) {
      console.log('Matched label: ' + label, JSON.stringify(labelInfo));
      return label;
    }
  }

  // Return undefined if none found
  return undefined;
};

/**
 * Check if issue matches the template.
 */
IssueHandler.prototype.checkMatchesTemplate = function(org, name, issue) {
  return this.gh_client.getIssueTemplate(org, name).then(data => {
    var checker = new template.TemplateChecker('###', '[REQUIRED]', data);
    var issueBody = issue.body;

    var result = {
      matches: true,
      label: undefined,
      message: undefined
    };

    if (issue.title && issue.title.startsWith('FR')) {
      // This is a feature request, so we don't care about the template
      result.label = LABEL_FR;
      return result;
    }

    if (!checker.matchesTemplateSections(issueBody)) {
      result.matches = false;
      result.message =
        'Hmmm this issue does not seem to follow the issue template ' +
        'so I am going to close it. You can file a new issue and try again';
      return result;
    }

    var missing = checker.getRequiredSectionsMissed(issueBody);
    if (missing.length > 0) {
      result.matches = false;
      result.message =
        'This issues does not have all the required information so I have to close it.  ' +
        'Looks like you forgot to fill out some sections: (' +
        missing +
        ').  ' +
        'You can file a new issue and try again.';
      return result;
    }

    return result;
  });
};

/**
 * Make an email subject that's suitable for filtering.
 * ex: "[firebase/ios-sdk][auth] I have an auth issue!"
 */
IssueHandler.prototype.getIssueEmailSubject = function(
  title,
  org,
  name,
  label
) {
  return `[${org}/${name}][${label}] ${title}`;
};

// Exports
exports.IssueHandler = IssueHandler;
