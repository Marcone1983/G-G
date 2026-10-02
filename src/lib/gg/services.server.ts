import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import {
  cacheKey,
  canonicalCacheMaterial,
  compareOutcome,
  normalizeName,
  piiBlocksGlobal,
  redactPii,
  type AnalyzeInput,
} from "./engine.ts";
import {
  ENGINE_VERSION,
  MODEL_ID,
  MODEL_VERSION,
  SCHEMA_VERSION,
  SNAPSHOT_ID,
  buildSnapshot,
  type KnowledgeSnapshot,
} from "./knowledge.ts";
import { UNIFIED_SNAPSHOT } from "./brain.ts";
import { privateAccess } from "./privacy.ts";
import { declaredInfrastructure } from "./runtime.server.ts";
import { parseCrossStructure } from "./resolve.ts";
import { personalMedicalRequest } from "./enterprise-64.ts";

const hot = new Map<string, { at: number; body: string }>();
let memoryKnowledge: KnowledgeSnapshot | null = null;

function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

let readyOnce: Promise<Sql> | null = null;

export function ready(): Promise<Sql> {
  readyOnce ??= readyInner().catch((error) => {
    readyOnce = null;
    throw error;
  });
  return readyOnce;
}

async function readyInner(): Promise<Sql> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from gg_meta where key = 'snapshot_id'`;
  if (!rows[0] || rows[0].value !== SNAPSHOT_ID) {
    await bootstrap(sql);
    memoryKnowledge = null;
  }
  return sql;
}

async function bootstrap(sql: Sql) {
  const snap = buildSnapshot();
  await sql`delete from gg_aliases`;
  await sql`delete from gg_edges`;
  await sql`delete from gg_claims`;
  await sql`delete from gg_traits`;
  await sql`delete from gg_genetics`;
  await sql`delete from gg_patterns`;
  await sql`delete from gg_sources`;
  await sql`delete from gg_strains`;
  for (const source of snap.sources) {
    await sql`insert into gg_sources (id, document) values (${source.id}, ${JSON.stringify(source)})`;
  }
  for (const strain of snap.strains) {
    await sql`insert into gg_strains (id, canonical_name, name_norm, identity_status, record_role, document)
      values (${strain.id}, ${strain.canonical_name}, ${normalizeName(strain.canonical_name)}, ${strain.identity_status}, ${strain.record_role}, ${JSON.stringify(strain)})`;
    for (let index = 0; index < strain.aliases.length; index += 1) {
      const alias = strain.aliases[index]!;
      await sql`insert into gg_aliases (id, strain_id, alias, alias_norm)
        values (${`${strain.id}-a${index}`}, ${strain.id}, ${alias}, ${normalizeName(alias)})`;
    }
  }
  for (const edge of snap.edges) {
    await sql`insert into gg_edges (id, child_id, parent_id, relationship_type, confidence, source_id, note)
      values (${edge.id}, ${edge.child_id}, ${edge.parent_id}, ${edge.relationship_type}, ${edge.confidence}, ${edge.source_id}, ${edge.note})`;
  }
  for (const claim of snap.claims) {
    await sql`insert into gg_claims (id, subject_type, subject_id, field, claim_text, claim_class, evidence_level, measurement_kind, source_id, contradicts_claim_id, governance_status)
      values (${claim.id}, ${claim.subject_type}, ${claim.subject_id}, ${claim.field}, ${claim.claim_text}, ${claim.claim_class}, ${claim.evidence_level}, ${claim.measurement_kind}, ${claim.source_id}, ${claim.contradicts_claim_id}, ${claim.governance_status})`;
  }
  for (const trait of snap.traits) {
    await sql`insert into gg_traits (id, strain_id, dimension, trait_key, value_json, measurement_type, confidence, source_id, environment_json)
      values (${trait.id}, ${trait.strain_id}, ${trait.dimension}, ${trait.trait_key}, ${JSON.stringify(trait.value)}, ${trait.measurement_type}, ${trait.confidence}, ${trait.source_id}, ${JSON.stringify(trait.environment)})`;
  }
  for (const gene of snap.genetics) {
    await sql`insert into gg_genetics (id, document) values (${gene.id}, ${JSON.stringify(gene)})`;
  }
  for (const pattern of snap.patterns) {
    await sql`insert into gg_patterns (id, validation_status, document) values (${pattern.id}, ${pattern.validation_status}, ${JSON.stringify(pattern)})`;
  }
  await sql`insert into gg_meta (key, value) values ('snapshot_id', ${SNAPSHOT_ID})
    on conflict (key) do update set value = excluded.value`;
}

export async function loadKnowledge(sql?: Sql): Promise<KnowledgeSnapshot> {
  const db = sql ?? (await ready());
  if (memoryKnowledge) return memoryKnowledge;
  const base = buildSnapshot();
  const strains = await db<{ document: string }>`select document from gg_strains`;
  const sources = await db<{ document: string }>`select document from gg_sources`;
  const edges = await db<{
    id: string;
    child_id: string;
    parent_id: string | null;
    relationship_type: KnowledgeSnapshot["edges"][number]["relationship_type"];
    confidence: number;
    source_id: string | null;
    note: string;
  }>`select id, child_id, parent_id, relationship_type, confidence, source_id, note from gg_edges where status = 'active'`;
  const claims = await db<{
    id: string;
    subject_type: string;
    subject_id: string;
    field: string;
    claim_text: string;
    claim_class: KnowledgeSnapshot["claims"][number]["claim_class"];
    evidence_level: number;
    measurement_kind: KnowledgeSnapshot["claims"][number]["measurement_kind"];
    source_id: string | null;
    contradicts_claim_id: string | null;
    governance_status: string;
  }>`select id, subject_type, subject_id, field, claim_text, claim_class, evidence_level, measurement_kind, source_id, contradicts_claim_id, governance_status from gg_claims`;
  const traits = await db<{
    id: string;
    strain_id: string;
    dimension: string;
    trait_key: string;
    value_json: string;
    measurement_type: KnowledgeSnapshot["traits"][number]["measurement_type"];
    confidence: number;
    source_id: string | null;
    environment_json: string;
  }>`select id, strain_id, dimension, trait_key, value_json, measurement_type, confidence, source_id, environment_json from gg_traits`;
  const genetics = await db<{ document: string }>`select document from gg_genetics`;
  const patterns = await db<{ document: string }>`select document from gg_patterns`;
  memoryKnowledge = {
    snapshot_id: SNAPSHOT_ID,
    sources: sources.map((r) => parse(r.document)),
    strains: strains.map((r) => parse(r.document)),
    edges: edges.map((e) => ({ ...e, source_id: e.source_id ?? "", confidence: Number(e.confidence) })),
    claims: claims.map((c) => ({ ...c, source_id: c.source_id ?? "" })),
    traits: traits.map((t) => ({
      ...t,
      value: parse(t.value_json),
      environment: parse(t.environment_json),
      source_id: t.source_id ?? "",
      confidence: Number(t.confidence),
    })),
    genetics: genetics.map((g) => parse(g.document)),
    patterns: patterns.map((p) => parse(p.document)),
    excluded_sources: base.excluded_sources,
    catalog_meta: null,
  };
  return memoryKnowledge;
}

async function audit(sql: Sql, actor: string | null, action: string, subject: string, id: string | null, meta: unknown) {
  await sql`insert into gg_audit (id, actor_user_id, action, subject_type, subject_id, meta_json)
    values (${randomUUID()}, ${actor}, ${action}, ${subject}, ${id}, ${JSON.stringify(meta)})`;
}

export async function dashboard(userId: string | null) {
  const corpus = await previewKnowledgeRepository().availability();
  return {
    name: "GREED & GROSS",
    snapshot_id: UNIFIED_SNAPSHOT,
    curated_snapshot_id: null,
    model_id: MODEL_ID,
    model_version: MODEL_VERSION,
    engine_version: ENGINE_VERSION,
    schema_version: SCHEMA_VERSION,
    counts: corpus.counts,
    catalog: null,
    corpus,
    recent: [],
    signed_in: Boolean(userId),
  };
}

export async function versionInfo() {
  const declared = declaredInfrastructure();
  return {
    name: "GREED & GROSS",
    model_id: MODEL_ID,
    model_version: MODEL_VERSION,
    engine_version: ENGINE_VERSION,
    schema_version: SCHEMA_VERSION,
    api_version: declared.api_version,
    environment: declared.environment,
    snapshot_id: UNIFIED_SNAPSHOT,
    curated_snapshot_id: null,
    persistence: "NOT_CONFIGURED",
    postgres: "NOT_CONFIGURED",
    embedding_model: "gg-hashing-trick-v1",
    embedding_status: "BASELINE_NOT_SEMANTIC_MODEL",
    semantic_model: "NOT_CONFIGURED",
    embedding_dims: 64,
    vector_backend: declared.vector === "pgvector_requested" ? "pgvector_requested" : "in_process_cosine_v1",
    vector_backend_note:
      "Il backend effettivo è confermato da GET /health. pgvector non viene dichiarato attivo solo perché è stato richiesto.",
    hot_cache: declared.hot_cache,
    durable_cache: declared.durable_cache,
    redis: declared.redis,
    public_base_url: declared.public_base_url,
    scientific_engine: "server",
    architecture: {
      brain: "G&G Scientific Intelligence Core",
      api: "/api/v1",
      clients: ["web", "android", "chatgpt_actions"],
      plugin_is_api: false,
      android_has_scientific_engine: false,
      duplicate_logic: false,
      note: "Le schermate non usano il file SQLite come fonte. I dati scientifici arrivano solo da Supabase PostgreSQL.",
    },
    tools: [
      "search_strains",
      "get_strain_knowledge",
      "get_pedigree",
      "retrieve_cross_context",
      "save_cross_record",
      "search_patterns",
      "search_evidence",
      "semantic_search",
      "lookup_cache",
      "breeding_chat",
      "submit_observation",
      "resolve_query",
      "research_unknown",
      "get_prediction",
      "get_snapshot",
      "get_model_version",
      "get_knowledge_snapshot",
    ],
  };
}

export async function strainSearch(q: string) {
  const found = await previewKnowledgeRepository().resolveEntity(q);
  return {
    query: q,
    snapshot_id: UNIFIED_SNAPSHOT,
    origin: found.corpus.status === "CONNECTED" ? "SUPABASE" : "PRODUCTION_NOT_CONFIGURED",
    grok_called: false,
    resolution_status: found.results.length ? "STORED" : "NOT_AVAILABLE",
    research_id: null,
    research_status: null,
    cross_id: null,
    relationship_status: null,
    stages: [],
    resolution_note: found.note,
    prediction_probability: null,
    prediction_status: "NOT_COMPUTABLE",
    results: found.results,
    fallback: "NONE" as const,
    rule: "La ricerca della preview legge solo Supabase PostgreSQL. Senza connessione production il risultato è non disponibile, non il corpus locale.",
  };
}

export async function strainDetail(id: string) {
  const corpus = await previewKnowledgeRepository().availability();
  if (!corpus.connected) return null;
  if (!id.startsWith("entity:")) return null;
  return null;
}

export async function strainPedigree(id: string) {
  const query = id.replace(/^(entity|record):/, "").trim();
  if (!query) return null;
  const found = await previewKnowledgeRepository().getPedigree(query);
  if (!found || typeof found !== "object" || !("edges" in found) || !Array.isArray(found.edges) || found.edges.length === 0) return null;
  return {
    strain_id: id,
    canonical_name: query,
    edges: found.edges.map((edge, index) => {
      const row = edge as { parent_text?: string; relationship_type?: string };
      return {
        id: String(index),
        child_name: query,
        parent_name: String(row.parent_text ?? ""),
        relationship_type: String(row.relationship_type ?? "REPORTED"),
        note: "Parent riportato, non evidenza genomica.",
        note_on_genomic_percentage: "NOT_AVAILABLE",
      };
    }),
  };
}

export function parseAnalyze(data: unknown): AnalyzeInput {
  if (!data || typeof data !== "object") throw new Error("Richiesta non valida");
  const body = data as Record<string, unknown>;
  const parentA = String(body.parent_a ?? body.parentA ?? "").trim();
  const parentB = String(body.parent_b ?? body.parentB ?? "").trim();
  if (parentA.length < 2 || parentB.length < 2) throw new Error("Servono due parent.");
  const allowed = new Set([
    "F1",
    "F2",
    "F3_PLUS",
    "S1",
    "S2",
    "S3_PLUS",
    "BC1",
    "BC2",
    "BC3_PLUS",
    "SSD",
    "OTHER",
    "AUTHOR_G_LABEL",
  ]);
  const crossType = String(body.cross_type ?? "F1");
  if (!allowed.has(crossType)) throw new Error("Tipo di incrocio non riconosciuto.");
  const env = (body.environment ?? {}) as { temperature_c?: number | null; controlled?: boolean };
  const rare = body.rare_event as { p?: number; n?: number; independent?: boolean } | null;
  return {
    parent_a: parentA,
    parent_b: parentB,
    cross_type: crossType as AnalyzeInput["cross_type"],
    author_generation_label: body.author_generation_label ? String(body.author_generation_label) : null,
    direction: body.direction === "BxA" ? "BxA" : "AxB",
    population_size: body.population_size == null ? undefined : Number(body.population_size),
    environment: {
      temperature_c: env.temperature_c == null ? null : Number(env.temperature_c),
      controlled: Boolean(env.controlled),
    },
    target_traits: Array.isArray(body.target_traits) ? body.target_traits.map(String) : undefined,
    seed: body.seed == null ? null : Number(body.seed),
    replicates: body.replicates == null ? undefined : Number(body.replicates),
    parent_a_id: body.parent_a_id ? String(body.parent_a_id) : null,
    parent_b_id: body.parent_b_id ? String(body.parent_b_id) : null,
    rare_event:
      rare && typeof rare.p === "number" && typeof rare.n === "number"
        ? { p: rare.p, n: rare.n, independent: Boolean(rare.independent) }
        : null,
  };
}

export async function runCross(input: AnalyzeInput, _userId: string | null, _persist: boolean) {
  const corpus = await previewKnowledgeRepository().availability();
  const [parentA, parentB, measurementsA, measurementsB, pedigreeA, pedigreeB] = await Promise.all([
    previewKnowledgeRepository().resolveEntity(input.parent_a),
    previewKnowledgeRepository().resolveEntity(input.parent_b),
    previewKnowledgeRepository().getMeasurements(input.parent_a),
    previewKnowledgeRepository().getMeasurements(input.parent_b),
    previewKnowledgeRepository().getPedigree(input.parent_a),
    previewKnowledgeRepository().getPedigree(input.parent_b),
  ]);
  const human = [
    corpus.connected ? "Letto da Supabase PostgreSQL." : corpus.reason,
    `Parent A «${input.parent_a}»: ${parentA.results.length} righe. Parent B «${input.parent_b}»: ${parentB.results.length} righe.`,
    "prediction_probability = null. prediction_status = NOT_COMPUTABLE.",
    "Un parent riportato non è evidenza genomica. Il motore SQLite di verifica non risponde a questa route.",
  ].join(" ");
  return {
    saved: false as const,
    cross_id: null,
    prediction_id: null,
    report: {
      status: corpus.connected ? "CONNECTED" : corpus.status,
      model_version: MODEL_VERSION,
      knowledge_snapshot: UNIFIED_SNAPSHOT,
      cache_status: "NOT_A_SOURCE",
      human_report: human,
      parents: [{ query: input.parent_a }, { query: input.parent_b }],
      pedigree_confidence: { value: null, formula: "NOT_COMPUTABLE" },
      chemotype: { percentage_status: "NOT_AVAILABLE", reason: "Nessuna percentuale di progenie viene calcolata." },
      pigmentation: { single_locus_black: false, statement: "NOT_AVAILABLE" },
      stability: { generation_implies_stability: false, observed_stability_evidence: "NOT_AVAILABLE" },
      limitations: ["Il motore di verifica SQLite non è il backend production."],
      evidence: [],
      sections: {
        OBSERVED: [],
        SUPPORTED_INFERENCE: [],
        MODEL_PREDICTION: [],
        UNCERTAINTY: [{ discipline: "prediction", epistemic: "NOT_COMPUTABLE", statement: "Probabilità non calcolata." }],
        UNKNOWN: [],
      },
      reproducibility: { seed: 0, replicates: 0, prng: "NONE" },
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      source: "supabase_postgresql" as const,
      fallback: "NONE" as const,
      production: { corpus, parent_a: parentA, parent_b: parentB, measurements_a: measurementsA, measurements_b: measurementsB, pedigree_a: pedigreeA, pedigree_b: pedigreeB },
    },
  };
}

export async function listPredictions(userId: string) {
  const sql = await ready();
  const rows = await sql<{ id: string; cross_id: string; created_at: string; report_json: string }>`
    select id, cross_id, created_at::text, report_json from gg_predictions where user_id = ${userId} order by created_at desc limit 50`;
  return rows.map((r) => {
    const report = parse<{ status: string; parents: { query: string }[]; human_report: string }>(r.report_json);
    return {
      id: r.id,
      cross_id: r.cross_id,
      created_at: r.created_at,
      status: report.status,
      parents: report.parents.map((p) => p.query).join(" × "),
    };
  });
}

export async function getPrediction(id: string, userId: string) {
  const sql = await ready();
  const rows = await sql<{ report_json: string; user_id: string | null }>`
    select report_json, user_id from gg_predictions where id = ${id}`;
  const row = rows[0];
  if (!row || privateAccess(userId, row.user_id) === "DENY") return null;
  return parse(row.report_json);
}

export async function addObservation(
  userId: string,
  body: { prediction_id?: string | null; trait: string; ordinal?: number | null; note?: string },
) {
  const sql = await ready();
  const note = body.note ?? "";
  const redacted = redactPii(note);
  const scientific = {
    trait: body.trait,
    ordinal: body.ordinal ?? null,
    note: redacted.text,
    claim_class: "USER_PROVIDED_OBSERVATION",
    evidence_level: 1,
  };
  const id = randomUUID();
  let metrics: unknown = null;
  if (body.prediction_id) {
    const owned = await sql<{ report_json: string }>`
      select report_json from gg_predictions where id = ${body.prediction_id} and user_id = ${userId}`;
    const row = owned[0];
    if (!row) return { error: "Predizione non trovata" as const };
    const before = row.report_json;
    metrics = compareOutcome(parse(before), { trait: body.trait, ordinal: body.ordinal ?? null, note });
    const outcomeId = randomUUID();
    await sql`insert into gg_observations (id, user_id, prediction_id, visibility, scientific_json, private_note)
      values (${id}, ${userId}, ${body.prediction_id}, 'private', ${JSON.stringify(scientific)}, ${note})`;
    await sql`insert into gg_outcomes (id, prediction_id, observation_id, metrics_json)
      values (${outcomeId}, ${body.prediction_id}, ${id}, ${JSON.stringify(metrics)})`;
    const after = await sql<{ report_json: string }>`select report_json from gg_predictions where id = ${body.prediction_id}`;
    if (after[0]?.report_json !== before) throw new Error("La predizione storica è stata alterata.");
    await audit(sql, userId, "observation_added", "observation", id, { prediction_id: body.prediction_id });
    return { id, visibility: "private", metrics, global_accepted: false };
  }
  await sql`insert into gg_observations (id, user_id, prediction_id, visibility, scientific_json, private_note)
    values (${id}, ${userId}, ${null}, 'private', ${JSON.stringify(scientific)}, ${note})`;
  await audit(sql, userId, "observation_added", "observation", id, {});
  return { id, visibility: "private", metrics, global_accepted: false };
}

export async function promoteObservation(userId: string, observationId: string) {
  const sql = await ready();
  const role = await roleOf(sql, userId);
  if (role !== "SCIENTIFIC_REVIEWER" && role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "DATA_ENGINEER") {
    return { error: "Non autorizzato" as const };
  }
  const rows = await sql<{ scientific_json: string; private_note: string | null }>`
    select scientific_json, private_note from gg_observations where id = ${observationId}`;
  const row = rows[0];
  if (!row) return { error: "Osservazione assente" as const };
  if (piiBlocksGlobal(`${row.scientific_json}\n${row.private_note ?? ""}`)) {
    return { error: "Dati personali ancora presenti. Promozione bloccata." as const };
  }
  const gid = randomUUID();
  await sql`insert into gg_global_records (id, kind, scientific_json, governance_status)
    values (${gid}, 'observation', ${row.scientific_json}, 'APPROVED')`;
  await audit(sql, userId, "knowledge_promoted", "global_record", gid, { observation_id: observationId });
  return { id: gid, governance_status: "APPROVED" };
}

async function roleOf(sql: Sql, userId: string) {
  const rows = await sql<{ role: string }>`select role from gg_roles where user_id = ${userId}`;
  return rows[0]?.role ?? "USER";
}

export async function claimAdmin(userId: string) {
  const sql = await ready();
  const existing = await sql<{ n: number }>`select count(*)::int as n from gg_roles where role in ('ADMIN', 'SUPER_ADMIN')`;
  if ((existing[0]?.n ?? 0) > 0) return { error: "Un amministratore esiste già." as const };
  await sql`insert into gg_roles (user_id, role) values (${userId}, 'SUPER_ADMIN')
    on conflict (user_id) do update set role = 'SUPER_ADMIN'`;
  await audit(sql, userId, "admin_claimed", "role", userId, {});
  return { role: "SUPER_ADMIN" };
}

export async function listPatterns() {
  const corpus = await previewKnowledgeRepository().availability();
  const stored = corpus.connected ? await previewKnowledgeRepository().getPatterns() : { patterns: [] };
  const patterns = "patterns" in stored && Array.isArray(stored.patterns)
    ? stored.patterns.map((pattern, index) => {
        const row = pattern as { pattern_key?: string; hypothesis?: string; lifecycle?: string; validation_status?: string };
        return {
          id: row.pattern_key ?? String(index),
          pattern_type: row.lifecycle ?? "CANDIDATE",
          validation_status: row.validation_status ?? "NOT_VALIDATED",
          hypothesis: row.hypothesis ?? "",
          native_context: "production",
          transferability: "NOT_ASSESSED",
        };
      })
    : [];
  return {
    snapshot_id: UNIFIED_SNAPSHOT,
    patterns,
    curated: [],
    label_patterns: [],
    validated_patterns: 0,
    corpus,
    rule: corpus.connected
      ? patterns.length
        ? "Pattern letti dal database production. Nessuno viene promosso a VALIDATED da questa lettura."
        : "Nessun pattern validato/importato."
      : corpus.reason,
  };
}

export async function listEvidence(query = "") {
  const corpus = await previewKnowledgeRepository().availability();
  const term = query.trim();
  if (term.length < 2 || term === "*") {
    return { status: "QUERY_REQUIRED", sources: [], genetics: [], claims: [], excluded_sources: [], corpus, health: null, note: "Serve un nome. Il corpus non si scarica." };
  }
  const health = await previewKnowledgeRepository().getHealthEvidence(term);
  if (!corpus.connected) {
    return { sources: [], genetics: [], claims: [], excluded_sources: [], corpus, health, note: corpus.reason };
  }
  const found = await previewKnowledgeRepository().getClaims(term);
  const claims = found && typeof found === "object" && "claims" in found && Array.isArray(found.claims) ? found.claims : [];
  return {
    sources: [],
    genetics: [],
    claims,
    excluded_sources: [],
    corpus,
    health,
    note: claims.length ? "Claim letti da Supabase. Non sono misure di laboratorio." : "Nessun claim scientifico ancora importato.",
  };
}

export async function breedingChat(
  message: string,
  _pins?: { parent_a_id?: string | null; parent_b_id?: string | null },
) {
  const text = message.trim();
  if (text.length < 2) throw new Error("Scrivi un nome o un incrocio.");
  if (piiBlocksGlobal(text)) throw new Error("Nel messaggio c'è un contatto. Toglilo: la chat non archivia email o telefoni.");
  if (personalMedicalRequest(text)) {
    return {
      intent: "lookup" as const,
      reply: "Non faccio diagnosi, prescrizioni o dosaggi personali. Posso mostrare solo evidenza pubblicata, con popolazione, disegno dello studio, limiti e incertezza.",
      cards: [],
      report: null,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
    };
  }
  const parsed = parseCrossStructure(text);
  if (parsed.kind === "CROSS_REQUEST" && process.env.DATABASE_URL?.trim()) {
    const { predictOnPostgres } = await import("./prediction/postgres-predict.ts");
    const { narrateScientificReport } = await import("./scientific-report.ts");
    const { serverLanguageCredential } = await import("./server-credential.ts");
    const report = await predictOnPostgres(process.env.DATABASE_URL, { parentA: parsed.a, parentB: parsed.b });
    const credential = serverLanguageCredential();
    const narration = await narrateScientificReport(report, fetch, credential.token);
    return {
      intent: "cross" as const,
      reply: narration.text,
      cards: [],
      report,
      narration_status: narration.status,
      language_credential: credential.source === "ABSENT" ? "ABSENT" : "SERVER",
      prediction_probability: null,
      prediction_status: report.data_status,
    };
  }
  const found = await previewKnowledgeRepository().resolveEntity(text);
  if (found.corpus.status !== "CONNECTED") {
    return { intent: "lookup" as const, reply: found.note, cards: [], report: null, prediction_probability: null, prediction_status: "NOT_COMPUTABLE" as const };
  }
  const measurements = await previewKnowledgeRepository().getMeasurements(text);
  const pedigree = await previewKnowledgeRepository().getPedigree(text);
  const claims = await previewKnowledgeRepository().getClaims(text);
  const measured = measurements && typeof measurements === "object" && "measurements" in measurements && Array.isArray(measurements.measurements) ? measurements.measurements.length : 0;
  const edges = pedigree && typeof pedigree === "object" && "edges" in pedigree && Array.isArray(pedigree.edges) ? pedigree.edges.length : 0;
  const claimCount = claims && typeof claims === "object" && "claims" in claims && Array.isArray(claims.claims) ? claims.claims.length : 0;
  const human_report = [
    found.note,
    `Righe trovate: ${found.results.length}. Misure lette: ${measured}. Claim: ${claimCount}. Pedigree riportati: ${edges}.`,
    "Una misura non è una predizione. Un parent riportato non è un genoma. prediction_probability = null. prediction_status = NOT_COMPUTABLE.",
  ].join("\n");
  const { narrateScientificReport } = await import("./scientific-report.ts");
  const { serverLanguageCredential } = await import("./server-credential.ts");
  const credential = serverLanguageCredential();
  const narration = await narrateScientificReport(
    {
      human_report,
      identity_status: found.results[0]?.identity_status ?? "UNKNOWN",
      data_status: "NOT_COMPUTABLE",
      prediction_probability: null,
      calibration_status: "NOT_CALIBRATED",
      measured_row_count: measured,
      pedigree_edge_count: edges,
      claim_count: claimCount,
    },
    fetch,
    credential.token ?? undefined,
  );
  return {
    intent: "lookup" as const,
    reply: narration.status === "NARRATED" ? narration.text : human_report,
    cards: found.results.slice(0, 8).map((hit) => ({
      id: hit.id,
      name: hit.canonical_name,
      breeder: null,
      line: hit.identity_status,
      slot: "name" as const,
    })),
    report: {
      measurements_read: measured,
      pedigree_edges: edges,
      claims: claimCount,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      raw_measurements: "NOT_INCLUDED" as const,
    },
    narration_status: narration.status,
    language_credential: credential.source === "ABSENT" ? "ABSENT" : "SERVER",
    promoted_to_documented_fact: false as const,
    prediction_probability: null,
    prediction_status: "NOT_COMPUTABLE" as const,
  };
}

export async function invokeScientificTool(name: string, args: Record<string, unknown>, userId: string | null) {
  const tool = name.trim();
  if (tool === "search_strains") return strainSearch(String(args.q ?? args.query ?? ""));
  if (tool === "get_strain_knowledge" || tool === "get_strain") {
    const detail = await strainDetail(String(args.id ?? args.strain_id ?? ""));
    return detail ?? { error: "Cultivar assente" };
  }
  if (tool === "get_pedigree") {
    const pedigree = await strainPedigree(String(args.id ?? args.strain_id ?? ""));
    return pedigree ?? { error: "Cultivar assente" };
  }
  if (tool === "search_patterns") return searchPatternLibrary(String(args.q ?? args.query ?? ""));
  if (tool === "search_evidence") return listEvidence(String(args.q ?? args.query ?? ""));
  if (tool === "semantic_search" || tool === "knowledge_query") {
    return tool === "semantic_search"
      ? semanticSearch(String(args.q ?? args.query ?? ""), args)
      : knowledgeQuery(String(args.q ?? args.query ?? ""), args);
  }
  if (tool === "lookup_cache") return lookupScientificCache(parseAnalyze(args));
  if (tool === "breeding_chat" || tool === "retrieve_cross_context") {
    if (typeof args.message === "string" && args.message.trim()) {
      return breedingChat(args.message, {
        parent_a_id: args.parent_a_id ? String(args.parent_a_id) : null,
        parent_b_id: args.parent_b_id ? String(args.parent_b_id) : null,
      });
    }
    const result = await runCross(parseAnalyze(args), null, false);
    return { saved: false, report: result.report };
  }
  if (tool === "save_cross_record" || tool === "create_cross") {
    if (!userId) return { error: "Non autorizzato" };
    return runCross(parseAnalyze(args), userId, true);
  }
  if (tool === "resolve_query" || tool === "research_unknown") {
    return previewKnowledgeRepository().resolveQuery(String(args.q ?? args.query ?? args.message ?? ""));
  }
  if (tool === "get_prediction") {
    return {
      probability: null,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      source: "supabase_postgresql" as const,
      fallback: "NONE" as const,
      stored_as_evidence: false,
    };
  }
  if (tool === "get_snapshot") return knowledgeStatus();
  if (tool === "submit_observation") {
    if (!userId) return { error: "Non autorizzato" };
    const trait = String(args.trait ?? "");
    if (!trait) return { error: "Manca il tratto." };
    return addObservation(userId, {
      prediction_id: args.prediction_id ? String(args.prediction_id) : null,
      trait,
      ordinal: typeof args.ordinal === "number" ? args.ordinal : null,
      note: args.note ? String(args.note) : "",
    });
  }
  if (tool === "get_model_version") return versionInfo();
  if (tool === "get_knowledge_snapshot") return knowledgeStatus();
  return {
    error: "Strumento assente nel core. Il plugin ChatGPT non è un endpoint.",
    tool,
  };
}

export async function knowledgeStatus() {
  const corpus = await previewKnowledgeRepository().availability();
  const version = await versionInfo();
  return {
    ...version,
    snapshot_id: UNIFIED_SNAPSHOT,
    curated_snapshot_id: null,
    persistence: corpus.connected ? "supabase_postgresql" : "NOT_CONFIGURED",
    postgres: corpus.status,
    coverage: {
      laboratory_measurements: corpus.counts?.measurements ?? null,
      strains: corpus.counts?.canonical_entities ?? null,
      pedigree_edges: corpus.counts?.pedigree_edges ?? null,
    },
    excluded_sources: [],
    catalog: null,
    corpus,
    architecture: {
      ...version.architecture,
      note: "La preview e le API di schermata leggono solo Supabase PostgreSQL. Senza DATABASE_URL non aprono SQLite né catalog.json.",
    },
  };
}

export async function exportAccount(userId: string) {
  const sql = await ready();
  const predictions = await sql<{ id: string; report_json: string; created_at: string }>`
    select id, report_json, created_at::text from gg_predictions where user_id = ${userId}`;
  const observations = await sql<{ id: string; scientific_json: string; created_at: string }>`
    select id, scientific_json, created_at::text from gg_observations where user_id = ${userId}`;
  return {
    predictions: predictions.map((p) => ({ id: p.id, created_at: p.created_at, report: parse(p.report_json) })),
    observations: observations.map((o) => ({ id: o.id, created_at: o.created_at, scientific: parse(o.scientific_json) })),
  };
}

export async function deletePrivate(userId: string) {
  const sql = await ready();
  await sql`delete from gg_outcomes where prediction_id in (select id from gg_predictions where user_id = ${userId})`;
  await sql`delete from gg_observations where user_id = ${userId}`;
  await sql`delete from gg_predictions where user_id = ${userId}`;
  await sql`delete from gg_crosses where user_id = ${userId}`;
  await sql`delete from gg_api_keys where user_id = ${userId}`;
  await audit(sql, userId, "privacy_delete", "user", userId, {});
  return { deleted: true };
}

export async function createApiKey(userId: string) {
  const sql = await ready();
  const raw = `gg_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const id = randomUUID();
  await sql`insert into gg_api_keys (id, user_id, prefix, key_hash) values (${id}, ${userId}, ${raw.slice(0, 10)}, ${keyHash})`;
  await audit(sql, userId, "api_key_created", "api_key", id, {});
  return { id, token: raw, prefix: raw.slice(0, 10) };
}

