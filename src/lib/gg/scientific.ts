/**
 * Scientific contracts. These functions are the rules.
 * A strain name is never a branch. A missing value stays missing.
 */

export type ResearchState = "PENDING" | "RUNNING" | "COMPLETED" | "INSUFFICIENT_EVIDENCE" | "FAILED" | "REJECTED" | "BLOCKED" | "INVALID_PROVIDER_RESPONSE";

export type InheritanceArchitecture =
  | "MENDELIAN_LIKE"
  | "POLYGENIC"
  | "THRESHOLD"
  | "CONTINUOUS"
  | "CATEGORICAL"
  | "ENVIRONMENT_SENSITIVE"
  | "UNKNOWN";

export type GenerationLabel = "F1" | "F2" | "F3_PLUS" | "S1" | "S2" | "S3_PLUS" | "BC1" | "BC2" | "BC3_PLUS" | "UNKNOWN";

const MAX_RESEARCH_ATTEMPTS = 5;

export function classifyProviderFailure(message: string): "BLOCKED" | "REJECTED" | "FAILED" | "INVALID_PROVIDER_RESPONSE" {
  if (/malformed|invalid json|schema|non conforme|unexpected token/i.test(message)) return "INVALID_PROVIDER_RESPONSE";
  if (/spending-limit|personal-team-blocked|\b403\b|\b429\b|quota/i.test(message)) return "BLOCKED";
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(message)) return "REJECTED";
  return "FAILED";
}

export function cacheAdmission(status: string): "ADMIT" | "TTL" | "REJECT" {
  if (status === "COMPLETED") return "ADMIT";
  if (status === "INSUFFICIENT_EVIDENCE") return "TTL";
  return "REJECT";
}

export function retryDecision(input: { status: string; attempts: number; lastAt: number; now: number }): {
  retry: boolean;
  retry_after_ms: number | null;
  reason: string;
} {
  if (input.status === "COMPLETED" || input.status === "INSUFFICIENT_EVIDENCE") {
    return { retry: false, retry_after_ms: null, reason: "STORED_RESULT" };
  }
  if (input.attempts >= MAX_RESEARCH_ATTEMPTS) {
    return { retry: false, retry_after_ms: null, reason: "ATTEMPT_CAP" };
  }
  if (input.status !== "FAILED" && input.status !== "BLOCKED" && input.status !== "REJECTED" && input.status !== "INVALID_PROVIDER_RESPONSE") {
    return { retry: false, retry_after_ms: null, reason: "NOT_A_FAILURE" };
  }
  const backoff = Math.min(30 * 60 * 1000 * 2 ** Math.max(0, input.attempts - 1), 6 * 60 * 60 * 1000);
  const elapsed = input.now - input.lastAt;
  if (Number.isFinite(input.lastAt) && elapsed < backoff) {
    return { retry: false, retry_after_ms: backoff - elapsed, reason: "BACKOFF" };
  }
  return { retry: true, retry_after_ms: 0, reason: "RETRY_ALLOWED" };
}

export function aiCanBecomeDocumented(sourceClass: string): false {
  void sourceClass;
  return false;
}

export function claimBecomesMeasurement(): false {
  return false;
}

export function qualifierIsZero(qualifier: string | null): false {
  void qualifier;
  return false;
}

export function parentCountsAsProgeny(role: string): boolean {
  const normalized = role.toUpperCase();
  if (normalized === "PARENT" || normalized === "REPORTED_PARENT" || normalized === "UNVERIFIED_PARENT") return false;
  return normalized === "PROGENY" || normalized === "OFFSPRING";
}

export function trainingEligible(input: {
  provenance: boolean;
  measurement: boolean;
  role: string;
  leaked: boolean;
  approved: boolean;
}): boolean {
  return input.provenance && input.measurement && parentCountsAsProgeny(input.role) && !input.leaked && input.approved;
}

export function numericPredictionAllowed(input: {
  identityAcceptable: boolean;
  traitArchitectureKnown: boolean;
  dataEligible: boolean;
  modelExists: boolean;
  modelValidated: boolean;
  calibrationAcceptable: boolean;
  noLeakage: boolean;
  uncertaintyComputable: boolean;
}): { allowed: boolean; status: "COMPUTABLE" | "NOT_COMPUTABLE"; missing: string[] } {
  const checks: [boolean, string][] = [
    [input.identityAcceptable, "IDENTITY"],
    [input.traitArchitectureKnown, "TRAIT_ARCHITECTURE"],
    [input.dataEligible, "ELIGIBLE_DATA"],
    [input.modelExists, "MODEL"],
    [input.modelValidated, "VALIDATION"],
    [input.calibrationAcceptable, "CALIBRATION"],
    [input.noLeakage, "LEAKAGE"],
    [input.uncertaintyComputable, "UNCERTAINTY"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, name]) => name);
  if (missing.length > 0) return { allowed: false, status: "NOT_COMPUTABLE", missing };
  return { allowed: true, status: "COMPUTABLE", missing: [] };
}

export function traitArchitecture(known: InheritanceArchitecture | null): { architecture: InheritanceArchitecture; heritability: null; heritability_status: "UNKNOWN" } {
  return { architecture: known ?? "UNKNOWN", heritability: null, heritability_status: "UNKNOWN" };
}

