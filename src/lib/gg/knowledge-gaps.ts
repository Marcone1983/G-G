export const GAP_CATEGORIES = [
  "STRAINS",
  "ALIASES",
  "BREEDERS",
  "SEED_BANKS",
  "PEDIGREES",
  "PARENTS",
  "GRANDPARENTS",
  "ANCESTRY",
  "GENERATIONS",
  "CLONES",
  "CROSSES",
  "BACKCROSSES",
  "SELFING",
  "SELECTION_HISTORY",
  "PHENOTYPES",
  "MORPHOLOGY",
  "FLOWERING",
  "GROWTH",
  "YIELD",
  "RESISTANCE",
  "STRESS_RESPONSE",
  "PEST_RESPONSE",
  "MOLD_RESPONSE",
  "ENVIRONMENT",
  "CHEMOTYPE",
  "CANNABINOIDS",
  "TERPENES",
  "FLAVONOIDS",
  "ANTHOCYANINS",
  "VOLATILES",
  "METABOLITES",
  "GENES",
  "MARKERS",
  "QTL",
  "PATHWAYS",
  "GENE_EXPRESSION",
  "GENOTYPE_PHENOTYPE",
  "GENOTYPE_ENVIRONMENT",
  "PROGENY",
  "BREEDING_OUTCOMES",
  "PREDICTION_OUTCOMES",
  "SCIENTIFIC_PAPERS",
  "REVIEWS",
  "META_ANALYSES",
  "CLINICAL_EVIDENCE",
  "PHARMACOLOGY",
  "TOXICOLOGY",
  "ADVERSE_EFFECTS",
  "HEALTH_OUTCOMES",
] as const;

export type GapCategory = (typeof GAP_CATEGORIES)[number];

export type GapInput = number | null | { count: number | null; status: "QUERIED" | "TABLE_ABSENT" | "NOT_MEASURED"; source?: string };

export function findKnowledgeGaps(counts: Partial<Record<GapCategory, GapInput>>) {
  return GAP_CATEGORIES.map((category) => {
    if (!Object.prototype.hasOwnProperty.call(counts, category)) {
      return { category, count: null, status: "NOT_MEASURED" as const, source: null, search: "NOT_STARTED" as const };
    }
    const raw = counts[category];
    if (raw && typeof raw === "object") {
      if (raw.status !== "QUERIED") {
        return {
          category,
          count: null,
          status: raw.status === "TABLE_ABSENT" ? ("ABSENT" as const) : ("NOT_MEASURED" as const),
          source: raw.source ?? raw.status,
          search: raw.status === "TABLE_ABSENT" ? ("GUIDED" as const) : ("NOT_STARTED" as const),
        };
      }
      const count = raw.count;
      const status = count == null ? "NOT_MEASURED" : count === 0 ? "GAP" : "PRESENT";
      return { category, count, status, source: raw.source ?? "QUERIED", search: status === "GAP" ? ("GUIDED" as const) : ("NOT_STARTED" as const) };
    }
    const count = raw ?? null;
    const status = count == null ? "NOT_MEASURED" : count === 0 ? "GAP" : "PRESENT";
    return { category, count, status, source: "CALLER", search: status === "GAP" ? ("GUIDED" as const) : ("NOT_STARTED" as const) };
  });
}
