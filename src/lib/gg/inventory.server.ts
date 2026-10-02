import type { PoolClient } from "pg";

import { COUNTABLE_TABLES, assertAllowlisted, countRow, lifecycleRows, sumClasses, type CountRow } from "./inventory.ts";
import { withProductionRead } from "./production-query.server.ts";

const CLASS_FILTERS: { category: string; pattern: RegExp }[] = [
  { category: "cannabinoid_measurements", pattern: /cannabin|thc|cbd|cbg|cbn/i },
  { category: "terpene_measurements", pattern: /terpen/i },
  { category: "flavonoid_measurements", pattern: /flavon/i },
  { category: "anthocyanin_measurements", pattern: /anthocyan/i },
  { category: "phenotype_measurements", pattern: /phenotype|morpholog/i },
  { category: "chemotype_measurements", pattern: /chemotype|cannabin|terpen/i },
];

const DOMAINS = [
  "botany",
  "physiology",
  "genetics",
  "genomics",
  "transcriptomics",
  "proteomics",
  "metabolomics",
  "phytochemistry",
  "biosynthesis",
  "qtl",
  "gwas",
  "flavonoid",
  "anthocyanin",
  "chemotype",
  "hplc",
  "nmr",
  "pharmacology",
];

type Inventory = {
  status: "QUERIED" | "NOT_MEASURED" | "QUERY_FAILED";
  source: "supabase_postgresql";
  categories: CountRow[];
  measurement_classes: { klass: string; n: number }[] | null;
  domains: { domain: string; records: number | null; status: string; note: string }[];
  embedding_columns: { table_name: string; column_name: string }[] | null;
  error: string | null;
};

let cache: { at: number; value: Inventory } | null = null;

function quoteTable(table: string) {
  assertAllowlisted(table);
  return `public.${table}`;
}

