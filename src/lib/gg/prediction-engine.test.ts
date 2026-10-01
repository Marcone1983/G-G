import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bayesianBeta, bootstrapMidParent, brier, populationAtLeastOne } from "./prediction/math.ts";
import { predictCross, recordOutcome, resetPredictionCache } from "./prediction/orchestrator.ts";
import { openSqliteCorpus } from "./prediction/sqlite-reader.ts";

const corpus = "data/gg-foundation.sqlite";

describe("prediction math", () => {
  it("does not turn a missing probability into zero or a population chance", () => {
    assert.equal(populationAtLeastOne(null, 100, true).population_probability, null);
    assert.equal(populationAtLeastOne(0.5, 2, false).status, "NOT_COMPUTABLE");
    assert.equal(populationAtLeastOne(0.5, 2, true).population_probability, 0.75);
    assert.equal(bayesianBeta({ priorAlpha: null, priorBeta: null, successes: 3, failures: 1 }).posterior_mean, null);
    assert.equal(brier([0.25], [1]), 0.5625);
  });

  it("repeats the same bootstrap for the same seed", () => {
    const left = [1, 1, 1, 9];
    const right = [2, 2, 2, 40];
    const a = bootstrapMidParent({ left, right, seed: 7, replicates: 80 });
    const b = bootstrapMidParent({ left, right, seed: 7, replicates: 80 });
    assert.deepEqual(a, b);
    const other = bootstrapMidParent({ left, right, seed: 99, replicates: 80 });
    assert.notEqual(`${a.q05}|${a.q95}`, `${other.q05}|${other.q95}`);
  });
});

describe("prediction engine on the verified corpus", () => {
  it("refuses to fuse an ambiguous parent into a progeny probability", () => {
    resetPredictionCache();
    const report = predictCross(openSqliteCorpus(corpus), {
      parentA: "Black Domina",
      parentB: "Sugar Black Rose",
    }, "2026-10-01T00:00:00.000Z");
    assert.equal(report.prediction_probability, null);
    assert.equal(report.calibration_status, "NOT_CALIBRATED");
    assert.equal(report.data_status, "IDENTITY_AMBIGUOUS");
    assert.equal(report.traits.every((trait) => trait.central_estimate === null), true);
    assert.match(report.human_report, /Black Domina/);
  });

  it("reads independent groups and caches the uncalibrated mid-parent", () => {
    resetPredictionCache();
    const reader = openSqliteCorpus(corpus);
    let calls = 0;
    const counting = new Proxy(reader, {
      get(target, property, receiver) {
        if (property === "values") {
          return (...args: Parameters<typeof reader.values>) => {
            calls += 1;
            return target.values(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const input = {
      parentA: "GMO",
      parentB: "Blueberry Muffin",
      parentAId: 5759,
      parentBId: 1927,
      compounds: ["delta_9_thc"],
      seed: 11,
    };
    const started = Date.now();
    const first = predictCross(counting, input, "2026-10-01T00:00:00.000Z");
    const cold = Date.now() - started;
    const readsAfterFirst = calls;
    const second = predictCross(counting, input, "2026-10-01T00:00:01.000Z");
    assert.equal(first.cache_status, "MISS");
    assert.equal(second.cache_status, "HIT");
    assert.equal(calls, readsAfterFirst);
    assert.equal(second.prediction_id, first.prediction_id);
    assert.equal(first.prediction_probability, null);
    assert.equal(first.identity_status, "RESOLVED");
    const trait = first.traits[0]!;
    assert.equal(trait.status, "ESTIMATE");
    assert.equal(trait.central_estimate, (trait.parent_a_median! + trait.parent_b_median!) / 2);
    assert.ok(trait.parent_a_groups >= 2);
    assert.ok(trait.parent_a_rows > trait.parent_a_groups);
    assert.equal(trait.monte_carlo.status, "COMPUTED");
    assert.equal(first.patterns_used.every((pattern) => pattern.applied_to_estimate === false), true);
    assert.equal(first.linkage, "linkage_unknown");
    assert.equal(first.population.population_probability, null);
    const otherModel = predictCross(counting, { ...input, modelVersion: "2" }, "2026-10-01T00:00:02.000Z");
    assert.equal(otherModel.cache_status, "MISS");
    const outcome = recordOutcome(first.prediction_id, 1);
    assert.equal(outcome.stored, true);
    assert.equal(outcome.prediction_rewritten, false);
    assert.equal(predictCross(counting, input, "2026-10-01T00:00:03.000Z").prediction_probability, null);
    assert.ok(cold < 120_000, `cold read took ${cold}ms`);
  });
});
