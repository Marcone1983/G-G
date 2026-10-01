import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { circuitAllowsCall } from "./circuit.ts";
import { rawGuard } from "./guard.ts";
import { postgresPreflight } from "./release.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export function readinessReport() {
  const guard = rawGuard();
  const circuit = circuitAllowsCall();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let calibration = "CALIBRATION_REQUIRED";
  let provider = circuit.allow ? "BLOCKED" : "BLOCKED";
  try {
    const cal = db.prepare("select status from calibration_runs").all() as { status: string }[];
    if (cal.some((row) => row.status === "CALIBRATED")) calibration = "CALIBRATED";
    else if (cal.length > 0) calibration = "NOT_CALIBRATED";
    const blocked = db
      .prepare("select status from research_events where status = 'BLOCKED' or error_status like '%spending-limit%' limit 1")
      .get() as { status: string } | undefined;
    provider = blocked || !circuit.allow ? "BLOCKED" : "NOT_PROBED";
  } finally {
    db.close();
  }
  return {
    database: "SQLITE_SOURCE_OF_TRUTH" as const,
    postgres: postgresPreflight().status,
    redis: guard.redis,
    ci: "CONFIGURED" as const,
    provider,
    provider_live_call: false as const,
    prediction: "NOT_COMPUTABLE" as const,
    calibration,
    genomics: "NOT_AVAILABLE" as const,
    worker: "READY" as const,
    worker_backend: "PROCESS_LOCAL" as const,
    raw_guard: guard.ok ? ("PASS" as const) : ("FAIL" as const),
    probability: null as null,
    counts: guard.counts,
  };
}