export async function userIdForApiKey(token: string) {
  const sql = await ready();
  const keyHash = createHash("sha256").update(token).digest("hex");
  const rows = await sql<{ user_id: string }>`
    select user_id from gg_api_keys where key_hash = ${keyHash} and revoked_at is null`;
  return rows[0]?.user_id ?? null;
}

const REVIEW_ROLES = new Set(["SCIENTIFIC_REVIEWER", "ADMIN", "SUPER_ADMIN", "DATA_ENGINEER"]);

export async function listModels() {
  return {
    models: [
      {
        model_id: MODEL_ID,
        model_version: MODEL_VERSION,
        engine_version: ENGINE_VERSION,
        schema_version: SCHEMA_VERSION,
        knowledge_snapshot: UNIFIED_SNAPSHOT,
        status: "ACTIVE",
        deterministic: true,
        parameters: { replicates_default: 4000, prng: "mulberry32", embedding: "gg-hashing-trick-v1" },
        training_note: "Nessun fine-tune. Il registro punta allo snapshot di conoscenza e al motore deterministico.",
        replaces: null,
      },
    ],
  };
}

export async function getModel(id: string) {
  const models = (await listModels()).models;
  return models.find((model) => model.model_id === id || model.model_version === id) ?? null;
}

export async function platformMetrics() {
  const sql = await ready();
  const rows = await sql<{
    predictions: number;
    observations: number;
    cache_valid: number;
    cache_invalid: number;
    audit_events: number;
    crosses: number;
  }>`select
      (select count(*)::int from gg_predictions) as predictions,
      (select count(*)::int from gg_observations) as observations,
      (select count(*)::int from gg_cache where invalidation_status = 'valid') as cache_valid,
      (select count(*)::int from gg_cache where invalidation_status <> 'valid') as cache_invalid,
      (select count(*)::int from gg_audit) as audit_events,
      (select count(*)::int from gg_crosses) as crosses`;
  const row = rows[0];
  const hotEntries = hot.size;
  const valid = row?.cache_valid ?? 0;
  const invalid = row?.cache_invalid ?? 0;
  const durable = valid + invalid;
  return {
    model_version: MODEL_VERSION,
    snapshot_id: UNIFIED_SNAPSHOT,
    process_cache_note: `gg_cache vive nel database applicativo e non è la cache scientifica. semantic_cache vale solo per ${UNIFIED_SNAPSHOT}.`,
    predictions: row?.predictions ?? 0,
    observations: row?.observations ?? 0,
    crosses: row?.crosses ?? 0,
    audit_events: row?.audit_events ?? 0,
    cache_valid: valid,
    cache_invalid: invalid,
    hot_cache_entries: hotEntries,
    durable_cache_entries: durable,
    cache_hit_rate: null,
    cache_hit_rate_note: "Il tasso di hit non è inventato: si misura solo quando lookup e miss sono strumentati sulla stessa finestra.",
    redis: "not_configured",
  };
}

