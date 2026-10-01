import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyze,
  atLeastOne,
  compareOutcome,
  normalizeName,
  patternStatus,
  redactPii,
  resolveStrain,
  semanticRetrieve,
} from "./engine.ts";
import { discoverPatterns, sealPrediction } from "./acquisition.ts";
import { REGRESSION_CROSSES, buildSnapshot } from "./knowledge.ts";

const knowledge = buildSnapshot();

describe("identity", () => {
  it("does not merge Black Domina and Black Domina 98", () => {
    const a = resolveStrain("Black Domina", knowledge);
    const b = resolveStrain("Black Domina '98", knowledge);
    assert.equal(a.strain?.id, "ggs-black-domina");
    assert.equal(b.strain?.id, "ggs-black-domina-98");
    assert.notEqual(a.strain?.id, b.strain?.id);
    assert.equal(a.auto_merged, false);
  });

  it("normalizes gelato aliases without inventing a pedigree", () => {
    assert.equal(normalizeName("Gelato #33"), "gelato 33");
    const hit = resolveStrain("Gelato#33", knowledge);
    assert.equal(hit.strain?.id, "ggs-gelato-33");
    assert.equal(hit.strain?.record_role, "public_name_only");
  });

  it("ranks documented strains ahead of an empty semantic query result set", () => {
    const hits = semanticRetrieve("Black Domina pigment", knowledge, { limit: 8, kind: "STRAIN" });
    assert.ok(hits.length > 0);
    assert.ok(hits.some((hit) => hit.id === "ggs-black-domina" || hit.id === "ggs-black-domina-98"));
    assert.ok(hits.every((hit) => hit.score >= 0.2 && hit.score <= 1));
  });
});

