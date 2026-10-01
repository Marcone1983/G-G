import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { normalizeName } from "./engine.ts";
import { sectionForResearch } from "./sections.ts";

export type MemoryKnowledgeStatus = "UNVERIFIED_AI_RESEARCH" | "VERIFIED_RESEARCH" | "DOCUMENTED_CLAIM" | "MEASUREMENT" | "PEDIGREE_FACT" | "MODEL_OUTPUT";
export type MemoryRecordState = "ACTIVE" | "STALE" | "SUPERSEDED" | "REVOKED";

type ProviderResult =
  | { status: "SUCCESS"; response: string; model: string; requestId?: string }
  | { status: "BLOCKED" | "RETRYABLE" | "INVALID_PROVIDER_RESPONSE" | "FAILED" | "REJECTED"; response: null; model: string };

const inflight = new Map<string, Promise<unknown>>();
const DEV_FILE = path.join(process.cwd(), "data/dev/research-memory.sqlite");

export class ResearchMemory {
  readonly environment: "TEST_ONLY" | "DEV_FILE";
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync, environment: "TEST_ONLY" | "DEV_FILE") {
    this.db = db;
    this.environment = environment;
    db.exec(`create table if not exists research_memory (
      memory_id text primary key,
      tenant_scope text not null,
      owner_id text,
      raw_query text not null,
      normalized_query text not null,
      lookup_key text not null,
      response text not null,
      structured_result text,
      provider text not null,
      model text not null,
      provider_request_id text,
      prompt_hash text,
      response_hash text,
      knowledge_status text not null,
      verification_status text not null,
      source_references text,
      snapshot_id text not null,
      research_job_id text,
      parent_memory_id text,
      parser_version text not null,
      schema_version text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text,
      record_state text not null
    )`);
    db.exec(`create unique index if not exists research_memory_active_key on research_memory(lookup_key) where record_state = 'ACTIVE'`);
    db.exec(`create table if not exists memory_metrics (
      id integer primary key check (id = 1),
      total_queries integer not null default 0,
      cache_hits integer not null default 0,
      cache_misses integer not null default 0,
      provider_calls integer not null default 0,
      provider_calls_avoided integer not null default 0,
      research_results_stored integer not null default 0,
      research_results_reused integer not null default 0
    )`);
    db.exec(`insert or ignore into memory_metrics (id) values (1)`);
  }

  static isolated() {
    return new ResearchMemory(new DatabaseSync(":memory:"), "TEST_ONLY");
  }

  static devFile(file = DEV_FILE) {
    if (file.includes("gg-foundation.sqlite")) throw new Error("CORPUS_FILE_FORBIDDEN");
    mkdirSync(path.dirname(file), { recursive: true });
    return new ResearchMemory(new DatabaseSync(file), "DEV_FILE");
  }

  lookup(raw: string, snapshotId: string, scope = "GLOBAL_RESEARCH", ownerId: string | null = null) {
    const key = lookupKey(normalizeName(raw), snapshotId, scope, ownerId);
    return (
      (this.db
        .prepare(
          `select memory_id, tenant_scope, owner_id, raw_query, normalized_query, lookup_key, response, provider, model, knowledge_status, verification_status, snapshot_id, record_state, prompt_hash, response_hash
           from research_memory where lookup_key = ? and record_state = 'ACTIVE'`,
        )
        .get(key) as Record<string, string> | undefined) ?? null
    );
  }

  metrics() {
    return this.db.prepare("select * from memory_metrics where id = 1").get() as Record<string, number>;
  }

  forget(raw: string, snapshotId: string) {
    this.db.prepare("delete from research_memory where normalized_query = ? and snapshot_id = ?").run(normalizeName(raw), snapshotId);
  }

  mark(memoryId: string, state: MemoryRecordState) {
    const changed = this.db.prepare("update research_memory set record_state = ?, updated_at = ? where memory_id = ?").run(state, new Date().toISOString(), memoryId);
    return Number(changed.changes) === 1;
  }

  async answer(input: {
    raw: string;
    snapshotId: string;
    providerName: string;
    scope?: string;
    ownerId?: string | null;
    call: () => Promise<ProviderResult> | ProviderResult;
  }) {
    const scope = input.scope ?? "GLOBAL_RESEARCH";
    const ownerId = input.ownerId ?? null;
    this.bump("total_queries");
    const hit = this.lookup(input.raw, input.snapshotId, scope, ownerId);
    if (hit) {
      this.bump("cache_hits");
      this.bump("provider_calls_avoided");
      this.bump("research_results_reused");
      return { source: "MEMORY" as const, cache_hit: true, provider_called: false, memory_write_status: "VERIFIED" as const, entry: hit, environment: this.environment };
    }
    this.bump("cache_misses");
    const key = lookupKey(normalizeName(input.raw), input.snapshotId, scope, ownerId);
    const pending = inflight.get(key);
    if (pending) {
      const shared = (await pending) as { entry: Record<string, string> | null };
      return { source: "MEMORY" as const, cache_hit: true, provider_called: false, memory_write_status: "VERIFIED" as const, entry: shared.entry, deduplicated: true, environment: this.environment };
    }
    const work = (async () => {
      this.bump("provider_calls");
      const result = await input.call();
      if (result.status !== "SUCCESS") {
        return { source: "PROVIDER" as const, cache_hit: false, provider_called: true, memory_write_status: "NOT_WRITTEN" as const, knowledge_status: null, status: result.status, entry: null, environment: this.environment };
      }
      return this.writeSuccess({
        raw: input.raw,
        snapshotId: input.snapshotId,
        providerName: input.providerName,
        model: result.model,
        response: result.response,
        requestId: result.requestId ?? null,
        scope,
        ownerId,
      });
    })();
    inflight.set(key, work);
    try {
      return await work;
    } finally {
      inflight.delete(key);
    }
  }

  writeSuccess(input: {
    raw: string;
    snapshotId: string;
    providerName: string;
    model: string;
    response: string;
    requestId: string | null;
    scope: string;
    ownerId: string | null;
  }) {
    const normalized = normalizeName(input.raw);
    const key = lookupKey(normalized, input.snapshotId, input.scope, input.ownerId);
    const now = new Date().toISOString();
    const memoryId = `mem-${key.slice(0, 24)}`;
    const promptHash = createHash("sha256").update(`${input.providerName}|${input.model}|${normalized}`).digest("hex");
    const responseHash = createHash("sha256").update(input.response).digest("hex");
    this.db
      .prepare(
        `insert or ignore into research_memory (
          memory_id, tenant_scope, owner_id, raw_query, normalized_query, lookup_key, response, structured_result, provider, model, provider_request_id,
          prompt_hash, response_hash, knowledge_status, verification_status, source_references, snapshot_id, research_job_id, parent_memory_id,
          parser_version, schema_version, created_at, updated_at, expires_at, record_state
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED_AI_RESEARCH', 'UNVERIFIED', '[]', ?, null, null, 'gg-memory-1', 'gg-memory-schema-1', ?, ?, null, 'ACTIVE')`,
      )
      .run(memoryId, input.scope, input.ownerId, input.raw, normalized, key, input.response, input.response, input.providerName, input.model, input.requestId, promptHash, responseHash, input.snapshotId, now, now);
    const entry = this.lookup(input.raw, input.snapshotId, input.scope, input.ownerId);
    if (!entry || entry.response !== input.response || entry.knowledge_status !== "UNVERIFIED_AI_RESEARCH") throw new Error("MEMORY_REREAD_FAILED");
    this.bump("research_results_stored");
    return { source: "PROVIDER" as const, cache_hit: false, provider_called: true, memory_write_status: "VERIFIED" as const, knowledge_status: "UNVERIFIED_AI_RESEARCH" as const, section_key: sectionForResearch(input.ownerId), status: "SUCCESS" as const, entry, environment: this.environment, deduplicated: false };
  }

  private bump(column: string) {
    this.db.prepare(`update memory_metrics set ${column} = ${column} + 1 where id = 1`).run();
  }
}

