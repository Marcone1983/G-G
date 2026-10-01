import type { EntityLookup, KnowledgeAvailability, KnowledgeRepository } from "./knowledge-repository.ts";
import { productionCorpus } from "./production-source.server.ts";
import {
  readProductionClaims,
  readProductionMeasurements,
  readProductionMemory,
  readProductionHealth,
  readProductionPatterns,
  readProductionPedigree,
  readProductionSnapshot,
  searchProductionNames,
} from "./production-query.server.ts";
import { healthStatements, searchHealthPlan } from "./health-evidence.ts";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";
const UNAVAILABLE =
  "Dato non ancora disponibile. Questo processo non legge SQLite, catalog.json o fixture al posto di Supabase.";

function unavailable(reason = "DATABASE_URL assente in questo processo. Nessun corpus locale viene aperto."): KnowledgeAvailability {
  return {
    status: "NOT_CONFIGURED",
    source: "supabase_postgresql",
    project_ref: PROJECT_REF,
    connected: false,
    counts: null,
    fallback: "NONE",
    role: "PRODUCTION",
    reason,
  };
}

async function productionAvailability(): Promise<KnowledgeAvailability> {
  if (!process.env.DATABASE_URL?.trim()) return unavailable();
  const corpus = await productionCorpus();
  return {
    status: corpus.status,
    source: "supabase_postgresql",
    project_ref: corpus.project_ref,
    connected: corpus.connected,
    counts: corpus.counts,
    fallback: "NONE",
    role: "PRODUCTION",
    reason: corpus.reason,
  };
}

function blocked<T>(corpus: KnowledgeAvailability, empty: T) {
  return { status: corpus.status, fallback: "NONE" as const, source: "supabase_postgresql" as const, ...empty };
}

