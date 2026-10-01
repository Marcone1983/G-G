import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { cosine, embed, normalizeName, semanticRetrieve } from "./engine.ts";
import type { KnowledgeSnapshot } from "./knowledge.ts";

export const UNIFIED_SNAPSHOT = "GGS-KNOWLEDGE-000005";
const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export type ChemistryClass = {
  klass: string;
  numeric_measurements: number;
  qualified_measurements: number;
  source_reported_zeros: number;
  independent_samples: number;
};

export type LabFacts = {
  query: string;
  name_norm: string;
  source_rows: number;
  independent_samples: number;
  numeric_measurements: number;
  qualified_measurements: number;
  source_reported_zeros: number;
  laboratories: number;
  reported_parents: number;
  genomic_records: 0;
  genomics: "NOT_AVAILABLE";
  declared_flowering_records: number;
  declared_flowering_distinct_texts: number;
  declared_types: number;
  autoflower_records: number;
  exact_identity: 0;
  chemistry: ChemistryClass[];
  identity: { status: string; n: number }[];
  identity_legacy: { status: string; n: number }[];
  entities: { id: number; display_name: string; breeder: string | null; identity_status: string; homonym_status: string | null }[];
};

function open(readOnly: boolean) {
  return new DatabaseSync(dbPath, { readOnly });
}

export function storeReady() {
  return existsSync(dbPath);
}

function tableExists(db: DatabaseSync, name: string) {
  const row = db.prepare("select 1 as ok from sqlite_master where type = 'table' and name = ?").get(name) as { ok: number } | undefined;
  return Boolean(row);
}

