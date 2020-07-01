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

import * as log from "../log";
import * as config from "../config";
import * as github from "../github";
import * as email from "../email";

export class MockGitHubClient extends github.GitHubClient {
  auth() {
    log.debug("mock: github.auth()");
  }

  addLabel(org: string, name: string, number: number, label: string) {
    log.debug(`mock: github.addLabel(${org}, ${name}, ${number}, ${label})`);
    return Promise.resolve(undefined);
  }

  addComment(org: string, name: string, number: number, body: string) {
    log.debug(`mock: github.addComment(${org}, ${name}, ${number}, ${body})`);
    return Promise.resolve(undefined);
  }

  getIssueTemplate(org: string, name: string, file: string) {
    log.debug(`mock: github.getIssueTemplate(${org}, ${name}, ${file})`);

    // Just use the file name of the path (ignore directories) and replace the
    // default with our designated empty file.
    let templatePath = path.basename(file);
    if (templatePath === config.BotConfig.getDefaultTemplateConfig("issue")) {
      templatePath = "issue_template_empty.md";
    }

    const filePath = path.join(__dirname, "mock_data", templatePath);
    const template = fs.readFileSync(filePath).toString();
    return Promise.resolve(template);
  }

  closeIssue(org: string, name: string, number: number) {
    log.debug(`mock: github.closeIssue(${org}, ${name}, ${number})`);
    return Promise.resolve(undefined);
  }
}

export class MockEmailClient extends email.EmailClient {
  sendEmail(recipient: string, subject: string, body: string) {
    log.debug(`mock: email.sendEmail(${recipient}, ${subject}, ...)`);
    return Promise.resolve(undefined);
  }

  getSmartMailMarkup(url: string, title: string) {
    log.debug(`mock: email.getSmartMailMarkup(${url}, ${title})`);
    return "<div>MOCK</div>";
  }
}
