import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL ABSENT");
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1 });
const found = await pool.query(
  `select c.doi, c.knowledge_status, c.numeric_value, c.claim_type, s.embedding_status
   from research_claims c
   join research_sessions s on s.research_id = c.research_id
   where c.doi = $1`,
  ["10.1192/bjp.2023.91"],
);
console.log(JSON.stringify({
  rows: found.rowCount,
  doi: found.rows[0]?.doi ?? null,
  knowledge_status: found.rows[0]?.knowledge_status ?? null,
  numeric_value: found.rows[0]?.numeric_value ?? null,
  claim_type: found.rows[0]?.claim_type ?? null,
  embedding_status: found.rows[0]?.embedding_status ?? null,
}));
await pool.end();
if (found.rowCount !== 1) process.exit(1);