export const supabaseKnowledgeRepository: KnowledgeRepository = {
  id: "supabase_postgresql",
  role: "PRODUCTION",
  availability: productionAvailability,
  async resolveEntity(query: string): Promise<EntityLookup> {
    const corpus = await productionAvailability();
    if (!corpus.connected) return { corpus, results: [], note: UNAVAILABLE };
    const found = await searchProductionNames(query);
    if (!found.value) return { corpus, results: [], note: found.error ?? UNAVAILABLE };
    const canonical = found.value.canonical.map((row) => ({
      id: `entity:${row.id}`,
      canonical_name: String(row.display_name),
      identity_status: String(row.identity_status ?? "STORED"),
      record_role: "CANONICAL_ENTITY",
      match_kind: "SUPABASE",
    }));
    const records = found.value.records.map((row) => ({
      id: `record:${row.id}`,
      canonical_name: String(row.original_name ?? row.name_norm),
      identity_status: "SOURCE_RECORD_NOT_CANONICAL",
      record_role: "SOURCE_RECORD",
      match_kind: "SUPABASE_SOURCE_RECORD",
    }));
    const canonicalCount = corpus.counts?.canonical_entities ?? 0;
    const note =
      canonicalCount === 0
        ? "Identità canoniche non ancora importate. I risultati sono righe source_records, non schede fuse."
        : "Letto da Supabase PostgreSQL. Una riga source non è un'identità canonica.";
    return { corpus, results: [...canonical, ...records].slice(0, 20), note };
  },
  async resolveQuery(query: string) {
    const found = await this.resolveEntity(query);
    return {
      status: found.corpus.status,
      fallback: "NONE" as const,
      source: "supabase_postgresql" as const,
      results: found.results,
      note: found.note,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
    };
  },
  async getEvidence(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) return blocked(corpus, { evidence: [] });
    const names = await searchProductionNames(query);
    const claims = await readProductionClaims(query);
    return {
      status: "CONNECTED" as const,
      fallback: "NONE" as const,
      source: "supabase_postgresql" as const,
      records: names.value?.records ?? [],
      claims: claims.value ?? [],
      error: names.error ?? claims.error,
    };
  },
  async getMeasurements(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) return blocked(corpus, { measurements: [] });
    const found = await readProductionMeasurements(query);
    return {
      status: "CONNECTED" as const,
      fallback: "NONE" as const,
      measurements: found.value ?? [],
      error: found.error,
      rule: "ND e <LOQ restano qualificatori. Non sono zero.",
    };
  },
  async getPedigree(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) return blocked(corpus, { edges: [], genomic: "NOT_AVAILABLE" });
    const found = await readProductionPedigree(query);
    const edges = (found.value ?? []).map((row) => ({
      parent_text: row.parent_text,
      relationship_type: row.relationship_type,
      reported_or_inferred: row.reported_or_inferred,
      identity_status: row.identity_status,
      genomic: "NOT_A_GENOMIC_PARENT" as const,
    }));
    return {
      status: edges.length ? ("CONNECTED" as const) : ("NOT_AVAILABLE" as const),
      fallback: "NONE" as const,
      edges,
      genomic: "NOT_AVAILABLE" as const,
      note: edges.length ? "Parent riportato, non evidenza genomica." : "Nessun pedigree production per questa query.",
    };
  },
  async getClaims(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) return blocked(corpus, { claims: [] });
    const found = await readProductionClaims(query);
    return { status: "CONNECTED" as const, fallback: "NONE" as const, claims: found.value ?? [], error: found.error };
  },
  async getPatterns() {
    const corpus = await productionAvailability();
    if (!corpus.connected) return blocked(corpus, { validated: 0, patterns: [] });
    const found = await readProductionPatterns();
    const patterns = (found.value ?? []).map((row) => ({
      pattern_key: row.pattern_key,
      hypothesis: row.hypothesis,
      lifecycle: row.lifecycle,
      validation_status: Number(row.promoted_to_validated) === 1 ? "STORED_FLAG" : "NOT_VALIDATED",
    }));
    return { status: "CONNECTED" as const, fallback: "NONE" as const, validated: 0, patterns };
  },
  async getLiterature() {
    const corpus = await productionAvailability();
    return blocked(corpus.connected ? { ...corpus, status: "CONNECTED" } : corpus, { literature: [], data_status: "NOT_AVAILABLE" });
  },
  async getLearnedKnowledge(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) return { status: corpus.status, role: "AI_RESEARCH_IS_NOT_A_MEASUREMENT" as const, cards: [] };
    const found = await readProductionMemory(query);
    return {
      status: "CONNECTED" as const,
      role: "AI_RESEARCH_IS_NOT_A_MEASUREMENT" as const,
      cards: found.value ?? [],
    };
  },
  async getHealthEvidence(query: string) {
    const corpus = await productionAvailability();
    if (!corpus.connected) {
      return {
        status: corpus.status,
        fallback: "NONE" as const,
        source: "supabase_postgresql" as const,
        records: [],
        statements: healthStatements([]),
        search: searchHealthPlan(0),
        stored: false as const,
      };
    }
    const found = await readProductionHealth(query);
    const records = found.value ?? [];
    const direct = records.filter((row) => row.attribution === "DIRECT_STRAIN_EVIDENCE").length;
    return {
      status: "CONNECTED" as const,
      fallback: "NONE" as const,
      source: "supabase_postgresql" as const,
      records,
      statements: records.length ? { hidden: false, absence_is_evidence_of_absence: false, collapsed_health_benefit: false, strain_specific: direct ? "Esiste evidenza specifica nei record letti." : null, compound_or_chemotype_only: !direct ? "I record letti non sono evidenza diretta di strain, salvo il loro campo attribution." : null, insufficient: null, shown: records.length } : healthStatements([]),
      search: searchHealthPlan(direct),
      stored: false as const,
      error: found.error,
    };
  },
  async recordResearch() {
    const corpus = await productionAvailability();
    return { stored: false as const, status: corpus.connected ? ("READ_ONLY" as const) : ("NOT_CONFIGURED" as const) };
  },
  async createSnapshot() {
    const current = await readProductionSnapshot();
    return {
      written: false as const,
      snapshot_id: current.value?.snapshot_id ? String(current.value.snapshot_id) : null,
      status: current.corpus.connected ? ("EXISTING_NOT_REWRITTEN" as const) : ("NOT_CONFIGURED" as const),
    };
  },
};
