import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { lockStatus } from "./locks.ts";

const EXPECTED = {
  source_records: 783429,
  samples: 762770,
  measurements: 8750800,
  canonical_entities: 20337,
  aliases: 15974,
  claims: 27782,
  pedigree_edges: 28592,
} as const;

const reportPath = path.join(process.cwd(), "data/raw-reconciliation.json");
const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export function rawGuard() {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    cells_compared: number;
    csv_cell_exact: number;
    csv_cell_mismatch: number;
    writes: number;
    nd_with_numeric_value: number;
    stored_fidelity: { JSON_VALUE_REPR: number; CSV_CELL_EXACT: number };
    mode: string;
  };
  const failures: string[] = [];
  if (report.mode !== "READ_ONLY") failures.push("REPORT_NOT_READ_ONLY");
  if (report.cells_compared !== 8750800 || report.csv_cell_exact !== 8750800) failures.push("CELL_COUNT");
  if (report.csv_cell_mismatch !== 0 || report.writes !== 0 || report.nd_with_numeric_value !== 0) failures.push("CELL_DRIFT");
  if (report.stored_fidelity.JSON_VALUE_REPR !== 4226354) failures.push("JSON_VALUE_REPR_CHANGED");
  if (report.stored_fidelity.CSV_CELL_EXACT !== 4524446) failures.push("CSV_CELL_EXACT_CHANGED");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const counts: Record<string, number> = {};
  try {
    for (const [table, expected] of Object.entries(EXPECTED)) {
      const got = Number((db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n);
      counts[table] = got;
      if (got !== expected) failures.push(`COUNT_${table}`);
    }
    const nd = Number((db.prepare("select count(*) as n from measurements where qualifier = 'ND' and value is not null").get() as { n: number }).n);
    if (nd !== 0) failures.push("ND_BECAME_NUMBER");
    const gap = db.prepare("select declared_rows, records_in_file, gap_count, reason_code from catalog_gaps limit 1").get() as {
      declared_rows: number;
      records_in_file: number;
      gap_count: number;
      reason_code: string;
    };
    if (gap.reason_code !== "DECLARED_NOT_IN_FILE" || gap.gap_count !== 551) failures.push("CATALOG_GAP");
    return {
      ok: failures.length === 0,
      failures,
      counts,
      gap: { ...gap, status: "NOT_AVAILABLE" as const },
      json_value_repr: "PRESERVED" as const,
      postgres: "NOT_CONFIGURED" as const,
      redis: lockStatus().redis,
      prediction_probability: null as null,
    };
  } finally {
    db.close();
  }
}
