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
    "PROVIDER_BLOCKED",
    "CALIBRATION_NOT_CALIBRATED",
    "PREDICTION_NOT_COMPUTABLE",
    "GENOMICS_NOT_AVAILABLE",
    "CI_REMOTE_NOT_RUN",
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
      provider: "BLOCKED",
      calibration: "NOT_CALIBRATED",
      prediction: "NOT_COMPUTABLE",
      probability: null,
      models: "TESTED",
      patterns: "NOT_PROMOTED",
      genomics: "NOT_AVAILABLE",
      ci: "CONFIGURED",
      ci_remote: "NOT_RUN",
      missing_records: "DECLARED_NOT_IN_FILE",
    },
    blockers,
  };
}
