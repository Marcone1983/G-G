import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { UNIFIED_SNAPSHOT } from "./brain.ts";
import { acceptAsEvidence, assertNoLeakage, assignSplit, baselineMedian, evaluatePrediction, featureRole, regressionMetrics } from "./predict.ts";
import { disciplineReport, getEntityGraph, unifiedScientificRetrieve } from "./unified.ts";

const db = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });

function names(sql: string): string[] {
  return (db.prepare(sql).all() as { name: string }[]).map((row) => row.name);
}

describe("phase 3 universal brain", () => {
  it("resolves, retrieves and gates entities chosen from the database", () => {
    const sample = names(
      `select name_norm as name from canonical_entities
       where name_norm is not null and length(name_norm) > 3
       order by id limit 12`,
    );
    assert.ok(sample.length >= 8);
    for (const name of sample) {
      const retrieval = unifiedScientificRetrieve(name);
      assert.equal(retrieval.snapshot_id, UNIFIED_SNAPSHOT);
      assert.equal(retrieval.genomics.data_status, "NOT_AVAILABLE");
      assert.equal(retrieval.prediction.probability, null);
      assert.equal(retrieval.prediction.predicted_value, null);
      assert.notEqual(retrieval.prediction.status, "COMPUTABLE");
      assert.equal(retrieval.chemistry.flavonoid.data_status, "NOT_AVAILABLE");
      assert.equal(retrieval.chemistry.anthocyanin.data_status, "NOT_AVAILABLE");
      const report = disciplineReport("Flavonoid Analyst", name);
      assert.equal(report.confidence, null);
      assert.equal(report.unknowns.includes("NOT_AVAILABLE"), true);
    }
  });

  it("walks a graph without a strain-specific function", () => {
    const row = db.prepare("select id from canonical_entities order by id limit 1").get() as { id: number };
    const graph = getEntityGraph(`entity:${row.id}`);
    assert.equal(graph.genomics_status, "NOT_AVAILABLE");
    assert.ok(Array.isArray(graph.edges));
  });

  it("blocks self-reinforcement and target leakage", () => {
    assert.equal(acceptAsEvidence({ origin: "PREDICTION" }).accepted, false);
    assert.equal(acceptAsEvidence({ origin: "CACHE_ANSWER" }).accepted, false);
    assert.equal(acceptAsEvidence({ origin: "MEASURED" }).accepted, true);
    assert.equal(featureRole("thca", "thca"), "TARGET");
    assert.equal(assertNoLeakage("thca", ["thca", "limonene"]).ok, false);
    assert.equal(assertNoLeakage("thca", ["beta_myrcene"]).ok, true);
    const gate = evaluatePrediction({ target_id: "sample_thca", query: "x", features: ["thca"] });
    assert.equal(gate.probability, null);
    assert.equal(gate.reason_code, "FEATURE_LEAKAGE");
    const absent = evaluatePrediction({ target_id: "flavonoid_concentration", features: [] });
    assert.equal(absent.status, "TARGET_NOT_AVAILABLE");
    assert.equal(absent.prediction, null);
  });

  it("splits by group hash and scores a median baseline without a fake interval", () => {
    const a = assignSplit("group-a", "GROUP_SPLIT");
    const again = assignSplit("group-a", "GROUP_SPLIT");
    assert.equal(a, again);
    assert.equal(baselineMedian([1, 9, 3]), 3);
    const metrics = regressionMetrics([1, 2, 3], [1, 2, 3]);
    assert.equal(metrics?.mae, 0);
    assert.equal(metrics?.mape, null);
    assert.equal(metrics?.interval_coverage, null);
  });

  it("keeps the catalog gap and refuses production models", () => {
    const gap = db.prepare("select gap_count, reason_code from catalog_gaps").get() as { gap_count: number; reason_code: string };
    assert.equal(Number(gap.gap_count), 551);
    assert.equal(gap.reason_code, "DECLARED_NOT_IN_FILE");
    const production = db.prepare("select count(*) as n from model_versions where production_eligible = 1").get() as { n: number };
    assert.equal(Number(production.n), 0);
    const snapshot = db.prepare("select snapshot_id from snapshot_manifests where snapshot_id = ?").get(UNIFIED_SNAPSHOT) as { snapshot_id: string };
    assert.equal(snapshot.snapshot_id, UNIFIED_SNAPSHOT);
    const previous = db.prepare("select note from knowledge_snapshots where snapshot_id = 'GGS-KNOWLEDGE-000004'").get() as { note: string };
    assert.match(previous.note, /EXACT_IDENTITY=0/);
  });

  it("keeps every qualifier off the numeric column", () => {
    const rows = db
      .prepare("select qualifier, count(*) as n, sum(value is not null) as numeric_values from measurements where qualifier is not null group by 1")
      .all() as { qualifier: string; n: number; numeric_values: number | null }[];
    const names = new Set(rows.map((row) => row.qualifier));
    for (const qualifier of ["ND", "NT", "<LOQ", "<LOD", "LOD"]) assert.equal(names.has(qualifier), true);
    assert.equal(rows.every((row) => Number(row.numeric_values ?? 0) === 0), true);
  });

  it("maps duplicate-key records off the scientific identity axis without erasing legacy status", () => {
    const legacy = db.prepare("select count(*) as n from identity_decisions where status = 'CANONICAL_MATCH'").get() as { n: number };
    const scientific = db.prepare("select count(*) as n from identity_decisions where scientific_status = 'CANONICAL_MATCH'").get() as { n: number };
    const exact = db.prepare("select count(*) as n from identity_decisions where scientific_status = 'EXACT_IDENTITY'").get() as { n: number };
    const folded = db
      .prepare("select count(*) as n from identity_decisions where status = 'CANONICAL_MATCH' and scientific_status = 'PROBABLE_MATCH'")
      .get() as { n: number };
    assert.equal(Number(legacy.n), 322);
    assert.equal(Number(scientific.n), 0);
    assert.equal(Number(exact.n), 0);
    assert.equal(Number(folded.n), 322);
  });
});
