"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Create a new config handler.
 * @param {object} config JSON config data.
 */
class BotConfig {
    constructor(config) {
        this.config = config;
    }
    /**
     * Get a list of all configured repos.
     */
    getAllRepos() {
        const repos = [];
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
    getRepoConfig(org, name) {
        if (this.config[org] && this.config[org][name]) {
            return this.config[org][name];
        }
    }
    /**
     * Get the config object for a single label of a specific repo.
     */
    getRepoLabelConfig(org, name, label) {
        const repoConfig = this.getRepoConfig(org, name);
        if (repoConfig && repoConfig.labels && repoConfig.labels[label]) {
            return repoConfig.labels[label];
        }
    }
    /**
     * Get the templates configuration for a specific repo.
     */
    getRepoTemplateConfig(org, name, template) {
        const repoConfig = this.getRepoConfig(org, name);
        if (repoConfig && repoConfig.templates && repoConfig.templates[template]) {
            return repoConfig.templates[template];
        }
    }
}
exports.BotConfig = BotConfig;
//# sourceMappingURL=config.js.map