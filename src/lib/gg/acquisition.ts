import type { Claim, ClaimClass, KnowledgeSnapshot, Strain } from "./knowledge.ts";

export type ClaimMachineStatus =
  | "OBSERVED"
  | "DOCUMENTED"
  | "INFERRED"
  | "CANDIDATE"
  | "SUPPORTED"
  | "VALIDATED"
  | "PREDICTED"
  | "UNKNOWN"
  | "CONTRADICTED";

export type PatternLifecycle = "DISCOVERED" | "CANDIDATE" | "SUPPORTED" | "REPLICATED" | "HUMAN_REVIEW" | "VALIDATED";

export type StudyObservation = {
  id: string;
  cohort: "discovery" | "validation";
  source_id: string;
  lineage: string;
  trait: string;
  value: string;
  environment?: string | null;
};

export type PatternCandidate = {
  id: string;
  hypothesis: string;
  lifecycle: PatternLifecycle;
  discovery_ids: string[];
  validation_ids: string[];
  sample_size: number;
  independent_sources: number;
  independent_observations: number;
  effect_size: number | null;
  confidence_interval: [number, number] | null;
  replication_count: number;
  potential_confounders: string[];
  leakage_rejected: number;
  same_data_validation: false;
  promoted_to_validated: boolean;
};

const GAP_REQUIREMENTS: { subject: string; dimensions: string[]; fields: string[] }[] = [
  { subject: "terpene_profile", dimensions: ["terpene", "terpenes"], fields: ["terpen"] },
  { subject: "flavonoid_profile", dimensions: ["flavonoid", "flavonoids"], fields: ["flavon"] },
  { subject: "anthocyanin_profile", dimensions: ["anthocyanin", "anthocyanins", "pigment"], fields: ["anthocyan", "pigment"] },
  { subject: "chemotype", dimensions: ["chemotype", "cannabinoid"], fields: ["thc", "cbd", "chemo", "synthase"] },
  { subject: "genotype", dimensions: ["genotype", "zygosity"], fields: ["zygos", "marker", "genom"] },
];

export function claimMachineStatus(claim: Claim): { claim_status: ClaimMachineStatus; conflict: "CONTRADICTED" | null } {
  return {
    claim_status: statusFromClass(claim.claim_class, claim.measurement_kind),
    conflict: claim.contradicts_claim_id ? "CONTRADICTED" : null,
  };
}

function statusFromClass(claimClass: ClaimClass, measurement: Claim["measurement_kind"]): ClaimMachineStatus {
  if (claimClass === "OBSERVED_DATA" && measurement === "measured") return "OBSERVED";
  if (claimClass === "OBSERVED_DATA") return "DOCUMENTED";
  if (claimClass === "SCIENTIFIC_LITERATURE" || claimClass === "DOCUMENTED_FACT" || claimClass === "MARKETING_CLAIM") return "DOCUMENTED";
  if (claimClass === "USER_PROVIDED_OBSERVATION") return measurement === "measured" ? "OBSERVED" : "DOCUMENTED";
  if (claimClass === "STATISTICAL_INFERENCE" || claimClass === "MODEL_ASSUMPTION") return "INFERRED";
  if (claimClass === "HYPOTHESIS") return "CANDIDATE";
  if (claimClass === "REPLICATED_PATTERN") return "SUPPORTED";
  if (claimClass === "VALIDATED_PATTERN") return "VALIDATED";
  if (claimClass === "MODEL_PREDICTION") return "PREDICTED";
  return "UNKNOWN";
}

export function knowledgeGaps(a: Strain | null, b: Strain | null, knowledge: KnowledgeSnapshot) {
  const parents = [a, b].filter((strain): strain is Strain => Boolean(strain));
  const traits = knowledge.traits.filter((trait) => parents.some((strain) => strain.id === trait.strain_id));
  const claims = knowledge.claims.filter((claim) => parents.some((strain) => strain.id === claim.subject_id));
  return GAP_REQUIREMENTS.map((slot) => {
    const measured = traits.filter(
      (trait) => trait.measurement_type === "measured" && slot.dimensions.some((dimension) => trait.dimension.toLowerCase().includes(dimension)),
    );
    const related = claims.filter((claim) => slot.fields.some((field) => claim.field.toLowerCase().includes(field)));
    const literature = knowledge.genetics.filter((gene) =>
      slot.fields.some((field) => `${gene.trait} ${gene.marker_or_gene}`.toLowerCase().includes(field)),
    );
    const available = [
      ...related.map((claim) => `${claim.claim_class} su ${claim.field}`),
      ...traits
        .filter((trait) => slot.dimensions.some((dimension) => trait.dimension.toLowerCase().includes(dimension)))
        .map((trait) => `${trait.measurement_type} ${trait.dimension}:${trait.trait_key}`),
      ...literature.map((gene) => `letteratura non trasferita: ${gene.study}`),
    ];
    const missing = measured.length
      ? []
      : [
          "identità dei parent autenticata, non solo il nome di cultivar",
          "analisi di laboratorio su questi parent",
          "metodo analitico",
          "metadati del campione",
          "conferma da una fonte indipendente",
        ];
    return {
      subject: slot.subject,
      claim_status: measured.length ? ("OBSERVED" as const) : ("UNKNOWN" as const),
      prediction_status: "NOT_COMPUTABLE" as const,
      prediction_probability: null,
      available,
      missing,
    };
  });
}

