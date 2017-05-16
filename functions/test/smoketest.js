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
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var issues = require('../issues.js');
var pullrequests = require('../pullrequests.js');
var cron = require('../cron.js');
var mocks = require('./mocks.js');

// Label mapping configuration
var config = require('./mock_data/config.json');

// Issue event handler
var issue_handler = new issues.IssueHandler(
  new mocks.MockGithubClient(),
  new mocks.MockEmailClient(),
  config
);

// Issue event handler
var pr_handler = new pullrequests.PullRequestHandler(
  new mocks.MockGithubClient(),
  new mocks.MockEmailClient(),
  config
);

// Cron handler
var cron_handler = new cron.CronHandler(new mocks.MockGithubClient());

// Issue with the template properly filled in
var good_issue = {
  body: fs
    .readFileSync(path.join(__dirname, 'mock_data', 'issue_template_filled.md'))
    .toString()
};

// Issue that is just the empty template
var bad_issue = {
  body: fs
    .readFileSync(path.join(__dirname, 'mock_data', 'issue_template_empty.md'))
    .toString()
};

// Issue that is really a feature request
var fr_issue = {
  title: 'FR: I want to change the Firebase',
  body: bad_issue.body
};

// Some mock events
var opened_evt = require('./mock_data/issue_opened.json');
var comment_evt = require('./mock_data/comment_created.json');
var only_product_evt = require('./mock_data/issue_opened_filled_only_product.json');

describe('The OSS Robot', () => {
  it('should handle issue opened', () => {
    return issue_handler.handleIssueEvent(
      {},
      'opened',
      opened_evt.issue,
      opened_evt.repository,
      opened_evt.sender
    );
  });

  it('should handle comment created', () => {
    return issue_handler.handleIssueCommentEvent(
      {},
      'created',
      comment_evt.issue,
      comment_evt.comment,
      comment_evt.repository,
      comment_evt.sender
    );
  });

  it('should check a good issue against the template', () => {
    return issue_handler
      .checkMatchesTemplate('foo', 'bar', good_issue)
      .then(res => {
        assert.ok(res.matches, 'Matches template.');
      });
  });

  it('should check a bad issue against the template', () => {
    return issue_handler
      .checkMatchesTemplate('foo', 'bar', bad_issue)
      .then(res => {
        assert.ok(!res.matches, 'Does not match template.');
      });
  });

  it('should handle a partially correct issue', () => {
    var issue = only_product_evt.issue;

    // Should match the auth issue
    var label = issue_handler.getRelevantLabel('samtstern', 'BotTest', issue);
    assert.equal(label, 'auth', 'Label is auth.');

    // Should fail the tempalte check for not filling out all sections
    return issue_handler.checkMatchesTemplate('foo', 'bar', issue).then(res => {
      assert.ok(!res.matches, 'Does not fully match template.');
      assert.ok(
        res.message.indexOf('Hmmm') == -1,
        "Message does not contain 'Hmm.'"
      );
      assert.ok(
        res.message.indexOf('forgot to') > -1,
        "Message does contain 'forgot to'."
      );
    });
  });

  it('should correctly identify a feature request', () => {
    return issue_handler
      .checkMatchesTemplate('foo', 'bar', fr_issue)
      .then(res => {
        assert.ok(res.matches, 'Matches the template.');
        assert.ok(
          res.label == 'feature-request',
          'Has the feature request label.'
        );
      });
  });

  it('should correctly clean up old pull requests', () => {
    return cron_handler.handleCleanup('samtstern', 'BotTest', 0);
  });

  it('should detect issue link in a PR', () => {
    pr_none = {
      body: 'Hey this is bad!'
    };

    assert.ok(!pr_handler.hasIssueLink('foo', pr_none), 'Has no link.');

    pr_shortlink = {
      body: 'Hey this is in reference to #4'
    };

    assert.ok(pr_handler.hasIssueLink('foo', pr_shortlink), 'Has short link.');

    pr_longlink = {
      body: 'Hey this is in reference to https://github.com/samtstern/BotTest/issues/4'
    };

    assert.ok(pr_handler.hasIssueLink('foo', pr_longlink), 'Has long link.');
  });

  it('should skip some PRs', () => {
    pr_skip = {
      title: "[triage-skip] Don't triage me"
    };

    assert.ok(pr_handler.hasSkipTag('foo', pr_skip), 'Has skip tag');

    pr_triage = {
      title: 'Hey whatever'
    };

    assert.ok(
      !pr_handler.hasSkipTag('foo', pr_triage),
      'Does not have skip tag'
    );
  });
});
