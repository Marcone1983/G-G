import pg from "pg";

import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log(JSON.stringify({ status: "NOT_CONFIGURED", measurements_written: 0 }));
  process.exit(0);
}
const search = await fetch("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=cannabis%20flavonoid%20biosynthesis&format=json&pageSize=1");
if (!search.ok) {
  console.log(JSON.stringify({ status: "SOURCE_HTTP", http: search.status, measurements_written: 0 }));
  process.exit(1);
}
const payload = (await search.json()) as { resultList?: { result?: { id?: string; source?: string; title?: string; doi?: string; pmid?: string; pubYear?: string; isOpenAccess?: string }[] } };
const paper = payload.resultList?.result?.[0];
if (!paper?.id) {
  console.log(JSON.stringify({ status: "NO_HIT", measurements_written: 0 }));
  process.exit(1);
}
const externalId = `${paper.source ?? "europepmc"}:${paper.id}`;
const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const before = await client.query("select count(*)::text as n from public.measurements");
  const present = await client.query("select to_regclass('public.research_papers') as name");
  if (!present.rows[0]?.name) {
    console.log(JSON.stringify({ status: "TABLE_ABSENT", table: "research_papers", measurements: before.rows[0].n }));
    process.exit(0);
  }
  const inserted = await client.query(
    `insert into public.research_papers (external_id, source_id, title, doi, pmid, publication_year, is_open_access, knowledge_status, license)
     values ($1, 'europepmc', $2, $3, $4, $5, $6, 'UNREVIEWED', 'METADATA_ONLY')
     on conflict (external_id) do nothing
     returning external_id`,
    [externalId, paper.title ?? null, paper.doi ?? null, paper.pmid ?? null, paper.pubYear ?? null, paper.isOpenAccess === "Y"],
  );
  const after = await client.query("select count(*)::text as n from public.measurements");
  const stored = await client.query("select knowledge_status from public.research_papers where external_id = $1", [externalId]);
  console.log(JSON.stringify({
    status: inserted.rowCount === 1 ? "INSERTED_UNREVIEWED" : "ALREADY_PRESENT",
    external_id: externalId,
    knowledge_status: stored.rows[0]?.knowledge_status ?? null,
    measurements_before: before.rows[0].n,
    measurements_after: after.rows[0].n,
    measurements_written: 0,
  }));
  if (before.rows[0].n !== after.rows[0].n) process.exit(1);
} finally {
  client.release();
  await pool.end();
}
