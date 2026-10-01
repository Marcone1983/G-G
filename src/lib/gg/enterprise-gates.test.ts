import assert from "node:assert/strict";
import test from "node:test";
import { findKnowledgeGaps, GAP_CATEGORIES } from "./knowledge-gaps.ts";
import { canComputeProbability } from "./probability-gate.ts";
import { acquisitionFailed } from "./research-acquisition.ts";

test("knowledge gaps stay unmeasured until a real count exists", () => {
  const gaps = findKnowledgeGaps({ STRAINS: 0, CLINICAL_EVIDENCE: 2 });
  assert.equal(gaps.length, GAP_CATEGORIES.length);
  assert.equal(gaps.find((gap) => gap.category === "STRAINS")?.status, "GAP");
  assert.equal(gaps.find((gap) => gap.category === "CLINICAL_EVIDENCE")?.status, "PRESENT");
  assert.equal(gaps.find((gap) => gap.category === "QTL")?.status, "NOT_MEASURED");
  assert.equal(gaps.find((gap) => gap.category === "QTL")?.count, null);
});

test("an uncalibrated model cannot emit a probability", () => {
  const blocked = canComputeProbability({ calibrated: false, independent_replicates: 10, leakage: false, proposed: 0.8 });
  assert.equal(blocked.probability, null);
  assert.equal(blocked.prediction_status, "NOT_COMPUTABLE");
  const open = canComputeProbability({ calibrated: true, independent_replicates: 10, leakage: false, proposed: 0.8 });
  assert.equal(open.allowed, true);
  assert.equal(open.probability, 0.8);
});

test("a failed source acquisition stores no invented content", () => {
  const failed = acquisitionFailed("pubmed", "timeout", 2);
  assert.equal(failed.status, "ACQUISITION_FAILED");
  assert.equal(failed.content, null);
  assert.equal(failed.attempt_count, 2);
});
