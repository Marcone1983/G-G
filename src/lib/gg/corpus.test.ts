import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { parentFacts, predictionGate, searchEntities, UNIFIED_SNAPSHOT } from "./brain.ts";

const db = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });

function names(sql: string): string[] {
  return (db.prepare(sql).all() as { name: string }[]).map((row) => row.name);
}

describe("universal corpus", () => {
  it("resolves different entity situations through the same function", () => {
    const homonyms = names("select name_norm as name from canonical_entities group by 1 having count(*) > 1 limit 5");
    const withPedigree = names(
      "select c.name_norm as name from pedigree_edges e join canonical_entities c on c.id = e.child_canonical_id group by 1 limit 5",
    );
    const withoutPedigree = names(
      "select c.name_norm as name from canonical_entities c where not exists (select 1 from pedigree_edges e where e.child_canonical_id = c.id) limit 5",
    );
    const withChemistry = names(
      `select r.name_norm as name from measurements m join source_records r on r.id = m.source_record_id
       where r.name_norm is not null group by 1 limit 5`,
    );
    const withoutChemistry = names(
      `select c.name_norm as name from canonical_entities c
       where not exists (select 1 from source_records r join measurements m on m.source_record_id = r.id where r.name_norm = c.name_norm)
       limit 5`,
    );
    assert.ok(homonyms.length >= 5);
    assert.ok(withPedigree.length >= 5 && withoutPedigree.length >= 5);
    assert.ok(withChemistry.length >= 5 && withoutChemistry.length >= 5);
    const sample = [...new Set([...homonyms, ...withPedigree, ...withoutPedigree, ...withChemistry, ...withoutChemistry])];
    assert.ok(sample.length >= 20);
    for (const name of sample) {
      const facts = parentFacts(name);
      assert.ok(facts);
      assert.equal(facts.genomics, "NOT_AVAILABLE");
      assert.equal(facts.exact_identity, 0);
      assert.equal(facts.independent_samples <= facts.source_rows, true);
      assert.equal(predictionGate(facts).status, "NOT_COMPUTABLE");
      assert.equal(predictionGate(facts).probability, null);
      assert.equal(predictionGate(facts).snapshot_id, UNIFIED_SNAPSHOT);
      const hits = searchEntities(name);
      assert.ok(Array.isArray(hits));
      assert.equal(hits.every((hit) => hit.auto_merged === false), true);
    }
    const homonymFacts = parentFacts(homonyms[0] ?? "");
    assert.ok(homonymFacts && homonymFacts.entities.length > 1);
    const bare = parentFacts(withoutChemistry[0] ?? "");
    assert.ok(bare);
    assert.equal(bare.numeric_measurements, 0);
    const bred = parentFacts(withPedigree[0] ?? "");
    assert.ok(bred && bred.reported_parents > 0);
    const unbred = parentFacts(withoutPedigree[0] ?? "");
    assert.ok(unbred && unbred.reported_parents === 0);
  });

  it("keeps qualifiers off numeric values and reported zeros labelled", () => {
    const qualified = db.prepare("select count(*) as n from measurements where qualifier is not null and value is not null").get() as { n: number };
    const nd = db.prepare("select count(*) as n from measurements where qualifier = 'ND' and value is not null").get() as { n: number };
    const zeros = db.prepare("select count(*) as n from measurements where zero_semantics = 'SOURCE_REPORTED_ZERO' and value = 0").get() as { n: number };
    const mismatch = db.prepare("select count(*) as n from source_records r join identity_decisions d on d.source_record_id = r.id where r.match_status != d.status").get() as { n: number };
    assert.equal(Number(qualified.n), 0);
    assert.equal(Number(nd.n), 0);
    assert.equal(Number(zeros.n), 1987959);
    assert.equal(Number(mismatch.n), 0);
  });
});
