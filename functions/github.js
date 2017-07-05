"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GithubApi = require("github");
/**
 * Get a new client for interacting with Github.
 * @param {string} token Github API token.
 */
class GithubClient {
    constructor(token) {
        // Github API token
        this.token = token;
        // Underlying Github API client
        this.api = new GithubApi({
            debug: true,
            Promise: Promise,
            timeout: 5000
        });
    }
    /**
     * Authenticate with Github as the bot. This function should be called before
     * each use of the Github API.
     */
    auth() {
        this.api.authenticate({
            type: "oauth",
            token: this.token
        });
    }
    /**
     * Add a label to a github issue, returns a promise.
     */
    addLabel(org, name, number, label) {
        this.auth();
        return this.api.issues.addLabels({
            owner: org,
            repo: name,
            number: number,
            labels: [label]
        });
    }
    /**
     * Add a comment to a github issue, returns a promise.
     */
    addComment(org, name, number, body) {
        this.auth();
        return this.api.issues.createComment({
            owner: org,
            repo: name,
            number: number,
            body: body
        });
    }
    /**
     * Gets issue template from a github repo.
     */
    getIssueTemplate(org, name, config) {
        const issue_file = config.getRepoTemplateConfig(org, name, "issue") || "ISSUE_TEMPLATE.md";
        console.log(`GithubClient.getIssueTemplate: ${org}/${name}, file=${issue_file}`);
        return this.getFileContent(org, name, issue_file);
    }
    /**
     * Gets file content from a github repo.
     */
    getFileContent(org, name, file) {
        this.auth();
        return this.api.repos
            .getContent({
            owner: org,
            repo: name,
            path: file
        })
            .then(function (res) {
            // Content is encoded as base64, we need to decode it
            return new Buffer(res.data.content, "base64").toString();
        });
    }
    /** */
    closeIssue(org, name, number) {
        this.auth();
        // Add the closed-by-bot label
        const add_label = this.api.issues.addLabels({
            owner: org,
            repo: name,
            number: number,
            labels: ["closed-by-bot"]
        });
        // Close the issue
        const close_issue = this.api.issues.edit({
            owner: org,
            repo: name,
            number: number,
            state: "closed"
        });
        return Promise.all([add_label, close_issue]);
    }
    /**
     * Get open PRs not modified in the last "expiry" ms.
     */
    getOldPullRequests(org, name, expiry) {
        this.auth();
        return this.api.pullRequests
            .getAll({
            owner: org,
            repo: name,
            state: "open",
            sort: "updated",
            direction: "asc"
        })
            .then(res => {
            const prs = res.data;
            const results = [];
            // For each PR, check if it was updated recently enough.
            for (const pr of prs) {
                const nowTime = new Date().getTime();
                const updatedTime = new Date(pr.updated_at).getTime();
                if (nowTime - updatedTime > expiry) {
                    results.push(pr);
                }
            }
            return results;
        });
    }
}
exports.GithubClient = GithubClient;
//# sourceMappingURL=github.js.map