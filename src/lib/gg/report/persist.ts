import { createHash } from "node:crypto";

import type { Sql } from "@/lib/db";
import type { ArchitectureReport } from "./architecture.ts";

export const REPORT_SCHEMA = "gg-report-architecture-1";
const FIXTURE_ACTOR = "fixture:synthetic";

export function publicReport(report: ArchitectureReport): ArchitectureReport {
  return {
    ...report,
    query_interpretation: { ...report.query_interpretation, raw: report.query_interpretation.intent },
  };
}

export function reportCacheKey(input: { parents: string[]; generation: string[]; requested: string[]; model: string; snapshot: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({
      parents: input.parents.map((parent) => parent.trim().toLowerCase()),
      generation: input.generation,
      requested: input.requested,
      model: input.model,
      snapshot: input.snapshot,
      schema: REPORT_SCHEMA,
    }))
    .digest("hex");
}

export function fixtureMetrics(): { calibration_status: "NOT_CALIBRATED"; brier: null; global_knowledge: false; reason: string } {
  return {
    calibration_status: "NOT_CALIBRATED",
    brier: null,
    global_knowledge: false,
    reason: "SYNTHETIC_TEST_FIXTURE è escluso dalla calibrazione e dalla conoscenza globale.",
  };
}

export async function readCompatibleReport(sql: Sql, key: string, model: string, snapshot: string): Promise<ArchitectureReport | null> {
  const rows = await sql<{ result_json: string }>`
    select result_json from gg_cache
    where cache_key = ${key}
      and model_version = ${model}
      and snapshot_id = ${snapshot}
      and schema_version = ${REPORT_SCHEMA}
      and invalidation_status = 'valid'`;
  const row = rows[0];
  if (!row) return null;
  await sql`update gg_cache set last_accessed = now() where cache_key = ${key}`;
  return JSON.parse(row.result_json) as ArchitectureReport;
}

export async function persistPublicReport(sql: Sql, report: ArchitectureReport): Promise<{ cross_id: string; prediction_id: string; stored: "INSERTED" | "EXISTING" }> {
  const stored = publicReport(report);
  const parents = stored.identity_resolution.parents.map((parent) => parent.query);
  const crossId = reportCacheKey({
    parents,
    generation: stored.generational_interpretation.labels,
    requested: stored.query_interpretation.requested,
    model: stored.provenance.model_version,
    snapshot: stored.provenance.knowledge_snapshot,
  });
  const predictionId = stored.provenance.prediction_id ?? crossId;
  const request = JSON.stringify({
    parents: stored.identity_resolution.parents.map((parent) => ({ query: parent.query, status: parent.status, id: parent.candidates[0]?.entity_id ?? null })),
    generation: stored.generational_interpretation.labels,
    schema: REPORT_SCHEMA,
  });
  await sql`insert into gg_crosses (id, user_id, parent_a_query, parent_b_query, parent_a_id, parent_b_id, cross_type, request_json)
    values (${crossId}, ${null}, ${stored.identity_resolution.parents[0]?.query ?? ""}, ${stored.identity_resolution.parents[1]?.query ?? ""}, ${stored.identity_resolution.parents[0]?.candidates[0]?.entity_id ?? null}, ${stored.identity_resolution.parents[1]?.candidates[0]?.entity_id ?? null}, ${stored.query_interpretation.intent}, ${request})
    on conflict (id) do nothing`;
  const inserted = await sql<{ id: string }>`
    insert into gg_predictions (id, cross_id, user_id, model_version, snapshot_id, report_json)
    values (${predictionId}, ${crossId}, ${null}, ${stored.provenance.model_version}, ${stored.provenance.knowledge_snapshot}, ${JSON.stringify(stored)})
    on conflict (id) do nothing
    returning id`;
  await sql`insert into gg_cache (cache_key, model_version, snapshot_id, schema_version, result_json, ttl_seconds, invalidation_status)
    values (${crossId}, ${stored.provenance.model_version}, ${stored.provenance.knowledge_snapshot}, ${REPORT_SCHEMA}, ${JSON.stringify(stored)}, ${60 * 60 * 24 * 7}, 'valid')
    on conflict (cache_key) do nothing`;
  await sql`insert into gg_audit (id, actor_user_id, action, subject_type, subject_id, meta_json)
    values (${`audit:${predictionId}`}, ${null}, 'report_persisted', 'prediction', ${predictionId}, ${JSON.stringify({ schema: REPORT_SCHEMA, snapshot: stored.provenance.knowledge_snapshot, visualization: stored.visualization.status })})
    on conflict (id) do nothing`;
  return { cross_id: crossId, prediction_id: predictionId, stored: inserted[0] ? "INSERTED" : "EXISTING" };
}

