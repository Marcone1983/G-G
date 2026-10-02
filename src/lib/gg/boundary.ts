const DENIED = new Set([
  "database",
  "database/all",
  "raw-measurements",
  "measurements/all",
  "measurements/raw",
  "internal-sql",
  "sql",
  "query",
  "supabase",
  "supabase/rest",
  "credentials",
  "secrets",
  "service-role",
  "service_role",
  "postgres",
  "connection",
]);

const QUERY_BOUND = new Set(["measurements", "chemistry", "samples"]);

export function boundaryDenial(path: string): { error: string; boundary: string; reason: string; database: "PRIVATE"; supabase_data_api: string } | null {
  const normalized = path.replace(/^\/+|\/+$/g, "").toLowerCase();
  const denied =
    DENIED.has(normalized) ||
    normalized.startsWith("database/") ||
    normalized.startsWith("internal-sql") ||
    normalized.startsWith("raw-measurements") ||
    normalized.includes("service_role") ||
    normalized.includes("service-role");
  if (!denied) return null;
  return {
    error: "DENIED",
    boundary: "PUBLIC_API",
    reason: "Raw database access is not an application operation.",
    database: "PRIVATE",
    supabase_data_api: "NOT_THE_APPLICATION_API",
  };
}

export function needsBoundedQuery(path: string, query: string | null): boolean {
  if (!QUERY_BOUND.has(path)) return false;
  return (query ?? "").trim().replace(/[%_]/g, "").length < 2;
}

export function publicArchitecture() {
  const configured = (process.env.GG_PUBLIC_BASE_URL ?? process.env.PRODUCTION_API_BASE_URL ?? "").trim();
  let publicHttps = false;
  if (configured.startsWith("https://")) {
    try {
      const host = new URL(configured).hostname.toLowerCase();
      publicHttps = Boolean(host) && host !== "localhost" && host !== "127.0.0.1" && host !== "10.0.2.2" && !host.endsWith(".local");
    } catch {
      publicHttps = false;
    }
  }
  const poolMax = Number(process.env.PG_POOL_MAX ?? 8);
  return {
    layers: ["native_client", "public_https_api", "scientific_engine", "private_postgresql", "optional_redis", "replaceable_ai_provider"],
    database_public: false,
    supabase_data_api: "NOT_THE_APPLICATION_API",
    credentials_in_client: false,
    public_https_configured: publicHttps,
    public_base_url: publicHttps ? configured : null,
    domain_status: publicHttps ? "CONFIGURED" : "NOT_CONFIGURED",
    invented_domain: false,
    pooling: "process_pool",
    pool_max: Number.isFinite(poolMax) ? poolMax : 8,
    rate_limit: "process_memory_120_per_minute",
    rate_limit_shared_across_instances: false,
    redis: process.env.REDIS_URL?.trim() ? "CONFIGURED" : "NOT_CONFIGURED",
    horizontal_instances: "STATELESS_API",
    load_test: "NOT_RUN",
    millions_of_users: "NOT_CLAIMED",
    ai_source_of_truth: false,
  };
}
