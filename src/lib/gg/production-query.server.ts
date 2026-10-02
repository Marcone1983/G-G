import type { PoolClient } from "pg";
import { normalizeName } from "./engine.ts";
import { scientificPing, type ProductionCorpus } from "./production-source.server.ts";
import { scientificPool } from "./prediction/pool.ts";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";

export function redactConnection(text: string) {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 240);
}

export async function withProductionRead<T>(
  read: (client: PoolClient) => Promise<T>,
): Promise<{ corpus: ProductionCorpus; value: T | null; error: string | null }> {
  const corpus = await scientificPing();
  if (corpus.status !== "CONNECTED") return { corpus, value: null, error: null };
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !url.includes(PROJECT_REF)) return { corpus, value: null, error: "DATABASE_URL rifiutato." };
  let client: PoolClient;
  try {
    client = await scientificPool(url).connect();
  } catch (error) {
    return { corpus, value: null, error: redactConnection(error instanceof Error ? error.message : "Pool non disponibile.") };
  }
  try {
    await client.query("begin read only");
    const value = await read(client);
    await client.query("rollback");
    return { corpus, value, error: null };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* already closed */
    }
    return { corpus, value: null, error: redactConnection(error instanceof Error ? error.message : "Lettura non riuscita.") };
  } finally {
    client.release();
  }
}

export function boundedLike(query: string): string | null {
  const cleaned = query.trim().replace(/[%_]/g, "").slice(0, 120);
  if (cleaned.length < 2) return null;
  return `%${cleaned}%`;
}

export function likeTerm(query: string) {
  return boundedLike(query) ?? "";
}

export async function searchProductionNames(query: string) {
  return withProductionRead(async (client) => {
    const term = boundedLike(query);
    if (!term) return { canonical: [], records: [] };
    const exact = normalizeName(query);
    const canonical = await client.query(
      `select id::text, display_name, identity_status, breeder
       from public.canonical_entities
       where name_norm = $2 or name_norm ilike $1 or display_name ilike $1
       order by case when name_norm = $2 then 0 else 1 end, display_name
       limit 20`,
      [term, exact],
    ).catch((error: { code?: string }) => (error.code === "42P01" ? { rows: [] } : Promise.reject(error)));
    const records = await client.query(
      `select id::text, original_name, name_norm, breeder
       from public.source_records
       where name_norm = $2 or name_norm ilike $1 or original_name ilike $1
       order by case when name_norm = $2 then 0 else 1 end, original_name
       limit 20`,
      [term, exact],
    );
    return { canonical: canonical.rows, records: records.rows };
  });
}

export async function readProductionMeasurements(query: string) {
  const term = boundedLike(query);
  if (!term) {
    const corpus = await scientificPing();
    return { corpus, value: { query_status: "QUERY_REQUIRED" as const, raw_rows: "NOT_RETURNED" as const, measurements: [] }, error: null };
  }
  return withProductionRead(async (client) => {
    const names = await client.query<{ original_name: string }>(
      `select distinct s.original_name
       from public.source_records s
       where s.name_norm ilike $1 or s.original_name ilike $1
       limit 21`,
      [term],
    );
    if (names.rows.length === 0) {
      return { query_status: "UNRESOLVED" as const, raw_rows: "NOT_RETURNED" as const, measurements: [] };
    }
    if (names.rows.length > 20) {
      return { query_status: "TOO_BROAD" as const, raw_rows: "NOT_RETURNED" as const, matches: names.rows.length, measurements: [] };
    }
    const rows = await client.query(
      `select m.compound, coalesce(m.normalized_class, m.klass) as klass, count(*)::int as n,
              percentile_cont(0.5) within group (order by m.value) as median
       from public.measurements m
       join public.source_records s on s.id = m.source_record_id
       where (s.name_norm ilike $1 or s.original_name ilike $1) and m.value is not null
       group by m.compound, coalesce(m.normalized_class, m.klass)
       order by n desc
       limit 30`,
      [term],
    );
    return {
      query_status: "AGGREGATE" as const,
      raw_rows: "NOT_RETURNED" as const,
      raw_cell_text: "NOT_RETURNED" as const,
      names: names.rows.map((row) => row.original_name),
      measurements: rows.rows,
    };
  });
}

export async function readProductionPedigree(query: string) {
  const term = boundedLike(query);
  if (!term) {
    const corpus = await scientificPing();
    return { corpus, value: [], error: null };
  }
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.pedigree_edges') as name");
    if (!present.rows[0]?.name) return [];
    const rows = await client.query(
      `select e.parent_text, e.relationship_type, e.reported_or_inferred, e.identity_status
       from public.pedigree_edges e
       join public.source_records s on s.id = e.child_record_id
       where s.name_norm ilike $1 or s.original_name ilike $1
       limit 20`,
      [term],
    );
    return rows.rows;
  });
}

export async function readProductionClaims(query: string) {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.claims') as name");
    if (!present.rows[0]?.name) return [];
    const term = boundedLike(query);
    if (!term) return [];
    const rows = await client.query(
      `select c.field, c.value, c.claim_class
       from public.claims c
       left join public.source_records s on s.id = c.source_record_id
       where $1 = '%' or s.name_norm ilike $1 or s.original_name ilike $1 or c.field ilike $1
       limit 20`,
      [term],
    );
    return rows.rows;
  });
}

