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
import * as types from "./types";

interface Repo {
  org: string;
  name: string;
}

/**
 * Create a new config handler.
 * @param {object} config JSON config data.
 */
export class BotConfig {
  config: types.Config;

  constructor(config: any) {
    this.config = config as types.Config;
  }

  /**
   * Get a list of all configured repos.
   */
  getAllRepos() {
    const repos: Repo[] = [];

    for (const org in this.config) {
      for (const name in this.config[org]) {
        repos.push({
          org: org,
          name: name
        });
      }
    }

    return repos;
  }

  /**
   * Get the config object for a specific repo.
   */
  getRepoConfig(org: string, name: string): types.RepoConfig | undefined {
    const cleanOrg = this.sanitizeKey(org);
    const cleanName = this.sanitizeKey(name);
    if (this.config[cleanOrg] && this.config[cleanOrg][cleanName]) {
      return this.config[cleanOrg][cleanName];
    }
  }

  /**
   * Get the config object for a single label of a specific repo.
   */
  getRepoLabelConfig(
    org: string,
    name: string,
    label: string
  ): types.LabelConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    const cleanLabel = this.sanitizeKey(label);
    if (repoConfig && repoConfig.labels && repoConfig.labels[cleanLabel]) {
      return repoConfig.labels[cleanLabel];
    }
  }

  /**
   * Get the templates configuration for a specific repo.
   */
  getRepoTemplateConfig(
    org: string,
    name: string,
    template: string
  ): string | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    const cleanTemplate = this.sanitizeKey(template);
    if (
      repoConfig &&
      repoConfig.templates &&
      repoConfig.templates[cleanTemplate]
    ) {
      return repoConfig.templates[cleanTemplate];
    }
  }

  /**
   * Get the config for weekly repo report emails.
   */
  getRepoReportingConfig(
    org: string,
    name: string
  ): types.ReportConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    if (repoConfig && repoConfig.reports) {
      return repoConfig.reports;
    }
  }

  /**
   * Get the config for cleaning up stale issues on a repo.
   */
  getRepoCleanupConfig(
    org: string,
    name: string
  ): types.CleanupConfig | undefined {
    // TODO: Actually use the values and get a per-repo config!
    const repoConfig = this.getRepoConfig(org, name);

    return {
      issue: {
        label_needs_info: "needs-info",
        label_needs_attention: "needs-attention",
        label_stale: "stale",
        ignore_labels: ["feature-request", "internal"],
        needs_info_days: 7,
        stale_days: 3
      }
    };
  }

  /**
   * Get the default template path for a type.
   */
  static getDefaultTemplateConfig(template: string) {
    if (template === "issue") {
      return "ISSUE_TEMPLATE.md";
    } else {
      return "PULL_REQUEST_TEMPLATE.md";
    }
  }

  /**
   * Keys are sanitized before they are stored in config and therefore need
   * to be sanitized when retrieved.
   */
  sanitizeKey(key: string): string {
    let cleanKey = key;
    cleanKey = cleanKey.toLowerCase();
    cleanKey = cleanKey.trim();

    return cleanKey;
  }
}
