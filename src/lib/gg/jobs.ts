import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { UNIFIED_SNAPSHOT } from "./brain.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");
const MAX_ATTEMPTS = 5;

export type JobState = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYABLE" | "DEAD_LETTER";

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec("pragma busy_timeout = 5000");
  return db;
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`pragma table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

export function ensureJobSchema() {
  const db = open();
  try {
    db.exec(`create table if not exists jobs (
      id integer primary key,
      job_type text not null,
      job_status text not null,
      input_snapshot text,
      output_snapshot text,
      started_at text,
      completed_at text,
      finished_at text,
      error text,
      retry_count integer not null default 0
    )`);
    if (!columnExists(db, "jobs", "input_hash")) db.exec("alter table jobs add column input_hash text");
    if (!columnExists(db, "jobs", "worker_version")) db.exec("alter table jobs add column worker_version text");
    if (!columnExists(db, "jobs", "finished_at")) db.exec("alter table jobs add column finished_at text");
    if (!columnExists(db, "jobs", "owner_token")) db.exec("alter table jobs add column owner_token text");
    if (!columnExists(db, "jobs", "lease_until")) db.exec("alter table jobs add column lease_until text");
  } finally {
    db.close();
  }
}

export function enqueueJob(type: string, payload: unknown): number {
  ensureJobSchema();
  const hash = createHash("sha256").update(`${type}|${UNIFIED_SNAPSHOT}|${JSON.stringify(payload)}`).digest("hex");
  const db = open();
  try {
    const existing = db
      .prepare("select id from jobs where job_type = ? and input_hash = ? and job_status in ('QUEUED','RUNNING','RETRYABLE','SUCCEEDED') order by id desc limit 1")
      .get(type, hash) as { id: number } | undefined;
    if (existing) return existing.id;
    const row = db
      .prepare("insert into jobs (job_type, job_status, input_snapshot, input_hash, retry_count, worker_version) values (?, 'QUEUED', ?, ?, 0, 'gg-jobs-1')")
      .run(type, UNIFIED_SNAPSHOT, hash);
    return Number(row.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function claimJob(owner: string, leaseMs: number, now = Date.now(), type?: string): { id: number; status: JobState } | null {
  ensureJobSchema();
  const db = open();
  try {
    db.exec("begin immediate");
    const row = (type
      ? db.prepare("select id, retry_count from jobs where job_status in ('QUEUED','RETRYABLE') and job_type = ? order by id limit 1").get(type)
      : db.prepare("select id, retry_count from jobs where job_status in ('QUEUED','RETRYABLE') order by id limit 1").get()) as
      | { id: number; retry_count: number }
      | undefined;
    if (!row) {
      db.exec("commit");
      return null;
    }
    if (Number(row.retry_count) >= MAX_ATTEMPTS) {
      db.prepare("update jobs set job_status = 'DEAD_LETTER', error = 'ATTEMPT_CAP', completed_at = ? where id = ?").run(new Date(now).toISOString(), row.id);
      db.exec("commit");
      return { id: row.id, status: "DEAD_LETTER" };
    }
    const until = new Date(now + leaseMs).toISOString();
    const changed = db
      .prepare("update jobs set job_status = 'RUNNING', owner_token = ?, lease_until = ?, started_at = ? where id = ? and job_status in ('QUEUED','RETRYABLE')")
      .run(owner, until, new Date(now).toISOString(), row.id);
    db.exec("commit");
    return Number(changed.changes) === 1 ? { id: row.id, status: "RUNNING" } : null;
  } catch (error) {
    try {
      db.exec("rollback");
    } catch {
      /* already closed by the statement error */
    }
    throw error;
  } finally {
    db.close();
  }
}

export function claimSpecific(id: number, owner: string, leaseMs: number, now = Date.now()): boolean {
  ensureJobSchema();
  const db = open();
  try {
    const until = new Date(now + leaseMs).toISOString();
    const changed = db
      .prepare("update jobs set job_status = 'RUNNING', owner_token = ?, lease_until = ?, started_at = ? where id = ? and job_status in ('QUEUED','RETRYABLE')")
      .run(owner, until, new Date(now).toISOString(), id);
    return Number(changed.changes) === 1;
  } finally {
    db.close();
  }
}
export function heartbeatJob(id: number, owner: string, leaseMs: number, now = Date.now()): boolean {
  ensureJobSchema();
  const db = open();
  try {
    const changed = db
      .prepare("update jobs set lease_until = ? where id = ? and owner_token = ? and job_status = 'RUNNING'")
      .run(new Date(now + leaseMs).toISOString(), id, owner);
    return Number(changed.changes) === 1;
  } finally {
    db.close();
  }
}

export function cancelJob(id: number): boolean {
  ensureJobSchema();
  const db = open();
  try {
    const changed = db.prepare("update jobs set job_status = 'CANCELLED', error = 'CANCELLED' where id = ? and job_status in ('QUEUED','RETRYABLE','RUNNING')").run(id);
    return Number(changed.changes) === 1;
  } finally {
    db.close();
  }
}

export function recoverStaleJobs(maxAgeMs: number, now = Date.now()): number {
  ensureJobSchema();
  const db = open();
  try {
    const rows = db.prepare("select id, started_at, lease_until from jobs where job_status = 'RUNNING'").all() as {
      id: number;
      started_at: string | null;
      lease_until: string | null;
    }[];
    let recovered = 0;
    for (const row of rows) {
      const lease = Date.parse(row.lease_until ?? "");
      const started = Date.parse(row.started_at ?? "");
      const expired = Number.isFinite(lease) ? lease <= now : Number.isFinite(started) && now - started > maxAgeMs;
      if (!expired) continue;
      db.prepare("update jobs set job_status = 'RETRYABLE', owner_token = null, error = 'LEASE_EXPIRED' where id = ? and job_status = 'RUNNING'").run(row.id);
      recovered += 1;
    }
    return recovered;
  } finally {
    db.close();
  }
}

export function runIdempotentJob(input: {
  type: string;
  payload: unknown;
  work: () => { output: unknown } | Promise<{ output: unknown }>;
}): Promise<{ id: number; status: JobState; reused: boolean; output: unknown; error: string | null }> {
  ensureJobSchema();
  const hash = createHash("sha256").update(`${input.type}|${UNIFIED_SNAPSHOT}|${JSON.stringify(input.payload)}`).digest("hex");
  const db = open();
  const existing = db
    .prepare("select id, job_status, error from jobs where job_type = ? and input_hash = ? and job_status = 'SUCCEEDED' order by id desc limit 1")
    .get(input.type, hash) as { id: number; job_status: string; error: string | null } | undefined;
  if (existing) {
    db.close();
    return Promise.resolve({ id: existing.id, status: "SUCCEEDED", reused: true, output: null, error: null });
  }
  const attempts = db.prepare("select count(*) as n from jobs where job_type = ? and input_hash = ?").get(input.type, hash) as { n: number };
  if (Number(attempts.n) >= MAX_ATTEMPTS) {
    const dead = db
      .prepare(
        `insert into jobs (job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, finished_at, error, retry_count, input_hash, worker_version)
         values (?, 'DEAD_LETTER', ?, null, ?, ?, ?, 'ATTEMPT_CAP', ?, ?, 'gg-jobs-1')`,
      )
      .run(input.type, UNIFIED_SNAPSHOT, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), Number(attempts.n), hash);
    db.close();
    return Promise.resolve({ id: Number(dead.lastInsertRowid), status: "DEAD_LETTER", reused: false, output: null, error: "ATTEMPT_CAP" });
  }
  const now = new Date().toISOString();
  const started = db
    .prepare(
      `insert into jobs (job_type, job_status, input_snapshot, started_at, error, retry_count, input_hash, worker_version)
       values (?, 'RUNNING', ?, ?, null, ?, ?, 'gg-jobs-1')`,
    )
    .run(input.type, UNIFIED_SNAPSHOT, now, Number(attempts.n), hash);
  const id = Number(started.lastInsertRowid);
  db.close();
  return Promise.resolve()
    .then(() => input.work())
    .then((result) => {
      const done = open();
      try {
        done
          .prepare(`update jobs set job_status = 'SUCCEEDED', output_snapshot = ?, completed_at = ?, finished_at = ?, error = null where id = ?`)
          .run(UNIFIED_SNAPSHOT, new Date().toISOString(), new Date().toISOString(), id);
      } finally {
        done.close();
      }
      return { id, status: "SUCCEEDED" as const, reused: false, output: result.output, error: null };
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "job failed";
      const retryable = Number(attempts.n) + 1 < MAX_ATTEMPTS;
      const status: JobState = retryable ? "RETRYABLE" : "FAILED";
      const done = open();
      try {
        done.prepare(`update jobs set job_status = ?, completed_at = ?, finished_at = ?, error = ? where id = ?`).run(
          status,
          new Date().toISOString(),
          new Date().toISOString(),
          message.slice(0, 300),
          id,
        );
      } finally {
        done.close();
      }
      return { id, status, reused: false, output: null, error: message };
    });
}
