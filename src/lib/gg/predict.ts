/**
 * Predictive infrastructure. A missing probability is a result, not a bug.
 * Nothing in this module treats a strain name as a special case.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { parentFacts, UNIFIED_SNAPSHOT } from "./brain.ts";
import { numericPredictionAllowed, separatedConfidence } from "./scientific.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export type GateStatus =
  | "COMPUTABLE"
  | "NOT_COMPUTABLE"
  | "INSUFFICIENT_DATA"
  | "MODEL_UNCALIBRATED"
  | "OUT_OF_DISTRIBUTION"
  | "CONFLICTING_EVIDENCE"
  | "MISSING_PROVENANCE"
  | "TARGET_NOT_AVAILABLE";

export type UncertaintyKind =
  | "ALEATORIC"
  | "EPISTEMIC"
  | "DATA_QUALITY"
  | "IDENTITY"
  | "SOURCE"
  | "MODEL";

export type SplitStrategy =
  | "RANDOM_SPLIT"
  | "GROUP_SPLIT"
  | "FAMILY_HOLDOUT"
  | "SOURCE_HOLDOUT"
  | "TEMPORAL_HOLDOUT"
  | "ENTITY_HOLDOUT"
  | "LEAVE_ONE_GROUP_OUT";

const FORBIDDEN_AS_EVIDENCE = new Set([
  "PREDICTION",
  "MODEL_OUTPUT",
  "CACHE_ANSWER",
  "GENERATED_ANSWER",
  "SEMANTIC_SIMILARITY",
  "NAME_SIMILARITY",
  "CHEMICAL_SIMILARITY",
]);

export function acceptAsEvidence(input: { origin?: string | null; claim_class?: string | null }) {
  const origin = String(input.origin ?? input.claim_class ?? "").toUpperCase();
  if (FORBIDDEN_AS_EVIDENCE.has(origin)) {
    return {
      accepted: false as const,
      reason_code: "SELF_REINFORCEMENT_BLOCK",
      human_reason: "Una predizione, una risposta o una similarità non diventano evidenza.",
      blocked: origin,
    };
  }
  return { accepted: true as const, reason_code: "EXTERNAL_OR_OBSERVED_RECORD" };
}

export function featureRole(targetCompound: string, featureName: string): "PREDICTOR" | "TARGET" | "DERIVED_TARGET" | "LEAKAGE_FORBIDDEN" | "CONTEXT_ONLY" {
  const target = targetCompound.toLowerCase();
  const feature = featureName.toLowerCase();
  if (feature === target) return "TARGET";
  if (feature === `total_${target}` || feature.startsWith(`${target}_`) || target.startsWith(feature)) return "LEAKAGE_FORBIDDEN";
  if (["sample_id", "source_id", "lab", "independence_group", "name_norm"].includes(feature)) return "CONTEXT_ONLY";
  return "PREDICTOR";
}

export function assertNoLeakage(targetCompound: string, features: string[]) {
  const blocked = features.filter((feature) => {
    const role = featureRole(targetCompound, feature);
    return role === "TARGET" || role === "LEAKAGE_FORBIDDEN" || role === "DERIVED_TARGET";
  });
  return { ok: blocked.length === 0, blocked };
}

/** Group key, not row id. The same group always lands in the same split. */
export function assignSplit(groupKey: string, strategy: SplitStrategy): "train" | "validation" | "test" | "holdout" {
  if (strategy === "RANDOM_SPLIT") {
    return bucket(groupKey, "random-diagnostic");
  }
  if (strategy === "SOURCE_HOLDOUT" || strategy === "FAMILY_HOLDOUT" || strategy === "ENTITY_HOLDOUT" || strategy === "TEMPORAL_HOLDOUT") {
    return bucket(groupKey, strategy);
  }
  return bucket(groupKey, "group");
}

function bucket(groupKey: string, salt: string): "train" | "validation" | "test" {
  const byte = createHash("sha256").update(`${salt}|${groupKey}`).digest()[0] ?? 0;
  const fold = byte % 10;
  if (fold <= 6) return "train";
  if (fold <= 8) return "validation";
  return "test";
}

