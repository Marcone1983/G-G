/**
 * SQLite verification surface. Tests, import checks and benchmarks call this object.
 * The Preview production path uses previewKnowledgeRepository() and does not fall back here.
 */
import { oneAnswer, parentFacts, qualityReport, retrieve, searchEntities, searchLabelPatterns, unifiedPatterns, walkName } from "./brain.ts";
import { foundationNameStats, foundationSearch, foundationStatus } from "./foundation.server.ts";
import { evaluatePrediction, listEvaluations, listSources, listTargets, predictionRequestSummary, recordPredictionRequest, registryModels, targetStatusCounts } from "./predict.ts";
import { providerHealth } from "./provider.ts";
import { httpStatusForResolution, listKnowledgeEvents, loadCrossDetail, readResearch, resolveQuery } from "./resolve.ts";
import { disciplineReport, DISCIPLINES, getEntityGraph, readJobs, snapshotManifest, unifiedScientificRetrieve } from "./unified.ts";
import { rawGuard } from "./guard.ts";

export const knowledgeRepository = {
  resolveQuery,
  retrieve,
  oneAnswer,
  resolveEntity: searchEntities,
  searchEntities,
  foundationStatus,
  foundationSearch,
  foundationNameStats,
  searchLabelPatterns,
  unifiedPatterns,
  qualityReport,
  getEvidence(query: string) {
    return unifiedScientificRetrieve(query);
  },
  getMeasurements(query: string) {
    return unifiedScientificRetrieve(query).chemistry;
  },
  getPedigree(query: string) {
    return walkName(query);
  },
  walkName,
  getClaims(query: string) {
    return parentFacts(query);
  },
  getPatterns(query: string) {
    return unifiedPatterns(query);
  },
  getLiterature(query: string) {
    const found = unifiedScientificRetrieve(query);
    return { literature: found.literature, role: "EVIDENCE_NOT_MEASUREMENT" as const, snapshot_id: found.snapshot_id };
  },
  getLearnedKnowledge(query: string) {
    return { query, role: "AI_RESEARCH_IS_NOT_A_MEASUREMENT" as const, cards: unifiedScientificRetrieve(query) };
  },
  getObservations(query: string) {
    const found = unifiedScientificRetrieve(query);
    return { samples: found.samples, chemistry: found.chemistry, snapshot_id: found.snapshot_id };
  },
  getGenomics() {
    return { data_status: "NOT_AVAILABLE" as const, cultivar_link: "CULTIVAR_LINK_NOT_ESTABLISHED" as const, records: 0, reason: "NO_GENOMIC_ROWS" };
  },
  getPhenotypes(query: string) {
    const found = unifiedScientificRetrieve(query);
    return { phenotype: found.phenotype, phenology: found.phenology, snapshot_id: found.snapshot_id };
  },
  getProvenance() {
    return snapshotManifest();
  },
  recordResearch: readResearch,
  readResearch,
  listKnowledgeEvents,
  httpStatusForResolution,
  providerHealth,
  getCross: loadCrossDetail,
  loadCrossDetail,
  getSnapshot: snapshotManifest,
  invalidateDerivedData() {
    return { status: "DERIVED_ONLY" as const, scientific_rows: "NOT_DELETED" as const };
  },
  getGraph: getEntityGraph,
  readJobs,
  disciplines: DISCIPLINES,
  disciplineReport,
  evaluate(request: { target_id?: string; query?: string; entity_id?: string | null; features?: string[] }) {
    const result = evaluatePrediction(request);
    return { ...result, prediction_probability: null as null, probability: null as null };
  },
  registryModels,
  targetStatusCounts,
  listTargets,
  listSources,
  listEvaluations,
  predictionRequestSummary,
  recordPredictionRequest,
  readiness: rawGuard,
};
