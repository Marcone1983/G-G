import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { corpusAudit, crossObservation, invalidateRetrievalCache, parentFacts, qualityReport, readAnalysis, recordAnalysis, retrieve, UNIFIED_SNAPSHOT, walkName } from "./brain.ts";

const backupPath = "data/backups/gg-foundation-pre-unify.sqlite";

describe("unified brain", () => {
  it("keeps Gelato homonyms, samples and reported pedigree apart", () => {
    const facts = parentFacts("Gelato");
    assert.ok(facts);
    assert.equal(facts.source_rows, 601);
    assert.equal(facts.independent_samples, 572);
    assert.equal(facts.laboratories, 12);
    assert.equal(facts.genomic_records, 0);
    assert.equal(facts.reported_parents, 4);
    assert.equal(facts.entities.length, 5);
    assert.equal(new Set(facts.entities.map((entity) => entity.breeder)).size, 5);
    assert.ok(facts.entities.every((entity) => entity.homonym_status === "DISTINCT_ENTITY"));
    assert.equal(facts.declared_flowering_records, 4);
    assert.equal(facts.declared_flowering_distinct_texts, 3);
    assert.equal(facts.qualified_measurements > 0 || facts.numeric_measurements > 0, true);
    const cannabinoid = facts.chemistry.find((row) => row.klass === "CANNABINOID");
    assert.ok(cannabinoid);
    assert.equal(facts.chemistry.some((row) => row.klass === "FLAVONOID"), false);
  });

  it("audits the corpus and does not invent a cross probability", () => {
    const audit = corpusAudit();
    assert.ok(audit);
    assert.equal(audit.measurements, 8750800);
    assert.equal(audit.numeric_values, 6413733);
    assert.equal(audit.canonical_entities, 20337);
    assert.equal(audit.external_rows_added, 0);
    assert.equal(audit.prediction_probability, null);
    const cross = crossObservation("Gelato x Gelato");
    assert.equal(cross.prediction_probability, null);
    assert.equal(cross.prediction_status, "NOT_COMPUTABLE");
    assert.equal(cross.offspring_measurements, 0);
    assert.equal(cross.parents[0]?.source_rows, 601);
  });

  it("does not serve a retrieval cached under an older snapshot", () => {
    invalidateRetrievalCache("test-requires-a-fresh-lookup");
    const first = retrieve("Gelato") as { cache?: string; snapshot_id?: string; prediction_probability?: null; prediction_status?: string; marker?: string };
    assert.equal(first.snapshot_id, UNIFIED_SNAPSHOT);
    assert.equal(first.cache, "MISS");
    assert.equal(first.prediction_probability, null);
    assert.equal(first.prediction_status, "NOT_COMPUTABLE");
    assert.equal(first.marker, undefined);
    const second = retrieve("Gelato") as { cache?: string; snapshot_id?: string };
    assert.equal(second.cache, "EXACT_HIT");
    assert.equal(second.snapshot_id, UNIFIED_SNAPSHOT);
    const walked = walkName("Gelato");
    assert.equal(walked?.prediction_status, "NOT_COMPUTABLE");
    assert.equal(walked?.genomic_edges.length, 0);
  });

  it("keeps an analysis readable from a new connection", () => {
    const key = "phase1-durability-probe";
    recordAnalysis(key, { report: { knowledge_snapshot: UNIFIED_SNAPSHOT, marker: "kept" }, cache_key: key });
    const read = readAnalysis(key);
    assert.equal(read?.cache_key, key);
    assert.equal((read?.report as { marker?: string }).marker, "kept");
    assert.equal((read?.report as { knowledge_snapshot?: string }).knowledge_snapshot, UNIFIED_SNAPSHOT);
  });

  it("reconciles the scientific store and does not turn qualifiers into numbers", () => {
    const report = qualityReport();
    assert.equal(report.ready, true);
    if (!report.ready) return;
    assert.equal(report.snapshot_id, UNIFIED_SNAPSHOT);
    assert.equal(report.postgres, "NOT_CONFIGURED");
    assert.equal(report.source_records, 783429);
    assert.equal(report.samples, 762770);
    assert.equal(report.independent_samples, 720327);
    assert.equal(report.canonical_entities, 20337);
    assert.equal(report.distinct_entities, 1024);
    assert.equal(report.measurements, 8750800);
    assert.equal(report.numeric_measurements, 6413733);
    assert.equal(report.qualified_with_numeric_value, 0);
    assert.equal(report.source_reported_zeros, 1987959);
    assert.equal(report.pedigree_edges, 28592);
    assert.equal(report.aliases, 15974);
    assert.equal(report.claims, 27782);
    assert.equal(report.unresolved, 730705);
    assert.equal(report.conflicts, 13785);
    assert.equal(report.possible, 18280);
    assert.equal(report.genomic_samples, 0);
    assert.equal(report.variants, 0);
    assert.equal(report.calibrated_predictions, 0);
    assert.equal(report.validated_patterns, 0);
    const decisions = report.identity_decisions as { status: string; n: number }[];
    const decisionTotal = decisions.reduce((total, row) => total + Number(row.n), 0);
    assert.equal(decisionTotal, 783429);
  });

  it("reads the pre-unification backup without rewriting it", () => {
    const db = new DatabaseSync(backupPath, { readOnly: true });
    try {
      const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
      assert.equal(count("select count(*) as n from source_records"), 783429);
      assert.equal(count("select count(*) as n from canonical_entities"), 20337);
      assert.equal(count("select count(*) as n from pedigree_edges"), 28592);
      assert.equal(count("select count(*) as n from aliases"), 15974);
      assert.equal(count("select count(*) as n from measurements"), 8750800);
    } finally {
      db.close();
    }
  });
});
