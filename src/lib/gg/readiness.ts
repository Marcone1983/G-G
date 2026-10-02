import { rawGuard } from "./guard.ts";
import { postgresPreflight } from "./release.ts";

export function readinessReport() {
  let guard: ReturnType<typeof rawGuard> | null = null;
  let rawGuardStatus: "PASS" | "FAIL" | "FILE_ABSENT_ON_HOST" = "FAIL";
  try {
    guard = rawGuard();
    rawGuardStatus = guard.ok ? "PASS" : "FAIL";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
    rawGuardStatus = code === "ENOENT" ? "FILE_ABSENT_ON_HOST" : "FAIL";
  }
  return {
    database: "POSTGRESQL_WHEN_CONFIGURED" as const,
    sqlite_on_this_host: guard ? ("OPENED" as const) : ("NOT_OPENED" as const),
    local_sqlite_is_production: false as const,
    postgres: postgresPreflight().status,
    redis: guard?.redis ?? ("NOT_READ" as const),
    provider_live_call: false as const,
    prediction: "NOT_COMPUTABLE" as const,
    calibration: "NOT_THIS_ROUTE" as const,
    genomics: "SEE_INVENTORY" as const,
    raw_guard: rawGuardStatus,
    probability: null as null,
    counts: guard?.counts ?? null,
  };
}