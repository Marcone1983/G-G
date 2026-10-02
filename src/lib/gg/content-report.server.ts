import pg from "pg";
import { connectableUrl } from "./prediction/pg-url.ts";

const KINDS = new Set([
  "incorrect",
  "offensive",
  "unsafe",
  "misleading",
  "scientifically_unsupported",
  "privacy",
  "image",
]);

export async function storeContentReport(input: {
  userId: string;
  kind: string;
  detail: string;
  targetId: string;
}): Promise<{ stored: boolean; status: string }> {
  if (!KINDS.has(input.kind)) return { stored: false, status: "REJECTED" };
  const detail = input.detail.trim().slice(0, 2000);
  if (detail.length < 3) return { stored: false, status: "REJECTED" };
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return { stored: false, status: "SCIENTIFIC_DB_UNAVAILABLE" };
  const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1, connectionTimeoutMillis: 8000 });
  try {
    await pool.query(
      `insert into content_reports (user_id, kind, detail, target_id)
       values ($1, $2, $3, $4)`,
      [input.userId, input.kind, detail, input.targetId.slice(0, 200)],
    );
    return { stored: true, status: "STORED" };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "42P01") return { stored: false, status: "SCHEMA_NOT_APPLIED" };
    return { stored: false, status: "WRITE_FAILED" };
  } finally {
    await pool.end();
  }
}
