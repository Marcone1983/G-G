import type { EntityLookup, KnowledgeAvailability, KnowledgeRepository } from "./knowledge-repository.ts";
import { productionCorpus, productionNameSearch } from "./production-source.server.ts";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";
const UNAVAILABLE =
  "Dato non ancora disponibile. Questo processo non legge SQLite, catalog.json o fixture al posto di Supabase.";

function unavailable(): KnowledgeAvailability {
  return {
    status: "NOT_CONFIGURED",
    source: "supabase_postgresql",
    project_ref: PROJECT_REF,
    connected: false,
    counts: null,
    fallback: "NONE",
    role: "PRODUCTION",
    reason: "DATABASE_URL assente in questo processo. Nessun corpus locale viene aperto.",
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

export const supabaseKnowledgeRepository: KnowledgeRepository = {
  id: "supabase_postgresql",
  role: "PRODUCTION",
  availability: productionAvailability,
  async resolveEntity(query: string): Promise<EntityLookup> {
    const corpus = await productionAvailability();
    if (!corpus.connected) return { corpus, results: [], note: UNAVAILABLE };
    const found = await productionNameSearch(query);
    return { corpus, results: found.results, note: found.note };
  },
  async resolveQuery() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, source: "supabase_postgresql" as const };
  },
  async getEvidence() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, evidence: [] };
  },
  async getMeasurements() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, measurements: [] };
  },
  async getPedigree() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, edges: [], genomic: "NOT_AVAILABLE" as const };
  },
  async getClaims() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, claims: [] };
  },
  async getPatterns() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, validated: 0, patterns: [] };
  },
  async getLiterature() {
    return { status: "NOT_CONFIGURED" as const, fallback: "NONE" as const, literature: [] };
  },
  async getLearnedKnowledge() {
    return { status: "NOT_CONFIGURED" as const, role: "AI_RESEARCH_IS_NOT_A_MEASUREMENT" as const, cards: [] };
  },
  async recordResearch(): Promise<{ stored: false; status: "NOT_CONFIGURED" }> {
    return { stored: false, status: "NOT_CONFIGURED" };
  },
  async createSnapshot() {
    return { written: false as const, snapshot_id: null, status: "NOT_CONFIGURED" as const };
  },
};