export function baselineMedian(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function brierScore(probabilities: number[], outcomes: number[]): number | null {
  if (probabilities.length === 0 || probabilities.length !== outcomes.length) return null;
  let sum = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    const probability = probabilities[i] ?? Number.NaN;
    const outcome = outcomes[i] ?? Number.NaN;
    if (probability < 0 || probability > 1 || (outcome !== 0 && outcome !== 1)) return null;
    sum += (probability - outcome) ** 2;
  }
  return sum / probabilities.length;
}

export type CapabilityState = "AVAILABLE" | "PARTIAL" | "MISSING" | "CONFLICTED" | "UNVERIFIED";

export function capabilityMatrix(input: {
  identityHits: number;
  identityConflict: boolean;
  pedigreeRows: number;
  measurements: number;
  genomicSamples: number;
  productionModels: number;
  calibrated: boolean;
}): Record<string, CapabilityState | null> & { prediction_probability: null; numeric_prediction: "NOT_COMPUTABLE" } {
  return {
    IDENTITY: input.identityConflict ? "CONFLICTED" : input.identityHits > 0 ? "PARTIAL" : "MISSING",
    PEDIGREE: input.pedigreeRows > 0 ? "UNVERIFIED" : "MISSING",
    TRAIT: "MISSING",
    CHEMISTRY: input.measurements > 0 ? "PARTIAL" : "MISSING",
    ENVIRONMENT: "MISSING",
    GENOMICS: input.genomicSamples > 0 ? "AVAILABLE" : "MISSING",
    MODEL: input.productionModels > 0 ? "AVAILABLE" : "MISSING",
    CALIBRATION: input.calibrated ? "AVAILABLE" : "MISSING",
    OBSERVATION: "MISSING",
    prediction_probability: null,
    numeric_prediction: "NOT_COMPUTABLE",
  };
}

export function regressionMetrics(actual: number[], predicted: number[]) {
  if (actual.length === 0 || actual.length !== predicted.length) return null;
  let abs = 0;
  let sq = 0;
  let mean = 0;
  for (const value of actual) mean += value;
  mean /= actual.length;
  let varSum = 0;
  const absErrors: number[] = [];
  for (let i = 0; i < actual.length; i += 1) {
    const err = (predicted[i] ?? 0) - (actual[i] ?? 0);
    abs += Math.abs(err);
    sq += err * err;
    varSum += ((actual[i] ?? 0) - mean) ** 2;
    absErrors.push(Math.abs(err));
  }
  absErrors.sort((a, b) => a - b);
  const mae = abs / actual.length;
  const rmse = Math.sqrt(sq / actual.length);
  const r2 = varSum === 0 ? null : 1 - sq / varSum;
  const mid = Math.floor(absErrors.length / 2);
  const medianAe = absErrors.length % 2 ? absErrors[mid] : ((absErrors[mid - 1] ?? 0) + (absErrors[mid] ?? 0)) / 2;
  return {
    n: actual.length,
    mae,
    rmse,
    r2,
    median_absolute_error: medianAe,
    mape: null,
    mape_reason: "MAPE is omitted. Zero and near-zero observations make it undefined or misleading.",
    interval_coverage: null,
    calibration_error: null,
  };
}

export type OodStatus = "IN_DISTRIBUTION" | "BORDERLINE" | "OUT_OF_DISTRIBUTION" | "UNKNOWN";

export function oodStatus(input: { independent_samples: number; numeric_measurements: number; identity_conflict: boolean }): {
  status: OodStatus;
  method: string;
  probability: null;
} {
  if (input.identity_conflict) {
    return { status: "UNKNOWN", method: "identity_conflict_blocks_distribution_claim", probability: null };
  }
  if (input.numeric_measurements === 0 || input.independent_samples === 0) {
    return { status: "OUT_OF_DISTRIBUTION", method: "no_observed_support_in_snapshot", probability: null };
  }
  if (input.independent_samples < 30) {
    return { status: "BORDERLINE", method: "support_below_reference_group_count", probability: null };
  }
  return { status: "IN_DISTRIBUTION", method: "support_count_only_not_density", probability: null };
}

