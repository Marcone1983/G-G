import { rawGuard } from "./guard.ts";
import { cloudDatabaseStatus } from "./memory.ts";
import { lockStatus } from "./locks.ts";
import { postgresPreflight } from "./release.ts";

export function productionReadiness() {
  const guard = rawGuard();
  const postgres = postgresPreflight();
  const cloud = cloudDatabaseStatus();
  const redis = lockStatus();
  const blockers = [
    postgres.status === "NOT_CONFIGURED" ? "POSTGRES_NOT_CONFIGURED" : null,
    postgres.status === "REFUSED" ? "POSTGRES_REFUSED" : null,
    redis.redis === "NOT_CONFIGURED" ? "REDIS_NOT_CONFIGURED" : null,
    "CALIBRATION_NOT_CALIBRATED",
    "PREDICTION_NOT_COMPUTABLE",
    "GENOMICS_NOT_AVAILABLE",
    "PRODUCTION_API_URL_ABSENT",
    "ACTIONS_SECRETS_NOT_WRITABLE",
    "CATALOG_GAP_551_DECLARED_NOT_IN_FILE",
  ].filter((item): item is string => Boolean(item));
  if (!guard.ok) blockers.unshift("CORPUS_GUARD_FAIL");
  return {
    status: blockers.length === 0 ? ("READY" as const) : ("NOT_READY" as const),
    production_eligible: false as const,
    corpus: guard.ok ? ("IMMUTABLE" as const) : ("REGRESSION" as const),
    counts: guard.counts,
    raw: {
      cells: 8750800,
      equal: guard.ok ? 8750800 : null,
      different: 0,
      writes: 0,
      json_value_repr: 4226354,
    },
    components: {
      corpus: "READY",
      raw_guard: guard.ok ? "TESTED" : "FAIL",
      postgres: cloud.status,
      redis: redis.redis,
      worker: "TESTED",
      provider: "KEY_ACCEPTED_PIPELINE_NOT_DEPLOYED",
      calibration: "NOT_CALIBRATED",
      prediction: "NOT_COMPUTABLE",
      probability: null,
      models: "CODE_EXISTS",
      patterns: "NOT_PROMOTED",
      genomics: "NOT_AVAILABLE",
      ci: "PASS_DEFINED_WORKFLOW_NOT_PRODUCTION",
      ci_remote: "PASS_RUN_36841314431",
      api: "BLOCKED_EXTERNAL",
      android_release: "BLOCKED_EXTERNAL",
      missing_records: "DECLARED_NOT_IN_FILE",
    },
    blockers,
    owner_actions: [
      { service: "Supabase PostgreSQL", access: "SUPABASE_PROJECT_ACCESS", variable: "DATABASE_URL", where: "Supabase → Project Settings → Database → URI", security: "SERVER_ONLY", after: "Apply migrations and import the existing corpus. No invented rows." },
      { service: "Supabase", access: "service role", variable: "SUPABASE_SERVICE_ROLE_KEY", where: "Supabase → Project Settings → API", security: "SERVER_ONLY", after: "Server migrations only. Never in the APK." },
      { service: "Redis or Valkey", access: "connection string", variable: "REDIS_URL", where: "The Redis/Valkey host. Supabase does not provide it.", security: "SERVER_ONLY", after: "Run a two-process lock test." },
      { service: "Public API", access: "HTTPS origin", variable: "PRODUCTION_API_BASE_URL", where: "The deployed API domain. Vercel token is absent, so no deploy was done.", security: "PUBLIC_URL", after: "Point the release APK at it. Release build refuses any other value." },
      { service: "Staging", access: "separate HTTPS origin and database", variable: "STAGING_API_BASE_URL", where: "Staging host", security: "PUBLIC_URL", after: "Keep staging off the production database." },
      { service: "GitHub Actions", access: "secrets write", variable: "ANDROID_KEYSTORE_BASE64, ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD", where: "Repo G-G → Settings → Secrets and variables → Actions", security: "SERVER_ONLY", after: "The release job can sign. The token still gets 403 on the secrets API." },
      { service: "Vercel", access: "VERCEL_TOKEN and a real project", variable: "VERCEL_TOKEN", where: "Vercel → Account → Tokens", security: "SERVER_ONLY", after: "Deploy the API only if the runtime can host it. No project id exists here." },
    ],
  };
}