describe("science", () => {
  it("refuses cannabinoid percentages and a black gene on the regression crosses", () => {
    for (const [parentA, parentB] of REGRESSION_CROSSES) {
      const { report } = analyze(
        {
          parent_a: parentA,
          parent_b: parentB,
          cross_type: "F1",
          target_traits: ["chemotype", "pigmentation", "flowering"],
        },
        knowledge,
      );
      assert.equal(report.chemotype.percentages, null);
      assert.equal(report.chemotype.percentage_status, "INSUFFICIENT_EVIDENCE");
      assert.equal(report.pigmentation.single_locus_black, false);
      assert.equal(report.stability.generation_implies_stability, false);
      assert.equal(report.chemotype.classical_b_locus.applied, false);
      const text = JSON.stringify(report);
      assert.equal(text.includes("73.82"), false);
    }
  });

  it("does not treat an author G label as stability", () => {
    const { report } = analyze(
      {
        parent_a: "OG Kush",
        parent_b: "Wedding Cake",
        cross_type: "AUTHOR_G_LABEL",
        author_generation_label: "G6",
      },
      knowledge,
    );
    assert.equal(report.population_parameters.cross_type, "AUTHOR_G_LABEL");
    assert.match(report.human_report, /non implica stabilità/i);
    assert.equal(report.stability.generation_implies_stability, false);
  });

  it("keeps the Sensi contradiction and reported parents", () => {
    const { report } = analyze({ parent_a: "Black Domina", parent_b: "Finola", cross_type: "F1" }, knowledge);
    assert.equal(report.parents[0]?.resolution.strain_id, "ggs-black-domina");
    assert.ok(report.pedigree_confidence.value !== null && report.pedigree_confidence.value < 0.3);
    assert.match(report.pedigree_confidence.formula, /NON è una percentuale genomica/);
    assert.equal(report.lineage.a.links.length, 4);
    assert.equal(report.lineage.a.genomic_percentage, null);
    assert.equal(report.lineage.b.genomic_percentage, null);
    assert.equal(report.knowledge_graph.genomic_percentage, null);
    const terpenes = report.lenses.find((item) => item.discipline === "Terpenes");
    const flavonoids = report.lenses.find((item) => item.discipline === "Flavonoids");
    assert.equal(terpenes?.epistemic, "UNKNOWN");
    assert.equal(flavonoids?.epistemic, "UNKNOWN");
    assert.equal(terpenes?.applies_to_offspring, false);
    assert.equal(report.sections.OBSERVED.length, 0);
    assert.equal(report.sections.MODEL_PREDICTION.length, 0);
    assert.equal(report.pattern_scan.applied_to_this_cross, false);
    assert.equal(report.pattern_scan.auto_validated, false);
    const graph = JSON.stringify(report.knowledge_graph);
    assert.equal(graph.includes("\"kind\":\"TERPENE\""), false);
    assert.equal(graph.includes("\"kind\":\"FLAVONOID\""), false);
    const lensText = JSON.stringify(report.lenses);
    assert.equal(/myrcene|limonene|caryophyllene|pinene|linalool|quercetin|cannflavin/i.test(lensText), false);
    assert.equal(report.chemotype.percentages, null);
    const spec = report.specification;
    assert.equal(spec.spec, "gg-sci-spec-1.0");
    assert.equal(spec.parent_identification[0]?.kind, "CULTIVAR_NAME");
    assert.equal(spec.parent_identification[0]?.upgraded_from_name, false);
    assert.equal(spec.model.prediction_probability, null);
    assert.equal(spec.model.prediction_status, "NOT_COMPUTABLE");
    assert.equal(spec.model.confidence_is_probability, false);
    assert.equal(spec.metabolites.absence_is_not_negative, true);
    assert.equal(spec.metabolites.terpenes.length, 0);
    assert.equal(spec.metabolites.anthocyanins.length, 0);
    assert.equal(spec.chemotype_category, null);
    assert.equal(spec.predicted_traits.exact_class_count_claimed, false);
    assert.equal(spec.pigmentation.purple_equals_black, false);
    assert.equal(spec.evidence.conflicts.winner_chosen, false);
    assert.ok(spec.evidence.conflicts.unresolved.some((item) => item.left_id === "clm-bd-sa" || item.right_id === "clm-bd-sa"));
    assert.ok(spec.evidence.independent_sources < spec.evidence.ranked.length);
    assert.ok(spec.literature_not_transferred.some((item) => item.id === "gen-gagalova-2024" && item.transferred_to_this_cross === false && item.causal_claim === false));
    assert.equal(JSON.stringify(spec).includes("cianidina"), false);
    assert.equal(spec.phenology.flowering.epistemic, "BREEDER_CLAIM");
    assert.equal(spec.phenology.flowering.progeny_duration, null);
    assert.equal(spec.phenology.emergence.epistemic, "UNKNOWN");
    assert.equal(spec.learning.new_observation_changes_pattern, false);
    const terpene = report.acquisition.gaps.find((gap) => gap.subject === "terpene_profile");
    assert.equal(terpene?.claim_status, "UNKNOWN");
    assert.equal(terpene?.prediction_probability, null);
    assert.equal(terpene?.prediction_status, "NOT_COMPUTABLE");
    assert.ok(terpene?.missing.includes("analisi di laboratorio su questi parent"));
    assert.equal(JSON.stringify(terpene).includes("myrcene"), false);
    const conflict = report.specification.evidence.ranked.find((item) => item.id === "clm-bd-sa");
    assert.equal(conflict?.claim_status, "DOCUMENTED");
    assert.equal(conflict?.conflict, "CONTRADICTED");
    assert.equal(report.acquisition.pattern_discovery.candidates.length, 0);
    assert.equal(report.predictions.every((item) => item.prediction_probability === null && item.prediction_status === "NOT_COMPUTABLE"), true);
  });

  it("uses foundation sample counts without naming a compound or fusing declared flowering", () => {
    const slot = {
      source_rows: 10,
      independent_samples: 4,
      numeric_measurements: 6,
      qualified_measurements: 2,
      source_reported_zeros: 1,
      reported_parents: 3,
      genomic_records: 0,
      declared_flowering_records: 4,
      declared_flowering_distinct_texts: 3,
      chemistry: [
        {
          klass: "TERPENE",
          numeric_measurements: 5,
          qualified_measurements: 2,
          source_reported_zeros: 1,
          independent_samples: 2,
        },
      ],
    };
    const { report } = analyze(
      { parent_a: "Black Domina", parent_b: "Finola", cross_type: "F1" },
      knowledge,
      { knowledgeSnapshot: "GGS-KNOWLEDGE-000003", foundation: { a: slot, b: null } },
    );
    assert.equal(report.knowledge_snapshot, "GGS-KNOWLEDGE-000003");
    const terpenes = report.lenses.find((item) => item.discipline === "Terpenes");
    const horticulture = report.lenses.find((item) => item.discipline === "Horticulturist");
    assert.equal(terpenes?.epistemic, "DATABASE_RECORD");
    assert.equal(terpenes?.applies_to_offspring, false);
    assert.equal(/myrcene|limonene|caryophyllene|pinene|linalool|quercetin|cannflavin/i.test(terpenes?.statement ?? ""), false);
    assert.match(horticulture?.statement ?? "", /non vengono fuse/);
    assert.equal(report.chemotype.percentages, null);
    assert.equal(report.predictions.every((item) => item.prediction_probability === null), true);
    assert.equal(report.lineage.a.genomic_percentage, null);
  });

  it("does not turn an author G8 label or a missing name into biology", () => {
    const labeled = analyze(
      { parent_a: "OG Kush", parent_b: "Wedding Cake", cross_type: "AUTHOR_G_LABEL", author_generation_label: "G8" },
      knowledge,
    ).report;
    assert.equal(labeled.specification.generation.stability, "UNKNOWN");
    assert.equal(labeled.specification.generation.author_label_is_filial_standard, false);
    assert.equal(labeled.stability.generation_implies_stability, false);
    const missing = analyze(
      { parent_a: "Nome Inesistente XYZ", parent_b: "Altro Nome Inesistente QQQ", cross_type: "F1" },
      knowledge,
    ).report;
    assert.equal(missing.status, "OUT_OF_DISTRIBUTION");
    assert.equal(missing.specification.parent_identification[0]?.kind, "UNRESOLVED");
    assert.equal(missing.specification.model.prediction_probability, null);
    assert.equal(missing.specification.model.prediction_status, "NOT_COMPUTABLE");
  });

  it("keeps discovery and validation apart and does not invent a probability", () => {
    const rows = [
      { id: "d1", cohort: "discovery" as const, source_id: "s1", lineage: "L1", trait: "pigment", value: "dark" },
      { id: "d2", cohort: "discovery" as const, source_id: "s2", lineage: "L2", trait: "pigment", value: "dark" },
      { id: "d3", cohort: "discovery" as const, source_id: "s1", lineage: "L1", trait: "pigment", value: "dark" },
      { id: "v1", cohort: "validation" as const, source_id: "s3", lineage: "L3", trait: "pigment", value: "dark" },
      { id: "v2", cohort: "validation" as const, source_id: "s4", lineage: "L4", trait: "pigment", value: "dark" },
      { id: "d1", cohort: "validation" as const, source_id: "s1", lineage: "L1", trait: "pigment", value: "dark" },
    ];
    const [candidate] = discoverPatterns(rows);
    assert.ok(candidate);
    assert.equal(candidate?.lifecycle, "REPLICATED");
    assert.equal(candidate?.promoted_to_validated, false);
    assert.equal(candidate?.same_data_validation, false);
    assert.equal(candidate?.leakage_rejected, 1);
    assert.equal(candidate?.validation_ids.includes("d1"), false);
    assert.equal(candidate?.effect_size, null);
    assert.equal(candidate?.confidence_interval, null);
    const sealed = sealPrediction(candidate);
    assert.throws(() => {
      (sealed as { lifecycle: string }).lifecycle = "VALIDATED";
    });
    const jumped = discoverPatterns(rows.slice(0, 3), { manually_validated: true });
    assert.equal(jumped[0]?.lifecycle, "CANDIDATE");
    assert.equal(jumped[0]?.promoted_to_validated, false);
  });
});

