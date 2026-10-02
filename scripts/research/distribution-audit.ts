import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log(JSON.stringify({ status: "NOT_EXECUTED", reason: "DATABASE_URL_ABSENT" }));
  process.exit(2);
}
if (!url.includes("tupswxnfidpemjkzwgkx")) {
  console.log(JSON.stringify({ status: "REFUSED", reason: "PROJECT_REF_MISMATCH" }));
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1, statement_timeout: 120_000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

async function regclass(name: string) {
  const row = await client.query("select to_regclass($1) as name", [`public.${name}`]);
  return Boolean(row.rows[0]?.name);
}

async function scalar(sql: string) {
  const row = await client.query(sql);
  return row.rows[0] ?? null;
}

async function rows(sql: string) {
  const result = await client.query(sql);
  return result.rows;
}

const report: Record<string, unknown> = { status: "QUERIED", writes: 0, raw_rows: "NOT_RETURNED" };
try {
  await client.query("begin read only");
  report.database_size = await scalar("select pg_size_pretty(pg_database_size(current_database())) as size");
  report.extensions = await rows("select extname from pg_extension order by extname");
  const tables = [
    "canonical_entities",
    "aliases",
    "pedigree_edges",
    "measurements",
    "claims",
    "pattern_candidates",
    "knowledge_cache",
    "calibration_runs",
    "observation_units",
    "content_reports",
    "scientific_features",
    "research_papers",
    "prediction_records",
    "knowledge_snapshots",
    "embeddings",
  ];
  const present: Record<string, boolean> = {};
  for (const table of tables) present[table] = await regclass(table);
  report.tables_present = present;
  if (present.canonical_entities) {
    report.entities = await scalar(`
      select count(*)::int as entities,
             count(*) filter (where breeder is null)::int as breeder_unknown,
             count(distinct breeder)::int as breeders
      from public.canonical_entities`);
    report.identity_status = await rows(`select identity_status, count(*)::int as n from public.canonical_entities group by 1 order by n desc`);
    report.duplicate_display_names = await scalar(`
      select count(*)::int as names
      from (select display_name from public.canonical_entities group by display_name having count(*) > 1) d`);
  }
  if (present.aliases) {
    report.alias_collisions = await scalar(`
      select count(*)::int as norms
      from (select alias_norm from public.aliases group by alias_norm having count(distinct canonical_id) > 1) c`);
  }
  if (present.pedigree_edges && present.canonical_entities) {
    report.pedigree_coverage = await scalar(`
      select count(*)::int as entities_with_child_edge
      from public.canonical_entities e
      where exists (select 1 from public.pedigree_edges p where p.child_canonical_id = e.id)`);
  }
  if (present.measurements) {
    report.measurement_classes = await rows(`
      select coalesce(normalized_class, 'NULL') as class, count(*)::int as n
      from public.measurements
      group by 1
      order by n desc`);
  }
  if (present.pattern_candidates) {
    report.pattern_lifecycle = await rows(`select lifecycle, count(*)::int as n from public.pattern_candidates group by 1 order by n desc`);
  }
  if (present.knowledge_cache) report.knowledge_cache = await scalar("select count(*)::int as n from public.knowledge_cache");
  if (present.calibration_runs) report.calibration_runs = await scalar("select count(*)::int as n from public.calibration_runs");
  if (present.observation_units) report.observation_units = await scalar("select count(*)::int as n from public.observation_units");
  if (present.content_reports) report.content_reports = await scalar("select count(*)::int as n from public.content_reports");
  if (present.scientific_features) report.scientific_features = await scalar("select count(*)::int as n from public.scientific_features");
  if (present.research_papers) {
    report.research_papers = await scalar("select count(*)::int as n from public.research_papers");
    const columns = await rows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'research_papers'`);
    const names = new Set(columns.map((row) => String(row.column_name)));
    if (names.has("external_id") && names.has("knowledge_status")) {
      report.paper_med_42387130 = await rows(`
        select external_id, knowledge_status
        from public.research_papers
        where external_id = 'MED:42387130'
        limit 5`);
    } else {
      report.paper_med_42387130 = "COLUMNS_ABSENT";
    }
  }
  await client.query("rollback");
  console.log(JSON.stringify(report));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* already closed */
  }
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 300) : "QUERY_FAILED";
  console.log(JSON.stringify({ status: "QUERY_FAILED", error: message }));
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
