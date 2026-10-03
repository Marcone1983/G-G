import type { Sql } from "@/lib/db";
import { getCurrentKnowledgeSnapshot } from "./production-source.server.ts";

const CANNABINOID = ["delta_9_thc", "thc", "thca", "cbd", "cbda", "cbg", "cbga", "cbn", "cbc"];
const TERPENE = ["myrcene", "limonene", "pinene", "linalool", "caryophyllene", "humulene", "terpinolene", "ocimene"];

export async function ensureAuditTables(sql: Sql) {
  await sql.query(`create table if not exists entity_audit_jobs (
    job_id text primary key,
    snapshot_id text not null,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    processed_count integer not null default 0,
    failed_count integer not null default 0,
    remaining_count integer,
    cursor_id bigint not null default 0
  )`);
  await sql.query(`create table if not exists entity_audit_rows (
    job_id text not null,
    entity_id bigint not null,
    identity_class text not null,
    alias_count integer,
    measurement_count integer,
    cannabinoid_count integer,
    terpene_count integer,
    pedigree_count integer,
    breeder text,
    primary key (job_id, entity_id)
  )`);
  await sql.query(`create table if not exists knowledge_gap_records (
    job_id text not null,
    entity_id bigint not null,
    missing_domain text not null,
    severity text not null,
    primary key (job_id, entity_id, missing_domain)
  )`);
}

export async function runEntityAuditBatch(sql: Sql, limit = 250): Promise<Record<string, unknown>> {
  const current = await getCurrentKnowledgeSnapshot();
  if (!current.id) return { error: "SNAPSHOT_UNAVAILABLE", source: current.source };
  await ensureAuditTables(sql);
  const jobId = `audit:${current.id}`;
  await sql.query(
    `insert into entity_audit_jobs (job_id, snapshot_id) values ($1, $2) on conflict (job_id) do nothing`,
    [jobId, current.id],
  );
  const job = await sql.query<{ cursor_id: string; processed_count: number }>(
    `select cursor_id::text, processed_count from entity_audit_jobs where job_id = $1`,
    [jobId],
  );
  const cursor = Number(job[0]?.cursor_id ?? 0);
  const rows = await sql.query<{
    id: string;
    breeder: string | null;
    same_name: number;
    alias_count: number;
    measurement_count: number;
    cannabinoid_count: number;
    terpene_count: number;
    pedigree_count: number;
    identity_status: string;
  }>(
    `with batch as (
       select id, name_norm, breeder, identity_status
       from canonical_entities
       where id > $1
       order by id
       limit $2
     ),
     names as (
       select name_norm, count(*)::int as same_name from canonical_entities
       where name_norm in (select name_norm from batch)
       group by name_norm
     ),
     alias_n as (
       select canonical_id, count(*)::int as alias_count from aliases
       where canonical_id in (select id from batch) group by canonical_id
     ),
     measure_n as (
       select s.name_norm,
              count(*)::int as measurement_count,
              count(*) filter (where m.compound = any($3::text[]))::int as cannabinoid_count,
              count(*) filter (where m.compound = any($4::text[]))::int as terpene_count
       from measurements m
       join source_records s on s.id = m.source_record_id
       where s.name_norm in (select name_norm from batch)
       group by s.name_norm
     ),
     pedigree_n as (
       select child_canonical_id, count(*)::int as pedigree_count
       from pedigree_edges
       where child_canonical_id in (select id from batch)
       group by child_canonical_id
     )
     select b.id::text, b.breeder, b.identity_status,
            coalesce(n.same_name, 1) as same_name,
            coalesce(a.alias_count, 0) as alias_count,
            coalesce(m.measurement_count, 0) as measurement_count,
            coalesce(m.cannabinoid_count, 0) as cannabinoid_count,
            coalesce(m.terpene_count, 0) as terpene_count,
            coalesce(p.pedigree_count, 0) as pedigree_count
     from batch b
     left join names n on n.name_norm = b.name_norm
     left join alias_n a on a.canonical_id = b.id
     left join measure_n m on m.name_norm = b.name_norm
     left join pedigree_n p on p.child_canonical_id = b.id
     order by b.id`,
    [cursor, limit, CANNABINOID, TERPENE],
  );
  let failed = 0;
  let last = cursor;
  for (const row of rows) {
    const id = Number(row.id);
    last = id;
    const identityClass = row.identity_status.toUpperCase().includes("DISPUTED")
      ? "DISPUTED"
      : row.identity_status.toUpperCase().includes("UNVERIFIED")
        ? "IDENTITY_UNVERIFIED"
        : Number(row.same_name) > 1
          ? "AMBIGUOUS"
          : "RESOLVED";
    try {
      await sql.query(
        `insert into entity_audit_rows (job_id, entity_id, identity_class, alias_count, measurement_count, cannabinoid_count, terpene_count, pedigree_count, breeder)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (job_id, entity_id) do nothing`,
        [jobId, id, identityClass, row.alias_count, row.measurement_count, row.cannabinoid_count, row.terpene_count, row.pedigree_count, row.breeder],
      );
      const gaps: string[] = [];
      if (Number(row.pedigree_count) === 0) gaps.push("pedigree");
      if (!row.breeder) gaps.push("breeder");
      if (Number(row.terpene_count) === 0) gaps.push("terpene");
      if (Number(row.cannabinoid_count) === 0) gaps.push("cannabinoid");
      for (const domain of gaps) {
        await sql.query(
          `insert into knowledge_gap_records (job_id, entity_id, missing_domain, severity)
           values ($1,$2,$3,'UNVERIFIED')
           on conflict (job_id, entity_id, missing_domain) do nothing`,
          [jobId, id, domain],
        );
      }
    } catch {
      failed += 1;
    }
  }
  const total = await sql.query<{ n: number }>(`select count(*)::int as n from canonical_entities`);
  const processed = Number(job[0]?.processed_count ?? 0) + rows.length;
  const remaining = Math.max(0, Number(total[0]?.n ?? 0) - processed);
  await sql.query(
    `update entity_audit_jobs
     set cursor_id = $2, processed_count = $3, failed_count = failed_count + $4, remaining_count = $5,
         completed_at = case when $5 = 0 then now() else completed_at end
     where job_id = $1`,
    [jobId, last, processed, failed, remaining],
  );
  return { job_id: jobId, snapshot_id: current.id, batch: rows.length, processed_count: processed, failed_count: failed, remaining_count: remaining, total: Number(total[0]?.n ?? 0) };
}

export async function auditStatus(sql: Sql): Promise<Record<string, unknown>> {
  await ensureAuditTables(sql);
  const current = await getCurrentKnowledgeSnapshot();
  if (!current.id) return { error: "SNAPSHOT_UNAVAILABLE", source: current.source };
  const rows = await sql.query(`select job_id, snapshot_id, started_at, completed_at, processed_count, failed_count, remaining_count, cursor_id::text from entity_audit_jobs where job_id = $1`, [`audit:${current.id}`]);
  return rows[0] ?? { job_id: `audit:${current.id}`, snapshot_id: current.id, processed_count: 0, remaining_count: null };
}
