import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { providerBlock } from "./classify.ts";
import { UNIFIED_SNAPSHOT } from "./brain.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export function providerHealth() {
  const configured = Boolean(process.env.XAI_API_KEY);
  let lastAttempt: string | null = null;
  let lastSuccess: string | null = null;
  let lastError: string | null = null;
  let lastStatus: string | null = null;
  let cooldown = false;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const last = db
      .prepare(
        `select status, error_status, completed_at, started_at from research_events
         order by started_at desc limit 1`,
      )
      .get() as { status: string; error_status: string | null; completed_at: string | null; started_at: string } | undefined;
    const ok = db
      .prepare(
        `select completed_at from research_events where status = 'COMPLETED' and grok_called = 1 order by completed_at desc limit 1`,
      )
      .get() as { completed_at: string | null } | undefined;
    db.close();
    if (last) {
      lastAttempt = last.completed_at ?? last.started_at;
      lastStatus = last.status;
      lastError = last.error_status;
      const at = Date.parse(last.completed_at ?? "");
      cooldown = (last.status === "BLOCKED" || providerBlock(last.error_status ?? "")) && Number.isFinite(at) && Date.now() - at < 30 * 60 * 1000;
    }
    lastSuccess = ok?.completed_at ?? null;
  } catch {
    lastError = "STORE_UNREADABLE";
  }
  const blocked = lastStatus === "BLOCKED" || providerBlock(lastError ?? "");
  return {
    provider: "xai",
    model: "grok-4.5",
    configured,
    reachable: "NOT_VERIFIED" as const,
    authenticated: configured ? ("NOT_VERIFIED" as const) : ("NOT_CONFIGURED" as const),
    quota_available: blocked ? false : ("NOT_VERIFIED" as const),
    live_test: blocked ? ("LIVE_PROVIDER_BLOCKED" as const) : ("NOT_RUN" as const),
    last_attempt: lastAttempt,
    last_success: lastSuccess,
    last_error: lastError,
    last_status: lastStatus,
    cooldown,
    snapshot_id: UNIFIED_SNAPSHOT,
    secrets: "OMITTED" as const,
  };
}
