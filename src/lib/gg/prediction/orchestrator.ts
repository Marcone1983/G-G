import { createHash } from "node:crypto";

import { cosine, embed, normalizeName } from "../engine.ts";
import {
  MIDPARENT_ASSUMPTION,
  bayesianBeta,
  bootstrapMidParent,
  median,
  midParent,
  patternWeight,
  pearson,
  populationAtLeastOne,
  quantile,
  sensitivityByGroup,
} from "./math.ts";
import type { CorpusReader, ParentHit, RawValue } from "./sqlite-reader.ts";

export const MODEL_ID = "gg-additive-midparent";
export const MODEL_VERSION = "1";
export const EMBEDDING_MODEL = "gg-hashing-trick-v1";
export const EMBEDDING_VERSION = "1";
export const SIMULATION_VERSION = "empirical-bootstrap-1";

const DEFAULT_COMPOUNDS = ["delta_9_thc", "cbd", "thca", "cbda"];

export type PredictRequest = {
  parentA: string;
  parentAId?: number | null;
  parentBId?: number | null;
  compounds?: string[];
  populationSize?: number | null;
  environment?: string | null;
  generation?: string | null;
  seed?: number;
  modelVersion?: string;
  knowledgeSnapshot?: string | null;
};

type CacheEntry = { key: string; report: MachineReport; reads: number };

const cache = new Map<string, CacheEntry>();
const outcomes = new Map<string, { prediction_id: string; value: number; recorded_at: string }[]>();

export function resetPredictionCache() {
  cache.clear();
  outcomes.clear();
}

export type MachineReport = {
  prediction_id: string;
  cache_status: "HIT" | "MISS";
  identity_status: "RESOLVED" | "IDENTITY_AMBIGUOUS" | "UNRESOLVED";
  data_status: "DATA_AVAILABLE" | "DATA_PARTIAL" | "DATA_INSUFFICIENT" | "IDENTITY_AMBIGUOUS";
  prediction_probability: null;
  calibration_status: "NOT_CALIBRATED";
  model_id: string;
  model_version: string;
  simulation_version: string;
  embedding_model: string;
  embedding_version: string;
  knowledge_snapshot: string;
  source: CorpusReader["source"];
  parents: { query: string; status: MachineReport["identity_status"]; candidates: ParentHit[] }[];
  features: Record<string, unknown>;
  traits: TraitEstimate[];
  correlation: ReturnType<typeof pearson> & { pair: string[]; causation: false };
  patterns_used: ReturnType<typeof patternWeight> & { pattern_key: string; promoted: boolean }[];
  historical_crosses: { same_parent_pair_children: number; analogy: "SAME_PARENT_PAIR" | "NONE"; causal: false };
  semantic: { status: string; hits: { name: string; cosine: number }[]; identity_filter: true };
  pedigree: { rows: number; classes: string[]; genomic_percent: null };
  environment: { supplied: string | null; gxe_status: "NOT_AVAILABLE" };
  population: ReturnType<typeof populationAtLeastOne> & { individual_probability: null };
  bayesian: ReturnType<typeof bayesianBeta>;
  linkage: "linkage_unknown";
  segregation: "NOT_APPLIED_ARCHITECTURE_UNKNOWN";
  research_request: { reason: string; missing_data: string; priority: string; status: "OPEN" } | null;
  health_evidence: { strain_specific: "NOT_AVAILABLE"; note: string };
  graph: string[];
  assumptions: string[];
  limitations: string[];
  generated_at: string;
  human_report: string;
  reads: number;
};

type TraitEstimate = {
  compound: string;
  parent_a_groups: number;
  parent_b_groups: number;
  parent_a_rows: number;
  parent_b_rows: number;
  parent_a_median: number | null;
  parent_b_median: number | null;
  central_estimate: number | null;
  dispersion_low: number | null;
  dispersion_high: number | null;
  band_kind: "MIDPARENT_OF_PARENT_QUARTILES" | null;
  status: "ESTIMATE" | "NOT_COMPUTABLE";
  monte_carlo: ReturnType<typeof bootstrapMidParent>;
  sensitivity: { parameter: string; absolute_delta: number }[];
};

