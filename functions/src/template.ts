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
import * as diff from "diff";

/**
 * An object that checks whether a given piece of text matches a template.
 * @param {string} sectionPrefix a prefix that identifies a line as a new section (trailing space assumed).
 * @param {string} requiredMarker a string that identifies a section as requied.
 * @param {string} templateText text of the empty template.
 */
export class TemplateChecker {
  sectionPrefix: string;
  requiredMarker: string;
  templateText: string;

  constructor(
    sectionPrefix: string,
    requiredMarker: string,
    templateText: string
  ) {
    // String prefix for a section (normally ###)
    this.sectionPrefix = sectionPrefix;

    // String that marks a required section (normally [REQUIRED])
    this.requiredMarker = requiredMarker;

    // String text of the template
    this.templateText = templateText;
  }

  /**
   * Take a string and turn it into a map from section header to section content.
   */
  extractSections(data: string) {
    // Fix newlines
    data = data.replace(/\r\n/g, "\n");

    // Then split
    const lines = data.split("\n");

    const sections: { [s: string]: string[] } = {};
    let current_section;

    for (const line of lines) {
      if (line.startsWith(this.sectionPrefix + " ")) {
        // New section
        current_section = line;
        sections[current_section] = [];
      } else if (current_section) {
        // Line in current section
        sections[current_section].push(line);
      }
    }

    return sections;
  }

  /**
   * Determine if a string has the same sections as the template.
   */
  matchesTemplateSections(data: string) {
    const otherSections = this.extractSections(data);
    const templateSections = this.extractSections(this.templateText);

    for (const key in templateSections) {
      if (!otherSections[key]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the names of all sections that were not filled out (unmodified).
   */
  getRequiredSectionsMissed(data: string) {
    const otherSections = this.extractSections(data);
    const templateSections = this.extractSections(this.templateText);

    const sectionsMissed = [];

    for (const key in templateSections) {
      if (key.indexOf(this.requiredMarker) >= 0) {
        // This section is required, compare contents
        const templateText = templateSections[key].join("\n");
        const otherText = otherSections[key].join("\n");

        if (this.areStringsEqual(otherText, templateText)) {
          sectionsMissed.push(key);
        }
      }
    }

    return sectionsMissed;
  }

  /**
   * Compare two multiline strings
   */
  areStringsEqual(a: string, b: string) {
    const diffs = diff.diffWords(a, b);
    for (const d of diffs) {
      if (d.added || d.removed) {
        return false;
      }
    }

    return true;
  }
}
