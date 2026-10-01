import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";
import { predictOnPostgres } from "../../src/lib/gg/prediction/postgres-predict.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL ABSENT");
  process.exit(2);
}
const crosses = [
  ["GMO", "Blueberry Muffin"],
  ["Black Domina '98", "Sugar Black Rose"],
  ["Purple Punch", "Wedding Cake"],
  ["Gelato #33", "Wedding Cake"],
  ["Super Lemon Haze", "LSD"],
  ["OG Kush", "Super Lemon Haze"],
  ["Northern Lights #5", "Super Lemon Haze"],
  ["Purple Punch", "Gelato #33"],
  ["Wedding Cake", "Super Lemon Haze"],
  ["LSD", "Purple Punch"],
  ["OG Kush", "Wedding Cake"],
];
for (const [parentA, parentB] of crosses) {
  const report = await predictOnPostgres(url, { parentA, parentB, compounds: ["delta_9_thc"], seed: 11 });
  const trait = report.traits[0];
  console.log(JSON.stringify({
    cross: `${parentA} x ${parentB}`,
    source: report.source,
    snapshot: report.knowledge_snapshot,
    identity: report.identity_status,
    groups_a: trait?.parent_a_groups ?? null,
    groups_b: trait?.parent_b_groups ?? null,
    centre: trait?.central_estimate ?? null,
    probability: report.prediction_probability,
    calibration: report.calibration_status,
    historical: report.historical_crosses.status,
    pattern_adjustment: report.features.pattern_features?.point_estimate_adjustment ?? null,
    group_median_origin: report.group_median_origin,
  }));
}
const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1 });
const patterns = await pool.query("select count(*)::int as n from pattern_candidates");
const compounds = await pool.query(
  `select compound, count(*)::int as n
   from measurements
   where compound = any($1::text[])
   group by compound
   order by compound`,
  [["delta_9_thc", "thca", "cbd", "cbda", "cbg", "cbga", "cbc", "cbn", "thcv", "cbdv"]],
);
console.log(JSON.stringify({ pattern_candidates: patterns.rows[0].n, compound_rows: compounds.rows }));
await pool.end();