export function genealogicalFraction(generation: GenerationLabel): { fraction: number | null; is_genomic_percent: false; stable: false } {
  if (generation === "F1") return { fraction: 0.5, is_genomic_percent: false, stable: false };
  if (generation === "BC1") return { fraction: 0.75, is_genomic_percent: false, stable: false };
  return { fraction: null, is_genomic_percent: false, stable: false };
}

export function chemotypeFromName(): { status: "NOT_AVAILABLE"; reason: "NAME_IS_NOT_A_MEASUREMENT"; thc: null; cbd: null } {
  return { status: "NOT_AVAILABLE", reason: "NAME_IS_NOT_A_MEASUREMENT", thc: null, cbd: null };
}

export function visualToGenotype(): { genotype: null; status: "NOT_AVAILABLE"; reason: "A_PHOTO_IS_NOT_A_GENOTYPE" } {
  return { genotype: null, status: "NOT_AVAILABLE", reason: "A_PHOTO_IS_NOT_A_GENOTYPE" };
}

export function genomicsFromRows(genomicSamples: number): { status: "NOT_AVAILABLE" | "PRESENT_UNVERIFIED"; records: number } {
  if (genomicSamples <= 0) return { status: "NOT_AVAILABLE", records: 0 };
  return { status: "PRESENT_UNVERIFIED", records: genomicSamples };
}

export function logLoss(probabilities: number[], outcomes: number[]): number | null {
  if (probabilities.length === 0 || probabilities.length !== outcomes.length) return null;
  let sum = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    const probability = Math.min(1 - 1e-12, Math.max(1e-12, probabilities[i] ?? Number.NaN));
    const outcome = outcomes[i];
    if (!Number.isFinite(probability) || (outcome !== 0 && outcome !== 1)) return null;
    sum += -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability));
  }
  return sum / probabilities.length;
}

export function expectedCalibrationError(probabilities: number[], outcomes: number[], bins = 10): number | null {
  if (probabilities.length === 0 || probabilities.length !== outcomes.length || bins < 1) return null;
  const counts = new Array<number>(bins).fill(0);
  const confidence = new Array<number>(bins).fill(0);
  const accuracy = new Array<number>(bins).fill(0);
  for (let i = 0; i < probabilities.length; i += 1) {
    const probability = probabilities[i] ?? Number.NaN;
    const outcome = outcomes[i];
    if (probability < 0 || probability > 1 || (outcome !== 0 && outcome !== 1)) return null;
    const index = Math.min(bins - 1, Math.floor(probability * bins));
    counts[index] += 1;
    confidence[index] += probability;
    accuracy[index] += outcome;
  }
  let error = 0;
  for (let i = 0; i < bins; i += 1) {
    if (counts[i] === 0) continue;
    error += (counts[i] / probabilities.length) * Math.abs(accuracy[i]! / counts[i]! - confidence[i]! / counts[i]!);
  }
  return error;
}

export function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateBernoulli(p: number | null, n: number, seed: number): { status: "NOT_COMPUTABLE"; draws: null } | { status: "OK"; seed: number; n: number; mean: number; draws: number[] } {
  if (p == null || !(p >= 0 && p <= 1) || !Number.isInteger(n) || n < 1 || n > 10000) {
    return { status: "NOT_COMPUTABLE", draws: null };
  }
  const random = mulberry(seed);
  const draws: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const draw = random() < p ? 1 : 0;
    draws.push(draw);
    sum += draw;
  }
  return { status: "OK", seed, n, mean: sum / n, draws };
}

export function bayesianUpdate(input: {
  prior: { alpha: number; beta: number; documented: true; source: string } | null;
  successes: number;
  trials: number;
}): { status: "PRIOR_NOT_DOCUMENTED"; posterior: null } | { status: "OK"; alpha: number; beta: number; mean: number } {
  if (!input.prior || input.prior.documented !== true || !input.prior.source) {
    return { status: "PRIOR_NOT_DOCUMENTED", posterior: null };
  }
  if (!(input.prior.alpha > 0) || !(input.prior.beta > 0) || input.successes < 0 || input.trials < input.successes) {
    return { status: "PRIOR_NOT_DOCUMENTED", posterior: null };
  }
  const alpha = input.prior.alpha + input.successes;
  const beta = input.prior.beta + (input.trials - input.successes);
  return { status: "OK", alpha, beta, mean: alpha / (alpha + beta) };
}

export function patternMayValidate(input: { humanReview: boolean; independentSupport: number; contradictions: number }): boolean {
  return input.humanReview === true && input.independentSupport >= 2 && input.contradictions === 0;
}

export function separatedConfidence(): {
  identity_confidence: null;
  pedigree_confidence: null;
  evidence_confidence: null;
  model_confidence: null;
  prediction_uncertainty: null;
  calibration_status: "NOT_CALIBRATED";
} {
  return {
    identity_confidence: null,
    pedigree_confidence: null,
    evidence_confidence: null,
    model_confidence: null,
    prediction_uncertainty: null,
    calibration_status: "NOT_CALIBRATED",
  };
}