export function predictCross(reader: CorpusReader, request: PredictRequest, now = new Date().toISOString()): MachineReport {
  const modelVersion = request.modelVersion ?? MODEL_VERSION;
  const snapshot = request.knowledgeSnapshot ?? reader.snapshotId();
  const compounds = (request.compounds?.length ? request.compounds : DEFAULT_COMPOUNDS).map((item) => item.toLowerCase());
  const left = selectParent(reader.parents(request.parentA), request.parentAId ?? null);
  const right = selectParent(reader.parents(request.parentB), request.parentBId ?? null);
  const leftStatus = identityStatus(left);
  const rightStatus = identityStatus(right);
  const blocked = leftStatus !== "RESOLVED" || rightStatus !== "RESOLVED";
  const key = cacheKey({
    a: leftStatus === "RESOLVED" ? String(left[0]!.canonical_id) : normalizeName(request.parentA),
    b: rightStatus === "RESOLVED" ? String(right[0]!.canonical_id) : normalizeName(request.parentB),
    compounds,
    modelVersion,
    snapshot,
    seed: request.seed ?? 20261001,
    environment: request.environment ?? "",
    generation: request.generation ?? "",
    population: request.populationSize ?? null,
  });
  const cached = cache.get(key);
  if (cached && cached.report.model_version === modelVersion && cached.report.knowledge_snapshot === snapshot) {
    return { ...cached.report, cache_status: "HIT", reads: cached.reads, human_report: cached.report.human_report };
  }
  let reads = 2;
  const report = buildReport({
    reader,
    request,
    left,
    right,
    leftStatus,
    rightStatus,
    blocked,
    compounds,
    modelVersion,
    snapshot,
    now,
    reads,
  });
  reads = report.reads;
  cache.set(key, { key, report, reads });
  return report;
}

export function recordOutcome(predictionId: string, value: number, now = new Date().toISOString()) {
  const prediction = [...cache.values()].find((entry) => entry.report.prediction_id === predictionId);
  if (!prediction) return { stored: false as const, status: "NOT_FOUND" as const };
  const list = outcomes.get(predictionId) ?? [];
  list.push({ prediction_id: predictionId, value, recorded_at: now });
  outcomes.set(predictionId, list);
  const original = prediction.report.prediction_probability;
  return {
    stored: true as const,
    status: "OUTCOME_RECORDED" as const,
    prediction_rewritten: false as const,
    calibration_status: original === null ? "NOT_CALIBRATED" as const : "NOT_ENOUGH_PAIRS" as const,
    outcomes: list.length,
  };
}

