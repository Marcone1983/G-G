import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cacheCompatibility, redisCacheStatus } from "./cache-provider.ts";
import { calibrate } from "./calibration.ts";
import { classifyPattern } from "./pattern-lifecycle.ts";
import { privateAccess } from "./privacy.ts";

describe("completion gates", () => {
  it("does not calibrate a fixture and does not turn a missing probability into a score", () => {
    const none = calibrate([{ fixture: true, approved: true, predicted: 1, observed: 1 }]);
    assert.equal(none.calibration_status, "NOT_CALIBRATED");
    assert.equal(none.brier, null);
    const empty = calibrate([]);
    assert.equal(empty.calibration_status, "NOT_CALIBRATED");
  });

  it("does not promote a name pattern into a genetic effect", () => {
    const row = classifyPattern({ support: 14, contradictions: 0, genomic: false, reviewed: false });
    assert.equal(row.lifecycle, "CANDIDATE");
    assert.equal(row.genetic_effect, false);
    assert.equal(row.promoted, false);
  });

  it("rejects a cache hit when the snapshot differs and does not invent redis", () => {
    assert.equal(cacheCompatibility({ model: "1", snapshot: "A", schema: "gg-report-architecture-1" }, { model: "1", snapshot: "B", schema: "gg-report-architecture-1" }), "INCOMPATIBLE");
    assert.equal(redisCacheStatus({}).redis, "NOT_CONFIGURED");
    assert.equal(redisCacheStatus({}).hit, false);
  });

  it("denies another user's private row", () => {
    assert.equal(privateAccess("user-a", "user-b"), "DENY");
    assert.equal(privateAccess(null, null), "DENY");
    assert.equal(privateAccess("user-a", "user-a"), "ALLOW");
  });
});
