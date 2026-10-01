import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { oneAnswer, qualityReport, UNIFIED_SNAPSHOT, unifiedPatterns } from "./brain.ts";
import { foundationStatus } from "./foundation.server.ts";

describe("one knowledge store", () => {
  it("answers from sqlite and does not return a second result", () => {
    const status = foundationStatus();
    const report = qualityReport();
    assert.equal(status.source_of_truth, "sqlite:data/gg-foundation.sqlite");
    assert.equal(status.snapshot_id, UNIFIED_SNAPSHOT);
    assert.equal(status.source_records, report.source_records);
    assert.equal(status.import_artifact_role, "IMPORT_MANIFEST_NOT_SOURCE_OF_TRUTH");
    const answer = oneAnswer("zzzz-not-a-stored-cultivar");
    assert.equal(answer.competing_results, 0);
    assert.equal(answer.fixture_cannot_override, true);
    assert.equal(answer.answer.snapshot_id, UNIFIED_SNAPSHOT);
    assert.equal(answer.answer.prediction_probability, null);
    const patterns = unifiedPatterns("zzzz-not-a-stored-cultivar");
    assert.ok(Array.isArray(patterns));
    assert.equal(patterns.some((row) => row.authority !== "sqlite"), false);
  });
});