function buildReport(input: {
  reader: CorpusReader;
  request: PredictRequest;
  left: ParentHit[];
  right: ParentHit[];
  leftStatus: MachineReport["identity_status"];
  rightStatus: MachineReport["identity_status"];
  blocked: boolean;
  compounds: string[];
  modelVersion: string;
  snapshot: string;
  now: string;
  reads: number;
}): MachineReport {
  const leftNorm = input.leftStatus === "RESOLVED" ? input.left[0]!.name_norm : normalizeName(input.request.parentA);
  const rightNorm = input.rightStatus === "RESOLVED" ? input.right[0]!.name_norm : normalizeName(input.request.parentB);
  const leftValues = input.blocked ? [] : input.reader.values(leftNorm, input.compounds);
  const rightValues = input.blocked ? [] : input.reader.values(rightNorm, input.compounds);
  const reads = input.reads + (input.blocked ? 0 : 2);
  const traits = input.compounds.map((compound) => estimateTrait(compound, leftValues, rightValues, input.request.seed ?? 20261001));
  const anyEstimate = traits.some((trait) => trait.status === "ESTIMATE");
  const patterns = input.blocked ? [] : input.reader.patterns(leftNorm).concat(input.reader.patterns(rightNorm)).slice(0, 12);
  const weighted = patterns.map((pattern) => ({
    pattern_key: pattern.pattern_key,
    promoted: pattern.promoted,
    ...patternWeight({ independentSources: pattern.independent_sources, contradictions: 0, promoted: pattern.promoted }),
  }));
  const paired = pairedGroups(leftValues, "delta_9_thc", "cbd");
  const correlation = { ...pearson(paired.xs, paired.ys), pair: ["delta_9_thc", "cbd"], causation: false as const };
  const samePair = input.blocked ? 0 : input.reader.samePairChildren(leftNorm, rightNorm);
  const semantic = semanticHits(input.reader, input.request.parentA);
  const pedigreeRows = input.blocked ? [] : input.reader.pedigree(leftNorm);
  const dataStatus: MachineReport["data_status"] = input.blocked
    ? "IDENTITY_AMBIGUOUS"
    : anyEstimate
      ? "DATA_PARTIAL"
      : "DATA_INSUFFICIENT";
  const research = dataStatus === "DATA_AVAILABLE"
    ? null
    : {
        reason: input.blocked ? "Identity is not unique." : "Independent progeny outcomes are absent.",
        missing_data: input.blocked ? "disambiguated canonical id" : "observed progeny measurements",
        priority: input.blocked ? "HIGH" : "MEDIUM",
        status: "OPEN" as const,
      };
  const machine: Omit<MachineReport, "human_report"> = {
    prediction_id: createHash("sha256").update(`${input.snapshot}|${leftNorm}|${rightNorm}|${input.modelVersion}|${input.now}`).digest("hex").slice(0, 24),
    cache_status: "MISS",
    identity_status: input.blocked ? (input.leftStatus === "RESOLVED" ? input.rightStatus : input.leftStatus) : "RESOLVED",
    data_status: dataStatus,
    prediction_probability: null,
    calibration_status: "NOT_CALIBRATED",
    model_id: MODEL_ID,
    model_version: input.modelVersion,
    simulation_version: SIMULATION_VERSION,
    embedding_model: EMBEDDING_MODEL,
    embedding_version: EMBEDDING_VERSION,
    knowledge_snapshot: input.snapshot,
    source: input.reader.source,
    parents: [
      { query: input.request.parentA, status: input.leftStatus, candidates: input.left.slice(0, 12) },
      { query: input.request.parentB, status: input.rightStatus, candidates: input.right.slice(0, 12) },
    ],
    features: {
      parent_a: summarize(leftValues),
      parent_b: summarize(rightValues),
      label_rows: {
        parent_a: input.blocked ? null : input.reader.labelRows(leftNorm),
        parent_b: input.blocked ? null : input.reader.labelRows(rightNorm),
      },
      generation: input.request.generation ?? null,
      environment: input.request.environment ?? null,
    },
    traits,
    correlation,
    patterns_used: weighted,
    historical_crosses: {
      same_parent_pair_children: samePair,
      analogy: samePair > 0 ? "SAME_PARENT_PAIR" : "NONE",
      causal: false,
    },
    semantic,
    pedigree: {
      rows: pedigreeRows.length,
      classes: [...new Set(pedigreeRows.map((row) => row.identity_status))],
      genomic_percent: null,
    },
    environment: { supplied: input.request.environment ?? null, gxe_status: "NOT_AVAILABLE" },
    population: {
      ...populationAtLeastOne(null, input.request.populationSize ?? null, false),
      individual_probability: null,
    },
    bayesian: bayesianBeta({ priorAlpha: null, priorBeta: null, successes: 0, failures: 0 }),
    linkage: "linkage_unknown",
    segregation: "NOT_APPLIED_ARCHITECTURE_UNKNOWN",
    research_request: research,
    health_evidence: {
      strain_specific: "NOT_AVAILABLE",
      note: "No strain-specific clinical row is read by this estimate. Compound measurements stay compound measurements.",
    },
    graph: ["USES_CHEMOTYPE", "USES_PEDIGREE", "USES_PATTERN", "PREDICTED_BY"],
    assumptions: [MIDPARENT_ASSUMPTION, "Rows in one independence group are one observation.", "A prediction is not stored as evidence."],
    limitations: [
      "The centre is not a calibrated probability.",
      "Seller and laboratory rows are separated only by the independence group already stored.",
      "No genomic contribution is inferred from a reported parent.",
    ],
    generated_at: input.now,
    reads,
  };
  const human = humanReport(machine);
  return { ...machine, human_report: human };
}

