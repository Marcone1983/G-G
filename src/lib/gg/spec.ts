import type { Claim, KnowledgeSnapshot, Source, Strain, Trait } from "./knowledge.ts";
import { claimMachineStatus } from "./acquisition.ts";

export const SPEC_ID = "gg-sci-spec-1.0";

export const EVIDENCE_HIERARCHY = [
  "MEASURED_GENETIC",
  "LAB_CHEMISTRY",
  "PEER_REVIEWED",
  "TRACEABLE_DATASET",
  "BREEDER_DOCUMENT",
  "PROVENANCE_DATABASE",
  "COMMERCIAL_CATALOG",
  "COMMUNITY_REPORT",
  "UNATTRIBUTED",
] as const;

export type EvidenceRank = (typeof EVIDENCE_HIERARCHY)[number];

export type BiologicalKind = "CULTIVAR_NAME" | "CLONE" | "STABILIZED_LINE" | "OBSERVED_PHENOTYPE" | "UNRESOLVED";

const MORPHOLOGY = [
  "architecture",
  "internodes",
  "leaves",
  "inflorescences",
  "bracteoles",
  "trichomes",
  "pigmentation",
  "density",
  "structure",
] as const;

const PHENOLOGY = ["emergence", "vegetative", "transition", "flowering", "ripening", "senescence"] as const;

export type MetaboliteRecord = {
  class: "CANNABINOID" | "TERPENE" | "FLAVONOID" | "ANTHOCYANIN" | "OTHER";
  compound: string;
  concentration: number | null;
  unit: string | null;
  sample: string | null;
  laboratory: string | null;
  date: string | null;
  epistemic: "OBSERVED";
};

export function biologicalIdentity(strain: Strain | null): {
  kind: BiologicalKind;
  upgraded_from_name: false;
  reason: string;
} {
  if (!strain) {
    return {
      kind: "UNRESOLVED",
      upgraded_from_name: false,
      reason: "Il nome non è risolto. Non diventa un clone, una linea o un fenotipo.",
    };
  }
  return {
    kind: "CULTIVAR_NAME",
    upgraded_from_name: false,
    reason: "Un nome di registro o di catalogo è un nome di cultivar. Non è un clone, non è una linea stabilizzata e non è un singolo fenotipo osservato.",
  };
}

export function measuredMetabolites(traits: Trait[]): MetaboliteRecord[] {
  const out: MetaboliteRecord[] = [];
  for (const trait of traits) {
    if (trait.measurement_type !== "measured") continue;
    const klass = metaboliteClass(trait.dimension);
    if (!klass) continue;
    const value = trait.value;
    const compound = typeof value.compound === "string" ? value.compound.trim() : "";
    if (!compound) continue;
    const concentration = typeof value.concentration === "number" && Number.isFinite(value.concentration) ? value.concentration : null;
    out.push({
      class: klass,
      compound,
      concentration,
      unit: typeof value.unit === "string" ? value.unit : null,
      sample: typeof value.sample === "string" ? value.sample : null,
      laboratory: typeof value.laboratory === "string" ? value.laboratory : null,
      date: typeof value.date === "string" ? value.date : null,
      epistemic: "OBSERVED",
    });
  }
  return out;
}

export function preserveConflicts(claims: Claim[]): {
  winner_chosen: false;
  unresolved: { left_id: string; right_id: string; winner: null; kept_both: true }[];
} {
  const seen = new Set<string>();
  const unresolved: { left_id: string; right_id: string; winner: null; kept_both: true }[] = [];
  for (const claim of claims) {
    if (!claim.contradicts_claim_id) continue;
    const key = [claim.id, claim.contradicts_claim_id].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unresolved.push({ left_id: claim.id, right_id: claim.contradicts_claim_id, winner: null, kept_both: true });
  }
  return { winner_chosen: false, unresolved };
}

export function independentSources(claims: Claim[]): { count: number; source_ids: string[] } {
  const source_ids = [...new Set(claims.map((claim) => claim.source_id).filter((id) => id.length > 0))];
  return { count: source_ids.length, source_ids };
}

export function evidenceRank(claim: Claim, source: Source | undefined): EvidenceRank {
  const field = claim.field.toLowerCase();
  if (claim.claim_class === "OBSERVED_DATA" && claim.measurement_kind === "measured") {
    return field.includes("genom") || field.includes("marker") || field.includes("synthase") ? "MEASURED_GENETIC" : "LAB_CHEMISTRY";
  }
  if (claim.claim_class === "SCIENTIFIC_LITERATURE") return "PEER_REVIEWED";
  if (source?.source_type === "open_catalog") return "TRACEABLE_DATASET";
  if (claim.claim_class === "DOCUMENTED_FACT" && source?.source_type === "breeder_publication") return "BREEDER_DOCUMENT";
  if (claim.claim_class === "DOCUMENTED_FACT") return "PROVENANCE_DATABASE";
  if (claim.claim_class === "MARKETING_CLAIM") return "COMMERCIAL_CATALOG";
  if (claim.claim_class === "USER_PROVIDED_OBSERVATION") return "COMMUNITY_REPORT";
  return "UNATTRIBUTED";
}

export function generationAssessment(crossType: string, authorLabel: string | null) {
  return {
    cross_type: crossType,
    author_label: authorLabel,
    states_are_distinct: true as const,
    author_label_is_filial_standard: false as const,
    generation_implies_stability: false as const,
    residual_heterozygosity: null,
    observed_segregation: null,
    phenotypic_uniformity: null,
    target_traits_fixed: null,
    individuals_observed: null,
    generations_with_data: null,
    selection_method: null,
    molecular_data: null,
    stability: "UNKNOWN" as const,
  };
}

