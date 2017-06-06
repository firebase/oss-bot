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

/**
 * Create a new config handler.
 * @param {object} config JSON config data.
 */
function BotConfig(config) {
  this.config = config;
}

/**
 * Get a list of all configured repos.
 */
BotConfig.prototype.getAllRepos = function() {
  var repos = [];

  for (var org in this.config) {
    for (var name in this.config[org]) {
      repos.push({
        org: org,
        name: name
      });
    }
  }

  return repos;
};

/**
 * Get the config object for a specific repo.
 */
BotConfig.prototype.getRepoConfig = function(org, name) {
  if (this.config[org] && this.config[org][name]) {
    return this.config[org][name];
  }

  return undefined;
};

/**
 * Get the config object for a single label of a specific repo.
 */
BotConfig.prototype.getRepoLabelConfig = function(org, name, label) {
  var repoConfig = this.getRepoConfig(org, name);
  if (repoConfig && repoConfig.labels && repoConfig.labels[label]) {
    return repoConfig.labels[label];
  }

  return undefined;
};

/**
 * Get the templates configuration for a specific repo.
 */
BotConfig.prototype.getRepoTemplateConfig = function(org, name, template) {
  var repoConfig = this.getRepoConfig(org, name);
  if (repoConfig && repoConfig.templates && repoConfig.templates[template]) {
    return repoConfig.templates[template];
  }

  return undefined;
};

// Exports
exports.BotConfig = BotConfig;
