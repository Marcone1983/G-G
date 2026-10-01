import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { expectedCalibrationError, continuousBrierRefused } from "./calibration.ts";
import { rawGuard } from "./guard.ts";
import { claimSpecific, enqueueJob, ensureJobSchema, heartbeatJob, recoverStaleJobs } from "./jobs.ts";
import { acquireLock, releaseLock, renewLock, tryLock } from "./locks.ts";
import { leakagePaths } from "./leakage.ts";
import { readinessReport } from "./readiness.ts";
import { knowledgeRepository } from "./repository.ts";

describe("enterprise guard", () => {
  it("keeps the verified corpus and does not pretend infrastructure is up", () => {
    const guard = rawGuard();
    assert.equal(guard.ok, true);
    assert.deepEqual(guard.failures, []);
    assert.equal(guard.counts.measurements, 8750800);
    assert.equal(guard.counts.source_records, 783429);
    assert.equal(guard.gap.gap_count, 551);
    assert.equal(guard.gap.reason_code, "DECLARED_NOT_IN_FILE");
    assert.equal(guard.postgres, "NOT_CONFIGURED");
    assert.equal(guard.redis, "NOT_CONFIGURED");
    assert.equal(guard.prediction_probability, null);
    assert.equal(guard.json_value_repr, "PRESERVED");
  });

  it("deduplicates a process lock and recovers an expired job lease", () => {
    const key = `lock-${Date.now()}`;
    assert.equal(tryLock(key, 10_000).acquired, true);
    assert.equal(tryLock(key, 10_000).acquired, false);
    releaseLock(key);
    const owned = acquireLock("owned", "worker-a", 1000, 10);
    assert.equal(owned.acquired, true);
    assert.equal(acquireLock("owned", "worker-b", 1000, 20).acquired, false);
    assert.equal(renewLock("owned", "worker-b", 1000, 20), false);
    assert.equal(releaseLock("owned", "worker-b"), false);
    assert.equal(releaseLock("owned", "worker-a"), true);
    ensureJobSchema();
    const db = new DatabaseSync("data/gg-foundation.sqlite");
    const inserted = db
      .prepare("insert into jobs (job_type, job_status, started_at, retry_count, input_hash) values ('lease_probe', 'RUNNING', ?, 0, ?)")
      .run("2000-01-01T00:00:00.000Z", `lease-${Date.now()}`);
    db.close();
    const recovered = recoverStaleJobs(60_000);
    assert.ok(recovered >= 1);
    const check = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });
    const row = check.prepare("select job_status, error from jobs where id = ?").get(Number(inserted.lastInsertRowid)) as { job_status: string; error: string };
    check.close();
    assert.equal(row.job_status, "RETRYABLE");
    assert.equal(row.error, "LEASE_EXPIRED");
  });

  it("prepares postgres foreign keys without applying them", () => {
    const sql = readFileSync(new URL("../../../scripts/postgres/001_scientific.sql", import.meta.url), "utf8");
    assert.match(sql, /references source_records\(id\)/);
    assert.match(sql, /measurement_qualifier_not_zero/);
    assert.match(sql, /NOT APPLIED/);
    const prediction = knowledgeRepository.evaluate({ query: "enterprise-gate" });
    assert.equal(prediction.probability, null);
    assert.ok(Array.isArray(prediction.abstention_reasons));
    assert.equal(prediction.abstention_reasons.includes("CALIBRATION"), true);
    const ready = readinessReport();
    assert.equal(ready.raw_guard, "PASS");
    assert.equal(ready.postgres, "NOT_CONFIGURED");
    assert.equal(ready.redis, "NOT_CONFIGURED");
    assert.equal(ready.prediction, "NOT_COMPUTABLE");
    assert.equal(ready.genomics, "NOT_AVAILABLE");
    assert.equal(ready.probability, null);
    assert.equal(ready.provider_live_call, false);
    const nonce = Date.now();
    const job = enqueueJob("worker_probe", { nonce });
    assert.equal(enqueueJob("worker_probe", { nonce }), job);
    assert.equal(claimSpecific(job, "worker-a", 60_000), true);
    assert.equal(claimSpecific(job, "worker-b", 60_000), false);
    assert.equal(heartbeatJob(job, "worker-b", 1000), false);
    assert.equal(heartbeatJob(job, "worker-a", 1000), true);
    const leaks = leakagePaths([
      { id: "1", entity: "same", family: "fam", lab: "lab", at: "2020", role: "train", target_in_features: true },
      { id: "2", entity: "same", family: "fam", lab: "lab", at: "2021", role: "test", target_in_features: false },
    ]);
    assert.equal(leaks.includes("SAME_ENTITY"), true);
    assert.equal(leaks.includes("SAME_FAMILY"), true);
    assert.equal(leaks.includes("SAME_LAB"), true);
    assert.equal(leaks.includes("TARGET_IN_FEATURES"), true);
    assert.equal(continuousBrierRefused().reason, "CONTINUOUS_TARGET");
    assert.equal(expectedCalibrationError([{ predicted: 0.2, observed: 0 }], 10).status, "NOT_CALIBRATED");
    const db = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });
    const sqliteColumns = new Map(
      ["samples", "aliases", "pedigree_edges", "identity_resolution", "entity_links", "calibration_runs"].map((table) => [
        table,
        new Set((db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((column) => column.name)),
      ]),
    );
    db.close();
    for (const [table, columns] of sqliteColumns) {
      const block = sql.slice(sql.indexOf(`create table if not exists ${table}`), sql.indexOf("create table if not exists", sql.indexOf(`create table if not exists ${table}`) + 10));
      for (const column of columns) assert.equal(block.includes(column), true, `${table}.${column}`);
    }
  });
});
