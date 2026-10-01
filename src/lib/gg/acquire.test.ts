import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { cardFromModel, ensureStrain, loadAcquired, scrubReportedText } from "./acquire.ts";
import { invalidateQueryCache, parentFacts, retrieve, searchEntities } from "./brain.ts";
import { normalizeName } from "./engine.ts";

const probe = "Zz Probe Cultivar 9f3";

function wipeProbe(norm: string) {
  const db = new DatabaseSync("data/gg-foundation.sqlite");
  try {
    const tables = new Set(
      (db.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name),
    );
    if (tables.has("acquired_entities")) {
      const ids = db.prepare("select id from acquired_entities where name_norm = ?").all(norm) as { id: number }[];
      for (const row of ids) {
        if (tables.has("acquired_aliases")) db.prepare("delete from acquired_aliases where entity_id = ?").run(row.id);
        if (tables.has("acquired_claims")) db.prepare("delete from acquired_claims where entity_id = ?").run(row.id);
        if (tables.has("acquired_pedigree")) db.prepare("delete from acquired_pedigree where entity_id = ?").run(row.id);
        db.prepare("delete from acquired_entities where id = ?").run(row.id);
      }
    }
    if (tables.has("research_events")) {
      const events = db.prepare("select id, research_key from research_events where normalized_query = ?").all(norm) as { id: string; research_key: string }[];
      for (const event of events) {
        if (tables.has("knowledge_revisions")) db.prepare("delete from knowledge_revisions where research_id = ?").run(event.id);
        if (tables.has("knowledge_audit")) db.prepare("delete from knowledge_audit where subject = ?").run(event.id);
        if (tables.has("research_locks")) db.prepare("delete from research_locks where research_key = ?").run(event.research_key);
      }
      db.prepare("delete from research_events where normalized_query = ?").run(norm);
    }
    if (tables.has("knowledge_crosses")) {
      const crosses = db.prepare("select id from knowledge_crosses where normalized_name = ?").all(norm) as { id: number }[];
      for (const cross of crosses) {
        if (tables.has("knowledge_cross_parents")) db.prepare("delete from knowledge_cross_parents where cross_id = ?").run(cross.id);
      }
      db.prepare("delete from knowledge_crosses where normalized_name = ?").run(norm);
    }
  } finally {
    db.close();
  }
  invalidateQueryCache(norm);
}

describe("database first, grok only on a miss", () => {
  it("strips laboratory-looking numbers from model text", () => {
    const card = cardFromModel(
      { known: true, display_name: probe, summary: "THC 22% in a shop listing", reported_parents: ["One", "Two"] },
      probe,
    );
    assert.equal(card.summary.includes("22"), false);
    assert.equal(scrubReportedText("CBD: 8.5"), "");
  });

  it("does not call out when the name is already in the store", async () => {
    let calls = 0;
    const result = await ensureStrain("Gelato", async () => {
      calls += 1;
      return cardFromModel({ known: true, display_name: "Gelato" }, "Gelato");
    });
    assert.equal(result.origin, "DATABASE");
    assert.equal(result.grok_called, false);
    assert.equal(calls, 0);
    const facts = parentFacts("Gelato");
    assert.equal(facts?.source_rows, 601);
    assert.equal(facts?.entities.length, 5);
    assert.equal(facts?.reported_parents, 4);
  });

  it("saves one missing name and serves it from the store the next time", async () => {
    const norm = normalizeName(probe);
    wipeProbe(norm);
    const before = new DatabaseSync("data/gg-foundation.sqlite", { readOnly: true });
    const records = Number((before.prepare("select count(*) as n from source_records").get() as { n: number }).n);
    const measures = Number((before.prepare("select count(*) as n from measurements").get() as { n: number }).n);
    before.close();
    let calls = 0;
    const first = await ensureStrain(probe, async () => {
      calls += 1;
      return cardFromModel(
        {
          known: true,
          display_name: probe,
          aliases: ["Zz Probe"],
          breeder: "Test Bench",
          reported_parents: ["Alpha Line", "Beta Line"],
          summary: "A reported name only. THC 19%.",
          declared_flowering: "about eight weeks",
        },
        probe,
      );
    });
    assert.equal(first.origin, "ACQUIRED");
    assert.equal(calls, 1);
    const second = await ensureStrain(probe, async () => {
      throw new Error("second request must not call the model");
    });
    assert.equal(second.origin, "DATABASE");
    assert.equal(second.grok_called, false);
    const hits = searchEntities(probe);
    assert.equal(hits.some((hit) => hit.id.startsWith("acquired:") && hit.match_kind === "EXACT" && hit.record_role === "GROK_REPORTED"), true);
    const aliasHits = searchEntities("Zz Probe");
    assert.equal(aliasHits.some((hit) => hit.id.startsWith("acquired:") && hit.match_kind === "ALIAS"), true);
    const detail = loadAcquired(hits.find((hit) => hit.id.startsWith("acquired:"))!.id);
    assert.ok(detail);
    assert.equal(detail.traits.length, 0);
    assert.equal(detail.claims.every((claim) => claim.measurement_kind === "reported" && claim.claim_class === "GROK_REPORTED"), true);
    assert.equal(JSON.stringify(detail).includes("19"), false);
    const looked = retrieve(probe) as { cache?: string; prediction_probability?: null; reported_cards?: { epistemic: string; parents: string[] }[] };
    assert.equal(looked.cache, "EXACT_HIT");
    assert.equal(looked.prediction_probability, null);
    assert.equal(looked.reported_cards?.[0]?.epistemic, "GROK_REPORTED");
    assert.equal(looked.reported_cards?.[0]?.parents.length, 2);
    const facts = parentFacts(probe);
    assert.equal(facts?.source_rows, 0);
    assert.equal(facts?.numeric_measurements, 0);
    assert.equal(facts?.exact_identity, 0);
    assert.equal(facts?.reported_parents, 2);
    const after = new DatabaseSync("data/gg-foundation.sqlite");
    try {
      assert.equal(Number((after.prepare("select count(*) as n from source_records").get() as { n: number }).n), records);
      assert.equal(Number((after.prepare("select count(*) as n from measurements").get() as { n: number }).n), measures);
    } finally {
      after.close();
    }
    wipeProbe(norm);
  });
});
