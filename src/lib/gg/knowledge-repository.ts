export type KnowledgeSource = "supabase_postgresql" | "sqlite_verification";

export type KnowledgeAvailability = {
  status: "NOT_CONFIGURED" | "CONNECTED" | "REFUSED" | "UNREACHABLE" | "VERIFICATION";
  source: KnowledgeSource;
  project_ref: string | null;
  connected: boolean;
  counts: Record<string, number | null> | null;
  fallback: "NONE";
  role: "PRODUCTION" | "VERIFICATION_ONLY";
  reason: string;
};

export type EntityCard = {
  id: string;
  canonical_name: string;
  identity_status: string;
  record_role: string;
  match_kind: string;
};

export type EntityLookup = {
  corpus: KnowledgeAvailability;
  results: EntityCard[];
  note: string;
};

export type SnapshotReceipt = {
  written: false;
  snapshot_id: string | null;
  status: "NOT_CONFIGURED" | "EXISTING_NOT_REWRITTEN";
};

export type ResearchReceipt = {
  stored: false;
  status: "NOT_CONFIGURED" | "READ_ONLY";
};

export interface KnowledgeRepository {
  readonly id: KnowledgeSource;
  readonly role: "PRODUCTION" | "VERIFICATION_ONLY";
  availability(): Promise<KnowledgeAvailability>;
  resolveEntity(query: string): Promise<EntityLookup>;
  resolveQuery(query: string): Promise<unknown>;
  getEvidence(query: string): Promise<unknown>;
  getMeasurements(query: string): Promise<unknown>;
  getPedigree(query: string): Promise<unknown>;
  getClaims(query: string): Promise<unknown>;
  getPatterns(query: string): Promise<unknown>;
  getLiterature(query: string): Promise<unknown>;
  getLearnedKnowledge(query: string): Promise<unknown>;
  recordResearch(id: string): Promise<ResearchReceipt>;
  createSnapshot(): Promise<SnapshotReceipt>;
}