export function parentFacts(query: string): LabFacts | null {
  const text = query.trim();
  if (!storeReady() || text.length < 2) return null;
  const norm = normalizeName(text);
  const db = open(true);
  try {
    if (!tableExists(db, "source_records")) return null;
    const rows = db
      .prepare(
        `select count(*) as source_rows,
                count(distinct case when u.unit_kind = 'LAB_SAMPLE' then u.independence_group end) as independent_samples,
                count(distinct r.lab) as laboratories
         from source_records r
         left join observation_units u on u.source_record_id = r.id
         where r.name_norm = ?`,
      )
      .get(norm) as { source_rows: number; independent_samples: number | null; laboratories: number | null };
    const measured = db
      .prepare(
        `select
           sum(m.value is not null) as numeric_measurements,
           sum(m.qualifier is not null) as qualified_measurements,
           sum(m.zero_semantics = 'SOURCE_REPORTED_ZERO') as source_reported_zeros
         from measurements m
         join source_records r on r.id = m.source_record_id
         where r.name_norm = ?`,
      )
      .get(norm) as { numeric_measurements: number | null; qualified_measurements: number | null; source_reported_zeros: number | null };
    const identity = db
      .prepare(
        `select coalesce(d.scientific_status, r.match_status) as status, count(*) as n
         from source_records r
         left join identity_decisions d on d.source_record_id = r.id
         where r.name_norm = ?
         group by 1`,
      )
      .all(norm) as { status: string; n: number }[];
    const identityLegacy = db.prepare("select match_status as status, count(*) as n from source_records where name_norm = ? group by 1").all(norm) as { status: string; n: number }[];
    const entities = db
      .prepare("select id, display_name, breeder, identity_status, homonym_status from canonical_entities where name_norm = ? limit 12")
      .all(norm) as LabFacts["entities"];
    const parents = db
      .prepare(
        `select count(*) as n from pedigree_edges e
         join canonical_entities c on c.id = e.child_canonical_id
         where c.name_norm = ?`,
      )
      .get(norm) as { n: number };
    let reportedParents = Number(parents.n ?? 0);
    if (tableExists(db, "acquired_entities")) {
      const extraParents = db
        .prepare(
          `select count(*) as n from acquired_pedigree p
           join acquired_entities e on e.id = p.entity_id
           where e.name_norm = ?`,
        )
        .get(norm) as { n: number };
      reportedParents += Number(extraParents.n ?? 0);
      const acquired = db
        .prepare("select id, display_name, breeder, identity_status, homonym_status from acquired_entities where name_norm = ? limit 8")
        .all(norm) as LabFacts["entities"];
      for (const row of acquired) entities.push({ ...row, id: -Math.abs(Number(row.id)) });
    }
    const chemistry = db
      .prepare(
        `select coalesce(m.normalized_class, m.klass) as klass,
                sum(m.value is not null) as numeric_measurements,
                sum(m.qualifier is not null) as qualified_measurements,
                sum(m.zero_semantics = 'SOURCE_REPORTED_ZERO') as source_reported_zeros,
                count(distinct case when u.unit_kind = 'LAB_SAMPLE' then u.independence_group end) as independent_samples
         from measurements m
         join source_records r on r.id = m.source_record_id
         left join observation_units u on u.source_record_id = r.id
         where r.name_norm = ?
         group by 1`,
      )
      .all(norm) as ChemistryClass[];
    const flowering = db
      .prepare(
        `select count(*) as n, count(distinct p.original_text) as distinct_texts
         from phenology p
         join source_records r on r.id = p.source_record_id
         where r.name_norm = ? and p.claim_status = 'DOCUMENTED'`,
      )
      .get(norm) as { n: number; distinct_texts: number };
    return {
      query: text,
      name_norm: norm,
      source_rows: Number(rows.source_rows ?? 0),
      independent_samples: Number(rows.independent_samples ?? 0),
      numeric_measurements: Number(measured.numeric_measurements ?? 0),
      qualified_measurements: Number(measured.qualified_measurements ?? 0),
      source_reported_zeros: Number(measured.source_reported_zeros ?? 0),
      laboratories: Number(rows.laboratories ?? 0),
      reported_parents: reportedParents,
      genomic_records: 0,
      genomics: "NOT_AVAILABLE" as const,
      declared_flowering_records: Number(flowering.n ?? 0),
      declared_flowering_distinct_texts: Number(flowering.distinct_texts ?? 0),
      declared_types: Number((db.prepare("select count(distinct p.original_text) as n from phenotypes p join source_records r on r.id = p.source_record_id where r.name_norm = ? and p.field = 'declared_type'").get(norm) as { n: number }).n ?? 0),
      autoflower_records: Number((db.prepare("select count(*) as n from phenotypes p join source_records r on r.id = p.source_record_id where r.name_norm = ? and p.field = 'autoflower_flag'").get(norm) as { n: number }).n ?? 0),
      exact_identity: 0,
      chemistry: chemistry.map((row) => ({
        klass: String(row.klass),
        numeric_measurements: Number(row.numeric_measurements ?? 0),
        qualified_measurements: Number(row.qualified_measurements ?? 0),
        source_reported_zeros: Number(row.source_reported_zeros ?? 0),
        independent_samples: Number(row.independent_samples ?? 0),
      })),
      identity,
      identity_legacy: identityLegacy,
      entities,
    };
  } finally {
    db.close();
  }
}

