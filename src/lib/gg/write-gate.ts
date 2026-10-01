const CORPUS = new Set(["measurements", "samples", "source_records", "canonical_entities", "aliases", "claims", "pedigree_edges"]);

export function scientificWriteAllowed(table: string, actor: "AI" | "USER" | "INGEST"): { allowed: boolean; reason: string } {
  if (!CORPUS.has(table)) return { allowed: true, reason: "NOT_CORPUS" };
  if (actor === "INGEST") return { allowed: true, reason: "AUTHORIZED_INGEST" };
  return { allowed: false, reason: "CORPUS_WRITE_FORBIDDEN" };
}
