import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { normalizeName } from "../src/lib/gg/engine.ts";
import { resolveQuery } from "../src/lib/gg/resolve.ts";

const query = process.argv[2] ?? "";
if (!query) throw new Error("missing query");
const norm = normalizeName(query);
const dbPath = "data/gg-foundation.sqlite";

function counts() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const n = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
    return {
      source_records: n("select count(*) as n from source_records"),
      measurements: n("select count(*) as n from measurements"),
      full_name_rows: n(`select count(*) as n from source_records where name_norm = '${norm.replaceAll("'", "''")}'`),
    };
  } finally {
    db.close();
  }
}

const before = counts();
const first = await resolveQuery(query);
const after = counts();
const db = new DatabaseSync(dbPath, { readOnly: true });
const event = first.research_id
  ? db.prepare("select id, status, grok_called, write_status, final_resolution, sources_consulted, sources_accepted, prompt_version, policy_version, error_status from research_events where id = ?").get(first.research_id)
  : null;
const cross = first.cross_id
  ? db.prepare("select id, status, relationship_status, origin, source_class, research_id from knowledge_crosses where id = ?").get(first.cross_id)
  : null;
const parents = first.cross_id
  ? db.prepare("select parent_role, parent_query, resolution_status, relationship_status, evidence_basis, parent_entity_ref from knowledge_cross_parents where cross_id = ?").all(first.cross_id)
  : [];
db.close();
const child = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/resolve-reread.ts", query], { encoding: "utf8" });
const rereadLine = child.stdout.trim().split("\n").at(-1) ?? "";
console.log(
  JSON.stringify(
    {
      before,
      after,
      counts_unchanged: before.source_records === after.source_records && before.measurements === after.measurements,
      first: {
        origin: first.origin,
        grok_called: first.grok_called,
        query_kind: first.query_kind,
        resolution_status: first.resolution_status,
        research_id: first.research_id,
        research_status: first.research_status,
        cross_id: first.cross_id,
        relationship_status: first.relationship_status,
        stages: first.stages,
        prediction_probability: first.prediction_probability,
        prediction_status: first.prediction_status,
        genomics: first.genomics,
        snapshot_id: first.snapshot_id,
        revision_id: first.revision_id,
      },
      event,
      cross,
      parents,
      answer: first.answer,
      restart: { status: child.status, stdout: rereadLine, called_model: child.stdout.includes("MODEL_CALLED"), stderr: child.stderr.slice(0, 500) },
    },
    null,
    2,
  ),
);
