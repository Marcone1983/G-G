/**
 * One resolver for chat, cultivar search, API and Android.
 * A parsed "A x B" is a request structure, never a pedigree fact.
 * The model is a researcher. It does not become the database.
 */
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { persistCard, researchWithGrok, type Ask, type GrokCard } from "./acquire.ts";
import { parentFacts, refreshQueryCache, searchEntities, storeReady, UNIFIED_SNAPSHOT, type EntityHit } from "./brain.ts";
import { classifyQuery, PARSER_VERSION, refineQueryType, type QueryType } from "./classify.ts";
import { normalizeName } from "./engine.ts";
import { cacheAdmission, classifyProviderFailure } from "./scientific.ts";
import { circuitAllowsCall, circuitRecord } from "./circuit.ts";
import { ResearchMemory } from "./memory.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");
const POLICY = "gg-research-policy-v1";
const PROMPT = "gg-research-prompt-v1";
const MODEL = "grok-4.5";

export type ResolutionCard = {
  id: string;
  name: string;
  breeder: string | null;
  line: string;
  slot: "A" | "B" | "name";
};

export type ResolutionOrigin =
  | "DATABASE"
  | "ACQUIRED"
  | "INSUFFICIENT"
  | "GROK_FAILED"
  | "GROK_UNAVAILABLE"
  | "GROK_BLOCKED"
  | "IGNORED"
  | "RESEARCH_IN_PROGRESS"
  | "RESEARCH_MEMORY";

export type Resolution = {
  query: string;
  normalized_query: string;
  query_kind: "ENTITY" | "CROSS_REQUEST" | "COMBINATION";
  query_type: QueryType;
  parser_version: typeof PARSER_VERSION;
  parser_confidence: null;
  score_kind: "NOT_A_PROBABILITY";
  origin: ResolutionOrigin;
  grok_called: boolean;
  resolution_status: string;
  research_id: string | null;
  research_status: string | null;
  cross_id: number | null;
  relationship_status: string | null;
  snapshot_id: string;
  revision_id: number | null;
  stages: string[];
  answer: string;
  cards: ResolutionCard[];
  prediction_probability: null;
  prediction_status: "NOT_COMPUTABLE";
  genomics: "NOT_AVAILABLE";
};

type CrossParse =
  | { kind: "CROSS_REQUEST"; a: string; b: string; parents: string[]; marker: string; query_type: QueryType }
  | { kind: "COMBINATION"; terms: [string, string]; query_type: "COMBINATION_QUERY" }
  | { kind: "ENTITY"; query_type: QueryType };

export function parseCrossStructure(query: string): CrossParse {
  const classified = classifyQuery(query);
  if (classified.query_type === "COMBINATION_QUERY" && classified.parents.length === 2) {
    return { kind: "COMBINATION", terms: [classified.parents[0]!, classified.parents[1]!], query_type: "COMBINATION_QUERY" };
  }
  if (classified.parents.length >= 2 && classified.query_type !== "COMBINATION_QUERY") {
    return {
      kind: "CROSS_REQUEST",
      a: classified.parents[0]!,
      b: classified.parents[1]!,
      parents: classified.parents,
      marker: classified.marker ?? "x",
      query_type: classified.query_type,
    };
  }
  return { kind: "ENTITY", query_type: classified.query_type };
}

export function httpStatusForResolution(status: string, origin: string): number {
  if (status === "RESEARCH_IN_PROGRESS" || origin === "RESEARCH_IN_PROGRESS") return 202;
  if (status === "INVALID_PROVIDER_RESPONSE") return 422;
  if (status === "BLOCKED" || origin === "GROK_UNAVAILABLE" || origin === "GROK_BLOCKED") return 503;
  if (status === "RESEARCH_FAILED" || status === "REJECTED" || origin === "GROK_FAILED") return 502;
  return 200;
}

const pending = new Map<string, Promise<Resolution>>();
let schemaReady = false;

function researchKey(norm: string): string {
  return createHash("sha256").update(`${norm}|${POLICY}`).digest("hex");
}

