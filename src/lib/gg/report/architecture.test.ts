import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { MachineReport } from "../prediction/orchestrator.ts";
import { buildArchitectureReport, buildEntityArchitecture, classifyImageHttp, narrativeFromReport, peelParent } from "./architecture.ts";

describe("report architecture", () => {
  it("peels generation labels without eating a name that is only a code", () => {
    const peeled = peelParent("Super Silver Haze G8 S2");
    assert.equal(peeled.name, "Super Silver Haze");
    assert.deepEqual(peeled.labels, ["G8", "S2"]);
    assert.equal(peelParent("G13").name, "G13");
  });

  it("does not treat a generation label as stability and does not invent a probability", () => {
    const report = buildArchitectureReport(fixture(), "north x south G8 S2", ["G8", "S2"]);
    assert.equal(report.generational_interpretation.generation_implies_stability, false);
    assert.equal(report.computable_probabilities.length, 0);
    assert.equal(report.noncomputable_probabilities[0]?.value, null);
    assert.equal(report.pedigree_analysis.genomic_percent, null);
    assert.equal(report.pattern_analysis[0]?.genetic_effect, false);
    assert.equal(report.pattern_analysis[0]?.pattern_type, "CHEMOTYPE");
    assert.match(report.pattern_analysis[0]?.support_means ?? "", /non una probabilità/);
    const text = narrativeFromReport(report);
    assert.match(text, /Probabilità null/);
    assert.equal(/\d+\s*%/.test(text), false);
    assert.equal(report.schema_version, "gg-report-architecture-1");
  });

  it("keeps two identities unmerged for an entity question", () => {
    const report = buildEntityArchitecture({
      raw: "cosa mi sai dire sulla blue dream",
      query: "blue dream",
      candidates: [
        { id: "entity:1", canonical_name: "Blue Dream", identity_status: "PROBABLE_IDENTITY" },
        { id: "entity:2", canonical_name: "Blue Dream", identity_status: "PROBABLE_IDENTITY" },
      ],
      patterns: [{ compound: "delta_9_thc", support: 14, n: 5520 }],
      snapshot: "GGS-KNOWLEDGE-000007",
    });
    assert.equal(report.query_interpretation.intent, "ENTITY");
    assert.equal(report.identity_resolution.status, "IDENTITY_AMBIGUOUS");
    assert.equal(report.pattern_analysis[0]?.support_count, 14);
    assert.equal(report.pattern_analysis[0]?.sample_count, 5520);
    assert.equal(report.pattern_analysis[0]?.genetic_effect, false);
    assert.equal(report.visualization.status, "NOT_A_CROSS");
  });

  it("classifies a spending block without calling it a missing image", () => {
    const classified = classifyImageHttp(403, "personal-team-blocked:spending-limit");
    assert.equal(classified.provider_class, "TEAM_SPENDING_BLOCKED");
    assert.equal(classified.billing, "BLOCKED_EXTERNAL_BILLING");
  });

  it("does not hardcode the reference cross", () => {
    const source = readFileSync(new URL("./architecture.ts", import.meta.url), "utf8");
    assert.equal(/lemon skunk|super silver haze/i.test(source), false);
  });
});

function fixture(): MachineReport {
  return {
    prediction_id: "p",
    cache_status: "MISS",
    identity_status: "RESOLVED",
    data_status: "DATA_INSUFFICIENT",
    prediction_probability: null,
    calibration_status: "NOT_CALIBRATED",
    model_id: "gg-additive-midparent",
    model_version: "1",
    simulation_version: "empirical-bootstrap-1",
    embedding_model: "gg-hashing-trick-v1",
    embedding_version: "1",
    knowledge_snapshot: "GGS-KNOWLEDGE-000007",
    source: "supabase_postgresql",
    parents: [
      { query: "north", status: "RESOLVED", candidates: [{ canonical_id: 1, display_name: "North", name_norm: "north", identity_status: "STORED", homonym_status: "UNIQUE", match_kind: "EXACT" }] },
      { query: "south", status: "RESOLVED", candidates: [{ canonical_id: 2, display_name: "South", name_norm: "south", identity_status: "STORED", homonym_status: "UNIQUE", match_kind: "EXACT" }] },
    ],
    features: {},
    traits: [{
      compound: "delta_9_thc",
      parent_a_groups: 0,
      parent_b_groups: 0,
      parent_a_rows: 0,
      parent_b_rows: 0,
      parent_a_median: null,
      parent_b_median: null,
      central_estimate: null,
      dispersion_low: null,
      dispersion_high: null,
      band_kind: null,
      status: "NOT_COMPUTABLE",
      monte_carlo: { status: "NOT_COMPUTABLE", q05: null, q50: null, q95: null, seed: 1, replicates: 0 },
      sensitivity: [],
    }],
    correlation: { n: 0, r: null, status: "INSUFFICIENT", pair: ["delta_9_thc", "cbd"], causation: false },
    patterns_used: [{ pattern_key: "entity:north:delta_9_thc", promoted: false, independent_sources: 3, sample_size: 10, weight: null, applied_to_estimate: false, formula: "x" }],
    historical_crosses: { same_parent_pair_children: 0, considered: 0, used: [], rejected: [], analogy: "NONE", status: "NOT_AVAILABLE", causal: false, point_estimate_adjustment: 0 },
    semantic: { status: "NO_CANDIDATE", hits: [], identity_filter: true },
    pedigree: { rows: 0, classes: [], genomic_percent: null },
    environment: { supplied: null, gxe_status: "NOT_AVAILABLE" },
    population: { status: "NOT_COMPUTABLE", n: null, individual_probability: null },
    bayesian: { status: "NOT_COMPUTABLE", mean: null, lower: null, upper: null },
    linkage: "linkage_unknown",
    segregation: "NOT_APPLIED_ARCHITECTURE_UNKNOWN",
    research_request: null,
    health_evidence: { strain_specific: "NOT_AVAILABLE", note: "" },
    graph: [],
    assumptions: [],
    limitations: [],
    generated_at: "2026-10-02T00:00:00.000Z",
    human_report: "",
    reads: 1,
  } as MachineReport;
}
