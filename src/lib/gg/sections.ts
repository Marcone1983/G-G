export const SECTION_POLICIES = [
  "SCIENTIFIC_CORPUS",
  "UNVERIFIED_AI_RESEARCH",
  "PRIVATE_USER",
  "OBSERVATION",
  "PATTERN_CANDIDATE",
  "MODEL_METADATA",
] as const;

export type SectionPolicy = (typeof SECTION_POLICIES)[number];

const SECTIONS: Record<string, { table: string; policy: SectionPolicy; filter: string | null }> = {
  "corpus.records": { table: "source_records", policy: "SCIENTIFIC_CORPUS", filter: null },
  "corpus.samples": { table: "samples", policy: "SCIENTIFIC_CORPUS", filter: null },
  "identity.entities": { table: "canonical_entities", policy: "SCIENTIFIC_CORPUS", filter: null },
  "identity.aliases": { table: "aliases", policy: "SCIENTIFIC_CORPUS", filter: null },
  "chemistry.cannabinoid": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "CANNABINOID" },
  "chemistry.terpene": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "TERPENE" },
  "chemistry.other": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "OTHER" },
  "safety.pesticide": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "PESTICIDE" },
  "safety.microbe": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "MICROBE" },
  "safety.residual_solvent": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "RESIDUAL_SOLVENT" },
  "safety.heavy_metal": { table: "measurements", policy: "SCIENTIFIC_CORPUS", filter: "HEAVY_METAL" },
  "pedigree.edges": { table: "pedigree_edges", policy: "SCIENTIFIC_CORPUS", filter: null },
  "claims.labels": { table: "claims", policy: "SCIENTIFIC_CORPUS", filter: null },
  "research.global": { table: "global_research_memory", policy: "UNVERIFIED_AI_RESEARCH", filter: null },
  "research.private": { table: "private_user_memory", policy: "PRIVATE_USER", filter: null },
  "patterns.candidates": { table: "pattern_candidates", policy: "PATTERN_CANDIDATE", filter: null },
  "prediction.models": { table: "model_versions", policy: "MODEL_METADATA", filter: null },
  "prediction.calibration": { table: "calibration_runs", policy: "MODEL_METADATA", filter: null },
  "operations.observations": { table: "observation_units", policy: "OBSERVATION", filter: null },
};

export function destinationFor(sectionKey: string) {
  const section = SECTIONS[sectionKey];
  if (!section) return { ok: false as const, reason: "UNKNOWN_SECTION" as const };
  if (section.policy === "SCIENTIFIC_CORPUS") {
    return { ok: false as const, reason: "CORPUS_NOT_WRITABLE" as const, section };
  }
  return { ok: true as const, section };
}

export function sectionForResearch(ownerId: string | null) {
  return ownerId ? "research.private" : "research.global";
}