export async function semanticSearch(query: string, options?: { limit?: number; kind?: string; subject_id?: string }) {
  const found = await previewKnowledgeRepository().resolveEntity(query);
  return {
    query,
    results: found.results.slice(0, options?.limit ?? 20),
    note: found.note,
    corpus: found.corpus,
    fallback: "NONE" as const,
    source: "supabase_postgresql" as const,
    literature_limit: options?.limit ?? null,
    rule: "La ricerca della Preview legge solo Supabase. Il recupero SQLite non è un risultato production.",
  };
}

export async function knowledgeQuery(query: string, _options?: { limit?: number; kind?: string; subject_id?: string }) {
  const found = await previewKnowledgeRepository().resolveQuery(query);
  return {
    model_version: MODEL_VERSION,
    ...found,
    rule: "Una sola risposta, dal KnowledgeRepository production. Lo store SQLite non risponde a questa route.",
  };
}

export async function searchPatternLibrary(query: string) {
  const stored = await listPatterns();
  const needle = normalizeName(query);
  const patterns = stored.patterns.filter((pattern) => {
    if (!needle) return true;
    return normalizeName(`${pattern.hypothesis} ${pattern.validation_status} ${pattern.pattern_type}`).includes(needle);
  });
  return {
    snapshot_id: stored.snapshot_id,
    patterns,
    fixture_patterns: [],
    fixture_role: "NOT_USED_BY_PREVIEW" as const,
    label_patterns: [],
    corpus: stored.corpus,
    fallback: "NONE" as const,
    rule: "I pattern della Preview arrivano solo da Supabase. Il fixture locale non è lo store.",
  };
}

