/**
 * One retrieval path for every entity. No strain-name branch.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { loadEntity, parentFacts, retrieve, searchEntities, storeReady, UNIFIED_SNAPSHOT, walkName } from "./brain.ts";
import { embed } from "./engine.ts";
import { evaluatePrediction, listTargets, registryModels } from "./predict.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export const DISCIPLINES = [
  "Breeder",
  "Geneticist",
  "Botanist",
  "Horticulturist",
  "Herbalist",
  "Phytochemist",
  "Chemotype Analyst",
  "Evidence Analyst",
  "Pattern Scientist",
  "Terpene Analyst",
  "Flavonoid Analyst",
  "Anthocyanin Analyst",
  "Morphology Analyst",
  "Phenology Analyst",
  "Pedigree Analyst",
  "Prediction Analyst",
  "Uncertainty Analyst",
  "Environment Analyst",
] as const;

export type EmbeddingProvider = {
  id: string;
  scientific_status: "BASELINE_HASH_NOT_SEMANTIC_UNDERSTANDING" | "LOCAL_SEMANTIC" | "FUTURE";
  dimension: number;
  embed: (text: string) => number[];
};

export const hashEmbeddingProvider: EmbeddingProvider = {
  id: "gg-hashing-trick-v1",
  scientific_status: "BASELINE_HASH_NOT_SEMANTIC_UNDERSTANDING",
  dimension: 64,
  embed,
};

export function unifiedScientificRetrieve(query: string) {
  const found = retrieve(query);
  const facts = parentFacts(query);
  const gate = evaluatePrediction({ target_id: "cultivar_thc", query, features: [] });
  return {
    retrieval_id: `${UNIFIED_SNAPSHOT}:${found && "normalized_query" in found ? String(found.normalized_query) : query}`,
    snapshot_id: UNIFIED_SNAPSHOT,
    query,
    normalized_query: facts?.name_norm ?? null,
    entities: searchEntities(query),
    aliases: facts?.entities ?? [],
    identity_decisions: facts?.identity ?? [],
    evidence_status: facts && facts.numeric_measurements > 0 ? "MEASURED_ROWS_PRESENT" : "NOT_OBSERVED",
    samples: {
      source_rows: facts?.source_rows ?? 0,
      independent_samples: facts?.independent_samples ?? 0,
      note: "A source row is not an independent genotype.",
    },
    chemistry: chemistryStatement(facts?.chemistry ?? []),
    phenotype: { declared_types: facts?.declared_types ?? 0, data_status: (facts?.declared_types ?? 0) > 0 ? "DOCUMENTED" : "NOT_AVAILABLE" },
    phenology: {
      declared_records: facts?.declared_flowering_records ?? 0,
      distinct_texts: facts?.declared_flowering_distinct_texts ?? 0,
      data_status: (facts?.declared_flowering_records ?? 0) > 0 ? "DOCUMENTED" : "NOT_AVAILABLE",
      fused_interval: null,
    },
    pedigree: { reported_parents: facts?.reported_parents ?? 0, genomic_inference: null, score_kind: "NOT_A_PROBABILITY" },
    genomics: { data_status: "NOT_AVAILABLE" as const, records: 0, cultivar_link: "CULTIVAR_LINK_NOT_ESTABLISHED" },
    literature: "literature" in found ? found.literature : [],
    patterns: "patterns" in found ? found.patterns : [],
    uncertainty: gate.uncertainty,
    provenance: { snapshot_id: UNIFIED_SNAPSHOT, source_of_truth: "sqlite" },
    embedding: hashEmbeddingProvider.scientific_status,
    prediction: gate,
    brain: found,
    graph: walkName(query),
  };
}

function chemistryStatement(rows: { klass: string; numeric_measurements: number; qualified_measurements: number; independent_samples: number }[]) {
  const by = Object.fromEntries(rows.map((row) => [row.klass, row]));
  const state = (klass: string) => {
    const row = by[klass];
    if (!row || (row.numeric_measurements === 0 && row.qualified_measurements === 0)) {
      return { data_status: "NOT_AVAILABLE" as const, numeric_measurements: null, qualified_measurements: null, independent_samples: null };
    }
    return {
      data_status: "OBSERVED" as const,
      numeric_measurements: row.numeric_measurements,
      qualified_measurements: row.qualified_measurements,
      independent_samples: row.independent_samples,
      universal_profile: null,
    };
  };
  return {
    cannabinoid: state("CANNABINOID"),
    terpene: state("TERPENE"),
    flavonoid: state("FLAVONOID"),
    anthocyanin: state("ANTHOCYANIN"),
    rule: "Absence is NOT_AVAILABLE, not zero. Samples are not averaged into one cultivar value.",
  };
}

export function disciplineReport(discipline: (typeof DISCIPLINES)[number], query: string) {
  const retrieval = unifiedScientificRetrieve(query);
  const missing = retrieval.chemistry.flavonoid.data_status === "NOT_AVAILABLE" && discipline === "Flavonoid Analyst";
  return {
    discipline,
    query,
    snapshot_id: UNIFIED_SNAPSHOT,
    facts: retrieval.samples,
    inferences: [],
    unknowns: missing || retrieval.genomics.data_status === "NOT_AVAILABLE" ? ["NOT_AVAILABLE"] : [],
    contradictions: retrieval.identity_decisions.filter((row) => row.status === "CONFLICTING_IDENTITY"),
    evidence: retrieval.evidence_status,
    confidence: null,
    confidence_is_probability: false,
    limitations: ["This discipline reads the same snapshot as every other discipline. It does not own a private dataset."],
    retrieval_id: retrieval.retrieval_id,
  };
}

export function getEntityGraph(entityId: string, limit = 24) {
  const numeric = Number(entityId.startsWith("entity:") ? entityId.slice("entity:".length) : entityId);
  if (!storeReady() || !Number.isInteger(numeric)) return { entity_id: entityId, edges: [], genomics: [] };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const edges = db
      .prepare(
        `select 'OUT' as direction, rel, dst_type, dst_id, evidence_level from graph_edges
         where src_type = 'entity' and src_id = ?
         union all
         select 'IN', rel, src_type, src_id, evidence_level from graph_edges
         where dst_type = 'entity' and dst_id = ?
         limit ?`,
      )
      .all(String(numeric), String(numeric), limit) as Record<string, unknown>[];
    return {
      entity_id: `entity:${numeric}`,
      snapshot_id: UNIFIED_SNAPSHOT,
      edges,
      genomic_edges: [] as unknown[],
      genomics_status: "NOT_AVAILABLE" as const,
      entity: loadEntity(`entity:${numeric}`),
    };
  } finally {
    db.close();
  }
}

export function snapshotManifest() {
  if (!storeReady()) return { ready: false };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare("select * from snapshot_manifests where snapshot_id = ?").get(UNIFIED_SNAPSHOT) as Record<string, unknown> | undefined;
    const current = db.prepare("select snapshot_id, note from knowledge_snapshots where snapshot_id = ?").get(UNIFIED_SNAPSHOT);
    return { ready: true, current, manifest: row ?? null, targets: listTargets(), models: registryModels() };
  } finally {
    db.close();
  }
}

export function readJobs() {
  if (!storeReady()) return [];
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("select id, job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, worker_version, error from jobs order by id desc limit 20").all();
  } finally {
    db.close();
  }
}
