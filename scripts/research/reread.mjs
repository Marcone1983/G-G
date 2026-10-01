import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL ABSENT");
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1 });
const kinds = await pool.query("select record_kind, count(*)::int as n from acquisition_records group by 1 order by 1");
const sources = await pool.query("select decision, count(*)::int as n from acquisition_sources group by 1 order by 1");
const measurements = await pool.query("select count(*)::bigint as n from measurements");
const entities = await pool.query("select count(*)::bigint as n from canonical_entities");
console.log(JSON.stringify({
  research_session_id: "acq-20261001-public-01",
  kinds: kinds.rows,
  decisions: sources.rows,
  measurements: measurements.rows[0].n,
  canonical_entities: entities.rows[0].n,
}));
await pool.end();
