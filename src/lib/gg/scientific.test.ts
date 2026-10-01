import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyQuery } from "./classify.ts";
import { parseCrossStructure } from "./resolve.ts";
import {
  aiCanBecomeDocumented,
  bayesianUpdate,
  cacheAdmission,
  chemotypeFromName,
  claimBecomesMeasurement,
  classifyProviderFailure,
  expectedCalibrationError,
  genealogicalFraction,
  genomicsFromRows,
  logLoss,
  numericPredictionAllowed,
  parentCountsAsProgeny,
  patternMayValidate,
  qualifierIsZero,
  retryDecision,
  simulateBernoulli,
  trainingEligible,
  traitArchitecture,
  visualToGenotype,
} from "./scientific.ts";

describe("scientific contracts", () => {
  it("keeps a failed provider out of knowledge and out of the cache", () => {
    assert.equal(classifyProviderFailure("personal-team-blocked:spending-limit 403"), "BLOCKED");
    assert.equal(classifyProviderFailure("401 unauthorized"), "REJECTED");
    assert.equal(classifyProviderFailure("malformed json"), "INVALID_PROVIDER_RESPONSE");
    assert.equal(classifyProviderFailure("socket hang up"), "FAILED");
    assert.equal(cacheAdmission("FAILED"), "REJECT");
    assert.equal(cacheAdmission("BLOCKED"), "REJECT");
    assert.equal(cacheAdmission("COMPLETED"), "ADMIT");
    assert.equal(cacheAdmission("INSUFFICIENT_EVIDENCE"), "TTL");
    assert.equal(aiCanBecomeDocumented("AI_RESEARCH"), false);
    assert.equal(claimBecomesMeasurement(), false);
    assert.equal(qualifierIsZero("ND"), false);
    assert.equal(qualifierIsZero("<LOQ"), false);
  });

  it("retries a failure later, and never turns a parent row into progeny", () => {
    const now = 1_000_000;
    const held = retryDecision({ status: "BLOCKED", attempts: 1, lastAt: now, now: now + 1000 });
    assert.equal(held.retry, false);
    assert.equal(held.reason, "BACKOFF");
    const later = retryDecision({ status: "FAILED", attempts: 1, lastAt: now, now: now + 31 * 60 * 1000 });
    assert.equal(later.retry, true);
    const capped = retryDecision({ status: "FAILED", attempts: 5, lastAt: 0, now });
    assert.equal(capped.retry, false);
    assert.equal(parentCountsAsProgeny("PARENT"), false);
    assert.equal(parentCountsAsProgeny("PROGENY"), true);
    assert.equal(trainingEligible({ provenance: true, measurement: true, role: "PARENT", leaked: false, approved: true }), false);
    assert.equal(trainingEligible({ provenance: true, measurement: true, role: "PROGENY", leaked: true, approved: true }), false);
  });

  it("refuses a number until every gate is actually true", () => {
    const closed = numericPredictionAllowed({
      identityAcceptable: true,
      traitArchitectureKnown: true,
      dataEligible: true,
      modelExists: true,
      modelValidated: true,
      calibrationAcceptable: false,
      noLeakage: true,
      uncertaintyComputable: true,
    });
    assert.equal(closed.allowed, false);
    assert.deepEqual(closed.missing, ["CALIBRATION"]);
    const open = numericPredictionAllowed({
      identityAcceptable: true,
      traitArchitectureKnown: true,
      dataEligible: true,
      modelExists: true,
      modelValidated: true,
      calibrationAcceptable: true,
      noLeakage: true,
      uncertaintyComputable: true,
    });
    assert.equal(open.allowed, true);
    assert.equal(traitArchitecture(null).heritability, null);
    assert.equal(genealogicalFraction("F1").is_genomic_percent, false);
    assert.equal(genealogicalFraction("F1").stable, false);
    assert.equal(chemotypeFromName().thc, null);
    assert.equal(visualToGenotype().genotype, null);
    assert.equal(genomicsFromRows(0).status, "NOT_AVAILABLE");
    assert.equal(patternMayValidate({ humanReview: false, independentSupport: 10, contradictions: 0 }), false);
    assert.equal(patternMayValidate({ humanReview: true, independentSupport: 2, contradictions: 0 }), true);
  });

  it("does not invent a prior, and a seeded simulation repeats", () => {
    assert.equal(bayesianUpdate({ prior: null, successes: 3, trials: 4 }).posterior, null);
    const prior = bayesianUpdate({
      prior: { alpha: 1, beta: 1, documented: true, source: "fixture-not-a-cannabis-prior" },
      successes: 3,
      trials: 4,
    });
    assert.equal(prior.status, "OK");
    const first = simulateBernoulli(0.5, 32, 7);
    const second = simulateBernoulli(0.5, 32, 7);
    assert.equal(first.status, "OK");
    assert.equal(second.status, "OK");
    if (first.status === "OK" && second.status === "OK") assert.deepEqual(first.draws, second.draws);
    assert.equal(simulateBernoulli(null, 10, 1).status, "NOT_COMPUTABLE");
    const loss = logLoss([0.8, 0.2], [1, 0]);
    assert.ok(loss != null && loss > 0);
    const ece = expectedCalibrationError([1, 0], [1, 0]);
    assert.equal(ece, 0);
  });

  it("parses conjunctions as structure and still refuses a slash", () => {
    assert.equal(classifyQuery("North and South").query_type, "CROSS");
    assert.equal(classifyQuery("North crossed to South").query_type, "CROSS");
    assert.equal(parseCrossStructure("North/South").kind, "ENTITY");
    assert.equal(parseCrossStructure("North and South").kind, "CROSS_REQUEST");
  });
});
