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

export function findKnowledgeGaps(counts: Partial<Record<GapCategory, number | null>>) {
  return GAP_CATEGORIES.map((category) => {
    const count = Object.prototype.hasOwnProperty.call(counts, category) ? counts[category] ?? null : null;
    const status = count == null ? "NOT_MEASURED" : count === 0 ? "GAP" : "PRESENT";
    return { category, count, status, search: status === "GAP" ? "GUIDED" : "NOT_STARTED" };
  });
}