export function crossObservation(query: string) {
  const parents = query
    .split(/\s+[x×]\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .slice(0, 2)
    .map((part) => parentFacts(part));
  return {
    query,
    parents,
    offspring_measurements: 0,
    prediction_probability: null,
    prediction_status: "NOT_COMPUTABLE" as const,
    reason: "Ogni chimica è quella osservata sul nome del parent. Non è la progenie e non è una probabilità.",
  };
}

export function corpusAudit() {
  if (!storeReady()) return null;
  const db = open(true);
  try {
    const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
    const classes = db
      .prepare("select normalized_class as klass, count(*) as rows, sum(value is not null) as numeric_values from measurements group by 1 order by 2 desc")
      .all() as { klass: string; rows: number; numeric_values: number }[];
    return {
      snapshot_id: UNIFIED_SNAPSHOT,
      source_records: count("select count(*) as n from source_records"),
      samples: count("select count(*) as n from samples"),
      measurements: count("select count(*) as n from measurements"),
      numeric_values: count("select count(*) as n from measurements where value is not null"),
      qualified_measurements: count("select count(*) as n from measurements where qualifier is not null"),
      json_value_repr: count("select count(*) as n from measurements where raw_fidelity = 'JSON_VALUE_REPR'"),
      canonical_entities: count("select count(*) as n from canonical_entities"),
      distinct_names: count("select count(distinct name_norm) as n from source_records"),
      aliases: count("select count(*) as n from aliases"),
      claims: count("select count(*) as n from claims"),
      pedigree_edges: count("select count(*) as n from pedigree_edges"),
      classes: classes.map((row) => ({ klass: String(row.klass), rows: Number(row.rows), numeric_values: Number(row.numeric_values) })),
      genomics: "NOT_AVAILABLE" as const,
      calibrated_models: 0,
      prediction_probability: null,
      external_rows_added: 0,
    };
  } finally {
    db.close();
  }
}

export function retrieve(query: string, knowledge?: KnowledgeSnapshot) {
  const text = query.trim();
  const norm = normalizeName(text);
  if (!storeReady()) return { ready: false, query: text, snapshot_id: UNIFIED_SNAPSHOT, hits: [] };
  const db = open(false);
  try {
    const cached = readCache(db, norm);
    if (cached) return cached;
    const facts = parentFacts(text);
    const aliases = db
      .prepare(
        `select c.id as canonical_id, c.display_name, c.breeder, c.homonym_status, a.alias
         from aliases a join canonical_entities c on c.id = a.canonical_id
         where a.alias_norm = ? limit 8`,
      )
      .all(norm) as Record<string, unknown>[];
    const chemistry = db
      .prepare(
        `select coalesce(m.normalized_class, m.klass) as klass, count(*) as measurement_rows,
                sum(m.value is not null) as numeric_rows,
                sum(m.qualifier is not null) as qualified_rows,
                sum(m.zero_semantics = 'SOURCE_REPORTED_ZERO') as source_reported_zeros,
                count(distinct u.independence_group) as independent_samples
         from measurements m
         join source_records r on r.id = m.source_record_id
         join observation_units u on u.source_record_id = r.id
         where r.name_norm = ?
         group by 1`,
      )
      .all(norm) as Record<string, unknown>[];
    const measurementIds = db
      .prepare(
        `select m.id from measurements m join source_records r on r.id = m.source_record_id
         where r.name_norm = ? and m.value is not null limit 40`,
      )
      .all(norm) as { id: number }[];
    const claimIds = db
      .prepare(
        `select c.id, c.field, 'REPORTED' as evidence_level from claims c
         join source_records r on r.id = c.source_record_id where r.name_norm = ? limit 20`,
      )
      .all(norm) as Record<string, unknown>[];
    const pedigree = db
      .prepare(
        `select e.parent_text, e.identity_status, 'REPORTED_PARENT' as relationship_type
         from pedigree_edges e join canonical_entities c on c.id = e.child_canonical_id
         where c.name_norm = ? limit 12`,
      )
      .all(norm) as Record<string, unknown>[];
    const literature = knowledge ? semanticRetrieve(text, knowledge, { limit: 6 }) : [];
    const patterns = db
      .prepare(
        `select lifecycle, count(*) as n from label_patterns where name_norm = ? group by 1`,
      )
      .all(norm) as Record<string, unknown>[];
    const reported = reportedCards(db, norm);
    const payload = {
      ready: true,
      query: text,
      normalized_query: norm,
      snapshot_id: UNIFIED_SNAPSHOT,
      method: "exact_name_plus_alias_plus_literature_cosine",
      vector_backend: "in_process_cosine_v1",
      score_kind: "HEURISTIC_NOT_A_PROBABILITY",
      facts,
      aliases,
      chemistry,
      measurement_ids: measurementIds.map((row) => row.id),
      claim_ids: claimIds,
      pedigree: [
        ...pedigree,
        ...reported.flatMap((card) =>
          card.parents.map((parent) => ({
            parent_text: parent,
            identity_status: "REPORTED",
            relationship_type: "reported_parent",
            epistemic: "GROK_REPORTED",
          })),
        ),
      ],
      reported_cards: reported,
      patterns,
      literature,
      literature_note: "I testi di letteratura restano nel loro studio. Non diventano il profilo del nome cercato.",
      neighbors: facts && facts.source_rows === 0 && aliases.length === 0 && reported.length === 0 ? similarEntities(db, text) : [],
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      prediction_gate: predictionGate(facts),
      genomics_status: "NOT_AVAILABLE" as const,
      embedding: {
        model: "gg-hashing-trick-v1",
        version: "1",
        dimension: 64,
        scientific_status: "BASELINE_HASH_NOT_SEMANTIC_UNDERSTANDING" as const,
      },
      cache_write_policy: "DERIVED_WRITE" as const,
      ...(reported.length ? { source_ids: ["src-grok-lookup"] } : {}),
      note: reported.length
        ? "Scheda GROK_REPORTED salvata nello store. Non è una misura di laboratorio e non è un'identità esatta."
        : "Un nome recupera campioni ed entità omonime. Non è un genotipo e non è una media chimica.",
    };
    writeCache(db, text, norm, payload);
    db.prepare(
      `insert into retrieval_events (snapshot_id, query, method, result_json, created_at, cache_hit, entity_ids)
       values (?, ?, ?, ?, ?, 'MISS', ?)`,
    ).run(
      UNIFIED_SNAPSHOT,
      text,
      String(payload.method),
      JSON.stringify({ measurement_ids: payload.measurement_ids, claim_ids: payload.claim_ids }),
      new Date().toISOString(),
      JSON.stringify((facts?.entities ?? []).map((entity) => entity.id)),
    );
    return { cache: "MISS" as const, ...payload };
  } finally {
    db.close();
  }
}

function readCache(db: DatabaseSync, norm: string) {
  const row = db
    .prepare(
      `select retrieved_json from semantic_cache
       where normalized_query = ? and snapshot_id = ? and invalidation_status = 'valid'
       order by id desc limit 1`,
    )
    .get(norm, UNIFIED_SNAPSHOT) as { retrieved_json: string } | undefined;
  if (!row) return null;
  return { cache: "EXACT_HIT" as const, ...(JSON.parse(row.retrieved_json) as Record<string, unknown>) };
}

function writeCache(db: DatabaseSync, query: string, norm: string, payload: Record<string, unknown>) {
  const blob = Buffer.from(new Float32Array(embed(query)).buffer);
  const sources = Array.isArray(payload.source_ids) ? payload.source_ids : ["src-cannlytics-results", "src-ci-strains-pro"];
  db.prepare(
    `insert into semantic_cache
     (query, normalized_query, embedding, retrieved_json, evidence_json, answer, source_refs, snapshot_id, confidence, created_at, invalidation_status, entity_ids, claim_ids, measurement_ids, source_ids, sample_group_ids)
     values (?, ?, ?, ?, ?, ?, ?, ?, null, ?, 'valid', ?, ?, ?, ?, ?)`,
  ).run(
    query,
    norm,
    blob,
    JSON.stringify(payload),
    JSON.stringify({ measurement_ids: payload.measurement_ids ?? [], claim_ids: payload.claim_ids ?? [] }),
    String(payload.note ?? ""),
    JSON.stringify({ snapshot_id: UNIFIED_SNAPSHOT }),
    UNIFIED_SNAPSHOT,
    new Date().toISOString(),
    JSON.stringify((payload.facts as LabFacts | null)?.entities?.map((entity) => entity.id) ?? []),
    JSON.stringify(payload.claim_ids ?? []),
    JSON.stringify(payload.measurement_ids ?? []),
    JSON.stringify(sources),
    JSON.stringify({ independent_samples: (payload.facts as LabFacts | null)?.independent_samples ?? null }),
  );
}

let vectorIndex: { canonical_id: number; display_name: string; breeder: string | null; vector: number[] }[] | null = null;

function similarEntities(db: DatabaseSync, query: string) {
  if (!vectorIndex) {
    const rows = db
      .prepare("select v.canonical_id, c.display_name, c.breeder, v.vector from entity_vectors v join canonical_entities c on c.id = v.canonical_id")
      .all() as { canonical_id: number; display_name: string; breeder: string | null; vector: Uint8Array }[];
    vectorIndex = rows.map((row) => ({
      canonical_id: row.canonical_id,
      display_name: row.display_name,
      breeder: row.breeder,
      vector: Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)),
    }));
  }
  const q = embed(query);
  return vectorIndex
    .map((row) => ({ ...row, vector: undefined, score: Math.round(cosine(q, row.vector) * 10000) / 10000, identity_status: "POSSIBLE_MATCH" as const }))
    .filter((row) => row.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function recordAnalysis(cacheKey: string, report: unknown) {
  if (!storeReady()) return;
  const db = open(false);
  try {
    db.prepare("insert into analysis_log (snapshot_id, cache_key, kind, report_json, created_at) values (?, ?, 'analysis', ?, ?)").run(
      UNIFIED_SNAPSHOT,
      cacheKey,
      JSON.stringify(report),
      new Date().toISOString(),
    );
    db.prepare("insert into audit_events (action, subject, meta_json, created_at) values ('analysis_recorded', ?, ?, ?)").run(
      cacheKey,
      JSON.stringify({ snapshot_id: UNIFIED_SNAPSHOT }),
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

export function readAnalysis(cacheKey: string) {
  if (!storeReady()) return null;
  const db = open(true);
  try {
    const row = db
      .prepare("select report_json from analysis_log where cache_key = ? and snapshot_id = ? order by id desc limit 1")
      .get(cacheKey, UNIFIED_SNAPSHOT) as { report_json: string } | undefined;
    return row ? (JSON.parse(row.report_json) as { report: Record<string, unknown>; cache_key: string }) : null;
  } finally {
    db.close();
  }
}

type ReportedCard = {
  id: string;
  display_name: string;
  breeder: string | null;
  identity_status: string;
  epistemic: "GROK_REPORTED";
  summary: string;
  aliases: string[];
  parents: string[];
};

function reportedCards(db: DatabaseSync, norm: string): ReportedCard[] {
  if (!tableExists(db, "acquired_entities")) return [];
  const rows = db
    .prepare(
      `select e.id, e.display_name, e.breeder, e.identity_status, e.summary, e.uncertainty
       from acquired_entities e where e.name_norm = ?
       union
       select e.id, e.display_name, e.breeder, e.identity_status, e.summary, e.uncertainty
       from acquired_aliases a join acquired_entities e on e.id = a.entity_id
       where a.alias_norm = ?
       limit 8`,
    )
    .all(norm, norm) as { id: number; display_name: string; breeder: string | null; identity_status: string; summary: string; uncertainty: string }[];
  const seen = new Set<number>();
  const cards: ReportedCard[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const aliases = db.prepare("select alias from acquired_aliases where entity_id = ? limit 8").all(row.id) as { alias: string }[];
    const parents = db.prepare("select parent_text from acquired_pedigree where entity_id = ? limit 8").all(row.id) as { parent_text: string }[];
    cards.push({
      id: `acquired:${row.id}`,
      display_name: row.display_name,
      breeder: row.breeder,
      identity_status: row.identity_status,
      epistemic: "GROK_REPORTED",
      summary: `${row.summary} ${row.uncertainty}`.trim(),
      aliases: aliases.map((item) => item.alias),
      parents: parents.map((item) => item.parent_text),
    });
  }
  return cards;
}

export function invalidateQueryCache(normalizedQuery: string) {
  if (!storeReady()) return 0;
  const db = open(false);
  try {
    const info = db
      .prepare("update semantic_cache set invalidation_status = 'invalidated' where snapshot_id = ? and normalized_query = ? and invalidation_status = 'valid'")
      .run(UNIFIED_SNAPSHOT, normalizedQuery);
    return Number(info.changes ?? 0);
  } finally {
    db.close();
  }
}

export function refreshQueryCache(query: string) {
  invalidateQueryCache(normalizeName(query.trim()));
  return retrieve(query);
}

export function invalidateRetrievalCache(reason: string) {
  if (!storeReady()) return 0;
  const db = open(false);
  try {
    const info = db
      .prepare("update semantic_cache set invalidation_status = 'invalidated' where snapshot_id = ? and invalidation_status = 'valid'")
      .run(UNIFIED_SNAPSHOT);
    db.prepare("insert into audit_events (action, subject, meta_json, created_at) values ('retrieval_cache_invalidated', ?, ?, ?)").run(
      UNIFIED_SNAPSHOT,
      JSON.stringify({ reason: reason.slice(0, 180) }),
      new Date().toISOString(),
    );
    return Number(info.changes ?? 0);
  } finally {
    db.close();
  }
}

export function qualityReport() {
  if (!storeReady()) return { ready: false };
  const db = open(true);
  try {
    const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
    const grouped = (sql: string) => db.prepare(sql).all();
    const measurementClasses = db
      .prepare(
        `select coalesce(normalized_class, klass) as klass,
                count(*) as n,
                sum(value is not null) as numeric_measurements,
                sum(qualifier is not null) as qualified_measurements,
                sum(zero_semantics = 'SOURCE_REPORTED_ZERO') as source_reported_zeros,
                sum(qualifier is not null and value is not null) as qualified_with_numeric_value
         from measurements
         group by coalesce(normalized_class, klass)`,
      )
      .all() as {
      klass: string;
      n: number;
      numeric_measurements: number | null;
      qualified_measurements: number | null;
      source_reported_zeros: number | null;
      qualified_with_numeric_value: number | null;
    }[];
    const sumClass = (key: "n" | "numeric_measurements" | "qualified_measurements" | "source_reported_zeros" | "qualified_with_numeric_value") =>
      measurementClasses.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    return {
      ready: true,
      snapshot_id: UNIFIED_SNAPSHOT,
      persistence: "sqlite_file",
      postgres: "NOT_CONFIGURED",
      scientific_role: "SOURCE_OF_TRUTH",
      app_database_role: "USER_GOVERNANCE_NOT_SCIENTIFIC_SOT",
      source_records: count("select count(*) as n from source_records"),
      samples: count("select count(*) as n from samples"),
      independent_samples: count("select count(distinct independence_group) as n from observation_units where unit_kind = 'LAB_SAMPLE'"),
      canonical_entities: count("select count(*) as n from canonical_entities"),
      distinct_entities: count("select count(*) as n from canonical_entities where homonym_status = 'DISTINCT_ENTITY'"),
      unresolved: count("select count(*) as n from source_records where match_status = 'UNRESOLVED'"),
      conflicts: count("select count(*) as n from source_records where match_status = 'CONFLICTING_IDENTITY'"),
      possible: count("select count(*) as n from source_records where match_status = 'POSSIBLE_MATCH'"),
      identity_decisions: grouped("select status, count(*) as n from identity_decisions group by 1"),
      measurements: sumClass("n"),
      numeric_measurements: sumClass("numeric_measurements"),
      qualified_measurements: sumClass("qualified_measurements"),
      source_reported_zeros: sumClass("source_reported_zeros"),
      qualified_with_numeric_value: sumClass("qualified_with_numeric_value"),
      measurement_classes: measurementClasses,
      pedigree_edges: count("select count(*) as n from pedigree_edges"),
      aliases: count("select count(*) as n from aliases"),
      claims: count("select count(*) as n from claims"),
      publications: count("select count(*) as n from publications"),
      phenology_documented: count("select count(*) as n from phenology"),
      phenotypes_documented: count("select count(*) as n from phenotypes"),
      morphology_rows: count("select count(*) as n from morphology"),
      genomic_samples: count("select count(*) as n from genomic_samples"),
      variants: count("select count(*) as n from variants"),
      genomic_records: count("select count(*) as n from literature_records where kind = 'genomic_map'"),
      expression_records: count("select count(*) as n from literature_records"),
      graph_edges: count("select count(*) as n from graph_edges"),
      files_with_sha256: count("select count(*) as n from files where sha256 is not null"),
      patterns: grouped("select lifecycle, count(*) as n from label_patterns group by 1"),
      pattern_candidates: grouped("select lifecycle, count(*) as n from pattern_candidates group by 1"),
      validated_patterns: count("select count(*) as n from label_patterns where promoted_to_validated = 1") +
        count("select count(*) as n from pattern_candidates where lifecycle = 'VALIDATED'"),
      semantic_cache_rows: count(`select count(*) as n from semantic_cache where snapshot_id = '${UNIFIED_SNAPSHOT}'`),
      semantic_cache_other_snapshots: grouped(
        "select snapshot_id, invalidation_status, count(*) as n from semantic_cache group by 1, 2",
      ),
      analysis_log_rows: count("select count(*) as n from analysis_log"),
      calibrated_predictions: count(
        "select count(*) as n from sqlite_master where type = 'table' and name = 'model_versions'",
      )
        ? count("select count(*) as n from model_versions where production_eligible = 1 and calibration_status = 'CALIBRATED'")
        : 0,
      by_source: grouped("select source_id, count(*) as n from source_records group by 1"),
    };
  } finally {
    db.close();
  }
}

export function oneAnswer(query: string) {
  const answer = retrieve(query);
  return {
    source_of_truth: "sqlite:data/gg-foundation.sqlite" as const,
    snapshot_id: UNIFIED_SNAPSHOT,
    competing_results: 0 as const,
    fixture_cannot_override: true as const,
    answer,
  };
}

export function unifiedPatterns(query: string) {
  if (!storeReady()) return [];
  const db = open(true);
  try {
    const norm = normalizeName(query);
    const rows = db
      .prepare(
        `select 'label_patterns' as record_origin, pattern_key, lifecycle, promoted_to_validated
         from label_patterns where name_norm = ?
         union all
         select 'pattern_candidates', pattern_key, lifecycle, promoted_to_validated
         from pattern_candidates
         where ? = '' or lower(pattern_key) like '%' || ? || '%'
         limit 40`,
      )
      .all(norm, norm, norm) as Record<string, unknown>[];
    return rows.map((row) => ({
      ...row,
      validated: Number(row.promoted_to_validated ?? 0) === 1 && row.lifecycle === "VALIDATED",
      authority: "sqlite" as const,
    }));
  } finally {
    db.close();
  }
}

export function searchLabelPatterns(query: string) {
  if (!storeReady()) return [];
  const db = open(true);
  try {
    return db
      .prepare(
        `select pattern_key, lifecycle, independent_samples, laboratories, datasets, promoted_to_validated
         from label_patterns where name_norm = ? limit 20`,
      )
      .all(normalizeName(query)) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

export function walkName(query: string) {
  const facts = parentFacts(query);
  if (!facts) return null;
  const db = open(true);
  try {
    const graph = db
      .prepare(
        `select rel, dst_type, dst_id, evidence_level from graph_edges
         where src_type = 'entity' and src_id in (select cast(id as text) from canonical_entities where name_norm = ?)
         limit 24`,
      )
      .all(facts.name_norm) as Record<string, unknown>[];
    return { snapshot_id: UNIFIED_SNAPSHOT, facts, graph, genomic_edges: [] as unknown[], prediction_status: "NOT_COMPUTABLE" as const, prediction_gate: predictionGate(facts) };
  } finally {
    db.close();
  }
}

export function predictionGate(facts: { independent_samples?: number; numeric_measurements?: number; source_rows?: number; identity?: { status: string; n: number }[] } | null) {
  const conflict = Boolean(facts?.identity?.some((row) => row.status === "CONFLICTING_IDENTITY" && row.n > 0));
  return {
    status: "NOT_COMPUTABLE" as const,
    probability: null,
    reason: "MODEL_UNCALIBRATED" as const,
    reason_code: conflict ? ("CONFLICTING_IDENTITY" as const) : ("NO_PRODUCTION_MODEL" as const),
    human_reason: conflict
      ? "Il nome collide con più entità. Nessuna predizione sceglie un vincitore."
      : "Non c'è un modello calibrato in produzione. Un conteggio di campioni non è una predizione.",
    machine_reason: conflict ? "CONFLICTING_IDENTITY" : "NO_PRODUCTION_MODEL",
    missing_evidence: ["calibrated_model", "leakage_free_split", "validation_population", "progeny_observations"],
    available_evidence: {
      source_rows: facts?.source_rows ?? 0,
      independent_samples: facts?.independent_samples ?? 0,
      numeric_measurements: facts?.numeric_measurements ?? 0,
    },
    required_evidence: ["independent progeny observations", "compatible units", "a calibrated model", "an out-of-distribution check"],
    required_conditions: [
      "identity that is not a bare name when the question is about a cultivar",
      "independent samples and sources above the target minimum",
      "features that do not contain the target",
      "a validated model that beats its baseline",
      "calibration with null probability when calibration is absent",
    ],
    limitations: ["Parent samples are not progeny observations.", "A heuristic score is not a probability.", "Reported pedigree is not genomic evidence."],
    uncertainty: [
      { kind: "IDENTITY", limits_prediction: true },
      { kind: "EPISTEMIC", limits_prediction: true },
      { kind: "MODEL", limits_prediction: true },
    ],
    snapshot_id: UNIFIED_SNAPSHOT,
  };
}

export type EntityHit = {
  id: string;
  canonical_name: string;
  identity_status: string;
  record_role: string;
  match_kind: string;
  breeder: string | null;
  auto_merged: false;
};

export function searchEntities(query: string): EntityHit[] {
  const text = query.trim();
  if (!storeReady() || text.length < 2) return [];
  const norm = normalizeName(text);
  const db = open(true);
  try {
    const acquired = tableExists(db, "acquired_entities");
    const rows = db
      .prepare(
        `select id, display_name, breeder, identity_status, homonym_status, match_kind, store, rank from (
           select id, display_name, breeder, identity_status, homonym_status, 'EXACT' as match_kind, 'entity' as store, 0 as rank
           from canonical_entities where name_norm = ?
           union all
           select c.id, c.display_name, c.breeder, c.identity_status, c.homonym_status, 'ALIAS', 'entity', 2
           from aliases a join canonical_entities c on c.id = a.canonical_id
           where a.alias_norm = ?
           ${
             acquired
               ? `union all
           select id, display_name, breeder, identity_status, homonym_status, 'EXACT', 'acquired', 1
           from acquired_entities where name_norm = ?
           union all
           select e.id, e.display_name, e.breeder, e.identity_status, e.homonym_status, 'ALIAS', 'acquired', 3
           from acquired_aliases a join acquired_entities e on e.id = a.entity_id
           where a.alias_norm = ?`
               : ""
           }
         ) order by rank, display_name limit 20`,
      )
      .all(...(acquired ? [norm, norm, norm, norm] : [norm, norm])) as { id: number; display_name: string; breeder: string | null; identity_status: string; homonym_status: string | null; match_kind: string; store: string }[];
    const seen = new Set<string>();
    const hits: EntityHit[] = [];
    for (const row of rows) {
      const key = `${row.store}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        id: row.store === "acquired" ? `acquired:${row.id}` : `entity:${row.id}`,
        canonical_name: row.display_name,
        identity_status: row.identity_status,
        record_role: row.store === "acquired" ? "GROK_REPORTED" : (row.homonym_status ?? "PROBABLE_IDENTITY"),
        match_kind: row.match_kind,
        breeder: row.breeder,
        auto_merged: false,
      });
    }
    return hits;
  } finally {
    db.close();
  }
}

export function loadEntity(id: string) {
  const numeric = Number(id.startsWith("entity:") ? id.slice("entity:".length) : "");
  if (!storeReady() || !Number.isInteger(numeric)) return null;
  const db = open(true);
  try {
    const entity = db
      .prepare("select id, display_name, breeder, identity_status, homonym_status, entity_class from canonical_entities where id = ?")
      .get(numeric) as { id: number; display_name: string; breeder: string | null; identity_status: string; homonym_status: string | null; entity_class: string | null } | undefined;
    if (!entity) return null;
    const aliases = db.prepare("select alias from aliases where canonical_id = ? limit 12").all(numeric) as { alias: string }[];
    const claims = db
      .prepare(
        `select c.id, c.field, c.claim_text, c.claim_status
         from claims c join entity_links l on l.source_record_id = c.source_record_id
         where l.canonical_id = ? limit 12`,
      )
      .all(numeric) as { id: number; field: string; claim_text: string; claim_status: string }[];
    const edges = db
      .prepare("select id, parent_text, relationship_type, identity_status from pedigree_edges where child_canonical_id = ? limit 12")
      .all(numeric) as { id: number; parent_text: string; relationship_type: string; identity_status: string }[];
    return {
      strain: {
        id: `entity:${entity.id}`,
        canonical_name: entity.display_name,
        identity_status: entity.identity_status,
        breeder: entity.breeder,
        summary: `${entity.entity_class ?? "UNKNOWN_ENTITY"}. Omonimi non fusi. Nessun profilo medio e nessuna classe dedotta senza evidenza.`,
      },
      quality: { formula_id: "gg-quality-v1" as const, value: null as number | null },
      aliases: aliases.map((row) => row.alias),
      claims: claims.map((claim) => ({
        id: String(claim.id),
        claim_class: claim.claim_status,
        evidence_level: "DOCUMENTED",
        measurement_kind: claim.field,
        claim_text: claim.claim_text,
      })),
      traits: [] as unknown[],
      edges: edges.map((edge) => ({
        id: String(edge.id),
        child_name: entity.display_name,
        parent_name: edge.parent_text,
        relationship_type: edge.relationship_type,
        note: edge.identity_status,
        note_on_genomic_percentage: "Pedigree dichiarato. Non è una percentuale genomica.",
      })),
      homonym_status: entity.homonym_status,
      snapshot_id: UNIFIED_SNAPSHOT,
    };
  } finally {
    db.close();
  }
}