describe("probability and privacy", () => {
  it("computes the rare-event bounds without assuming independence", () => {
    const free = atLeastOne(0.01, 100, true);
    assert.equal(free.status, "OK");
    if (free.status === "OK") assert.ok(Math.abs((free.point ?? 0) - (1 - 0.99 ** 100)) < 1e-12);
    const bounded = atLeastOne(0.01, 100, false);
    assert.equal(bounded.status, "OK");
    if (bounded.status === "OK") {
      assert.equal(bounded.point, null);
      assert.equal(bounded.lower, 0);
      assert.equal(bounded.upper, 1);
    }
  });

  it("redacts contact data and does not rewrite a prediction", () => {
    const hidden = redactPii("Scrivimi a breeder@example.com");
    assert.equal(hidden.findings.includes("email"), true);
    assert.equal(hidden.text.includes("breeder@example.com"), false);
    const { report } = analyze({ parent_a: "LSD", parent_b: "Purple Punch", cross_type: "F2" }, knowledge);
    const before = JSON.stringify(report);
    const metrics = compareOutcome(report, { trait: "chemotype", ordinal: null, note: "mail a a@b.co" });
    assert.equal(metrics.prediction_mutated, false);
    assert.equal(JSON.stringify(report), before);
  });

  it("never auto-validates a pattern", () => {
    assert.equal(
      patternStatus({ independent_support_count: 9, source_count: 4, lineage_count: 3, contradiction_count: 0 }),
      "STRONGLY_SUPPORTED",
    );
    assert.notEqual(
      patternStatus({ independent_support_count: 9, source_count: 4, lineage_count: 3, contradiction_count: 0 }),
      "VALIDATED",
    );
  });
});