function estimateTrait(compound: string, left: RawValue[], right: RawValue[], seed: number): TraitEstimate {
  const a = groupMedians(left.filter((row) => row.compound === compound));
  const b = groupMedians(right.filter((row) => row.compound === compound));
  const aMedian = median(a);
  const bMedian = median(b);
  const centre = a.length >= 2 && b.length >= 2 ? midParent(aMedian, bMedian) : null;
  return {
    compound,
    parent_a_groups: a.length,
    parent_b_groups: b.length,
    parent_a_rows: left.filter((row) => row.compound === compound).length,
    parent_b_rows: right.filter((row) => row.compound === compound).length,
    parent_a_median: aMedian,
    parent_b_median: bMedian,
    central_estimate: centre,
    dispersion_low: centre === null ? null : midParent(quantile(a, 0.25), quantile(b, 0.25)),
    dispersion_high: centre === null ? null : midParent(quantile(a, 0.75), quantile(b, 0.75)),
    band_kind: centre === null ? null : "MIDPARENT_OF_PARENT_QUARTILES",
    status: centre === null ? "NOT_COMPUTABLE" : "ESTIMATE",
    monte_carlo: bootstrapMidParent({ left: a, right: b, seed, replicates: 200 }),
    sensitivity: sensitivityByGroup({ left: a, right: b }),
  };
}

function groupMedians(rows: RawValue[]): number[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const list = groups.get(row.group) ?? [];
    list.push(row.value);
    groups.set(row.group, list);
  }
  return [...groups.values()].map((values) => median(values)).filter((value): value is number => value !== null);
}

function pairedGroups(rows: RawValue[], left: string, right: string): { xs: number[]; ys: number[] } {
  const a = new Map<string, number[]>();
  const b = new Map<string, number[]>();
  for (const row of rows) {
    const target = row.compound === left ? a : row.compound === right ? b : null;
    if (!target) continue;
    const list = target.get(row.group) ?? [];
    list.push(row.value);
    target.set(row.group, list);
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [group, values] of a) {
    const other = b.get(group);
    const x = median(values);
    const y = other ? median(other) : null;
    if (x === null || y === null) continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

function summarize(rows: RawValue[]) {
  const groups = new Set(rows.map((row) => row.group));
  return { rows: rows.length, independent_groups: groups.size, compounds: [...new Set(rows.map((row) => row.compound))] };
}

function semanticHits(reader: CorpusReader, query: string) {
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  const queryVector = embed(query);
  const hits = reader.vectorCandidates(tokens)
    .map((candidate) => ({ name: candidate.name, cosine: cosine(queryVector, candidate.vector) }))
    .filter((hit) => hit.cosine > 0.2)
    .sort((a, b) => b.cosine - a.cosine)
    .slice(0, 5);
  return {
    status: hits.length ? "HASHING_BASELINE_NOT_A_SEMANTIC_MODEL" : "NO_CANDIDATE",
    hits,
    identity_filter: true as const,
  };
}

function selectParent(hits: ParentHit[], id: number | null): ParentHit[] {
  if (id === null) return hits;
  const chosen = hits.filter((hit) => hit.canonical_id === id);
  return chosen.length === 1 ? chosen : [];
}

function identityStatus(hits: ParentHit[]): MachineReport["identity_status"] {
  if (hits.length === 0) return "UNRESOLVED";
  if (hits.length > 1) return "IDENTITY_AMBIGUOUS";
  return "RESOLVED";
}

function cacheKey(input: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function humanReport(report: Omit<MachineReport, "human_report">): string {
  const names = report.parents.map((parent) => `${parent.query} (${parent.status}, ${parent.candidates.length} candidati)`).join(" e ");
  const estimates = report.traits
    .filter((trait) => trait.status === "ESTIMATE" && trait.central_estimate !== null)
    .map((trait) => `${trait.compound}: mediana dei genitori ${trait.central_estimate}, non una probabilità`)
    .join("; ");
  return [
    `Noto: ${names}.`,
    `Osservato: gruppi indipendenti usati come repliche, non le righe grezze.`,
    estimates ? `Stimato sotto l'assunzione additiva non calibrata: ${estimates}.` : "Stimato: niente. Lo stato è NOT_COMPUTABLE per mancanza di identità unica o di gruppi.",
    "Incerto: nessuna calibrazione su progenie, linkage sconosciuto, ambiente non modellato.",
    `Pattern letti: ${report.patterns_used.length}. Nessuno entra nella stima.`,
    "Un dato che cambierebbe il risultato: misure di progenie con gruppo di indipendenza, oppure un solo identificatore canonico per ogni genitore.",
  ].join(" ");
}