export async function updatePatternStatus(
  userId: string,
  body: { pattern_id?: string; validation_status?: string; manually_validated?: boolean },
) {
  const sql = await ready();
  const role = await roleOf(sql, userId);
  if (!REVIEW_ROLES.has(role)) return { error: "Non autorizzato" as const };
  const id = String(body.pattern_id ?? "");
  const status = String(body.validation_status ?? "");
  const allowed = new Set(["HYPOTHESIS", "SUPPORTED", "REPLICATED", "STRONGLY_SUPPORTED", "CONTRADICTED", "RETIRED", "SUPERSEDED", "VALIDATED"]);
  if (!allowed.has(status)) return { error: "Stato non riconosciuto" as const };
  const rows = await sql<{ document: string; validation_status: string }>`
    select document, validation_status from gg_patterns where id = ${id}`;
  const row = rows[0];
  if (!row) return { error: "Pattern assente" as const };
  if (status === "VALIDATED" && !body.manually_validated) {
    return { error: "VALIDATED richiede una revisione umana esplicita." as const };
  }
  const current = parse<Record<string, unknown>>(row.document);
  if (status === "VALIDATED") {
    const discovery = Array.isArray(current.discovery_ids) ? current.discovery_ids.map(String) : [];
    const heldOut = Array.isArray(current.validation_ids) ? current.validation_ids.map(String) : [];
    const overlap = discovery.filter((id) => heldOut.includes(id));
    if (!discovery.length || !heldOut.length || overlap.length) {
      return { error: "VALIDATED richiede discovery e validazione disgiunte. Un candidato non si promuove da solo." as const };
    }
  }
  const history = Array.isArray(current.status_history) ? current.status_history : [];
  const next = {
    ...current,
    validation_status: status,
    status_history: [...history, { from: row.validation_status, to: status, at: new Date().toISOString() }],
  };
  await sql`update gg_patterns set validation_status = ${status}, document = ${JSON.stringify(next)} where id = ${id}`;
  memoryKnowledge = null;
  hot.clear();
  await audit(sql, userId, "pattern_status", "pattern", id, { from: row.validation_status, to: status });
  return { id, validation_status: status, previous: row.validation_status };
}