export function applySpecification(input: {
  status: string;
  crossType: string;
  authorLabel: string | null;
  a: Strain | null;
  b: Strain | null;
  knowledge: KnowledgeSnapshot;
  distributionEmitted: boolean;
  pedigreeValue: number | null;
}) {
  const parents = [input.a, input.b].filter((strain): strain is Strain => Boolean(strain));
  const claims = input.knowledge.claims.filter((claim) => parents.some((strain) => strain.id === claim.subject_id));
  const traits = input.knowledge.traits.filter((trait) => parents.some((strain) => strain.id === trait.strain_id));
  const metabolites = measuredMetabolites(traits);
  const grouped = {
    cannabinoids: metabolites.filter((item) => item.class === "CANNABINOID"),
    terpenes: metabolites.filter((item) => item.class === "TERPENE"),
    flavonoids: metabolites.filter((item) => item.class === "FLAVONOID"),
    anthocyanins: metabolites.filter((item) => item.class === "ANTHOCYANIN"),
    other: metabolites.filter((item) => item.class === "OTHER"),
  };
  const data_gaps = [
    !grouped.cannabinoids.length ? "cannabinoidi misurati assenti" : null,
    !grouped.terpenes.length ? "terpeni misurati assenti" : null,
    !grouped.flavonoids.length ? "flavonoidi misurati assenti" : null,
    !grouped.anthocyanins.length ? "antociani misurati assenti" : null,
    !traits.some((trait) => trait.dimension === "morphology") ? "morfologia non descritta da un record" : null,
    parents.length < 2 ? "almeno un parent non identificato" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    spec: SPEC_ID,
    parent_identification: [input.a, input.b].map((strain) => ({
      strain_id: strain?.id ?? null,
      ...biologicalIdentity(strain),
    })),
    pedigree: {
      is_graph: true as const,
      genomic_percentage: null,
      confidence: input.pedigreeValue,
      confidence_is_genomic_percentage: false as const,
    },
    known_traits: traits.map((trait) => ({
      id: trait.id,
      dimension: trait.dimension,
      trait_key: trait.trait_key,
      measurement_type: trait.measurement_type,
    })),
    metabolites: {
      ...grouped,
      absence_means: "UNKNOWN" as const,
      absence_is_not_negative: true as const,
      absence_is_not_positive: true as const,
    },
    morphology: Object.fromEntries(MORPHOLOGY.map((facet) => [facet, facetState(traits, facet)])),
    phenology: Object.fromEntries(PHENOLOGY.map((stage) => [stage, stageState(traits, stage)])),
    environment: {
      modulates_phenotype: true as const,
      experimental_design: null,
      transferred_from_other_population: false as const,
    },
    herbalism: {
      traditional_claims: 0,
      converted_to_clinical_effect: false as const,
    },
    evidence: {
      hierarchy: EVIDENCE_HIERARCHY,
      ranked: claims.map((claim) => ({
        id: claim.id,
        claim_class: claim.claim_class,
        ...claimMachineStatus(claim),
        rank: evidenceRank(claim, input.knowledge.sources.find((source) => source.id === claim.source_id)),
      })),
      conflicts: preserveConflicts(claims),
      independent_sources: independentSources(claims).count,
      copied_rows_are_not_independent: true as const,
    },
    model: {
      prediction_emitted: input.distributionEmitted,
      prediction_probability: null as null,
      prediction_status: input.distributionEmitted ? ("PREDICTED" as const) : ("NOT_COMPUTABLE" as const),
      evidence_confidence: claims.some((claim) => claim.claim_class === "SCIENTIFIC_LITERATURE" || claim.claim_class === "DOCUMENTED_FACT")
        ? ("LOW" as const)
        : ("UNKNOWN" as const),
      confidence_is_probability: false as const,
    },
    predicted_traits: {
      expected_phenotypic_classes: null,
      observed_segregating_classes: null,
      exact_class_count_claimed: false as const,
    },
    generation: generationAssessment(input.crossType, input.authorLabel),
    literature_not_transferred: input.knowledge.genetics.map((item) => ({
      id: item.id,
      study: item.study,
      causal_claim: item.causal_claim,
      transferred_to_this_cross: false as const,
    })),
    patterns: {
      correlation_is_not_causation: true as const,
      auto_validated: false as const,
    },
    ood_status: input.status,
    data_gaps,
    learning: {
      new_observation_is_training: false as const,
      new_observation_changes_pattern: false as const,
    },
    chemotype_category: null,
    pigmentation: {
      purple_equals_black: false as const,
      single_locus_black: false as const,
    },
  };
}

function metaboliteClass(dimension: string): MetaboliteRecord["class"] | null {
  const key = dimension.toLowerCase();
  if (key.includes("cannabin") || key.includes("chemo")) return "CANNABINOID";
  if (key.includes("terpen")) return "TERPENE";
  if (key.includes("flavon")) return "FLAVONOID";
  if (key.includes("anthocyan")) return "ANTHOCYANIN";
  return null;
}

function facetState(traits: Trait[], facet: string) {
  const hit = traits.find((trait) => trait.dimension === "morphology" && trait.trait_key.includes(facet));
  if (!hit) return { value: null, epistemic: "UNKNOWN" as const };
  return {
    value: hit.value,
    epistemic: hit.measurement_type === "measured" ? ("OBSERVED" as const) : ("BREEDER_CLAIM" as const),
  };
}

function stageState(traits: Trait[], stage: string) {
  const hit = traits.find((trait) => trait.dimension === "phenology" && trait.trait_key.includes(stage));
  if (!hit) return { value: null, epistemic: "UNKNOWN" as const, progeny_duration: null };
  return {
    value: hit.value,
    epistemic: hit.measurement_type === "measured" ? ("OBSERVED" as const) : ("BREEDER_CLAIM" as const),
    progeny_duration: null,
  };
}
