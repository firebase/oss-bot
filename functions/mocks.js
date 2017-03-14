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

function MockGithubClient() {
  this.auth = () => {
    console.log('mock: github.auth()');
  };

  this.addLabel = (org, name, number, label) => {
    console.log(`mock: github.addLabel(${org}, ${name}, ${number}, ${label})`);
    return Promise.resolve();
  };

  this.addComment = (org, name, number, body) => {
    console.log(`mock: github.addComment(${org}, ${name}, ${number}, ${body})`);
    return Promise.resolve();
  };

  this.getIssueTemplate = (org, name) => {
    console.log(`mock: github.getIssueTemplate(${org}, ${name})`);

    var filePath = path.join(__dirname, 'mock_data', 'issue_template_empty.md');
    var template = fs.readFileSync(filePath).toString();
    return Promise.resolve(template);
  };

  this.closeIssue = (org, name, number) => {
    console.log(`mock: github.closeIssue(${org}, ${name}, ${number})`);
    return Promise.resolve();
  };

  this.getOldPullRequests = (org, name, expiry) => {
    console.log(`mock: github.getOldPullRequests(${org}, ${name}, ${expiry})`);

    var filePath = path.join(__dirname, 'mock_data', 'old_pull_requests.json');
    var data = JSON.parse(fs.readFileSync(filePath).toString());
    return Promise.resolve(data);
  };
}

function MockEmailClient() {
  this.sendEmail = (recipient, subject, body) => {
    console.log(`mock: email.sendEmail(${recipient}, ${subject}, ...)`);
    return Promise.resolve();
  };

  this.sendStyledEmail = (
    recipient,
    subject,
    header,
    body_html,
    link,
    action
  ) => {
    console.log(`mock: email.sendStyledEmail(${recipient}, ${subject}, ...)`);
    return Promise.resolve();
  };

  this.getSmartMailMarkup = (url, title) => {
    console.log(`mock: email.getSmartMailMarkup(${url}, ${title})`);
    return '<div>MOCK</div>';
  };
}

// Exports
exports.MockGithubClient = MockGithubClient;
exports.MockEmailClient = MockEmailClient;