function lookupKey(normalized: string, snapshotId: string, scope: string, ownerId: string | null) {
  return createHash("sha256").update(`${scope}|${ownerId ?? ""}|${snapshotId}|${normalized}`).digest("hex");
}

export function providerErrorClass(message: string): "BLOCKED" | "REJECTED" | "RETRYABLE" | "INVALID_PROVIDER_RESPONSE" | "FAILED" {
  if (/malformed|invalid json|schema|unexpected token/i.test(message)) return "INVALID_PROVIDER_RESPONSE";
  if (/spending-limit|personal-team-blocked|\b403\b|\b429\b|quota/i.test(message)) return "BLOCKED";
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(message)) return "REJECTED";
  if (/timeout|timed out|\b5\d\d\b|econnreset/i.test(message)) return "RETRYABLE";
  return "FAILED";
}

export function cloudDatabaseStatus(env: Record<string, string | undefined> = process.env) {
  const url = env.DATABASE_URL?.trim() || env.SUPABASE_URL?.trim() || "";
  if (!url) {
    return { status: "BLOCKED_EXTERNAL_ACCESS" as const, driver: "pg" as const, connect: false as const, reason: "DATABASE_URL" };
  }
  if (!/^postgres(ql)?:\/\//i.test(env.DATABASE_URL?.trim() ?? "")) {
    return { status: "REFUSED" as const, driver: "pg" as const, connect: false as const, reason: "NOT_A_POSTGRES_URL" };
  }
  return { status: "CONFIGURED_NOT_MIGRATED" as const, driver: "pg" as const, connect: false as const, reason: "NO_LIVE_MIGRATION" };
}