export async function readPublicPrediction(sql: Sql, id: string): Promise<ArchitectureReport | null> {
  const rows = await sql<{ report_json: string; user_id: string | null }>`
    select report_json, user_id from gg_predictions where id = ${id}`;
  const row = rows[0];
  if (!row || row.user_id) return null;
  return JSON.parse(row.report_json) as ArchitectureReport;
}

export async function readPublicCross(sql: Sql, id: string): Promise<{ id: string; predictions: { id: string }[] } | null> {
  const rows = await sql<{ id: string }>`select id from gg_crosses where id = ${id} and user_id is null`;
  if (!rows[0]) return null;
  const predictions = await sql<{ id: string }>`select id from gg_predictions where cross_id = ${id} and user_id is null order by created_at`;
  return { id, predictions };
}

export async function attachSyntheticFixture(sql: Sql, predictionId: string, trait: string): Promise<{ observation_id: string; calibration_status: "NOT_CALIBRATED"; prediction_unchanged: true; global_accepted: false } | { error: "Predizione non trovata" }> {
  const before = await sql<{ report_json: string }>`select report_json from gg_predictions where id = ${predictionId} and user_id is null`;
  const row = before[0];
  if (!row) return { error: "Predizione non trovata" };
  const observationId = `fixture:${predictionId}:${trait}`.slice(0, 80);
  const scientific = JSON.stringify({ trait, fixture: "SYNTHETIC_TEST_FIXTURE", claim_class: "SYNTHETIC_TEST_FIXTURE", global_knowledge: false });
  await sql`insert into gg_observations (id, user_id, prediction_id, visibility, scientific_json, private_note)
    values (${observationId}, ${FIXTURE_ACTOR}, ${predictionId}, 'private', ${scientific}, ${null})
    on conflict (id) do nothing`;
  await sql`insert into gg_outcomes (id, prediction_id, observation_id, metrics_json)
    values (${`outcome:${observationId}`}, ${predictionId}, ${observationId}, ${JSON.stringify(fixtureMetrics())})
    on conflict (id) do nothing`;
  const after = await sql<{ report_json: string }>`select report_json from gg_predictions where id = ${predictionId}`;
  if (after[0]?.report_json !== row.report_json) throw new Error("La predizione storica è stata alterata.");
  return { observation_id: observationId, calibration_status: "NOT_CALIBRATED", prediction_unchanged: true, global_accepted: false };
}

export async function searchPublicReports(sql: Sql, filters: { parent?: string; generation?: string; snapshot?: string; limit?: number }): Promise<{ id: string; parent_a: string; parent_b: string; snapshot_id: string; model_version: string }[]> {
  const parent = filters.parent?.trim().toLowerCase() ?? "";
  const generation = filters.generation?.trim().toUpperCase() ?? "";
  const snapshot = filters.snapshot?.trim() ?? "";
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
  return sql<{ id: string; parent_a: string; parent_b: string; snapshot_id: string; model_version: string }>`
    select p.id, c.parent_a_query as parent_a, c.parent_b_query as parent_b, p.snapshot_id, p.model_version
    from gg_predictions p
    join gg_crosses c on c.id = p.cross_id
    where p.user_id is null
      and (${parent} = '' or lower(c.parent_a_query) like ${"%" + parent + "%"} or lower(c.parent_b_query) like ${"%" + parent + "%"})
      and (${generation} = '' or c.request_json ilike ${"%" + generation + "%"})
      and (${snapshot} = '' or p.snapshot_id = ${snapshot})
    order by p.created_at desc
    limit ${limit}`;
}
