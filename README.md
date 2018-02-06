# oss-bot

## Introduction

A robot to automate github issue/pull request management. This robot
has the following features:

  * Ensure adherence to templates.
  * Automatically add labels based on custom configuration.
  * Automatically add 'feature-request' and 'needs-triage' labels to issues.
  * Send customized email notifications based on labels, allowing more
    granular subscriptions than Github provides.

Runs on Cloud Functions for Firebase using Github webhooks.

## Deployment

### Deploy Functions and Cronjob

After completing all configuration below, run `make deploy-test` or
`make deploy-prod` to build, test, ande deploy.

### Customize Configuration

Edit the `config/config.json` file to have configuration in the following form:

```javascript
{
  "<ORG_NAME>": {
    "<REPO_NAME>": {
      "labels": {
        "<LABEL_NAME>": {
          "regex": "<ISSUE_BODY_REGEX>",
          "email": "<LABEL_NOTIFICATION_EMAIL>"
        }
      },
      "templates": {
        "issue": "<ISSUE_TEMPLATE_LOCATION>"
      },
      "cleanup": {
        "pr": PR_EXPIRY_MS
      }
    }
  }
}
```

If the `regex` matches the issue body (anywhere) then an email
will be sent to the `email` address.

### Configure Secrets

#### Github:

Go to the [github token page](https://github.com/settings/tokens/new) and
create a new personal access token for the bot account with the following
permissions:

  * `public_repo` - access public repositories.
  * `admin:repo_hook` - read and write repository hooks.

```
firebase functions:config:set github.token="<YOUR_GITHUB_TOKEN>"
```

#### Mailgun:

```
firebase functions:config:set mailgun.key="<YOUR_MAILGUN_KEY>"
firebase functions:config:set mailgun.domain="<YOUR_MAILGUN_DOMAIN>"
```

### Email

In order to use the `SendWeeklyEmail` endpoint you need to configure the
recipient to some public group.

```
firebase functions:config:set email.recipient="<GROUP_TO_GET_EMAILS>"
```

#### Configure Github Webhook

In Github add a webhook with the following configuration:

  * Payload URL - your cloud functions HTTP URL. Which should be
    `https://<YOURPROJECT>.cloudfunctions.net/githubWebhook`.
  * Content type - application/json
  * Secret - N/A
  * Select individual events:
    * Issues
    * Pull request
    * Issue comment

## Tools

Aside from the use as a bot, the `functions/` directory also contains a few operational tasks related to our Github presence.

You can get a weekly snapshot of the organization by running:

```
npm run task:get-weekly-report
```

You can generate the HTML for a pretty report email by running:

```
npm run task:get-weekly-email
```

## Development

### Test

To run basic tests, use `make test-functions` which runs the mocha tests in `smoketest.ts`.
These tests are mostly a sanity check, used to verify basic behavior without
needing an end-to-end deploy.

### Formatting

Code is formatted using `prettier` so no bikeshedding allowed. Run
`npm run build` before committing.

## Build Status

[![Build Status](https://travis-ci.org/firebase/oss-bot.svg?branch=master)](https://travis-ci.org/firebase/oss-bot)