async function tableCounts(client: PoolClient): Promise<CountRow[]> {
  const present = await client.query<{ name: string }>(
    `select c.relname as name
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1::text[])`,
    [COUNTABLE_TABLES],
  );
  const names = new Set(present.rows.map((row) => row.name));
  const stamps = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
     from information_schema.columns
     where table_schema = 'public' and column_name = any($1::text[]) and table_name = any($2::text[])`,
    [["created_at", "updated_at", "evidence_date"], COUNTABLE_TABLES],
  );
  const stampByTable = new Map<string, string>();
  for (const row of stamps.rows) if (!stampByTable.has(row.table_name)) stampByTable.set(row.table_name, row.column_name);
  const rows: CountRow[] = [];
  for (const table of COUNTABLE_TABLES) {
    if (!names.has(table)) {
      rows.push(countRow(table, null, quoteTable(table), "TABLE_ABSENT"));
      continue;
    }
    const counted = await client.query<{ n: string }>(`select count(*)::text as n from ${quoteTable(table)}`);
    let lastUpdated = "NOT_STORED";
    const stamp = stampByTable.get(table);
    if (stamp && /^[a-z_]+$/.test(stamp)) {
      const max = await client.query<{ at: string | null }>(`select max(${stamp})::text as at from ${quoteTable(table)}`);
      lastUpdated = max.rows[0]?.at ?? "NOT_STORED";
    }
    rows.push(countRow(table, Number(counted.rows[0]?.n ?? "0"), quoteTable(table), "QUERIED", lastUpdated));
  }
  return rows;
}

export async function readScientificInventory(): Promise<Inventory> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.value;
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      status: "NOT_MEASURED",
      source: "supabase_postgresql",
      categories: COUNTABLE_TABLES.map((table) => countRow(table, null, `public.${table}`, "NOT_MEASURED")),
      measurement_classes: null,
      domains: DOMAINS.map((domain) => ({ domain, records: null, status: "NOT_MEASURED", note: "DATABASE_URL is not in this process." })),
      embedding_columns: null,
      error: null,
    };
  }
  const read = await withProductionRead(async (client) => {
    await client.query("set local statement_timeout = '50000'");
    const categories = await tableCounts(client);
    const measurements = categories.find((row) => row.category === "measurements");
    let classes: { klass: string; n: number }[] | null = null;
    if (measurements?.status === "QUERIED") {
      try {
        const grouped = await client.query<{ klass: string; n: string }>(
          `select coalesce(normalized_class, klass, 'UNCLASSIFIED') as klass, count(*)::text as n
           from public.measurements
           group by 1
           order by count(*) desc`,
        );
        classes = grouped.rows.map((row) => ({ klass: row.klass, n: Number(row.n) }));
        for (const filter of CLASS_FILTERS) {
          categories.push(countRow(filter.category, sumClasses(classes, filter.pattern), "public.measurements.normalized_class", "QUERIED"));
        }
        const split = await client.query<{ numeric_values: string; qualified: string }>(
          `select count(*) filter (where value is not null)::text as numeric_values,
                  count(*) filter (where qualifier is not null)::text as qualified
           from public.measurements`,
        );
        categories.push(countRow("numeric_measurements", Number(split.rows[0]?.numeric_values ?? "0"), "public.measurements.value", "QUERIED"));
        categories.push(countRow("qualified_measurements", Number(split.rows[0]?.qualified ?? "0"), "public.measurements.qualifier", "QUERIED"));
      } catch {
        for (const filter of CLASS_FILTERS) categories.push(countRow(filter.category, null, "public.measurements.normalized_class", "QUERY_FAILED"));
      }
    } else {
      for (const filter of CLASS_FILTERS) categories.push(countRow(filter.category, null, "public.measurements", measurements?.status ?? "NOT_MEASURED"));
    }
    const patterns = categories.find((row) => row.category === "pattern_candidates");
    if (patterns?.status === "QUERIED") {
      const grouped = await client.query<{ lifecycle: string; n: string }>(
        `select lifecycle, count(*)::text as n from public.pattern_candidates group by 1`,
      );
      categories.push(...lifecycleRows(true, grouped.rows.map((row) => ({ lifecycle: row.lifecycle, n: Number(row.n) }))));
    } else {
      categories.push(...lifecycleRows(false, []));
    }
    const embedding = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public' and (column_name ilike '%embedding%' or udt_name = 'vector')`,
    );
    categories.push(
      embedding.rows.length
        ? countRow("embeddings", null, embedding.rows.map((row) => `${row.table_name}.${row.column_name}`).join(","), "NOT_MEASURED")
        : countRow("embeddings", null, "information_schema.columns", "TABLE_ABSENT"),
    );
    const papers = categories.find((row) => row.category === "research_papers");
    const domains = [];
    if (papers?.status !== "QUERIED") {
      for (const domain of DOMAINS) domains.push({ domain, records: null, status: papers?.status ?? "NOT_MEASURED", note: "research_papers was not counted." });
    } else {
      try {
        const filters = DOMAINS.map((domain) => `count(*) filter (where title ilike '%${domain}%')::text as ${domain}`).join(", ");
        const domainRow = await client.query<Record<string, string>>(`select ${filters} from public.research_papers`);
        for (const domain of DOMAINS) {
          const records = Number(domainRow.rows[0]?.[domain] ?? "0");
          domains.push({
            domain,
            records,
            status: records === 0 ? "ABSENT" : records < 5 ? "WEAK" : "PARTIALLY_COVERED",
            note: "Title match on research_papers. WELL_COVERED is not assigned.",
          });
        }
      } catch {
        for (const domain of DOMAINS) domains.push({ domain, records: null, status: "QUERY_FAILED", note: "research_papers title query failed." });
      }
    }
    const qtl = domains.find((domain) => domain.domain === "qtl");
    categories.push(countRow("qtl_records", qtl && qtl.records !== null ? qtl.records : null, "public.research_papers.title", qtl && qtl.records !== null ? "QUERIED" : "NOT_MEASURED"));
    return { categories, classes, domains, embedding: embedding.rows };
  });
  if (!read.value) {
    return {
      status: read.corpus.connected ? "QUERY_FAILED" : "NOT_MEASURED",
      source: "supabase_postgresql",
      categories: [],
      measurement_classes: null,
      domains: [],
      embedding_columns: null,
      error: read.error,
    };
  }
  const value: Inventory = {
    status: "QUERIED",
    source: "supabase_postgresql",
    categories: read.value.categories,
    measurement_classes: read.value.classes,
    domains: read.value.domains,
    embedding_columns: read.value.embedding,
    error: null,
  };
  cache = { at: Date.now(), value };
  return value;
}

export function clearInventoryCache() {
  cache = null;
}
