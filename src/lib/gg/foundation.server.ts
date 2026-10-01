import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { qualityReport, retrieve } from "./brain.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");
const metricsPath = path.join(process.cwd(), "data/foundation-metrics.json");

export function foundationStatus() {
  const report = qualityReport();
  const artifact = existsSync(metricsPath) ? (JSON.parse(readFileSync(metricsPath, "utf8")) as Record<string, unknown>) : null;
  return {
    ready: report.ready === true,
    source_of_truth: "sqlite:data/gg-foundation.sqlite" as const,
    import_artifact_role: "IMPORT_MANIFEST_NOT_SOURCE_OF_TRUTH" as const,
    import_artifact: artifact,
    ...report,
  };
}

export function foundationNameStats(query: string) {
  const text = query.trim();
  if (!existsSync(dbPath) || !existsSync(metricsPath) || text.length < 2) return null;
  const norm = normalize(text);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        `select
           count(*) as records,
           sum(case when match_status = 'CONFLICTING_IDENTITY' then 1 else 0 end) as conflicts,
           sum(case when match_status = 'POSSIBLE_MATCH' then 1 else 0 end) as possible,
           sum(case when match_status = 'UNRESOLVED' then 1 else 0 end) as unresolved
         from source_records where name_norm = ?`,
      )
      .get(norm) as { records: number; conflicts: number | null; possible: number | null; unresolved: number | null };
    const measured = db
      .prepare(
        `select count(*) as n from measurements m
         join source_records r on r.id = m.source_record_id
         where r.name_norm = ? and m.value is not null`,
      )
      .get(norm) as { n: number };
    const independent = tableExists(db, "observation_units")
      ? (db
          .prepare(
            `select count(distinct u.independence_group) as n
             from source_records r
             join observation_units u on u.source_record_id = r.id
             where r.name_norm = ? and u.unit_kind = 'LAB_SAMPLE'`,
          )
          .get(norm) as { n: number })
      : null;
    return {
      query: text,
      name_norm: norm,
      source_records: Number(row.records ?? 0),
      numeric_measurements: Number(measured.n ?? 0),
      independent_lab_samples: independent ? Number(independent.n) : null,
      conflicting: Number(row.conflicts ?? 0),
      possible_name_matches: Number(row.possible ?? 0),
      unresolved: Number(row.unresolved ?? 0),
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      note: "source_records sono righe. independent_lab_samples sono campioni. Le misure dello stesso campione non sono repliche.",
    };
  } finally {
    db.close();
  }
}

export function foundationSearch(query: string) {
  return retrieve(query);
}

function tableExists(db: DatabaseSync, name: string) {
  const row = db.prepare("select 1 as ok from sqlite_master where type in ('table','view') and name = ?").get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/®/g, "")
    .replace(/['’]/g, "")
    .replace(/[#_./]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(the|strain)\s+/, "");
}
