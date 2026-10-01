import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";

import { foundationSearch } from "../src/lib/gg/foundation.server.ts";

const db = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });

function ms(started: number) {
  return Math.round((performance.now() - started) * 100) / 100;
}

function timed(label: string, run: () => unknown) {
  const started = performance.now();
  const value = run();
  const rows = Array.isArray(value) ? value.length : value && typeof value === "object" && "n" in (value as object) ? Number((value as { n: number }).n) : null;
  return { label, ms: ms(started), rows };
}

const alias = db.prepare("select alias, alias_norm from aliases where alias_norm != '' limit 1").get() as { alias: string; alias_norm: string };
const pheno = db.prepare(
  `select r.name_norm as name from phenotypes p join source_records r on r.id = p.source_record_id limit 1`,
).get() as { name: string };
const pedigreeName = db.prepare(
  `select c.name_norm as name from pedigree_edges e join canonical_entities c on c.id = e.child_canonical_id limit 1`,
).get() as { name: string };

const plan = db
  .prepare(
    `explain query plan
     select m.klass, count(*)
     from measurements m
     join source_records r on r.id = m.source_record_id
     where r.name_norm = 'gelato'
     group by m.klass`,
  )
  .all();

const sql = [
  timed("exact_lookup_1", () => db.prepare("select id, original_name, breeder, source_id from source_records where name_norm = ? limit 30").all("gelato")),
  timed("exact_lookup_2", () => db.prepare("select id, original_name, breeder, source_id from source_records where name_norm = ? limit 30").all("gelato")),
  timed("alias_lookup_1", () => db.prepare("select canonical_id, alias from aliases where alias_norm = ?").all(alias.alias_norm)),
  timed("alias_lookup_2", () => db.prepare("select canonical_id, alias from aliases where alias_norm = ?").all(alias.alias_norm)),
  timed("pedigree_lookup_1", () =>
    db.prepare(
      `select e.parent_text, e.identity_status from pedigree_edges e
       join canonical_entities c on c.id = e.child_canonical_id where c.name_norm = ? limit 20`,
    ).all(pedigreeName.name),
  ),
  timed("pedigree_lookup_2", () =>
    db.prepare(
      `select e.parent_text, e.identity_status from pedigree_edges e
       join canonical_entities c on c.id = e.child_canonical_id where c.name_norm = ? limit 20`,
    ).all(pedigreeName.name),
  ),
  timed("chemistry_lookup_1", () =>
    db.prepare(
      `select m.klass, count(*) as n, count(distinct u.independence_group) as samples
       from measurements m
       join source_records r on r.id = m.source_record_id
       join observation_units u on u.source_record_id = r.id
       where r.name_norm = 'gelato' group by m.klass`,
    ).all(),
  ),
  timed("chemistry_lookup_2", () =>
    db.prepare(
      `select m.klass, count(*) as n, count(distinct u.independence_group) as samples
       from measurements m
       join source_records r on r.id = m.source_record_id
       join observation_units u on u.source_record_id = r.id
       where r.name_norm = 'gelato' group by m.klass`,
    ).all(),
  ),
  timed("phenotype_lookup_1", () =>
    db.prepare(
      `select p.field, p.original_text from phenotypes p
       join source_records r on r.id = p.source_record_id where r.name_norm = ? limit 20`,
    ).all(pheno.name),
  ),
  timed("phenotype_lookup_2", () =>
    db.prepare(
      `select p.field, p.original_text from phenotypes p
       join source_records r on r.id = p.source_record_id where r.name_norm = ? limit 20`,
    ).all(pheno.name),
  ),
  timed("provenance_lookup_1", () => db.prepare("select source_id, file_name, count(*) as n from source_records where name_norm = 'gelato' group by 1, 2").all()),
  timed("provenance_lookup_2", () => db.prepare("select source_id, file_name, count(*) as n from source_records where name_norm = 'gelato' group by 1, 2").all()),
];

const chemistry = db
  .prepare(
    `select m.klass as klass, count(*) as measurement_rows, sum(m.value is not null) as numeric_rows,
            count(distinct u.independence_group) as independent_samples
     from measurements m
     join source_records r on r.id = m.source_record_id
     join observation_units u on u.source_record_id = r.id
     where r.name_norm = 'gelato' group by m.klass`,
  )
  .all();
const gelatoSamples = db
  .prepare(
    `select count(*) as rows, count(distinct u.independence_group) as independent_samples, count(distinct r.lab) as laboratories
     from source_records r join observation_units u on u.source_record_id = r.id
     where r.name_norm = 'gelato' and u.unit_kind = 'LAB_SAMPLE'`,
  )
  .get();

function call(query: string) {
  const started = performance.now();
  const result = foundationSearch(query) as { cache?: string; matched_query?: string; match_score?: number; entities?: unknown[]; measurements?: unknown[] };
  return { query, ms: ms(started), cache: result.cache ?? null, matched_query: result.matched_query ?? null, match_score: result.match_score ?? null, entities: result.entities?.length ?? null, measurements: result.measurements?.length ?? null };
}

const cacheMiss = call("Gelato");
const cacheHit = call("Gelato");
const normalizedEquivalent = call("strain Gelato");
const semanticAttempt = call("Gelato flower");
const semanticCold = call("not a stored cultivar name zzz");
const semanticWarm = call("another missing cultivar name qqq");

const report = {
  measured_at: new Date().toISOString(),
  sql,
  explain_chemistry: plan,
  gelato: { samples: gelatoSamples, chemistry },
  examples: { alias: alias.alias_norm, phenotype: pheno.name, pedigree: pedigreeName.name },
  api: { cacheMiss, cacheHit, normalizedEquivalent, semanticAttempt, semanticCold, semanticWarm },
  notes: [
    "I tempi sono il primo e il secondo passaggio reale, non una media scelta.",
    "La cache semantica confronta al massimo le ultime 200 query dello stesso snapshot.",
    "Una soglia cosine di 0.92 decide SEMANTIC_HIT. Se il punteggio è sotto, resta un miss.",
    "Il lookup semantico delle entità è cosine in-process su 20337 vettori, non pgvector.",
  ],
};
writeFileSync("data/foundation-benchmarks.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
