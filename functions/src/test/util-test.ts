/**
 * Copyright 2020 Google Inc. All Rights Reserved.
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
import "mocha";

import * as assert from "assert";
import * as log from "../log";
import * as util from "../util";

describe("Configuration", async () => {
  before(() => {
    log.setLogLevel(log.Level.WARN);
  });

  after(() => {
    log.setLogLevel(log.Level.ALL);
  });

  it("should properly calculate days and working days ago", async () => {
    const tueDec31 = new Date(Date.parse("2019-12-31"));
    const wedJan1 = new Date(Date.parse("2020-01-01"));
    const friJan3 = new Date(Date.parse("2020-01-03"));
    const monJan6 = new Date(Date.parse("2020-01-06"));

    assert.equal(util.daysAgo(tueDec31, wedJan1), 1, "daysAgo Tues --> Weds");
    assert.equal(
      util.workingDaysAgo(tueDec31, wedJan1),
      1,
      "workingDaysAgo Tues --> Weds"
    );

    assert.equal(util.daysAgo(wedJan1, friJan3), 2, "daysAgo Weds --> Fri");
    assert.equal(
      util.workingDaysAgo(wedJan1, friJan3),
      2,
      "workingDaysAgo Weds --> Fri"
    );

    assert.equal(util.daysAgo(wedJan1, monJan6), 5, "daysAgo Weds --> Mon");
    assert.equal(
      util.workingDaysAgo(wedJan1, monJan6),
      3,
      "workingDaysAgo Weds --> Mon"
    );

    assert.equal(util.daysAgo(friJan3, monJan6), 3, "daysAgo Fri --> Mon");
    assert.equal(
      util.workingDaysAgo(friJan3, monJan6),
      1,
      "workingDaysAgo Fri --> Mon"
    );
  });
});