function open() {
  return new DatabaseSync(dbPath, { readOnly: true });
}

export type TargetRow = {
  target_id: string;
  name: string;
  target_type: string;
  unit: string | null;
  status: string;
  minimum_independent_samples: number;
  minimum_independent_sources: number;
  forbidden_features: string;
};

export function listTargets(): TargetRow[] {
  if (!existsSync(dbPath)) return [];
  const db = open();
  try {
    const exists = db.prepare("select 1 as ok from sqlite_master where name = 'prediction_targets'").get() as { ok: number } | undefined;
    if (!exists) return [];
    return db
      .prepare(
        `select target_id, name, target_type, unit, status, minimum_independent_samples, minimum_independent_sources, forbidden_features
         from prediction_targets order by target_id`,
      )
      .all() as TargetRow[];
  } finally {
    db.close();
  }
}

export function targetStatusCounts() {
  const targets = listTargets();
  const count = (status: string) => targets.filter((target) => target.status === status).length;
  return {
    target_count: targets.length,
    targets_available: count("AVAILABLE"),
    targets_insufficient_data: count("INSUFFICIENT_DATA"),
    targets_not_available: count("NOT_AVAILABLE"),
    targets_uncalibrated: count("MODEL_UNCALIBRATED"),
    targets_production_ready: count("PRODUCTION_READY"),
  };
}

