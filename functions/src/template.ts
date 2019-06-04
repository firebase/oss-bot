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

interface SectionValidationResult {
  all: string[];
  invalid: string[];
}

class TemplateContent {
  sections: TemplateSection[];
  index: { [name: string]: TemplateSection } = {};

  constructor(sections: TemplateSection[]) {
    this.sections = sections;
    for (const section of sections) {
      this.index[section.cleanName] = section;
    }
  }

  get(cleanName: string): TemplateSection | undefined {
    return this.index[cleanName];
  }
}

class TemplateSection {
  name: string;
  cleanName: string;
  required: boolean;
  body: string[];

  constructor(name: string, body: string[], checker: TemplateChecker) {
    this.name = name;
    this.body = body;
    this.cleanName = checker.cleanSectionName(name);
    this.required = this.name.indexOf(checker.requiredMarker) >= 0;
  }
}

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
  extractSections(data: string): TemplateContent {
    // Fix newlines
    data = data.replace(/\r\n/g, "\n");

    // Then split
    const lines = data.split("\n");

    const sections: TemplateSection[] = [];
    let currentSection: TemplateSection | undefined = undefined;

    for (const line of lines) {
      if (line.startsWith(this.sectionPrefix + " ")) {
        // New section
        currentSection = new TemplateSection(line, [], this);
        sections.push(currentSection);
      } else if (currentSection) {
        // Line in current section
        currentSection.body.push(line);
      }
    }

    return new TemplateContent(sections);
  }

  /**
   * Determine if a string has the same sections as the template.
   *
   * Returns an array of sections that were present in the template
   * but not in the issue.
   */
  matchesTemplateSections(data: string): SectionValidationResult {
    const otherSections = this.extractSections(data);
    const templateSections = this.extractSections(this.templateText);

    const missingSections: string[] = [];
    for (const section of templateSections.sections) {
      if (!otherSections.get(section.cleanName)) {
        missingSections.push(section.name);
      }
    }

    const all = templateSections.sections.map(x => x.name);
    const invalid = missingSections;
    return { all, invalid };
  }

  /**
   * Get the names of all required sections that were not filled out (unmodified).
   */
  getRequiredSectionsEmpty(data: string): SectionValidationResult {
    const otherContent = this.extractSections(data);
    const templateContent = this.extractSections(this.templateText);
    const emptySections: string[] = [];

    const requiredSections = templateContent.sections.filter(x => x.required);

    for (const section of requiredSections) {
      // For a required section, we want to make sure that the user
      // made *some* modification to the section body.
      const otherSection = otherContent.get(section.cleanName);
      if (!otherSection) {
        emptySections.push(section.cleanName);
        continue;
      }

      const templateSectionBody = section.body.join("\n");
      const otherSectionBody = otherSection.body.join("\n");

      if (this.areStringsEqual(templateSectionBody, otherSectionBody)) {
        emptySections.push(section.cleanName);
      }
    }

    const all = requiredSections.map(x => x.name);
    const invalid = emptySections;
    return { all, invalid };
  }

  cleanSectionName(name: string): string {
    let result = "" + name;

    result = result.replace(this.sectionPrefix, "");

    const markerIndex = result.indexOf(this.requiredMarker);
    if (markerIndex >= 0) {
      result = result.substring(markerIndex + this.requiredMarker.length);
    }

    result = result.trim();
    result = result.toLocaleLowerCase();

    return result;
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