export async function lookupScientificCache(_input: AnalyzeInput) {
  return {
    hit: false,
    cache_key: null,
    model_version: MODEL_VERSION,
    snapshot_id: UNIFIED_SNAPSHOT,
    result: null,
    source: "supabase_postgresql" as const,
    fallback: "NONE" as const,
    role: "NOT_A_SOURCE" as const,
    note: "La cache non è il corpus. Questa route non apre SQLite né catalog.json.",
  };
}

export async function storeScientificCache(input: AnalyzeInput) {
  const result = await runCross(input, null, false);
  return {
    stored: false,
    cache_key: null,
    model_version: MODEL_VERSION,
    snapshot_id: UNIFIED_SNAPSHOT,
    status: result.report.status,
    source: "supabase_postgresql" as const,
    fallback: "NONE" as const,
    note: "Nessuna cache locale viene scritta al posto del corpus production.",
  };
}

export async function invalidateScientificCache(userId: string, reason: string) {
  const sql = await ready();
  const role = await roleOf(sql, userId);
  if (!REVIEW_ROLES.has(role)) return { error: "Non autorizzato" as const };
  await sql`update gg_cache set invalidation_status = 'invalidated' where invalidation_status = 'valid'`;
  hot.clear();
  await audit(sql, userId, "cache_invalidated", "cache", null, { reason: reason.slice(0, 180) });
  return { invalidated: true, retrieval_rows: 0, scientific_store: "NOT_TOUCHED" as const };
}

