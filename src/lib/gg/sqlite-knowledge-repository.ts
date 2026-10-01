import type { EntityLookup, KnowledgeRepository } from "./knowledge-repository.ts";
import { knowledgeRepository } from "./repository.ts";

const SOURCE = "sqlite_verification" as const;

async function verificationAvailability() {
  const snapshot = knowledgeRepository.getSnapshot();
  return {
    status: "VERIFICATION" as const,
    source: SOURCE,
    project_ref: null,
    connected: false,
    counts: null,
    fallback: "NONE" as const,
    role: "VERIFICATION_ONLY" as const,
    reason: "Adattatore di test, import e benchmark. Non è il fallback della Preview.",
    snapshot,
  };
}

export const sqliteKnowledgeRepository: KnowledgeRepository = {
  id: SOURCE,
  role: "VERIFICATION_ONLY",
  availability: verificationAvailability,
  async resolveEntity(query: string): Promise<EntityLookup> {
    const corpus = await verificationAvailability();
    return {
      corpus,
      results: knowledgeRepository.resolveEntity(query).map((hit) => ({
        id: hit.id,
        canonical_name: hit.canonical_name,
        identity_status: hit.identity_status,
        record_role: hit.record_role,
        match_kind: hit.match_kind,
      })),
      note: "VERIFICATION_ONLY",
    };
  },
  async resolveQuery(query: string) {
    return knowledgeRepository.resolveQuery(query);
  },
  async getEvidence(query: string) {
    return knowledgeRepository.getEvidence(query);
  },
  async getMeasurements(query: string) {
    return knowledgeRepository.getMeasurements(query);
  },
  async getPedigree(query: string) {
    return knowledgeRepository.getPedigree(query);
  },
  async getClaims(query: string) {
    return knowledgeRepository.getClaims(query);
  },
  async getPatterns(query: string) {
    return knowledgeRepository.getPatterns(query);
  },
  async getLiterature(query: string) {
    return knowledgeRepository.getLiterature(query);
  },
  async getLearnedKnowledge(query: string) {
    return knowledgeRepository.getLearnedKnowledge(query);
  },
  async getHealthEvidence() {
    return {
      status: "VERIFICATION_ONLY" as const,
      fallback: "NONE" as const,
      records: [],
      statements: { insufficient: "Il motore di verifica non è evidenza sanitaria e non è il fallback della Preview." },
      stored: false as const,
    };
  },
  async recordResearch() {
    return { stored: false as const, status: "READ_ONLY" as const };
  },
  async createSnapshot() {
    const current = knowledgeRepository.getSnapshot();
    const snapshotId =
      current && typeof current === "object" && "current" in current && current.current && typeof current.current === "object" && current.current && "snapshot_id" in current.current
        ? String((current.current as { snapshot_id?: unknown }).snapshot_id ?? "")
        : null;
    return { written: false as const, snapshot_id: snapshotId || null, status: "EXISTING_NOT_REWRITTEN" as const };
  },
};
