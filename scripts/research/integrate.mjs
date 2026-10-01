import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";
import { predictOnPostgres } from "../../src/lib/gg/prediction/postgres-predict.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL ABSENT");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: connectableUrl(url), max: 1, statement_timeout: 900_000 });
const client = await pool.connect();

async function counts() {
  const result = await client.query(`
    select
      (select count(*)::bigint from measurements) as measurements,
      (select count(*)::bigint from canonical_entities) as entities,
      (select count(*)::bigint from acquisition_records) as acquired,
      (select count(*)::bigint from pattern_candidates) as patterns
  `);
  return result.rows[0];
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function main() {
  const before = await counts();
  console.log(JSON.stringify({ stage: "before", ...before }));
  await client.query(readFileSync(new URL("../postgres/011_knowledge.sql", import.meta.url), "utf8"));

  await client.query(`
    insert into scientific_records
      (source_id, external_id, record_kind, claim_type, knowledge_status, entity_name, title, numeric_value, unit, license, doi, payload)
    select r.source_id, r.external_id, r.record_kind, r.claim_type, r.knowledge_status, r.entity_name, r.title,
           r.numeric_value, r.unit, s.license, s.doi, r.payload
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    on conflict (source_id, external_id) do nothing
  `);

  await client.query(`
    insert into structural_variants
      (source_id, external_id, sample_code, chromosome, start_pos, end_pos, sv_type, resolved_to_catalog, license)
    select r.source_id, r.external_id, r.entity_name,
           r.payload->>'chromosome',
           nullif(r.payload->>'start', '')::bigint,
           nullif(r.payload->>'end', '')::bigint,
           r.payload->>'feature',
           'UNRESOLVED',
           s.license
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'GENOMIC_INTERVAL'
    on conflict (source_id, external_id) do nothing
  `);

  await client.query(`
    insert into genome_assemblies (assembly_accession, source_id, title, license, resolved_to_catalog, payload)
    select r.external_id, r.source_id, r.title, s.license, 'UNRESOLVED', r.payload
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'GENOME_ASSEMBLY'
    on conflict (assembly_accession) do nothing
  `);

  await client.query(`
    insert into protein_records (accession, source_id, gene_name, title, length_aa, license, resolved_to_catalog)
    select r.external_id, r.source_id, r.entity_name, r.title, r.numeric_value, s.license, 'UNRESOLVED'
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'PROTEIN'
    on conflict (accession) do nothing
  `);

  await client.query(`
    insert into research_papers (external_id, source_id, title, doi, pmid, publication_year, is_open_access, knowledge_status, license)
    select r.source_id || ':' || r.external_id, r.source_id, r.title,
           r.payload->>'doi', r.payload->>'pmid', r.payload->>'year',
           (r.payload->>'is_open_access')::boolean, r.knowledge_status, s.license
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'PAPER'
    on conflict (external_id) do nothing
  `);

  await client.query(`
    insert into expression_studies (accession, source_id, title, sample_count, license, matrices_downloaded)
    select r.external_id, r.source_id, r.title, r.numeric_value, s.license, false
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'EXPRESSION_SERIES'
    on conflict (accession) do nothing
  `);

  await client.query(`
    insert into chemical_observations
      (source_id, external_id, sample_code, compound_name, numeric_value, unit, knowledge_status, matrix, resolved_to_catalog, feature_status, license)
    select r.source_id, r.external_id, r.entity_name, r.title, r.numeric_value, null,
           'REPORTED_WITHOUT_UNIT', 'hemp_seed_extract_gcms', 'UNRESOLVED', 'NOT_A_MODEL_FEATURE', s.license
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    where r.record_kind = 'RELATIVE_SIGNAL'
    on conflict (source_id, external_id) do nothing
  `);

  const matrix = await client.query(`
    select s.source_id, r.record_kind, s.license, s.decision, count(*)::int as n
    from acquisition_records r
    join acquisition_sources s on s.source_id = r.source_id
    group by 1, 2, 3, 4
    order by n desc
  `);
  console.log(JSON.stringify({ stage: "matrix", rows: matrix.rows }));

  await client.query("drop table if exists group_medians");
  await client.query(`
    create temporary table group_medians as
    select s.name_norm,
           m.compound,
           coalesce(nullif(s.independence_group, ''), nullif(s.source_id, ''), 'unknown') as grp,
           min(s.source_id) as source_id,
           min(m.unit) as unit,
           percentile_cont(0.5) within group (order by m.numeric_value) as median
    from measurements m
    join source_records s on s.id = m.source_record_id
    where m.value_status = 'NUMERIC'
      and m.numeric_value is not null
      and s.name_norm is not null
      and s.name_norm <> ''
    group by 1, 2, 3
  `);

  await client.query(`
    insert into scientific_features
      (feature_id, entity_name, feature_type, compound, value, unit, q1, q3, independent_groups, independent_sources,
       derivation, quality, model_eligibility, model_version, knowledge_snapshot)
    select md5(name_norm || ':' || compound), name_norm, 'LABEL_GROUP_MEDIAN', compound, centre, unit, q1, q3, groups, sources,
           'median of independence-group medians; raw rows are not replicates',
           'LABEL_AGGREGATE',
           'DESCRIPTIVE_ONLY',
           'gg-additive-midparent-v1',
           'GGS-KNOWLEDGE-000007'
    from (
      select name_norm, compound,
             percentile_cont(0.5) within group (order by median) as centre,
             percentile_cont(0.25) within group (order by median) as q1,
             percentile_cont(0.75) within group (order by median) as q3,
             min(unit) as unit,
             count(*)::bigint as groups,
             count(distinct source_id)::bigint as sources
      from group_medians
      group by name_norm, compound
      having count(*) >= 2
    ) stats
    on conflict (feature_id) do nothing
  `);

  await client.query(`
    insert into pattern_candidates
      (id, pattern_key, hypothesis, lifecycle, promoted_to_validated, sample_size, independent_sources,
       contradictions, source_quality, model_version, knowledge_snapshot, effect_estimate)
    select coalesce((select max(id) from pattern_candidates), 0) + row_number() over (order by name_norm, compound),
           'entity:' || name_norm || ':' || compound,
           'Observed label aggregate for ' || compound || '. Not a genetic effect and not validated.',
           'CANDIDATE', 0, groups, sources, 0, 'LABEL_AGGREGATE', 'gg-additive-midparent-v1', 'GGS-KNOWLEDGE-000007', centre
    from (
      select name_norm, compound,
             percentile_cont(0.5) within group (order by median) as centre,
             count(*)::int as groups,
             count(distinct source_id)::int as sources
      from group_medians
      group by name_norm, compound
      having count(*) >= 5
    ) stats
    on conflict (pattern_key) do nothing
  `);

  await client.query(`
    insert into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
    select 'GGS-KNOWLEDGE-000007', count(*)::int, (select count(*)::int from measurements),
           'Features and candidate patterns were derived from existing measurements. No measurement row was modified.'
    from source_records
    on conflict (snapshot_id) do nothing
  `);

  const summary = await client.query(`
    select
      (select count(*)::int from scientific_records) as scientific_records,
      (select count(*)::int from structural_variants) as structural_variants,
      (select count(*)::int from genome_assemblies) as assemblies,
      (select count(*)::int from protein_records) as proteins,
      (select count(*)::int from research_papers) as papers,
      (select count(*)::int from expression_studies) as expression_studies,
      (select count(*)::int from chemical_observations) as chemical_observations,
      (select count(*)::int from scientific_features) as features,
      (select count(*)::int from pattern_candidates) as patterns,
      (select count(*)::int from pattern_candidates where lifecycle = 'CANDIDATE') as candidates,
      (select count(*)::int from pattern_candidates where lifecycle = 'SUPPORTED') as supported,
      (select count(*)::int from pattern_candidates where lifecycle = 'VALIDATED' or promoted_to_validated = 1) as validated
  `);
  console.log(JSON.stringify({ stage: "promoted", ...summary.rows[0] }));

  const klass = await client.query(`
    select coalesce(klass, 'UNCLASSIFIED') as klass, count(*)::bigint as n
    from measurements
    group by 1
    order by n desc
    limit 12
  `);
  console.log(JSON.stringify({ stage: "measurement_classes", rows: klass.rows }));

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/api/v1/predictions") {
      response.writeHead(404);
      response.end();
      return;
    }
    const body = JSON.parse(await readBody(request));
    const report = await predictOnPostgres(url, body);
    const trait = report.traits[0];
    await client.query(
      `insert into prediction_records
         (prediction_id, snapshot_id, model_version, identity_status, central_estimate, probability, calibration_status, cache_status, report)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       on conflict (prediction_id) do nothing`,
      [
        report.prediction_id,
        report.knowledge_snapshot,
        report.model_version,
        report.identity_status,
        trait?.central_estimate ?? null,
        report.prediction_probability,
        report.calibration_status,
        report.cache_status,
        JSON.stringify({
          identity_status: report.identity_status,
          central_estimate: trait?.central_estimate ?? null,
          probability: report.prediction_probability,
          calibration_status: report.calibration_status,
          cache_status: report.cache_status,
          patterns_considered: report.features.pattern_features?.considered ?? 0,
          patterns_used: report.features.pattern_features?.used ?? [],
          historical: report.historical_crosses.status,
          embedding_model: report.embedding_model,
        }),
      ],
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      prediction_id: report.prediction_id,
      snapshot: report.knowledge_snapshot,
      model_version: report.model_version,
      identity: report.identity_status,
      centre: trait?.central_estimate ?? null,
      probability: report.prediction_probability,
      calibration: report.calibration_status,
      cache: report.cache_status,
      patterns_used: report.features.pattern_features?.used?.length ?? 0,
      patterns_rejected: report.features.pattern_features?.rejected?.length ?? 0,
      source: report.source,
    }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const payload = JSON.stringify({
    parentA: "GMO",
    parentB: "Blueberry Muffin",
    parentAId: 5759,
    parentBId: 1927,
    compounds: ["delta_9_thc"],
    seed: 11,
  });
  const first = await fetch(`http://127.0.0.1:${port}/api/v1/predictions`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  const firstBody = await first.json();
  const second = await fetch(`http://127.0.0.1:${port}/api/v1/predictions`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  const secondBody = await second.json();
  console.log(JSON.stringify({ stage: "http", first_status: first.status, first: firstBody, second_status: second.status, second_cache: secondBody.cache }));
  server.close();

  const after = await counts();
  const persisted = await client.query("select count(*)::int as n from prediction_records");
  console.log(JSON.stringify({ stage: "after", ...after, predictions: persisted.rows[0].n, measurements_unchanged: String(before.measurements) === String(after.measurements) }));
  client.release();
  await pool.end();
  if (first.status !== 200) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "INTEGRATION_FAILED");
  process.exit(1);
});
