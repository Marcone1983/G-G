import pg from "pg";

import { normalizeName } from "../engine.ts";
import { connectableUrl } from "./pg-url.ts";
import { predictCross, type MachineReport, type PredictRequest } from "./orchestrator.ts";
import type { CorpusReader, ParentHit, PatternRow, PedigreeRow, RawValue } from "./sqlite-reader.ts";

const COMPOUND_OK = /^[a-z0-9_]{1,40}$/;

export async function predictOnPostgres(databaseUrl: string, request: PredictRequest): Promise<MachineReport & { group_median_origin: "DATABASE_CALCULATED" }> {
  const pool = new pg.Pool({ connectionString: connectableUrl(databaseUrl), max: 2, statement_timeout: 60_000 });
  try {
    const reader = await postgresReader(pool, request);
    const report = predictCross(reader, request);
    return { ...report, group_median_origin: "DATABASE_CALCULATED" };
  } finally {
    await pool.end();
  }
}

async function postgresReader(pool: pg.Pool, request: PredictRequest): Promise<CorpusReader> {
  const compounds = (request.compounds?.length ? request.compounds : ["delta_9_thc", "cbd", "thca", "cbda"]).filter((item) => COMPOUND_OK.test(item));
  const left = normalizeName(request.parentA);
  const right = normalizeName(request.parentB);
  const names = [...new Set([left, right])];
  const parents = new Map<string, ParentHit[]>();
  for (const name of names) parents.set(name, await parentHits(pool, name));
  const values = new Map<string, RawValue[]>();
  for (const name of names) values.set(name, await groupMedians(pool, name, compounds));
  const pedigree = new Map<string, PedigreeRow[]>();
  for (const name of names) pedigree.set(name, await pedigreeRows(pool, name));
  const patterns = new Map<string, PatternRow[]>();
  for (const name of names) patterns.set(name, await patternRows(pool, name));
  const pair = await samePair(pool, left, right);
  const labels = new Map<string, number>();
  for (const name of names) labels.set(name, await labelCount(pool, name));
  const snapshot = await snapshotId(pool);
  return {
    source: "supabase_postgresql",
    snapshotId: () => snapshot,
    parents: (name) => parents.get(normalizeName(name)) ?? [],
    values: (name) => values.get(normalizeName(name)) ?? [],
    pedigree: (name) => pedigree.get(normalizeName(name)) ?? [],
    patterns: (name) => patterns.get(normalizeName(name)) ?? [],
    samePairChildren: () => pair,
    labelRows: (name) => labels.get(normalizeName(name)) ?? 0,
    vectorCandidates: () => [],
  };
}

async function parentHits(pool: pg.Pool, name: string): Promise<ParentHit[]> {
  const exact = await pool.query<Omit<ParentHit, "match_kind">>(
    `select id as canonical_id, display_name, name_norm, identity_status, homonym_status
     from canonical_entities where name_norm = $1 limit 24`,
    [name],
  );
  const alias = await pool.query<Omit<ParentHit, "match_kind">>(
    `select c.id as canonical_id, c.display_name, c.name_norm, c.identity_status, c.homonym_status
     from aliases a join canonical_entities c on c.id = a.canonical_id
     where a.alias_norm = $1 limit 24`,
    [name],
  );
  const seen = new Set<number>();
  const hits: ParentHit[] = [];
  for (const row of exact.rows) {
    const id = Number(row.canonical_id);
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({ ...row, canonical_id: id, match_kind: "EXACT" });
  }
  for (const row of alias.rows) {
    const id = Number(row.canonical_id);
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({ ...row, canonical_id: id, match_kind: "ALIAS" });
  }
  return hits;
}

async function groupMedians(pool: pg.Pool, name: string, compounds: string[]): Promise<RawValue[]> {
  if (compounds.length === 0) return [];
  const result = await pool.query<{ compound: string; klass: string; grp: string; source_id: string; median: number }>(
    `select m.compound as compound,
            min(m.klass) as klass,
            coalesce(s.independence_group, s.source_id, 'unknown') as grp,
            min(coalesce(s.source_id, 'unknown')) as source_id,
            percentile_cont(0.5) within group (order by m.numeric_value) as median
     from measurements m
     join source_records s on s.id = m.source_record_id
     where s.name_norm = $1
       and m.value_status = 'NUMERIC'
       and m.numeric_value is not null
       and m.compound = any($2::text[])
     group by m.compound, coalesce(s.independence_group, s.source_id, 'unknown')`,
    [name, compounds],
  );
  return result.rows.map((row) => ({
    compound: row.compound,
    klass: row.klass,
    group: row.grp,
    source_id: row.source_id,
    value: Number(row.median),
  }));
}

async function pedigreeRows(pool: pg.Pool, name: string): Promise<PedigreeRow[]> {
  const result = await pool.query<PedigreeRow>(
    `select parent_text, identity_status, reported_or_inferred, relationship_type
     from pedigree_edges
     where parent_norm = $1 or child_canonical_id in (select id from canonical_entities where name_norm = $1)
     limit 40`,
    [name],
  );
  return result.rows;
}

async function patternRows(pool: pg.Pool, name: string): Promise<PatternRow[]> {
  const token = name.split(" ").find((part) => part.length > 2) ?? name;
  const result = await pool.query<{ pattern_key: string; hypothesis: string; lifecycle: string; promoted_to_validated: number }>(
    `select pattern_key, hypothesis, lifecycle, promoted_to_validated
     from pattern_candidates
     where pattern_key like $1
     limit 12`,
    [`%${token}%`],
  );
  return result.rows.map((row) => ({
    pattern_key: row.pattern_key,
    hypothesis: row.hypothesis,
    lifecycle: row.lifecycle,
    sample_size: 0,
    independent_sources: 0,
    validation_n: 0,
    discovery_mean: null,
    validation_mean: null,
    promoted: Number(row.promoted_to_validated) === 1,
  }));
}

async function samePair(pool: pg.Pool, left: string, right: string): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `select count(*) as n
     from pedigree_edges a
     join pedigree_edges b on a.child_canonical_id = b.child_canonical_id and a.id < b.id
     where a.parent_norm = $1 and b.parent_norm = $2`,
    [left, right],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function labelCount(pool: pg.Pool, name: string): Promise<number> {
  const result = await pool.query<{ n: string }>("select count(*) as n from source_records where name_norm = $1", [name]);
  return Number(result.rows[0]?.n ?? 0);
}

async function snapshotId(pool: pg.Pool): Promise<string> {
  const result = await pool.query<{ snapshot_id: string }>("select snapshot_id from knowledge_snapshots");
  const ids = result.rows.map((row) => row.snapshot_id);
  return ids.filter((id) => id.startsWith("GGS-KNOWLEDGE-")).sort().at(-1) ?? ids.at(-1) ?? "SNAPSHOT_NOT_RECORDED";
}