export async function readProposedPatterns() {
  return withProductionRead(async (client) => {
    const rows = await client.query<{
      display_name: string | null;
      name_norm: string | null;
      compound: string;
      support: number;
      n: number;
    }>(
      `select coalesce(nullif(max(c.display_name), ''), s.name_norm) as display_name,
              s.name_norm as name_norm,
              m.compound as compound,
              count(distinct coalesce(s.independence_group, s.source_id))::int as support,
              count(*)::int as n
       from public.measurements m
       join public.source_records s on s.id = m.source_record_id
       left join public.canonical_entities c on c.name_norm = s.name_norm
       where m.numeric_value is not null
         and m.value_status = 'NUMERIC'
         and s.name_norm is not null
         and length(s.name_norm) > 1
         and m.compound not in ('total_thc', 'total_cbd')
       group by s.name_norm, m.compound
       having count(distinct coalesce(s.independence_group, s.source_id)) >= 2
       order by support desc, n desc
       limit 40`,
    );
    return rows.rows;
  });
}

export async function readProductionPatterns() {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.pattern_candidates') as name");
    if (!present.rows[0]?.name) return [];
    const rows = await client.query(
      `select pattern_key, hypothesis, lifecycle, promoted_to_validated
       from public.pattern_candidates
       limit 20`,
    );
    return rows.rows;
  });
}

export async function readStoredAcquisition(query: string) {
  const exact = normalizeName(query);
  if (!exact) return null;
  const found = await withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.global_research_memory') as name");
    if (!present.rows[0]?.name) return null;
    const rows = await client.query<{ response_json: { records?: ExternalRecord[]; retrieved_at?: string }; id: string }>(
      `select id::text, response_json
       from public.global_research_memory
       where lookup_key = $1 and research_scope = 'strain_lookup' and status = 'UNVERIFIED_AI_RESEARCH'
       order by created_at desc
       limit 1`,
      [exact],
    );
    return rows.rows[0] ?? null;
  });
  const row = found.value;
  const records = row?.response_json?.records ?? [];
  if (!row || records.length === 0) return null;
  return { research_id: row.id, records, retrieved_at: row.response_json.retrieved_at ?? "" };
}

type ExternalRecord = {
  title: string;
  source_name?: string | null;
  url?: string | null;
  year?: string | null;
};

export async function saveExternalAcquisition(query: string, records: ExternalRecord[]) {
  const exact = normalizeName(query);
  const retrieved_at = new Date().toISOString();
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !exact) return { research_id: exact || "absent", retrieved_at, saved: false };
  const pool = scientificPool(url);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`create table if not exists public.global_research_memory (
      id bigint generated by default as identity primary key,
      lookup_key text not null,
      normalized_query text not null,
      research_scope text not null,
      snapshot_id text not null,
      provider text not null,
      model text,
      status text not null default 'UNVERIFIED_AI_RESEARCH',
      provenance jsonb not null,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      unique (lookup_key, research_scope, snapshot_id)
    )`);
    const inserted = await client.query<{ id: string }>(
      `insert into public.global_research_memory
         (lookup_key, normalized_query, research_scope, snapshot_id, provider, status, provenance, response_json)
       values ($1, $1, 'strain_lookup', 'EXTERNAL_ACQUISITION', 'europepmc', 'UNVERIFIED_AI_RESEARCH', $2::jsonb, $3::jsonb)
       on conflict (lookup_key, research_scope, snapshot_id)
       do update set response_json = excluded.response_json, provenance = excluded.provenance
       returning id::text`,
      [
        exact,
        JSON.stringify({ source: "Europe PMC", retrieved_at, not_a_measurement: true, not_a_pedigree: true }),
        JSON.stringify({ records, retrieved_at }),
      ],
    );
    await client.query("commit");
    return { research_id: inserted.rows[0]?.id ?? exact, retrieved_at, saved: true };
  } catch {
    try {
      await client.query("rollback");
    } catch {
      /* already closed */
    }
    return { research_id: exact, retrieved_at, saved: false };
  } finally {
    client.release();
  }
}

export async function readProductionMemory(query: string) {
  const term = boundedLike(query);
  if (!term) {
    const corpus = await scientificPing();
    return { corpus, value: [], error: null };
  }
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.global_research_memory') as name");
    if (!present.rows[0]?.name) return [];
    const rows = await client.query(
      `select normalized_query, status, provider
       from public.global_research_memory
       where normalized_query ilike $1
       limit 10`,
      [term],
    );
    return rows.rows;
  });
}

export async function readProductionSnapshot() {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.knowledge_snapshots') as name");
    if (!present.rows[0]?.name) return null;
    const rows = await client.query(
      `select snapshot_id, raw_records, measurements, note
       from public.knowledge_snapshots
       order by snapshot_id desc
       limit 1`,
    );
    return rows.rows[0] ?? null;
  });
}

export async function readProductionHealth(query: string) {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.health_evidence') as name");
    if (!present.rows[0]?.name) return [];
    const term = boundedLike(query);
    if (!term) return [];
    const rows = await client.query(
      `select id, subject_name, identity_status, effect_domain, evidence_class, attribution,
              evidence_strength, population, dose, formulation, route, study_design, source,
              limitations, evidence_date::text, provenance, study_id, methodological_quality,
              chemotype_id, compound, outcome, causal, testimony
       from public.health_evidence
       where $1 = '%' or subject_name ilike $1 or compound ilike $1 or outcome ilike $1
       limit 40`,
      [term],
    );
    return rows.rows;
  });
}
