export const INFO_CLASSES = ["NEW", "DUPLICATE", "PARTIAL_OVERLAP", "CORROBORATING", "CONTRADICTORY", "UPDATED_SOURCE", "NEW_MEASUREMENT", "NEW_SAMPLE", "NEW_ENTITY", "INDEPENDENT_REPLICATION", "AMBIGUOUS"] as const;

export function classifyIncoming(input: { sameHash: boolean; sameIds: boolean; sameSubjectDifferentObservation: boolean; conflicts: boolean }) {
  if (input.conflicts) return "CONTRADICTORY";
  if (input.sameHash || input.sameIds) return "DUPLICATE";
  if (input.sameSubjectDifferentObservation) return "INDEPENDENT_REPLICATION";
  return "NEW";
}

export function absentField() {
  return { value: null, status: "NOT_REPORTED" as const };
}

export function resolutionCandidate(input: { breederConflict: boolean; lineageConflict: boolean; chemistryConflict: boolean }) {
  const blocked = input.breederConflict || input.lineageConflict || input.chemistryConflict;
  return { merged: false, status: blocked ? "CONFLICT" : "CANDIDATE", auto_merge: false };
}

export function pedigreeClaim(input: { genomic: boolean; reported: boolean }) {
  return {
    verification_status: input.genomic ? "GENOMIC_EVIDENCE" : input.reported ? "REPORTED_PEDIGREE" : "UNKNOWN",
    genomic_percent: null,
  };
}

export function chemotypeValue(input: { raw: number | null; belowLoq: boolean; missing: boolean }) {
  if (input.missing || input.belowLoq) return { value: null, zero_substituted: false };
  return { value: input.raw, zero_substituted: false };
}

export function personalMedicalRequest(text: string) {
  return /\b(diagnos|prescri|my dose|quanto devo prendere|mi cur|la mia terapia)\b/i.test(text);
}

export function traitArchitecture(evidence: { commercialOnly: boolean; loci: number | null }) {
  if (evidence.commercialOnly || evidence.loci == null) return "UNKNOWN_ARCHITECTURE";
  if (evidence.loci === 1) return "MONOGENIC_SUPPORTED";
  if (evidence.loci <= 3) return "OLIGOGENIC_SUPPORTED";
  return "POLYGENIC";
}

export function bayesianUpdate(input: { prior: number | null; likelihood: number | null; observations: number }) {
  if (input.prior == null || input.likelihood == null || input.observations < 2) {
    return { posterior: null, status: "NOT_COMPUTABLE" as const };
  }
  const posterior = input.prior * input.likelihood;
  return { posterior: Number.isFinite(posterior) ? posterior : null, status: "COMPUTED" as const, false_precision: false };
}

export function monteCarlo(input: { seed: number; replicates: number; assumptionOnly: boolean }) {
  return {
    seed: input.seed,
    replicates: input.replicates,
    status: input.assumptionOnly || input.replicates < 2 ? "MODEL_SIMULATION" : "MODEL_SIMULATION",
    observed_evidence: false,
  };
}

export function calibrate(previous: { model_version: string; prediction: number }, observed: number | null) {
  if (observed == null) return { previous, next: null, mutated_history: false, status: "NOT_COMPUTABLE" as const };
  const error = observed - previous.prediction;
  return {
    previous,
    next: { model_version: `${previous.model_version}+1`, prediction_error: error },
    mutated_history: false,
    status: "RECORDED" as const,
  };
}

export function nameOnlyCross() {
  return { prediction_probability: null, prediction_status: "NOT_COMPUTABLE" as const, reason: "NAMES_ARE_NOT_A_MODEL" };
}

export function patternPromotion(input: { copies: number; independent: number; reviewed: boolean }) {
  return { validation_status: input.reviewed && input.independent >= 2 ? "CANDIDATE" : "NOT_VALIDATED", promoted: false, copies: input.copies };
}

export function sourceRank(kind: string) {
  const order = ["PRIMARY_RESEARCH", "SYSTEMATIC_REVIEW", "META_ANALYSIS", "REVIEW", "REPOSITORY_DATA", "LAB_DATA", "TRUSTED_DATABASE", "BREEDER_DOCUMENTATION", "SECONDARY_COMMERCIAL", "USER_REPORT", "UNVERIFIED_CLAIM"];
  return { kind, rank: order.indexOf(kind), equivalent_to_primary: kind === "PRIMARY_RESEARCH" };
}

export function growthFromCounts(before: Record<string, number>, after: Record<string, number>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const delta: Record<string, number> = {};
  for (const key of keys) delta[key] = (after[key] ?? 0) - (before[key] ?? 0);
  return { delta, invented: false };
}

export function governanceAllowsShare(status: string) {
  return status === "APPROVED";
}

export function researchLoop() {
  return ["SNAPSHOT", "GAP_ANALYSIS", "QUERY_GENERATION", "SOURCE_DISCOVERY", "DOWNLOAD", "PARSE", "RESOLVE", "DEDUPLICATE", "EXTRACT", "QUALITY", "INGEST", "EMBED", "PATTERN", "MODEL_CANDIDATE", "NEW_SNAPSHOT"] as const;
}

export const REQUIRED_REPORT_SECTIONS = ["cross_definition", "parent_identity", "pedigree_confidence", "evidence", "uncertainty", "model_version", "knowledge_snapshot", "provenance"] as const;

export function scientificReport(partial: Partial<Record<(typeof REQUIRED_REPORT_SECTIONS)[number], unknown>>) {
  const report: Record<string, unknown> = {};
  for (const key of REQUIRED_REPORT_SECTIONS) report[key] = partial[key] ?? null;
  report.prediction_probability = null;
  return report;
}
