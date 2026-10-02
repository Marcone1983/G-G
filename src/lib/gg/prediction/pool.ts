import pg from "pg";

import { connectableUrl } from "./pg-url.ts";

const PROJECT_REF = "tupswxnfidpemjkzwgkx";

let shared: pg.Pool | null = null;
let sharedKey = "";

export function scientificPool(databaseUrl: string): pg.Pool {
  const url = connectableUrl(databaseUrl.trim());
  if (!url.includes(PROJECT_REF)) throw new Error("DATABASE_URL rifiutato.");
  if (shared && sharedKey === url) return shared;
  const previous = shared;
  const requested = Number(process.env.PG_POOL_MAX ?? 8);
  const max = Number.isFinite(requested) && requested >= 1 && requested <= 20 ? requested : 8;
  shared = new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    ssl: { rejectUnauthorized: false },
  });
  sharedKey = url;
  if (previous) void previous.end().catch(() => undefined);
  return shared;
}
