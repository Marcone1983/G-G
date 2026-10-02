import { scientificPool } from "./prediction/pool.ts";

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
  "knowledge_sections",
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
    knowledge_sections: null,
  };
}

function absentCorpus(status: ProductionStatus, reason: string): ProductionCorpus {
  return {
    status,
    source: "supabase_postgresql",
    project_ref: PROJECT_REF,
    connected: false,
    fallback: "NONE",
    reason,
    counts: null,
  };
}

let pingCache: { at: number; value: ProductionCorpus } | null = null;

export async function scientificPing(): Promise<ProductionCorpus> {
  if (pingCache && Date.now() - pingCache.at < 15_000) return pingCache.value;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return absentCorpus("NOT_CONFIGURED", "DATABASE_URL assente in questo processo. La publishable key non è nel browser.");
  if (!url.includes(PROJECT_REF)) {
    return absentCorpus("REFUSED", "DATABASE_URL non punta al progetto production. Nessun altro database viene interrogato.");
  }
  const pool = scientificPool(url);
  const client = await pool.connect();
  try {
    await client.query("select 1 as ok");
    const value: ProductionCorpus = {
      status: "CONNECTED",
      source: "supabase_postgresql",
      project_ref: PROJECT_REF,
      connected: true,
      fallback: "NONE",
      reason: "Ping. Nessun count(*) su questo percorso.",
      counts: null,
    };
    pingCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    return absentCorpus(
      "UNREACHABLE",
      error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 240) : "Connessione production non riuscita.",
    );
  } finally {
    client.release();
  }
}

let snapshotCache: { at: number; id: string | null; source: "knowledge_snapshots" | "NOT_QUERIED" | "QUERY_FAILED" } | null = null;

export async function liveKnowledgeSnapshot(): Promise<{ id: string | null; source: "knowledge_snapshots" | "NOT_QUERIED" | "QUERY_FAILED" }> {
  if (snapshotCache && Date.now() - snapshotCache.at < 15_000) return { id: snapshotCache.id, source: snapshotCache.source };
  const url = process.env.DATABASE_URL?.trim();
  if (!url || !url.includes(PROJECT_REF)) {
    const value = { id: null, source: "NOT_QUERIED" as const };
    snapshotCache = { at: Date.now(), ...value };
    return value;
  }
  try {
    const pool = scientificPool(url);
    const result = await pool.query<{ snapshot_id: string }>("select snapshot_id from knowledge_snapshots");
    const ids = result.rows.map((row) => row.snapshot_id).filter((id) => typeof id === "string" && id.length > 0);
    const id = ids.filter((item) => item.startsWith("GGS-KNOWLEDGE-")).sort().at(-1) ?? ids.at(-1) ?? null;
    const value = { id, source: "knowledge_snapshots" as const };
    snapshotCache = { at: Date.now(), ...value };
    return value;
  } catch {
    const value = { id: null, source: "QUERY_FAILED" as const };
    snapshotCache = { at: Date.now(), ...value };
    return value;
  }
}

export async function productionCorpus(): Promise<ProductionCorpus> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return absentCorpus("NOT_CONFIGURED", "DATABASE_URL assente in questo processo. La publishable key non è nel browser.");
  if (!url.includes(PROJECT_REF)) {
    return absentCorpus("REFUSED", "DATABASE_URL non punta al progetto production. Nessun altro database viene interrogato.");
  }
  const pool = scientificPool(url);
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
      reason: error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 240) : "Connessione production non riuscita.",
      counts: null,
    };
  } finally {
    client.release();
  }
}

export async function productionNameSearch(query: string) {
  const corpus = await scientificPing();
  if (corpus.status !== "CONNECTED") {
    return { corpus, results: [] as { id: string; canonical_name: string; identity_status: string; record_role: string; match_kind: string }[], note: UNAVAILABLE };
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return { corpus, results: [], note: UNAVAILABLE };
  const pool = scientificPool(url);
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const rows = await client.query(
      `select id::text, display_name, identity_status, breeder
       from public.canonical_entities
       where display_name ilike $1 or name_norm ilike $1
       order by display_name
       limit 20`,
      [`%${query.replace(/[%_]/g, "")}%`],
    );
    await client.query("rollback");
    return {
      corpus,
      results: rows.rows.map((row) => ({
        id: `entity:${row.id}`,
        display_name: String(row.display_name),
        canonical_name: String(row.display_name),
        identity_status: String(row.identity_status ?? "UNKNOWN"),
        breeder: row.breeder == null ? null : String(row.breeder),
        record_role: "CANONICAL_ENTITY",
        match_kind: "SUPABASE",
        column: "display_name" as const,
      })),
      note: "Letto da public.canonical_entities.display_name. canonical_name nella risposta è lo stesso display_name. La colonna canonical_name non esiste.",
    };
  } finally {
    client.release();
  }
}

export const PRODUCTION_UNAVAILABLE = UNAVAILABLE;
