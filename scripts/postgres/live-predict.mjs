import { readFileSync } from "node:fs";
import pg from "pg";
import { predictOnPostgres } from "../../src/lib/gg/prediction/postgres-predict.ts";
import { searchEuropePmc } from "../../src/lib/gg/conversation/research.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL ABSENT");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1, statement_timeout: 60_000 });
const ddl = readFileSync(new URL("./009_research.sql", import.meta.url), "utf8");
await pool.query(ddl);

const live = await searchEuropePmc("cannabis cannabidiol", 1);
const paper = live.records[0];
if (!paper?.doi) {
  console.log("WEB", live.status, "PERSISTED", false);
} else {
  const researchId = `epmc-${paper.doi}`;
  await pool.query(
    `insert into research_sessions (research_id, query, knowledge_status, embedding_status, embedding_model, embedding_version)
     values ($1, $2, 'PENDING', 'EMBEDDING_UNAVAILABLE', null, null)
     on conflict (research_id) do nothing`,
    [researchId, "cannabis cannabidiol"],
  );
  await pool.query(
    `insert into research_claims
       (research_id, claim_type, claim_text, source_type, source_name, doi, url, publication_date, entity_id, evidence_level, knowledge_status, numeric_value)
     values ($1, 'LITERATURE_TITLE', $2, $3, $4, $5, $6, $7, null, 'TITLE_ONLY', 'PENDING', null)
     on conflict (doi) where doi is not null do nothing`,
    [researchId, paper.title, paper.source_class, paper.source_name, paper.doi, paper.url, paper.year],
  );
  console.log("WEB", live.status, "DOI", paper.doi, "VALUE", paper.value, "EMBEDDING", "EMBEDDING_UNAVAILABLE");
}
await pool.end();

const report = await predictOnPostgres(url, {
  parentA: "GMO",
  parentB: "Blueberry Muffin",
  parentAId: 5759,
  parentBId: 1927,
  compounds: ["delta_9_thc"],
  seed: 11,
});
const trait = report.traits[0];
const features = report.features.pattern_features;
console.log(JSON.stringify({
  source: report.source,
  snapshot: report.knowledge_snapshot,
  identity: report.identity_status,
  probability: report.prediction_probability,
  calibration: report.calibration_status,
  group_median_origin: report.group_median_origin,
  thc_groups_a: trait?.parent_a_groups,
  thc_groups_b: trait?.parent_b_groups,
  thc_centre: trait?.central_estimate,
  pattern_considered: features?.considered,
  pattern_used: features?.used?.length,
  pattern_weight_sum: features?.weight_sum,
  pattern_adjustment: features?.point_estimate_adjustment,
  historical: report.historical_crosses.status,
  embedding_model: report.embedding_model,
}));
