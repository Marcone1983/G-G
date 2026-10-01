import assert from "node:assert/strict";
import test from "node:test";
import {
  absentField,
  bayesianUpdate,
  calibrate,
  chemotypeValue,
  classifyIncoming,
  governanceAllowsShare,
  growthFromCounts,
  monteCarlo,
  nameOnlyCross,
  patternPromotion,
  pedigreeClaim,
  personalMedicalRequest,
  researchLoop,
  resolutionCandidate,
  scientificReport,
  sourceRank,
  traitArchitecture,
} from "./enterprise-64.ts";

test("enterprise gates do not invent science", () => {
  assert.equal(classifyIncoming({ sameHash: true, sameIds: false, sameSubjectDifferentObservation: false, conflicts: false }), "DUPLICATE");
  assert.equal(classifyIncoming({ sameHash: false, sameIds: false, sameSubjectDifferentObservation: true, conflicts: false }), "INDEPENDENT_REPLICATION");
  assert.equal(absentField().value, null);
  assert.equal(resolutionCandidate({ breederConflict: true, lineageConflict: false, chemistryConflict: false }).merged, false);
  assert.equal(pedigreeClaim({ genomic: false, reported: true }).genomic_percent, null);
  assert.equal(chemotypeValue({ raw: 0, belowLoq: true, missing: false }).value, null);
  assert.equal(personalMedicalRequest("qual è la mia terapia"), true);
  assert.equal(traitArchitecture({ commercialOnly: true, loci: 1 }), "UNKNOWN_ARCHITECTURE");
  assert.equal(bayesianUpdate({ prior: 0.5, likelihood: null, observations: 1 }).posterior, null);
  assert.equal(monteCarlo({ seed: 1, replicates: 10, assumptionOnly: true }).observed_evidence, false);
  const calibrated = calibrate({ model_version: "m1", prediction: 0.2 }, 0.4);
  assert.equal(calibrated.mutated_history, false);
  assert.equal(calibrated.previous.prediction, 0.2);
  assert.equal(nameOnlyCross().prediction_probability, null);
  assert.equal(patternPromotion({ copies: 40, independent: 1, reviewed: false }).promoted, false);
  assert.equal(sourceRank("USER_REPORT").equivalent_to_primary, false);
  assert.equal(growthFromCounts({ claims: 1 }, { claims: 1 }).delta.claims, 0);
  assert.equal(governanceAllowsShare("PENDING"), false);
  assert.equal(researchLoop()[0], "SNAPSHOT");
  assert.equal(scientificReport({}).prediction_probability, null);
  assert.equal(scientificReport({}).knowledge_snapshot, null);
});
