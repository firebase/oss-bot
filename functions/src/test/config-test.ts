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
import "mocha";

import * as assert from "assert";
import * as log from "../log";
import * as encoding from "../shared/encoding";

describe("Configuration", async () => {
  before(() => {
    log.setLogLevel(log.Level.WARN);
  });

  after(() => {
    log.setLogLevel(log.Level.ALL);
  });

  it("should properly encode and decode keys", async () => {
    const cases = [
      {
        original: "a",
        encoded: "a"
      },
      {
        original: "a:b",
        encoded: "a0col0b"
      },
      {
        original: "a b",
        encoded: "a0spc0b"
      },
      {
        original: "a: b",
        encoded: "a0col00spc0b"
      },
      {
        original: "a  b",
        encoded: "a0spc00spc0b"
      },
      {
        original: ".github/foo.md",
        encoded: "0dgh00sls0foo0dmd0"
      }
    ];

    for (const c of cases) {
      const encoded = encoding.encodeKey(c.original);
      const decoded = encoding.decodeKey(encoded);
      assert.deepEqual(c.encoded, encoded);
      assert.deepEqual(c.original, decoded);
    }
  });

  it("should properly flatten a config", async () => {
    const deep = {
      a: 1,
      b: {
        x: 2,
        "y: z": 3
      }
    };

    const flat = {
      a: 1,
      "b.x": 2,
      "b.y0col00spc0z": 3
    };

    assert.deepEqual(
      encoding.flattenConfig(deep, encoding.Direction.ENCODE),
      flat
    );
  });

  it("should properly deep decode an object", async () => {
    const encoded = {
      a: 1,
      b: {
        c0col0d: 2,
        e0spc0f: {
          g0spc0h: 3
        }
      }
    };

    const decoded = {
      a: 1,
      b: {
        "c:d": 2,
        "e f": {
          "g h": 3
        }
      }
    };

    assert.deepEqual(encoding.deepDecodeObject(encoded), decoded);
  });
});