export async function getOwnedCross(id: string, userId: string) {
  const sql = await ready();
  const rows = await sql<{
    id: string;
    parent_a_query: string;
    parent_b_query: string;
    cross_type: string;
    request_json: string;
    created_at: string;
  }>`select id, parent_a_query, parent_b_query, cross_type, request_json, created_at::text
     from gg_crosses where id = ${id} and user_id = ${userId}`;
  const row = rows[0];
  if (!row) return null;
  const predictions = await sql<{ id: string; model_version: string; created_at: string }>`
    select id, model_version, created_at::text from gg_predictions where cross_id = ${id} and user_id = ${userId}`;
  return {
    id: row.id,
    parent_a: row.parent_a_query,
    parent_b: row.parent_b_query,
    cross_type: row.cross_type,
    request: parse(row.request_json),
    created_at: row.created_at,
    predictions,
  };
}

export async function searchOwnedCrosses(userId: string, query: string) {
  const sql = await ready();
  const rows = await sql<{
    id: string;
    parent_a_query: string;
    parent_b_query: string;
    cross_type: string;
    created_at: string;
  }>`select id, parent_a_query, parent_b_query, cross_type, created_at::text
     from gg_crosses where user_id = ${userId} order by created_at desc limit 50`;
  const needle = normalizeName(query);
  return {
    crosses: rows
      .filter((row) => {
        if (!needle) return true;
        return normalizeName(`${row.parent_a_query} ${row.parent_b_query} ${row.cross_type}`).includes(needle);
      })
      .map((row) => ({
        id: row.id,
        parents: `${row.parent_a_query} × ${row.parent_b_query}`,
        cross_type: row.cross_type,
        created_at: row.created_at,
      })),
  };
}

