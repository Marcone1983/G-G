import { Pool, type PoolClient } from "pg";
import { productionCorpus, type ProductionCorpus } from "./production-source.server.ts";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";

export function redactConnection(text: string) {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 240);
}

export async function withProductionRead<T>(
  read: (client: PoolClient) => Promise<T>,
): Promise<{ corpus: ProductionCorpus; value: T | null; error: string | null }> {
  const corpus = await productionCorpus();
  if (corpus.status !== "CONNECTED") return { corpus, value: null, error: null };
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !url.includes(PROJECT_REF)) return { corpus, value: null, error: "DATABASE_URL rifiutato." };
  const pool = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
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
    await pool.end();
  }
}

export function likeTerm(query: string) {
  const cleaned = query.trim().replace(/[%_]/g, "").slice(0, 120);
  return `%${cleaned}%`;
}

export async function searchProductionNames(query: string) {
  return withProductionRead(async (client) => {
    const term = likeTerm(query);
    const canonical = await client.query(
      `select id::text, display_name, identity_status, breeder
       from public.canonical_entities
       where name_norm ilike $1 or display_name ilike $1
       order by display_name
       limit 20`,
      [term],
    ).catch((error: { code?: string }) => (error.code === "42P01" ? { rows: [] } : Promise.reject(error)));
    const records = await client.query(
      `select id::text, original_name, name_norm, breeder
       from public.source_records
       where name_norm ilike $1 or original_name ilike $1
       order by original_name
       limit 20`,
      [term],
    );
    return { canonical: canonical.rows, records: records.rows };
  });
}

export async function readProductionMeasurements(query: string) {
  return withProductionRead(async (client) => {
    const rows = await client.query(
      `select m.compound, m.qualifier, m.value, m.unit, m.value_status, m.raw_cell_text
       from public.measurements m
       join public.source_records s on s.id = m.source_record_id
       where s.name_norm ilike $1 or s.original_name ilike $1
       limit 40`,
      [likeTerm(query)],
    );
    return rows.rows.map((row) => ({
      compound: row.compound,
      qualifier: row.qualifier,
      value: row.value,
      unit: row.unit,
      value_status: row.value_status,
      raw_cell_text: row.raw_cell_text,
      zero_rule: "Un qualifier non è zero. Un value null non è zero.",
    }));
  });
}

export async function readProductionPedigree(query: string) {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.pedigree_edges') as name");
    if (!present.rows[0]?.name) return [];
    const rows = await client.query(
      `select e.parent_text, e.relationship_type, e.reported_or_inferred, e.identity_status
       from public.pedigree_edges e
       join public.source_records s on s.id = e.child_record_id
       where s.name_norm ilike $1 or s.original_name ilike $1
       limit 20`,
      [likeTerm(query)],
    );
    return rows.rows;
  });
}

export async function readProductionClaims(query: string) {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.claims') as name");
    if (!present.rows[0]?.name) return [];
    const term = query.trim() && query !== "*" ? likeTerm(query) : "%";
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

export async function readProductionMemory(query: string) {
  return withProductionRead(async (client) => {
    const present = await client.query("select to_regclass('public.global_research_memory') as name");
    if (!present.rows[0]?.name) return [];
    const rows = await client.query(
      `select normalized_query, status, provider
       from public.global_research_memory
       where normalized_query ilike $1
       limit 10`,
      [likeTerm(query)],
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
    const term = query.trim() && query !== "*" ? likeTerm(query) : "%";
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
