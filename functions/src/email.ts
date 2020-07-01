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
import * as log from "./log";
import * as types from "./types";
import * as config from "./config";

const mailgun = require("mailgun-js");

/**
 * Get a new email client that uses Mailgun.
 * @param {string} key Mailgun API key.
 * @param {string} domain Mailgun sender domain.
 */
export class EmailClient {
  apiKey: string;
  domain: string;

  sender: any;

  constructor(apiKey: string, domain: string) {
    this.apiKey = apiKey;
    this.domain = domain;
  }

  /**
   * Send a new email.
   */
  sendEmail(recipient: string, subject: string, body: string): Promise<any> {
    const data = {
      from: "Firebase OSS Bot <firebase-oss-bot@ossbot.computer>",
      to: recipient,
      subject: subject,
      html: body
    };

    log.debug("Sending email: ", JSON.stringify(data));

    // Return a promise for the email
    return new Promise((resolve, reject) => {
      this.getSender()
        .messages()
        .send(data, (error: string, body: string) => {
          if (error) {
            log.debug("Email Error: " + error);
            reject(error);
          } else {
            log.debug("Send Email Body: " + JSON.stringify(body));
            resolve(body);
          }
        });
    });
  }

  /**
   * Send an emails styled like a GitHub update.
   */
  sendStyledEmail(
    recipient: string,
    subject: string,
    header: string,
    body_html: string,
    link: string,
    action: string
  ): Promise<any> {
    const smartmail_markup = this.getSmartmailMarkup(link, action);

    const body = `
    <html>
      <body>
        <p>
          <a href="${link}">${link}</a>
        </p>

        <p>
          <b>${header}</b>
        </p>

        <div>
          ${body_html}
        </div>

        ___

        <p>(This email is automatically generated, do not reply)</p>

        ${smartmail_markup}
      <body>
    </html>`;

    return this.sendEmail(recipient, subject, body);
  }

  /**
   * Invisible email markup to add action in Gmail.
   *
   * Note: Get registered with google.
   * https://developers.google.com/gmail/markup/registering-with-google
   */
  getSmartmailMarkup(url: string, title: string): string {
    const email_markup = `
      <div itemscope itemtype="http://schema.org/EmailMessage">
        <div itemprop="potentialAction" itemscope itemtype="http://schema.org/ViewAction">
          <link itemprop="url" href="${url}"/>
          <meta itemprop="name" content="${title}"/>
        </div>
        <meta itemprop="description" content="${title}" />
      </div>`;

    return email_markup;
  }

  // Lazy initialize sender
  getSender(): any {
    if (!this.sender) {
      this.sender = mailgun({
        apiKey: this.apiKey,
        domain: this.domain
      });
    }

    return this.sender;
  }
}

export interface SendIssueUpdateEmailOpts {
  header: string;
  body: string;
  label?: string;
}

export class EmailUtils {
  constructor(private config: config.BotConfig) {}

  /**
   * Send an email when an issue has been updated.
   */
  getIssueUpdateEmailAction(
    repo: types.internal.Repository,
    issue: types.internal.IssueOrPullRequest,
    opts: SendIssueUpdateEmailOpts
  ): types.SendEmailAction | undefined {
    // Get basic issue information
    const org = repo.owner.login;
    const name = repo.name;
    const number = issue.number;

    // Check if emails are enabled at all
    const repoFeatures = this.config.getRepoFeatures(org, name);
    if (!repoFeatures.custom_emails) {
      log.debug("Repo does not have the email feature enabled.");
      return undefined;
    }

    // See if this issue belongs to any team.
    let label: string | undefined = opts.label;
    if (!label) {
      const labelRes = this.config.getRelevantLabel(org, name, issue);
      label = labelRes.label;
    }
    if (!label) {
      log.debug("Not a relevant label, no email needed.");
      return undefined;
    }

    // Get label email from mapping
    let recipient;
    const label_config = this.config.getRepoLabelConfig(org, name, label);
    if (label_config) {
      recipient = label_config.email;
    }

    if (!recipient) {
      log.debug("Nobody to notify, no email needed.");
      return undefined;
    }

    // Get email subject
    const subject = this.getIssueEmailSubject(issue.title, org, name, label);

    const issue_url =
      issue.html_url || `https://github.com/${org}/${name}/issues/${number}`;

    // Send email update
    return new types.SendEmailAction(
      recipient,
      subject,
      opts.header,
      opts.body,
      issue_url,
      "Open Issue"
    );
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
  ): string {
    return `[${org}/${name}][${label}] ${title}`;
  }
}