export function registryModels() {
  if (!existsSync(dbPath)) return [];
  const db = open();
  try {
    const exists = db.prepare("select 1 as ok from sqlite_master where name = 'model_versions'").get() as { ok: number } | undefined;
    if (!exists) return [];
    return db
      .prepare(
        `select model_id, version, algorithm, target_id, status, split_strategy, metrics_json, calibration_status, ood_method, production_eligible, limitations
         from model_versions order by model_id, version`,
      )
      .all() as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

export function evaluatePrediction(request: { target_id?: string; query?: string; entity_id?: string | null; features?: string[] }) {
  const targets = listTargets();
  const target = targets.find((row) => row.target_id === request.target_id) ?? null;
  const facts = request.query ? parentFacts(request.query) : null;
  const models = registryModels().filter((model) => model.target_id === request.target_id);
  const production = models.find((model) => model.status === "PRODUCTION" && Number(model.production_eligible) === 1);
  const leakage = assertNoLeakage(target?.forbidden_features?.split("|")[0] || request.target_id || "", request.features ?? []);
  const forbidden = (target?.forbidden_features ?? "").split("|").filter(Boolean);
  const usedForbidden = (request.features ?? []).filter((feature) => forbidden.includes(feature.toLowerCase()));
  const identityConflict = Boolean(facts?.identity.some((row) => row.status === "CONFLICTING_IDENTITY" && row.n > 0));
  const ood = oodStatus({
    independent_samples: facts?.independent_samples ?? 0,
    numeric_measurements: facts?.numeric_measurements ?? 0,
    identity_conflict: identityConflict,
  });
  const uncertainty: { kind: UncertaintyKind; limits_prediction: boolean; note: string }[] = [
    { kind: "IDENTITY", limits_prediction: true, note: "A name is not a genotype. EXACT_IDENTITY is not assigned." },
    { kind: "EPISTEMIC", limits_prediction: true, note: "No calibrated production model is registered for this target." },
    { kind: "SOURCE", limits_prediction: true, note: "Laboratory rows that share a source lineage are not independent replications." },
    { kind: "ALEATORIC", limits_prediction: Boolean((facts?.independent_samples ?? 0) > 1), note: "Observed sample spread is variability, not a prediction interval." },
    { kind: "DATA_QUALITY", limits_prediction: true, note: "Qualifiers are not numbers. Missing units stay missing." },
    { kind: "MODEL", limits_prediction: true, note: "Baseline fits, when present, are diagnostic. They are not production predictions." },
  ];

  let status: GateStatus = "NOT_COMPUTABLE";
  let reason_code = "MODEL_UNCALIBRATED";
  if (!target) {
    status = "TARGET_NOT_AVAILABLE";
    reason_code = "UNKNOWN_TARGET";
  } else if (target.status === "NOT_AVAILABLE") {
    status = "TARGET_NOT_AVAILABLE";
    reason_code = "NO_OBSERVATIONS";
  } else if (target.status === "INSUFFICIENT_DATA") {
    status = "INSUFFICIENT_DATA";
    reason_code = "INSUFFICIENT_INDEPENDENT_DATA";
  } else if (!leakage.ok || usedForbidden.length) {
    status = "NOT_COMPUTABLE";
    reason_code = "FEATURE_LEAKAGE";
  } else if (identityConflict && request.entity_id == null) {
    status = "CONFLICTING_EVIDENCE";
    reason_code = "CONFLICTING_IDENTITY";
  } else if (ood.status === "OUT_OF_DISTRIBUTION" && target.status !== "MODEL_UNCALIBRATED") {
    status = "OUT_OF_DISTRIBUTION";
    reason_code = "NO_SUPPORT";
  } else if (!production) {
    status = "MODEL_UNCALIBRATED";
    reason_code = "NO_PRODUCTION_MODEL";
  } else {
    status = "NOT_COMPUTABLE";
    reason_code = "CALIBRATION_REQUIRED";
  }

  const computable = false;
  const gate = numericPredictionAllowed({
    identityAcceptable: false,
    traitArchitectureKnown: false,
    dataEligible: false,
    modelExists: Boolean(production),
    modelValidated: false,
    calibrationAcceptable: false,
    noLeakage: leakage.ok && usedForbidden.length === 0,
    uncertaintyComputable: false,
  });
  return {
    status: computable ? ("COMPUTABLE" as const) : status,
    reason_code,
    human_reason: humanReason(reason_code),
    machine_reason: reason_code,
    prediction: null,
    predicted_value: null,
    unit: target?.unit ?? null,
    lower_bound: null,
    upper_bound: null,
    probability: null,
    abstention_reasons: gate.missing,
    prediction_gate: gate,
    confidence: separatedConfidence(),
    calibration_status: production ? "MISSING" : "NOT_CALIBRATED",
    ood_status: ood.status,
    ood_method: ood.method,
    ood_probability: null,
    model_version: production ? String(production.version) : null,
    diagnostic_models: models.map((model) => ({
      model_id: model.model_id,
      version: model.version,
      status: model.status,
      production_eligible: model.production_eligible,
      calibration_status: model.calibration_status,
    })),
    feature_snapshot: UNIFIED_SNAPSHOT,
    knowledge_snapshot: UNIFIED_SNAPSHOT,
    target,
    entity_query: request.query ?? null,
    evidence_note: "Gate evidence is the snapshot's observed rows for the query. It is not a predicted label.",
    uncertainty,
    required_conditions: [
      "exact or reviewed identity when the question is about a cultivar rather than a labeled sample",
      "independent samples above the target minimum",
      "independent sources above the target minimum",
      "features that do not contain the target",
      "group-aware split recorded on the training run",
      "a model that beats the baseline on the locked test groups",
      "a calibration method with held-out coverage",
      "an out-of-distribution decision that is not a fake probability",
    ],
    explanation: {
      association_language: "associated with",
      causal_claim: false,
      feature_contributions: [],
      nearest_training_examples: [],
      limitations: ["No production model is allowed to emit a value for this request."],
    },
    self_reinforcement: acceptAsEvidence({ origin: "PREDICTION" }),
    capability: capabilityMatrix({
      identityHits: facts?.identity?.length ?? 0,
      identityConflict,
      pedigreeRows: 0,
      measurements: facts?.numeric_measurements ?? 0,
      genomicSamples: 0,
      productionModels: production ? 1 : 0,
      calibrated: false,
    }),
  };
}

function humanReason(code: string) {
  const reasons: Record<string, string> = {
    UNKNOWN_TARGET: "Questo target non è nel registro.",
    NO_OBSERVATIONS: "Non ci sono osservazioni. Lo stato è NOT_AVAILABLE, non zero.",
    INSUFFICIENT_INDEPENDENT_DATA: "I conteggi grezzi non sono esempi indipendenti sufficienti per una predizione di cultivar.",
    FEATURE_LEAKAGE: "Una feature richiesta contiene il target o un suo derivato.",
    CONFLICTING_IDENTITY: "Il nome collide con più entità. Nessuna viene scelta come verità.",
    NO_SUPPORT: "La richiesta non ha supporto osservato in questo snapshot.",
    NO_PRODUCTION_MODEL: "Esiste al più un modello diagnostico. Non è calibrato e non è in produzione.",
    CALIBRATION_REQUIRED: "Senza calibrazione la probabilità e l'intervallo restano nulli.",
  };
  return reasons[code] ?? "La predizione non è calcolabile.";
}

export function predictionRequestSummary() {
  if (!existsSync(dbPath)) {
    return emptyPredictionSummary();
  }
  const db = open();
  try {
    const exists = db.prepare("select 1 as ok from sqlite_master where name = 'prediction_requests'").get() as { ok: number } | undefined;
    if (!exists) return emptyPredictionSummary();
    const rows = db.prepare("select status, count(*) as n from prediction_requests group by 1").all() as { status: string; n: number }[];
    const pick = (status: string) => Number(rows.find((row) => row.status === status)?.n ?? 0);
    const total = rows.reduce((sum, row) => sum + Number(row.n), 0);
    return {
      prediction_requests_total: total,
      computable: pick("COMPUTABLE"),
      not_computable: pick("NOT_COMPUTABLE") + pick("MODEL_UNCALIBRATED") + pick("TARGET_NOT_AVAILABLE"),
      insufficient_data: pick("INSUFFICIENT_DATA"),
      conflicting_evidence: pick("CONFLICTING_EVIDENCE"),
      out_of_distribution: pick("OUT_OF_DISTRIBUTION"),
      model_uncalibrated: pick("MODEL_UNCALIBRATED"),
      by_status: rows,
    };
  } finally {
    db.close();
  }
}

function emptyPredictionSummary() {
  return {
    prediction_requests_total: 0,
    computable: 0,
    not_computable: 0,
    insufficient_data: 0,
    conflicting_evidence: 0,
    out_of_distribution: 0,
    model_uncalibrated: 0,
    by_status: [] as { status: string; n: number }[],
  };
}

export function listSources() {
  if (!existsSync(dbPath)) return { sources: [], postgres: "NOT_CONFIGURED" as const };
  const db = open();
  try {
    const sources = db
      .prepare(
        `select source_id, name, license, redistribution_status, records_ingested, reason
         from source_registry order by source_id`,
      )
      .all();
    return { snapshot_id: UNIFIED_SNAPSHOT, sources, redis: "NOT_CONFIGURED" as const };
  } finally {
    db.close();
  }
}

export function listEvaluations() {
  if (!existsSync(dbPath)) return { evaluations: [], calibration: [] };
  const db = open();
  try {
    const evaluations = db
      .prepare("select model_id, target_id, status, metrics_json, production_eligible from model_versions")
      .all();
    const calibration = db.prepare("select calibration_id, method, status, coverage from calibration_runs").all();
    const splits = db.prepare("select split_id, split_method, grouping_method, family_leakage_check, pedigree_leakage_check from split_registry").all();
    return {
      snapshot_id: UNIFIED_SNAPSHOT,
      evaluations,
      calibration,
      splits,
      probability_emitted: false as const,
    };
  } finally {
    db.close();
  }
}

export function recordPredictionRequest(result: { status: string; reason_code: string; target?: { target_id: string } | null; entity_query: string | null }) {
  if (!existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath);
  try {
    const exists = db.prepare("select 1 as ok from sqlite_master where name = 'prediction_requests'").get() as { ok: number } | undefined;
    if (!exists) return;
    db.prepare(
      `insert into prediction_requests (target_id, query, status, reason_code, knowledge_snapshot, created_at)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(result.target?.target_id ?? null, result.entity_query, result.status, result.reason_code, UNIFIED_SNAPSHOT, new Date().toISOString());
  } finally {
    db.close();
  }
}
