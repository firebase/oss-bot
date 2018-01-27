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
import * as fs from "fs";
import * as path from "path";

import * as config from "../src/config";
import * as github from "../src/github";
import * as email from "../src/email";

export class MockGithubClient extends github.GithubClient {
  auth() {
    console.log("mock: github.auth()");
  }

  addLabel(org: string, name: string, number: number, label: string) {
    console.log(`mock: github.addLabel(${org}, ${name}, ${number}, ${label})`);
    return Promise.resolve(undefined);
  }

  addComment(org: string, name: string, number: number, body: string) {
    console.log(`mock: github.addComment(${org}, ${name}, ${number}, ${body})`);
    return Promise.resolve(undefined);
  }

  getIssueTemplate(org: string, name: string, config: config.BotConfig) {
    console.log(`mock: github.getIssueTemplate(${org}, ${name})`);

    var filePath = path.join(__dirname, "mock_data", "issue_template_empty.md");
    var template = fs.readFileSync(filePath).toString();
    return Promise.resolve(template);
  }

  closeIssue(org: string, name: string, number: number) {
    console.log(`mock: github.closeIssue(${org}, ${name}, ${number})`);
    return Promise.resolve(undefined);
  }

  getOldPullRequests(org: string, name: string, expiry: number) {
    console.log(`mock: github.getOldPullRequests(${org}, ${name}, ${expiry})`);

    var filePath = path.join(__dirname, "mock_data", "old_pull_requests.json");
    var data = JSON.parse(fs.readFileSync(filePath).toString());
    return Promise.resolve(data);
  }
}

export class MockEmailClient extends email.EmailClient {
  sendEmail(recipient: string, subject: string, body: string) {
    console.log(`mock: email.sendEmail(${recipient}, ${subject}, ...)`);
    return Promise.resolve(undefined);
  }

  getSmartMailMarkup(url: string, title: string) {
    console.log(`mock: email.getSmartMailMarkup(${url}, ${title})`);
    return "<div>MOCK</div>";
  }
}