export function discoverPatterns(
  observations: StudyObservation[],
  options?: { human_review?: boolean; manually_validated?: boolean },
): PatternCandidate[] {
  const discovery = observations.filter((item) => item.cohort === "discovery");
  const validation = observations.filter((item) => item.cohort === "validation");
  const discoveryIds = new Set(discovery.map((item) => item.id));
  const groups = new Map<string, StudyObservation[]>();
  for (const item of discovery) {
    const key = `${item.trait}||${item.value}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const found: PatternCandidate[] = [];
  for (const [key, rows] of groups) {
    const [trait, value] = key.split("||");
    const sources = new Set(rows.map((item) => item.source_id));
    const lineages = new Set(rows.map((item) => item.lineage));
    if (rows.length < 2 || sources.size < 2) continue;
    const heldOut = validation.filter((item) => item.trait === trait && item.value === value && !discoveryIds.has(item.id));
    const leakage_rejected = validation.filter((item) => item.trait === trait && item.value === value && discoveryIds.has(item.id)).length;
    const validationSources = new Set(heldOut.map((item) => item.source_id));
    const validationLineages = new Set(heldOut.map((item) => item.lineage));
    let lifecycle: PatternLifecycle = "CANDIDATE";
    if (validationSources.size >= 2 && validationLineages.size >= 2) lifecycle = "REPLICATED";
    else if (validationSources.size >= 1) lifecycle = "SUPPORTED";
    if (options?.human_review && lifecycle === "REPLICATED") lifecycle = "HUMAN_REVIEW";
    const promoted = Boolean(options?.manually_validated && (lifecycle === "REPLICATED" || lifecycle === "HUMAN_REVIEW"));
    if (promoted) lifecycle = "VALIDATED";
    const confounders = [];
    if (sources.size < rows.length) confounders.push("più osservazioni condividono la stessa fonte");
    if (rows.some((item) => !item.environment)) confounders.push("ambiente non registrato");
    found.push({
      id: `cand-${trait}-${value}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
      hypothesis: `Nel set di discovery, ${trait} = ${value} ricorre su ${lineages.size} linee e ${sources.size} fonti. Non è una causa.`,
      lifecycle,
      discovery_ids: rows.map((item) => item.id),
      validation_ids: heldOut.map((item) => item.id),
      sample_size: rows.length,
      independent_sources: sources.size,
      independent_observations: new Set(rows.map((item) => item.id)).size,
      effect_size: null,
      confidence_interval: null,
      replication_count: validationSources.size,
      potential_confounders: confounders,
      leakage_rejected,
      same_data_validation: false,
      promoted_to_validated: promoted,
    });
  }
  return found;
}

export function assessAcquisition(
  a: Strain | null,
  b: Strain | null,
  knowledge: KnowledgeSnapshot,
  distributionEmitted: boolean,
) {
  const measured = knowledge.traits.filter((trait) => trait.measurement_type === "measured").length;
  return {
    gaps: knowledgeGaps(a, b, knowledge),
    pattern_discovery: {
      observations_measured: measured,
      offspring_observations: 0,
      candidates: [] as PatternCandidate[],
      discovery_validation_separated: true as const,
      note: "Nessuna osservazione di progenie è archiviata. Il miner non crea un candidato dal nulla e non valida un pattern sugli stessi casi usati per scoprirlo.",
    },
    prediction_probability: null,
    prediction_status: distributionEmitted ? ("PREDICTED" as const) : ("NOT_COMPUTABLE" as const),
    historical_predictions_immutable: true as const,
  };
}

export function sealPrediction<T>(report: T): T {
  const copy = structuredClone(report);
  deepFreeze(copy);
  return copy;
}

function deepFreeze(value: unknown) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
}
