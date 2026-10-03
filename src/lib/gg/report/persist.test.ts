import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEntityArchitecture } from "./architecture.ts";
import { fixtureMetrics, publicReport, reportCacheKey } from "./persist.ts";

describe("report persistence", () => {
  it("drops the private sentence and keeps the scientific sections", () => {
    const report = buildEntityArchitecture({
      raw: "cosa mi sai dire sulla blue dream",
      query: "blue dream",
      candidates: [{ id: "entity:1", canonical_name: "Blue Dream", identity_status: "PROBABLE_IDENTITY" }],
      patterns: [],
      snapshot: "GGS-KNOWLEDGE-000007",
    });
    const stored = publicReport(report);
    assert.equal(stored.query_interpretation.raw, "ENTITY");
    assert.equal(stored.provenance.knowledge_snapshot, "GGS-KNOWLEDGE-000007");
    assert.equal(stored.prediction_probability ?? stored.provenance.prediction_probability, null);
  });

  it("changes the cache key when the snapshot changes", () => {
    const left = reportCacheKey({ parents: ["north", "south"], generation: ["G8"], requested: [], model: "1", snapshot: "GGS-KNOWLEDGE-000007" });
    const right = reportCacheKey({ parents: ["north", "south"], generation: ["G8"], requested: [], model: "1", snapshot: "GGS-KNOWLEDGE-000005" });
    assert.notEqual(left, right);
  });

  it("keeps a synthetic fixture out of calibration", () => {
    const metrics = fixtureMetrics();
    assert.equal(metrics.calibration_status, "NOT_CALIBRATED");
    assert.equal(metrics.brier, null);
    assert.equal(metrics.global_knowledge, false);
  });
});
