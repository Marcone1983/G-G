import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { intervalCoverage, regressionDiagnostics } from "./calibration.ts";
import { cancelJob, enqueueJob } from "./jobs.ts";
import { backoffMs, externalUrlAllowed, featureLineage, genomicProxyRefused, patternPromotion, postgresPreflight, redactSecrets, transitionModel } from "./release.ts";

describe("release candidate contracts", () => {
  it("refuses unsafe promotion, a continuous brier, and a direct production jump", () => {
    assert.equal(postgresPreflight({}).status, "NOT_CONFIGURED");
    assert.equal(postgresPreflight({ DATABASE_URL: "http://db.example" }).status, "REFUSED");
    assert.equal(postgresPreflight({ DATABASE_URL: "postgres://db.example/gg" }).connect, false);
    assert.equal(transitionModel("DRAFT", "PRODUCTION").ok, false);
    assert.equal(transitionModel("CALIBRATED", "PRODUCTION").ok, true);
    const thin = regressionDiagnostics([{ predicted: 1, observed: 1 }]);
    assert.equal(thin.status, "NOT_CALIBRATED");
    assert.equal(thin.brier, "NOT_APPLICABLE");
    const fit = regressionDiagnostics([{ predicted: 2, observed: 1 }, { predicted: 2, observed: 3 }]);
    assert.equal(fit.status, "COMPUTED");
    assert.equal(fit.brier, "NOT_APPLICABLE");
    assert.equal(intervalCoverage([{ observed: 1, lower: 0, upper: 1 }]).status, "NOT_CALIBRATED");
    assert.equal(featureLineage({ name: "progeny", sources: ["outcome"], usesTarget: false, usesFuture: false, usesProgenyOutcome: true }).promotable, false);
    assert.equal(patternPromotion({ humanReview: false, pValues: [0.01, 0.2] }).reason, "HUMAN_REVIEW_REQUIRED");
    assert.equal(genomicProxyRefused("f1").data_status, "NOT_AVAILABLE");
    assert.equal(externalUrlAllowed("https://169.254.169.254/latest").reason, "SSRF");
    assert.equal(externalUrlAllowed("https://example.test/a").allowed, true);
    assert.equal(redactSecrets("token sk-live-secret-value").includes("sk-"), false);
    assert.equal(backoffMs(2, 5), 4000 + 5);
  });

  it("cancels a queued job and does not change the scientific counts", () => {
    const before = counts();
    const id = enqueueJob("cancel_probe", { nonce: Date.now() });
    assert.equal(cancelJob(id), true);
    assert.equal(cancelJob(id), false);
    const after = counts();
    assert.equal(after.measurements, before.measurements);
    assert.equal(after.measurements, 8750800);
    assert.equal(after.records, 783429);
    assert.equal(after.samples, 762770);
  });
});

function counts() {
  const db = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });
  try {
    const n = (table: string) => Number((db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n);
    return { records: n("source_records"), samples: n("samples"), measurements: n("measurements") };
  } finally {
    db.close();
  }
}