export async function submitEvidence(
  userId: string,
  body: { title?: string; claim?: string; url?: string },
) {
  const sql = await ready();
  const role = await roleOf(sql, userId);
  if (!REVIEW_ROLES.has(role)) return { error: "Non autorizzato" as const };
  const claim = String(body.claim ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (claim.length < 8 || title.length < 3) return { error: "Servono titolo e affermazione." as const };
  if (piiBlocksGlobal(`${title}\n${claim}\n${body.url ?? ""}`)) {
    return { error: "Dati personali presenti. Ingestione bloccata." as const };
  }
  const id = randomUUID();
  const scientific = {
    title,
    claim,
    url: body.url ? String(body.url) : null,
    claim_class: "USER_PROVIDED_OBSERVATION",
    evidence_level: 1,
    governance_status: "PENDING",
  };
  await sql`insert into gg_global_records (id, kind, scientific_json, governance_status)
    values (${id}, 'evidence', ${JSON.stringify(scientific)}, 'PENDING')`;
  await audit(sql, userId, "evidence_submitted", "global_record", id, { title });
  return { id, governance_status: "PENDING" as const };
}

export async function createUnresolvedStrain(
  userId: string,
  body: { canonical_name?: string; aliases?: string[] },
) {
  const sql = await ready();
  const role = await roleOf(sql, userId);
  if (!REVIEW_ROLES.has(role)) return { error: "Non autorizzato" as const };
  const name = String(body.canonical_name ?? "").trim();
  if (name.length < 2) return { error: "Nome troppo corto." as const };
  const aliases = Array.isArray(body.aliases) ? body.aliases.map((alias) => String(alias).trim()).filter(Boolean).slice(0, 12) : [];
  const norm = normalizeName(name);
  const found = await previewKnowledgeRepository().resolveEntity(name);
  const existing = found.results[0];
  if (existing) {
    return {
      error: "Nome già presente. Nessuna fusione automatica." as const,
      existing_id: existing.id,
      identity_status: existing.identity_status,
    };
  }
  const id = `ggs-unresolved-${randomUUID()}`;
  const strain = {
    id,
    canonical_name: name,
    aliases,
    identity_status: "IDENTITY_UNVERIFIED" as const,
    record_role: "unresolved_submission",
    breeder: null,
    summary: "Sottomissione in revisione. Nessun pedigree e nessun profilo chimico sono stati inventati.",
  };
  await sql`insert into gg_strains (id, canonical_name, name_norm, identity_status, record_role, document)
    values (${id}, ${name}, ${norm}, ${strain.identity_status}, ${strain.record_role}, ${JSON.stringify(strain)})`;
  for (let index = 0; index < aliases.length; index += 1) {
    const alias = aliases[index]!;
    await sql`insert into gg_aliases (id, strain_id, alias, alias_norm)
      values (${`${id}-a${index}`}, ${id}, ${alias}, ${normalizeName(alias)})`;
  }
  memoryKnowledge = null;
  await audit(sql, userId, "strain_unresolved_created", "strain", id, { canonical_name: name });
  return { strain, pedigree: null, chemotype: null };
}

export { canonicalCacheMaterial, cacheKey };
