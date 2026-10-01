import { Pool } from "pg";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";

const TABLES = [
  "source_records",
  "samples",
  "measurements",
  "canonical_entities",
  "aliases",
  "claims",
  "pedigree_edges",
  "global_research_memory",
] as const;

export type ProductionStatus = "CONNECTED" | "NOT_CONFIGURED" | "REFUSED" | "UNREACHABLE";

export type ProductionCorpus = {
  status: ProductionStatus;
  source: "supabase_postgresql";
  project_ref: typeof PROJECT_REF;
  connected: boolean;
  fallback: "NONE";
  reason: string;
  counts: Record<(typeof TABLES)[number], number | null> | null;
};

const UNAVAILABLE =
  "Dato non ancora disponibile. Questo processo non legge SQLite, catalog.json o fixture al posto di Supabase.";

function emptyCounts(): Record<(typeof TABLES)[number], number | null> {
  return {
    source_records: null,
    samples: null,
    measurements: null,
    canonical_entities: null,
    aliases: null,
    claims: null,
    pedigree_edges: null,
    global_research_memory: null,
  };
}

export async function productionCorpus(): Promise<ProductionCorpus> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return {
      status: "NOT_CONFIGURED",
      source: "supabase_postgresql",
      project_ref: PROJECT_REF,
      connected: false,
      fallback: "NONE",
      reason: "DATABASE_URL assente in questo processo. La publishable key non è nel browser.",
      counts: null,
    };
  }
  if (!url.includes(PROJECT_REF)) {
    return {
      status: "REFUSED",
      source: "supabase_postgresql",
      project_ref: PROJECT_REF,
      connected: false,
      fallback: "NONE",
      reason: "DATABASE_URL non punta al progetto production. Nessun altro database viene interrogato.",
      counts: null,
    };
  }
  const pool = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const counts = emptyCounts();
    for (const table of TABLES) {
      const present = await client.query("select to_regclass($1) as name", [`public.${table}`]);
      if (!present.rows[0]?.name) continue;
      const counted = await client.query(`select count(*)::text as n from public.${table}`);
      counts[table] = Number(counted.rows[0]?.n ?? "0");
    }
    await client.query("rollback");
    return {
      status: "CONNECTED",
      source: "supabase_postgresql",
      project_ref: PROJECT_REF,
      connected: true,
      fallback: "NONE",
      reason: "Lettura sul progetto production. Nessuna scrittura.",
      counts,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection may already be closed */
    }
    return {
      status: "UNREACHABLE",
      source: "supabase_postgresql",
      project_ref: PROJECT_REF,
      connected: false,
      fallback: "NONE",
      reason: error instanceof Error ? error.message : "Connessione production non riuscita.",
      counts: null,
    };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function productionNameSearch(query: string) {
  const corpus = await productionCorpus();
  if (corpus.status !== "CONNECTED" || !corpus.counts) {
    return { corpus, results: [] as { id: string; canonical_name: string; identity_status: string; record_role: string; match_kind: string }[], note: UNAVAILABLE };
  }
  if ((corpus.counts.canonical_entities ?? 0) === 0) {
    return {
      corpus,
      results: [],
      note: "canonical_entities su Supabase è ancora 0. Dato non ancora disponibile. Il corpus locale non viene usato.",
    };
  }
  const url = process.env.DATABASE_URL?.trim();
  const pool = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const rows = await client.query(
      `select id::text, canonical_name
       from public.canonical_entities
       where canonical_name ilike $1
       order by canonical_name
       limit 20`,
      [`%${query.replace(/[%_]/g, "")}%`],
    );
    await client.query("rollback");
    return {
      corpus,
      results: rows.rows.map((row) => ({
        id: `entity:${row.id}`,
        canonical_name: String(row.canonical_name),
        identity_status: "STORED",
        record_role: "CANONICAL_ENTITY",
        match_kind: "SUPABASE",
      })),
      note: "Letto da public.canonical_entities sul progetto production.",
    };
  } finally {
    client.release();
    await pool.end();
  }
}

export const PRODUCTION_UNAVAILABLE = UNAVAILABLE;