function open(readonly = false) {
  const db = new DatabaseSync(dbPath, { readOnly: readonly });
  db.exec("pragma busy_timeout = 5000");
  return db;
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

export function ensureResearchSchema() {
  if (schemaReady) return;
  const db = open(false);
  try {
    db.exec(`
      create table if not exists research_events (
        id text primary key,
        research_key text not null,
        query text not null,
        normalized_query text not null,
        query_kind text not null,
        started_at text not null,
        completed_at text,
        model text,
        prompt_version text not null,
        policy_version text not null,
        search_strategy text not null,
        status text not null,
        sources_consulted integer not null default 0,
        sources_accepted integer not null default 0,
        sources_rejected integer not null default 0,
        claims_extracted integer not null default 0,
        claims_rejected integer not null default 0,
        final_resolution text,
        snapshot_before text not null,
        snapshot_after text,
        write_status text,
        error_status text,
        grok_called integer not null default 0,
        result_json text
      );
      create table if not exists research_locks (
        research_key text primary key,
        owner text not null,
        created_at text not null
      );
      create table if not exists knowledge_crosses (
        id integer primary key,
        cross_key text not null unique,
        query_name text not null,
        normalized_name text not null,
        status text not null,
        relationship_status text not null,
        origin text not null,
        source_class text not null,
        research_id text,
        snapshot_id text not null,
        note text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists knowledge_cross_parents (
        id integer primary key,
        cross_id integer not null,
        parent_query text not null,
        parent_norm text not null,
        parent_role text not null,
        parent_entity_ref text,
        resolution_status text not null,
        relationship_status text not null,
        evidence_basis text not null,
        note text not null
      );
      create table if not exists knowledge_audit (
        id integer primary key,
        action text not null,
        subject text not null,
        meta_json text not null,
        created_at text not null
      );
      create table if not exists knowledge_revisions (
        id integer primary key,
        reason text not null,
        research_id text,
        snapshot_id text not null,
        created_at text not null
      );
      create index if not exists idx_research_norm on research_events(normalized_query);
      create index if not exists idx_research_key on research_events(research_key);
      create index if not exists idx_kcross_norm on knowledge_crosses(normalized_name);
      create index if not exists idx_kcross_parents on knowledge_cross_parents(cross_id);
    `);
    if (!columnExists(db, "knowledge_cross_parents", "position")) {
      db.exec("alter table knowledge_cross_parents add column position integer");
    }
    if (!columnExists(db, "research_events", "query_type")) {
      db.exec("alter table research_events add column query_type text");
    }
    const hasAcquired = db.prepare("select name from sqlite_master where type = 'table' and name = 'acquired_entities'").get() as { name: string } | undefined;
    if (hasAcquired && !columnExists(db, "acquired_entities", "origin")) db.exec("alter table acquired_entities add column origin text");
    if (hasAcquired && !columnExists(db, "acquired_entities", "research_id")) db.exec("alter table acquired_entities add column research_id text");
    const hasAliases = db.prepare("select name from sqlite_master where type = 'table' and name = 'acquired_aliases'").get() as { name: string } | undefined;
    if (hasAliases && !columnExists(db, "acquired_aliases", "alias_status")) db.exec("alter table acquired_aliases add column alias_status text");
    schemaReady = true;
  } finally {
    db.close();
  }
}

function labelRows(norm: string): number {
  if (!storeReady()) return 0;
  const db = open(true);
  try {
    const row = db.prepare("select count(*) as n from source_records where name_norm = ?").get(norm) as { n: number };
    return Number(row.n ?? 0);
  } finally {
    db.close();
  }
}

type Stored = {
  sufficient: boolean;
  research_id: string | null;
  research_status: string | null;
  research_error: string | null;
  cross_id: number | null;
  relationship_status: string | null;
  revision_id: number | null;
  hits: EntityHit[];
};

function readStored(norm: string, key: string, parsed: CrossParse): Stored {
  ensureResearchSchema();
  const hits = searchEntities(norm.length >= 2 ? displayFromNorm(norm) : "");
  const exactHits = searchEntitiesByNorm(norm);
  const db = open(true);
  try {
    const research = db
      .prepare(
        `select id, status, error_status, completed_at from research_events
         where research_key = ? and status != 'RESEARCH_IN_PROGRESS'
         order by started_at desc limit 1`,
      )
      .get(key) as { id: string; status: string; error_status: string | null; completed_at: string | null } | undefined;
    const cross = db
      .prepare("select id, relationship_status, research_id from knowledge_crosses where normalized_name = ?")
      .get(norm) as { id: number; relationship_status: string; research_id: string | null } | undefined;
    const revision = db
      .prepare("select id from knowledge_revisions where research_id = ? order by id desc limit 1")
      .get(research?.id ?? cross?.research_id ?? "") as { id: number } | undefined;
    const fullNameKnown = exactHits.length > 0 || (parsed.kind === "ENTITY" && labelRows(norm) > 0);
    const admission = cacheAdmission(research?.status ?? "");
    const researchTerminal = admission === "ADMIT" || admission === "TTL";
    const held = providerHold(research);
    const sufficient = parsed.kind === "CROSS_REQUEST" ? fullNameKnown || researchTerminal || held : fullNameKnown || researchTerminal || held;
    return {
      sufficient,
      research_id: research?.id ?? cross?.research_id ?? null,
      research_status: research?.status ?? null,
      research_error: research?.error_status ?? null,
      cross_id: cross?.id ?? null,
      relationship_status: cross?.relationship_status ?? null,
      revision_id: revision?.id ?? null,
      hits: exactHits.length ? exactHits : hits,
    };
  } finally {
    db.close();
  }
}

function searchEntitiesByNorm(norm: string): EntityHit[] {
  if (!norm) return [];
  return searchEntities(norm).filter((hit) => normalizeName(hit.canonical_name) === norm || hit.match_kind === "ALIAS" || hit.match_kind === "EXACT");
}

function displayFromNorm(norm: string): string {
  return norm;
}

function providerHold(research: { status: string; error_status: string | null; completed_at: string | null } | undefined): boolean {
  if (!research) return false;
  if (research.status === "BLOCKED") {
    const at = Date.parse(research.completed_at ?? "");
    return Number.isFinite(at) && Date.now() - at < 30 * 60 * 1000;
  }
  if (research.status !== "FAILED" && research.status !== "UNAVAILABLE") return false;
  if (!/spending-limit|403|429|NO_MODEL|credit/i.test(research.error_status ?? "")) return false;
  const at = Date.parse(research.completed_at ?? "");
  return Number.isFinite(at) && Date.now() - at < 30 * 60 * 1000;
}

export function rankCandidates(query: string, hits: EntityHit[]): EntityHit[] {
  const plus = /\+/.test(query);
  const score = (hit: EntityHit) => {
    const hasPlus = /\+/.test(hit.canonical_name);
    const mark = plus === hasPlus ? 0 : 1;
    const alias = hit.match_kind === "ALIAS" ? 1 : 0;
    return mark * 10 + alias;
  };
  return [...hits].sort((a, b) => score(a) - score(b) || a.canonical_name.localeCompare(b.canonical_name) || (a.breeder ?? "").localeCompare(b.breeder ?? ""));
}

export function candidateLine(query: string, hit: EntityHit): string {
  const plusQuery = /\+/.test(query);
  const plusName = /\+/.test(hit.canonical_name);
  const who = hit.breeder ? `Breeder dichiarato: ${hit.breeder}.` : "Breeder non dichiarato.";
  if (plusQuery && !plusName) {
    return `${who} Il «+» della richiesta non c'è in questo nome: collide solo perché la normalizzazione lo toglie. Non è la stessa scheda.`;
  }
  if (plusQuery && plusName) {
    return `${who} Il «+» resta nel nome. ${hit.match_kind === "ALIAS" ? "Entrata da un alias." : "Match sul nome."} Più breeder restano schede distinte.`;
  }
  if (hit.match_kind === "ALIAS") return `${who} Trovata da un alias, non da un'identità unica.`;
  return `${who} Match sul nome già in archivio. Non è una fusione e non è un genotipo.`;
}

function candidatesFor(name: string): EntityHit[] {
  return rankCandidates(name, searchEntities(name)).slice(0, 4);
}

function researchSentence(status: string | null, error: string | null): string | null {
  if (status === "INSUFFICIENT_EVIDENCE") {
    return "La ricerca esterna non ha trovato una fonte utilizzabile. Non ho creato un'identità e non ho inventato chimica.";
  }
  if (status === "BLOCKED") {
    return "I nomi già presenti restano schede locali. La combinazione richiesta non è verificata nello store scientifico. La ricerca esterna è stata tentata ma il provider non è disponibile (credito o accesso). Non ho fabbricato pedigree, chimica o una probabilità.";
  }
  if (status === "FAILED" || status === "UNAVAILABLE") {
    if (/spending-limit|403|429|credit/i.test(error ?? "")) {
      return "I nomi già presenti restano schede locali. La combinazione richiesta non è verificata nello store scientifico. La ricerca esterna è stata tentata ma il provider non è disponibile (credito o accesso). Non ho fabbricato pedigree, chimica o una probabilità.";
    }
    if (status === "UNAVAILABLE") return "La ricerca esterna non è disponibile. Non ho inventato dati.";
    return "La ricerca esterna non ha risposto. Il tentativo resta registrato e si può riprovare. Non ho inventato dati.";
  }
  return null;
}

function sideParagraph(role: string, name: string): string {
  const all = rankCandidates(name, searchEntities(name));
  const hits = all.slice(0, 4);
  let rows = 0;
  try {
    rows = parentFacts(name)?.source_rows ?? 0;
  } catch {
    rows = 0;
  }
  if (!hits.length && rows === 0) {
    return `Lato ${role}, «${name}»: niente in archivio. Non creo una cultivar solo perché il nome compare nella frase.`;
  }
  const list = hits.map((hit) => `${hit.canonical_name}${hit.breeder ? ` (${hit.breeder})` : ""}`).join("; ");
  const shownWithoutMark = /\+/.test(name) && hits.some((hit) => !/\+/.test(hit.canonical_name));
  const buried = /\+/.test(name) ? all.slice(hits.length).filter((hit) => !/\+/.test(hit.canonical_name)).length : 0;
  const rowsText = rows > 0 ? ` Ci sono anche ${rows} righe di laboratorio con questo testo: sono etichette, non l'incrocio.` : "";
  const buriedText = buried > 0 ? ` Altre schede senza «+» restano fuori da questa lista: non sono il nome che hai scritto.` : "";
  return `Lato ${role}, «${name}»: ${hits.length} ${hits.length === 1 ? "candidato" : "candidati"} in primo piano. ${list}.${hits.length > 1 ? " Non li fondo." : " Un candidato solo non dichiara il pedigree."}${shownWithoutMark ? " Quelle senza «+» non sono il nome che hai scritto." : ""}${buriedText}${rowsText}`;
}

function parentRef(hits: EntityHit[]): { status: string; ref: string | null } {
  if (hits.length === 0) return { status: "UNKNOWN_ENTITY", ref: null };
  if (hits.length === 1) return { status: "LOCAL_CANDIDATE", ref: hits[0]!.id };
  return { status: "IDENTITY_UNRESOLVED", ref: null };
}

function buildAnswer(input: {
  query: string;
  norm: string;
  parsed: CrossParse;
  origin: ResolutionOrigin;
  status: string;
  researchStatus: string | null;
  researchError: string | null;
}): string {
  const external = researchSentence(input.researchStatus, input.researchError);
  if (input.parsed.kind === "COMBINATION") {
    const [left, right] = input.parsed.terms;
    return [
      `«${input.query}» è una combinazione scritta con «+». Non è la prova di un incrocio e non creo un pedigree.`,
      sideParagraph("1", left),
      sideParagraph("2", right),
      external ?? "Non calcolo una probabilità e non ricavo chimica da questi due nomi.",
    ].join("\n\n");
  }
  if (input.parsed.kind === "CROSS_REQUEST") {
    const lines = [
      `Ho letto «${input.query}» come richiesta di incrocio tra ${input.parsed.parents.map((name) => `«${name}»`).join(" e ")}. Il segno in mezzo non dimostra che siano parent.`,
    ];
    input.parsed.parents.forEach((name, index) => {
      const role = index === 0 ? "A" : index === 1 ? "B" : String(index + 1);
      lines.push(sideParagraph(role, name));
    });
    lines.push("L'incrocio, come nome unico, non ha una scheda misurata. Non ricavo chimica, terpeni o antociani dai parent, non ho genomica e non calcolo una probabilità.");
    if (external) lines.push(external);
    else if (input.origin === "DATABASE" && !input.researchStatus) {
      lines.push("Non ho chiamato il modello: i nomi erano già nello store. L'incrocio comunque non diventa un fatto.");
    }
    lines.push("Fissa una scheda per lato. Stesso nome e breeder diverso restano schede separate.");
    return lines.join("\n\n");
  }
  const local = candidatesFor(input.query);
  const lines: string[] = [];
  if (!local.length && labelRows(input.norm) === 0) {
    lines.push(`«${input.query}» non ha una scheda locale.`);
  } else if (local.length) {
    const dropped = /\+/.test(input.query) && local.some((hit) => !/\+/.test(hit.canonical_name));
    lines.push(
      `«${input.query}» è già nello store: ${local.map((hit) => `${hit.canonical_name}${hit.breeder ? ` (${hit.breeder})` : ""}`).join("; ")}. ${local.length > 1 ? "Non scelgo io tra gli omonimi." : "Non la promuovo a identità genetica."}${dropped ? " Le schede senza «+» non sono il nome che hai scritto." : ""}`,
    );
  } else {
    lines.push(`«${input.query}» ha etichette di laboratorio, non una scheda di cultivar unica.`);
  }
  if (external) lines.push(external);
  lines.push("Niente chimica inventata, niente genomica, niente probabilità.");
  return lines.join("\n\n");
}

function cardsFor(query: string, parsed: CrossParse, hits: EntityHit[]): ResolutionCard[] {
  if (parsed.kind === "COMBINATION") {
    return parsed.terms.flatMap((name, index) =>
      candidatesFor(name).map((hit) => ({
        id: hit.id,
        name: hit.canonical_name,
        breeder: hit.breeder,
        line: `Termine ${index + 1}. ${candidateLine(name, hit)} Il «+» non lo rende un parent.`,
        slot: "name" as const,
      })),
    );
  }
  if (parsed.kind === "CROSS_REQUEST") {
    const cards: ResolutionCard[] = [];
    parsed.parents.forEach((name, index) => {
      const role = index === 0 ? "A" : index === 1 ? "B" : "name";
      const label = index === 0 ? "A" : index === 1 ? "B" : String(index + 1);
      for (const hit of candidatesFor(name)) {
        cards.push({
          id: hit.id,
          name: hit.canonical_name,
          breeder: hit.breeder,
          line: `Lato ${label}. ${candidateLine(name, hit)}`,
          slot: role,
        });
      }
    });
    return cards;
  }
  return rankCandidates(query, hits)
    .slice(0, 8)
    .map((hit) => ({
      id: hit.id,
      name: hit.canonical_name,
      breeder: hit.breeder,
      line: candidateLine(query, hit),
      slot: "name" as const,
    }));
}

function pack(input: {
  query: string;
  norm: string;
  parsed: CrossParse;
  origin: ResolutionOrigin;
  grokCalled: boolean;
  status: string;
  stored: Stored;
  stages: string[];
}): Resolution {
  return {
    query: input.query,
    normalized_query: input.norm,
    query_kind: input.parsed.kind,
    query_type: refineQueryType(input.parsed.query_type, input.stored.hits),
    parser_version: PARSER_VERSION,
    parser_confidence: null,
    score_kind: "NOT_A_PROBABILITY",
    origin: input.origin,
    grok_called: input.grokCalled,
    resolution_status: input.status,
    research_id: input.stored.research_id,
    research_status: input.stored.research_status,
    cross_id: input.stored.cross_id,
    relationship_status: input.stored.relationship_status,
    snapshot_id: UNIFIED_SNAPSHOT,
    revision_id: input.stored.revision_id,
    stages: input.stages,
    answer: buildAnswer({
      query: input.query,
      norm: input.norm,
      parsed: input.parsed,
      origin: input.origin,
      status: input.status,
      researchStatus: input.stored.research_status,
      researchError: input.stored.research_error,
    }),
    cards: cardsFor(input.query, input.parsed, input.stored.hits),
    prediction_probability: null,
    prediction_status: "NOT_COMPUTABLE",
    cache_hit: !input.grokCalled && (input.origin === "DATABASE" || input.origin === "RESEARCH_MEMORY"),
    provider_called: input.grokCalled,
    knowledge_status: input.status === "BLOCKED" || input.status === "RESEARCH_FAILED" || input.status === "INVALID_PROVIDER_RESPONSE" ? null : input.grokCalled ? "UNVERIFIED_AI_RESEARCH" : "CORPUS",
    source: input.grokCalled ? "PROVIDER" : "MEMORY",
    genomics: "NOT_AVAILABLE",
  };
}

function localStatus(stored: Stored, parsed: CrossParse): string {
  if (stored.research_status === "BLOCKED") return "BLOCKED";
  if (stored.research_status === "FAILED" || stored.research_status === "UNAVAILABLE") return "RESEARCH_FAILED";
  if (parsed.kind === "CROSS_REQUEST" && (stored.research_status === "COMPLETED" || stored.research_status === "INSUFFICIENT_EVIDENCE")) {
    return stored.research_status === "INSUFFICIENT_EVIDENCE" ? "NOT_ENOUGH_EVIDENCE" : "IDENTITY_UNRESOLVED";
  }
  if (stored.hits.length > 1) return "IDENTITY_UNRESOLVED";
  if (stored.hits.length === 1) return stored.hits[0]!.identity_status || "LOCAL_HIT";
  if (stored.sufficient) return "LOCAL_LABELS";
  return "UNKNOWN_ENTITY";
}

function takeLock(key: string): boolean {
  const db = open(false);
  try {
    const stale = new Date(Date.now() - 180_000).toISOString();
    db.prepare("delete from research_locks where research_key = ? and created_at < ?").run(key, stale);
    db.prepare("insert into research_locks (research_key, owner, created_at) values (?, ?, ?)").run(key, randomUUID(), new Date().toISOString());
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function releaseLock(key: string) {
  const db = open(false);
  try {
    db.prepare("delete from research_locks where research_key = ?").run(key);
  } finally {
    db.close();
  }
}

function audit(action: string, subject: string, meta: Record<string, unknown>) {
  const db = open(false);
  try {
    db.prepare("insert into knowledge_audit (action, subject, meta_json, created_at) values (?, ?, ?, ?)").run(
      action,
      subject,
      JSON.stringify(meta).slice(0, 2000),
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

function writeCross(query: string, norm: string, parsed: Extract<CrossParse, { kind: "CROSS_REQUEST" }>, researchId: string, relationship: string, note: string) {
  const now = new Date().toISOString();
  const db = open(false);
  try {
    db.prepare(
      `insert into knowledge_crosses
       (cross_key, query_name, normalized_name, status, relationship_status, origin, source_class, research_id, snapshot_id, note, created_at, updated_at)
       values (?, ?, ?, 'UNRESOLVED', ?, 'AI_RESEARCH', 'UNVERIFIED', ?, ?, ?, ?, ?)
       on conflict(cross_key) do update set
         relationship_status = excluded.relationship_status,
         research_id = excluded.research_id,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    ).run(`cross|${norm}`, query, norm, relationship, researchId, UNIFIED_SNAPSHOT, note, now, now);
    const row = db.prepare("select id from knowledge_crosses where cross_key = ?").get(`cross|${norm}`) as { id: number };
    db.prepare("delete from knowledge_cross_parents where cross_id = ?").run(row.id);
    const parents = parsed.parents;
    const insert = db.prepare(
      `insert into knowledge_cross_parents
       (cross_id, parent_query, parent_norm, parent_role, parent_entity_ref, resolution_status, relationship_status, evidence_basis, note, position)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [index, name] of parents.entries()) {
      const hits = searchEntities(name);
      const ref = parentRef(hits);
      const role = index === 0 ? "A" : index === 1 ? "B" : `P${index + 1}`;
      insert.run(
        row.id,
        name,
        normalizeName(name),
        role,
        ref.ref,
        ref.status,
        relationship,
        relationship === "REPORTED" ? "MODEL_REPORTED" : "QUERY_PARSE",
        relationship === "REPORTED"
          ? "Il modello ha riportato l'incrocio. Non è una fonte primaria e non è genomica."
          : "Ipotesi di parse della query. Non è un parent verificato.",
        index + 1,
      );
    }
    return row.id;
  } finally {
    db.close();
  }
}

function startEvent(query: string, norm: string, key: string, parsed: CrossParse, stages: string[]): string {
  const id = randomUUID();
  const db = open(false);
  try {
    db.prepare(
      `insert into research_events
       (id, research_key, query, normalized_query, query_kind, query_type, started_at, prompt_version, policy_version, search_strategy, status, snapshot_before, grok_called)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESEARCH_IN_PROGRESS', ?, 0)`,
    ).run(id, key, query, norm, parsed.kind, parsed.query_type, new Date().toISOString(), PROMPT, POLICY, stages.join(" > "), UNIFIED_SNAPSHOT);
    audit("RESEARCH_STARTED", id, { query, normalized_query: norm });
    return id;
  } finally {
    db.close();
  }
}

function finishEvent(id: string, patch: {
  status: string;
  grokCalled: boolean;
  error?: string | null;
  result?: unknown;
  claimsExtracted: number;
  claimsRejected: number;
  writeStatus: string;
  resolution: string;
}) {
  const db = open(false);
  try {
    const revision = db
      .prepare("insert into knowledge_revisions (reason, research_id, snapshot_id, created_at) values (?, ?, ?, ?)")
      .run(patch.status, id, UNIFIED_SNAPSHOT, new Date().toISOString());
    db.prepare(
      `update research_events set
         completed_at = ?, model = ?, status = ?, grok_called = ?, error_status = ?, result_json = ?,
         claims_extracted = ?, claims_rejected = ?, sources_consulted = 0, sources_accepted = 0, sources_rejected = 0,
         final_resolution = ?, snapshot_after = ?, write_status = ?
       where id = ?`,
    ).run(
      new Date().toISOString(),
      patch.grokCalled ? MODEL : null,
      patch.status,
      patch.grokCalled ? 1 : 0,
      patch.error ?? null,
      patch.result ? JSON.stringify(patch.result).slice(0, 4000) : null,
      patch.claimsExtracted,
      patch.claimsRejected,
      patch.resolution,
      UNIFIED_SNAPSHOT,
      patch.writeStatus,
      id,
    );
    audit(patch.status === "BLOCKED" ? "RESEARCH_BLOCKED" : patch.status === "FAILED" || patch.status === "UNAVAILABLE" ? "RESEARCH_FAILED" : "RESEARCH_COMPLETED", id, {
      status: patch.status,
      revision_id: Number(revision.lastInsertRowid),
    });
    return Number(revision.lastInsertRowid);
  } finally {
    db.close();
  }
}

async function research(query: string, norm: string, key: string, parsed: CrossParse, ask: Ask): Promise<Resolution> {
  const stages = [
    "NORMALIZE",
    "EXACT",
    "ALIAS",
    "CROSS_PARSE",
    "PARENT_LOCAL",
    "RESEARCH",
  ];
  if (!takeLock(key)) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const stored = readStored(norm, key, parsed);
      if (stored.sufficient) {
        return pack({
          query,
          norm,
          parsed,
          origin: "DATABASE",
          grokCalled: false,
          status: localStatus(stored, parsed),
          stored,
          stages: [...stages.slice(0, 5), "WAITED_FOR_LOCK", "RE-READ"],
        });
      }
    }
    const stored = readStored(norm, key, parsed);
    return pack({
      query,
      norm,
      parsed,
      origin: "RESEARCH_IN_PROGRESS",
      grokCalled: false,
      status: "RESEARCH_IN_PROGRESS",
      stored,
      stages: [...stages, "LOCK_HELD"],
    });
  }
  const eventId = startEvent(query, norm, key, parsed, stages);
  try {
    const again = readStored(norm, key, parsed);
    if (again.sufficient) {
      finishEvent(eventId, {
        status: "COMPLETED",
        grokCalled: false,
        claimsExtracted: 0,
        claimsRejected: 0,
        writeStatus: "SKIPPED_BECAME_LOCAL",
        resolution: localStatus(again, parsed),
      });
      return pack({
        query,
        norm,
        parsed,
        origin: "DATABASE",
        grokCalled: false,
        status: localStatus(again, parsed),
        stored: readStored(norm, key, parsed),
        stages: [...stages.slice(0, 5), "RE-READ"],
      });
    }
    let card: GrokCard | null;
    const memory = ResearchMemory.devFile();
    const liveProvider = ask === researchWithGrok;
    const circuit = liveProvider ? circuitAllowsCall() : { allow: true, state: "CLOSED" as const };
    if (!circuit.allow) {
      finishEvent(eventId, {
        status: "BLOCKED",
        grokCalled: false,
        error: "CIRCUIT_OPEN",
        claimsExtracted: 0,
        claimsRejected: 0,
        writeStatus: "NOT_ATTEMPTED",
        resolution: "BLOCKED",
      });
      return pack({
        query,
        norm,
        parsed,
        origin: "GROK_BLOCKED",
        grokCalled: false,
        status: "BLOCKED",
        stored: readStored(norm, key, parsed),
        stages: [...stages, "CIRCUIT_OPEN"],
      });
    }
    try {
      card = await ask(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : "research failed";
      const failure = classifyProviderFailure(message);
      const blocked = failure === "BLOCKED";
      if (blocked) circuitRecord("BLOCKED");
      if (parsed.kind === "CROSS_REQUEST") {
        writeCross(query, norm, parsed, eventId, "UNVERIFIED", blocked ? "Provider bloccato. Nessun pedigree inventato." : "Ricerca fallita. La richiesta resta irrisolta. Nessun pedigree inventato.");
      }
      finishEvent(eventId, {
        status: failure,
        grokCalled: true,
        error: message.slice(0, 300),
        claimsExtracted: 0,
        claimsRejected: 0,
        writeStatus: "ATTEMPT_ONLY",
        resolution: failure,
      });
      return pack({
        query,
        norm,
        parsed,
        origin: blocked ? "GROK_BLOCKED" : "GROK_FAILED",
        grokCalled: true,
        status: failure === "BLOCKED" ? "BLOCKED" : failure === "INVALID_PROVIDER_RESPONSE" ? "INVALID_PROVIDER_RESPONSE" : "RESEARCH_FAILED",
        stored: readStored(norm, key, parsed),
        stages: [...stages, "WRITE", "RE-READ"],
      });
    }
    if (!card) {
      if (parsed.kind === "CROSS_REQUEST") {
        writeCross(query, norm, parsed, eventId, "UNVERIFIED", "Ricerca non disponibile. Nessun dato inventato.");
      }
      finishEvent(eventId, {
        status: "UNAVAILABLE",
        grokCalled: false,
        error: "NO_MODEL_ENDPOINT",
        claimsExtracted: 0,
        claimsRejected: 0,
        writeStatus: "ATTEMPT_ONLY",
        resolution: "RESEARCH_FAILED",
      });
      return pack({
        query,
        norm,
        parsed,
        origin: "GROK_UNAVAILABLE",
        grokCalled: false,
        status: "RESEARCH_FAILED",
        stored: readStored(norm, key, parsed),
        stages: [...stages, "WRITE", "RE-READ"],
      });
    }
    const documented = parsed.kind === "CROSS_REQUEST" && card.cross_documented;
    const rejectedParents = !card.known || (parsed.kind === "CROSS_REQUEST" && !documented) ? card.reported_parents.length : 0;
    const storable: GrokCard = {
      ...card,
      reported_parents: card.known && (parsed.kind === "ENTITY" || documented) ? card.reported_parents : [],
    };
    let writeStatus = "NO_ENTITY";
    if (card.known) {
      circuitRecord("SUCCESS");
      const entityId = persistCard(query, storable, MODEL);
      const db = open(false);
      try {
        db.prepare("update acquired_entities set origin = 'AI_RESEARCH', research_id = ? where id = ?").run(eventId, entityId);
        db.prepare("update acquired_aliases set alias_status = 'REPORTED' where entity_id = ? and alias_status is null").run(entityId);
      } finally {
        db.close();
      }
      writeStatus = "ENTITY_REPORTED";
      audit("ENTITY_CREATED", `acquired:${entityId}`, { research_id: eventId, identity_status: "UNRESOLVED", origin: "AI_RESEARCH" });
    }
    try {
      memory.writeSuccess({
        raw: query,
        snapshotId: UNIFIED_SNAPSHOT,
        providerName: "TEST_OR_CONFIGURED_PROVIDER",
        model: MODEL,
        response: JSON.stringify({ known: Boolean(card.known), query, cross_documented: Boolean(card.cross_documented) }),
        requestId: eventId,
        scope: "GLOBAL_RESEARCH",
        ownerId: null,
      });
    } catch {
      /* The research event remains the audit row. A memory reread failure must not invent corpus rows. */
    }
    if (parsed.kind === "CROSS_REQUEST") {
      const crossId = writeCross(
        query,
        norm,
        parsed,
        eventId,
        documented ? "REPORTED" : "UNVERIFIED",
        documented
          ? "Il modello riporta l'incrocio. Classe REPORTED, fonte UNVERIFIED. Non è VALIDATED e non è genomica."
          : "Nessuna documentazione accettata. La combinazione resta una richiesta irrisolta.",
      );
      audit("PEDIGREE_ADDED", `cross:${crossId}`, { relationship_status: documented ? "REPORTED" : "UNVERIFIED", evidence_basis: documented ? "MODEL_REPORTED" : "QUERY_PARSE" });
      writeStatus = card.known ? "ENTITY_AND_CROSS" : "CROSS_REQUEST_ONLY";
    }
    const finalStatus = card.known ? "COMPLETED" : "INSUFFICIENT_EVIDENCE";
    finishEvent(eventId, {
      status: finalStatus,
      grokCalled: true,
      result: storable,
      claimsExtracted: card.known ? 1 : 0,
      claimsRejected: rejectedParents,
      writeStatus,
      resolution: card.known ? "IDENTITY_UNRESOLVED" : "NOT_ENOUGH_EVIDENCE",
    });
    try {
      refreshQueryCache(query);
    } catch {
      audit("CACHE_INVALIDATED", eventId, { reason: "refresh_failed_store_remains_source" });
    }
    const stored = readStored(norm, key, parsed);
    return pack({
      query,
      norm,
      parsed,
      origin: card.known ? "ACQUIRED" : "INSUFFICIENT",
      grokCalled: true,
      status: card.known ? "IDENTITY_UNRESOLVED" : "NOT_ENOUGH_EVIDENCE",
      stored,
      stages: [...stages, "WRITE", "RE-READ"],
    });
  } finally {
    releaseLock(key);
  }
}

export function resolveQuery(query: string, ask?: Ask): Promise<Resolution> {
  const text = query.trim();
  const norm = normalizeName(text);
  const parsed = parseCrossStructure(text);
  if (norm.length < 2) {
    return Promise.resolve(
      pack({
        query: text,
        norm,
        parsed,
        origin: "IGNORED",
        grokCalled: false,
        status: "UNKNOWN_ENTITY",
        stored: { sufficient: false, research_id: null, research_status: null, research_error: null, cross_id: null, relationship_status: null, revision_id: null, hits: [] },
        stages: ["NORMALIZE", "REJECT_TOO_SHORT"],
      }),
    );
  }
  const key = researchKey(norm);
  const running = pending.get(key);
  if (running) return running;
  const job = (async () => {
    const stages = ["NORMALIZE", "EXACT", "ALIAS", "CROSS_PARSE", "PARENT_LOCAL"];
    const stored = readStored(norm, key, parsed);
    if (stored.sufficient) {
      return pack({
        query: text,
        norm,
        parsed,
        origin: "DATABASE",
        grokCalled: false,
        status: localStatus(stored, parsed),
        stored,
        stages: [...stages, "RE-READ"],
      });
    }
    return research(text, norm, key, parsed, ask ?? researchWithGrok);
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

export function readResearch(id: string) {
  ensureResearchSchema();
  const db = open(true);
  try {
    return db.prepare("select * from research_events where id = ?").get(id) ?? null;
  } finally {
    db.close();
  }
}

export function listKnowledgeEvents(limit = 20) {
  ensureResearchSchema();
  const db = open(true);
  try {
    const cap = Math.max(1, Math.min(50, limit));
    return db
      .prepare(
        `select id, query, normalized_query, query_kind, status, started_at, completed_at, grok_called, final_resolution, write_status, snapshot_before, snapshot_after
         from research_events order by started_at desc limit ?`,
      )
      .all(cap);
  } finally {
    db.close();
  }
}

export function loadCrossDetail(id: string) {
  const raw = id.startsWith("cross:") ? id.slice("cross:".length) : id;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric)) return null;
  ensureResearchSchema();
  const db = open(true);
  try {
    const cross = db.prepare("select * from knowledge_crosses where id = ?").get(numeric) as
      | {
          id: number;
          query_name: string;
          status: string;
          relationship_status: string;
          origin: string;
          source_class: string;
          research_id: string | null;
          note: string;
          snapshot_id: string;
        }
      | undefined;
    if (!cross) return null;
    const parents = db.prepare("select * from knowledge_cross_parents where cross_id = ? order by parent_role").all(numeric) as {
      id: number;
      parent_query: string;
      parent_role: string;
      resolution_status: string;
      relationship_status: string;
      evidence_basis: string;
      note: string;
    }[];
    return {
      strain: {
        id: `cross:${cross.id}`,
        canonical_name: cross.query_name,
        identity_status: cross.status,
        breeder: null as string | null,
        summary: `${cross.note} Non è una misura di laboratorio e non è un pedigree verificato.`,
      },
      quality: { formula_id: "gg-quality-v1" as const, value: null as number | null },
      aliases: [] as string[],
      claims: [
        {
          id: `cross-claim:${cross.id}`,
          claim_class: cross.relationship_status,
          evidence_level: "REPORTED",
          measurement_kind: "cross_request",
          claim_text: cross.note,
        },
      ],
      traits: [] as unknown[],
      edges: parents.map((parent) => ({
        id: `cross-parent:${parent.id}`,
        child_name: cross.query_name,
        parent_name: parent.parent_query,
        relationship_type: parent.evidence_basis,
        note: `${parent.parent_role} · ${parent.resolution_status} · ${parent.relationship_status}. ${parent.note}`,
        note_on_genomic_percentage: "Non è una percentuale genomica. Il parse della query non è un genotipo.",
      })),
      snapshot_id: cross.snapshot_id,
      source_id: "src-grok-lookup",
    };
  } finally {
    db.close();
  }
}
