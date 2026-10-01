import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { describe, it, beforeEach } from "node:test";

import { cardFromModel } from "./acquire.ts";
import { normalizeName } from "./engine.ts";
import { classifyQuery } from "./classify.ts";
import { providerHealth } from "./provider.ts";
import { knowledgeRepository } from "./repository.ts";
import { ResearchMemory } from "./memory.ts";
import { resetCircuitForTests } from "./circuit.ts";
import { httpStatusForResolution, candidateLine, loadCrossDetail, parseCrossStructure, rankCandidates, resolveQuery } from "./resolve.ts";
import { brierScore, capabilityMatrix } from "./predict.ts";

const dbPath = "data/gg-foundation.sqlite";

function counts() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const n = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
    return { records: n("select count(*) as n from source_records"), measures: n("select count(*) as n from measurements") };
  } finally {
    db.close();
  }
}

function wipe(query: string) {
  const norm = normalizeName(query);
  const db = new DatabaseSync(dbPath);
  try {
    const tables = new Set((db.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((row) => row.name));
    if (tables.has("acquired_entities")) {
      const ids = db.prepare("select id from acquired_entities where name_norm = ?").all(norm) as { id: number }[];
      for (const row of ids) {
        db.prepare("delete from acquired_aliases where entity_id = ?").run(row.id);
        db.prepare("delete from acquired_claims where entity_id = ?").run(row.id);
        db.prepare("delete from acquired_pedigree where entity_id = ?").run(row.id);
        db.prepare("delete from acquired_entities where id = ?").run(row.id);
      }
    }
    if (tables.has("research_events")) {
      const events = db.prepare("select id, research_key from research_events where normalized_query = ?").all(norm) as { id: string; research_key: string }[];
      for (const event of events) {
        if (tables.has("knowledge_revisions")) db.prepare("delete from knowledge_revisions where research_id = ?").run(event.id);
        if (tables.has("knowledge_audit")) db.prepare("delete from knowledge_audit where subject = ? or meta_json like ?").run(event.id, `%${event.id}%`);
        if (tables.has("research_locks")) db.prepare("delete from research_locks where research_key = ?").run(event.research_key);
      }
      db.prepare("delete from research_events where normalized_query = ?").run(norm);
    }
    if (tables.has("knowledge_crosses")) {
      const crosses = db.prepare("select id from knowledge_crosses where normalized_name = ?").all(norm) as { id: number }[];
      for (const cross of crosses) db.prepare("delete from knowledge_cross_parents where cross_id = ?").run(cross.id);
      db.prepare("delete from knowledge_crosses where normalized_name = ?").run(norm);
    }
  } finally {
    db.close();
  }
  ResearchMemory.devFile().forget(query, "GGS-KNOWLEDGE-000005");
}

describe("resolve before reject", () => {
  beforeEach(() => {
    resetCircuitForTests();
  });
  it("parses a cross as structure and does not mark it verified", () => {
    const parsed = parseCrossStructure("Qa North x Qb South");
    assert.equal(parsed.kind, "CROSS_REQUEST");
    if (parsed.kind === "CROSS_REQUEST") {
      assert.equal(parsed.a, "Qa North");
      assert.equal(parsed.b, "Qb South");
    }
    assert.equal("verified" in parsed, false);
    assert.equal(parseCrossStructure("Qa North").kind, "ENTITY");
  });

  it("does not call research when the full name is already local", async () => {
    let calls = 0;
    const result = await resolveQuery("Gelato", async () => {
      calls += 1;
      return cardFromModel({ known: true, display_name: "Gelato" }, "Gelato");
    });
    assert.equal(calls, 0);
    assert.equal(result.grok_called, false);
    assert.equal(result.origin, "DATABASE");
    assert.equal(result.query_kind, "ENTITY");
    assert.equal(result.prediction_probability, null);
    assert.equal(result.genomics, "NOT_AVAILABLE");
  });

  it("researches an unknown cross even when one parent is already in the store", async () => {
    const query = "Gelato x Zz Side 9f3";
    wipe(query);
    const before = counts();
    let calls = 0;
    const first = await resolveQuery(query, async () => {
      calls += 1;
      return cardFromModel(
        {
          known: false,
          display_name: query,
          summary: "THC 22% shop copy",
          reported_parents: ["Gelato", "Zz Side 9f3"],
          cross_documented: false,
        },
        query,
      );
    });
    assert.equal(calls, 1);
    assert.equal(first.grok_called, true);
    assert.equal(first.origin, "INSUFFICIENT");
    assert.equal(first.query_kind, "CROSS_REQUEST");
    assert.equal(first.relationship_status, "UNVERIFIED");
    assert.ok(first.research_id);
    assert.equal(first.prediction_probability, null);
    assert.equal(first.answer.includes("22"), false);
    assert.match(first.answer, /non dimostra/i);
    assert.equal(/NORMALIZE|QUERY_PARSE|Research event|relationship_status|GGS-KNOWLEDGE|NOT_COMPUTABLE/.test(first.answer), false);
    assert.equal(first.cards.some((card) => card.id.startsWith("cross:")), false);
    assert.equal(first.cards.filter((card) => card.slot === "A").every((card) => card.line.startsWith("Lato A.")), true);
    assert.equal(first.cards.filter((card) => card.slot === "B").every((card) => card.line.startsWith("Lato B.")), true);
    const detail = loadCrossDetail(`cross:${first.cross_id}`);
    assert.ok(detail);
    assert.equal(detail.edges.length, 2);
    assert.equal(detail.edges.every((edge) => edge.relationship_type === "QUERY_PARSE"), true);
    assert.equal(/\b22\b|thc/i.test(`${detail.strain.summary} ${detail.claims.map((claim) => claim.claim_text).join(" ")}`), false);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const acquired = Number(
      (db.prepare("select count(*) as n from acquired_entities where name_norm = ?").get(normalizeName(query)) as { n: number }).n,
    );
    const parent = db.prepare("select resolution_status, evidence_basis, parent_entity_ref from knowledge_cross_parents where cross_id = ? and parent_role = 'A'").get(
      first.cross_id,
    ) as { resolution_status: string; evidence_basis: string; parent_entity_ref: string | null };
    db.close();
    assert.equal(acquired, 0);
    assert.equal(parent.evidence_basis, "QUERY_PARSE");
    assert.equal(parent.resolution_status, "IDENTITY_UNRESOLVED");
    assert.equal(parent.parent_entity_ref, null);
    const second = await resolveQuery(query, async () => {
      throw new Error("second request must not call the model");
    });
    assert.equal(second.grok_called, false);
    assert.equal(second.origin, "DATABASE");
    assert.equal(second.research_id, first.research_id);
    const child = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/resolve-reread.ts", query], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.includes("MODEL_CALLED"), false);
    const reread = JSON.parse(child.stdout.trim().split("\n").at(-1) ?? "{}") as { grok_called: boolean; research_id: string; origin: string };
    assert.equal(reread.grok_called, false);
    assert.equal(reread.origin, "DATABASE");
    assert.equal(reread.research_id, first.research_id);
    assert.deepEqual(counts(), before);
    wipe(query);
  });

  it("retries after a failed research and still does not invent chemistry", async () => {
    const query = "Zz Missing Cultivar 9f3";
    wipe(query);
    let calls = 0;
    const failed = await resolveQuery(query, async () => {
      calls += 1;
      throw new Error("down");
    });
    assert.equal(failed.origin, "GROK_FAILED");
    assert.equal(failed.grok_called, true);
    const again = await resolveQuery(query, async () => {
      calls += 1;
      return cardFromModel({ known: true, display_name: query, summary: "CBD: 8.5 and a reported name", reported_parents: ["No Parent"] }, query);
    });
    assert.equal(calls, 2);
    assert.equal(again.origin, "ACQUIRED");
    assert.equal(again.answer.includes("8.5"), false);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("select summary from acquired_entities where name_norm = ?").get(normalizeName(query)) as { summary: string };
    const measures = Number((db.prepare("select count(*) as n from measurements where source_record_id < 0").get() as { n: number }).n);
    db.close();
    assert.equal(row.summary.includes("8.5"), false);
    assert.equal(measures, 0);
    wipe(query);
  });

  it("keeps a plus-mark ahead of a normalized collision", () => {
    const hits = rankCandidates("North +", [
      { id: "entity:1", canonical_name: "North", identity_status: "UNRESOLVED", record_role: "CATALOG", match_kind: "EXACT", breeder: "One", auto_merged: false },
      { id: "entity:2", canonical_name: "North +", identity_status: "UNRESOLVED", record_role: "CATALOG", match_kind: "EXACT", breeder: "Two", auto_merged: false },
    ]);
    assert.equal(hits[0]?.canonical_name, "North +");
    assert.match(candidateLine("North +", hits[1]!), /non è la stessa scheda/i);
    assert.match(candidateLine("North +", hits[0]!), /resta nel nome/i);
  });

  it("does not hammer a provider block on the next request", async () => {
    const query = "Zz Blocked Side 9f3 x Zz Other Side 9f3";
    wipe(query);
    let calls = 0;
    await resolveQuery(query, async () => {
      calls += 1;
      throw new Error("Grok 403 spending-limit");
    });
    const second = await resolveQuery(query, async () => {
      calls += 1;
      throw new Error("must not call");
    });
    assert.equal(calls, 1);
    assert.equal(second.grok_called, false);
    assert.equal(second.resolution_status, "BLOCKED");
    assert.equal(second.parser_confidence, null);
    assert.equal(second.score_kind, "NOT_A_PROBABILITY");
    assert.match(second.answer, /provider non è disponibile/i);
    assert.match(second.answer, /non ho fabbricato/i);
    assert.equal(httpStatusForResolution(second.resolution_status, second.origin), 503);
    assert.equal(second.answer.includes("must not call"), false);
    wipe(query);
  });

  it("does not turn a spaced plus into a pedigree", async () => {
    const query = "Zz Plusleft 9f3 + Zz Plusright 9f3";
    wipe(query);
    const parsed = parseCrossStructure(query);
    assert.equal(parsed.kind, "COMBINATION");
    assert.equal(classifyQuery("North + Feminized").query_type === "COMBINATION_QUERY", false);
    assert.equal(parseCrossStructure("North + x South").kind, "CROSS_REQUEST");
    const before = counts();
    let calls = 0;
    const result = await resolveQuery(query, async () => {
      calls += 1;
      throw new Error("Grok 403 spending-limit");
    });
    assert.equal(calls, 1);
    assert.equal(result.query_kind, "COMBINATION");
    assert.equal(result.cross_id, null);
    assert.match(result.answer, /non è la prova di un incrocio/i);
    assert.equal(result.prediction_probability, null);
    assert.deepEqual(counts(), before);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const crosses = Number((db.prepare("select count(*) as n from knowledge_crosses where normalized_name = ?").get(normalizeName(query)) as { n: number }).n);
    db.close();
    assert.equal(crosses, 0);
    wipe(query);
    assert.ok(Math.abs((brierScore([0.8], [1]) ?? 0) - 0.04) < 1e-12);
    assert.equal(brierScore([1.2], [1]), null);
    assert.equal(capabilityMatrix({ identityHits: 2, identityConflict: true, pedigreeRows: 3, measurements: 0, genomicSamples: 0, productionModels: 0, calibrated: false }).numeric_prediction, "NOT_COMPUTABLE");
    assert.equal(httpStatusForResolution("RESEARCH_FAILED", "GROK_FAILED"), 502);
  });

  it("classifies structure without treating a slash as a cross", () => {
    const cross = classifyQuery("North x South");
    assert.equal(cross.query_type, "CROSS");
    assert.equal(cross.parser_confidence, null);
    assert.equal(cross.score_kind, "NOT_A_PROBABILITY");
    const many = parseCrossStructure("North x South x East");
    assert.equal(many.kind, "CROSS_REQUEST");
    assert.equal(many.query_type, "MULTI_PARENT_CROSS");
    if (many.kind === "CROSS_REQUEST") assert.equal(many.parents.length, 3);
    const slash = classifyQuery("North/South");
    assert.equal(slash.query_type, "UNKNOWN_QUERY");
    assert.equal(slash.slash_rejected, true);
    assert.equal(parseCrossStructure("North/South").kind, "ENTITY");
  });

  it("stores every parent of a multi-parent request and does not invent the cross", async () => {
    const query = "Zz Side 9f3 x Zz Other 9f3 x Zz Third 9f3";
    wipe(query);
    const before = counts();
    const result = await resolveQuery(query, async () => cardFromModel({ known: false, display_name: query, summary: "not documented" }, query));
    assert.equal(result.query_type, "MULTI_PARENT_CROSS");
    assert.equal(result.relationship_status, "UNVERIFIED");
    assert.equal(result.prediction_probability, null);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const parents = db.prepare("select parent_role, position from knowledge_cross_parents where cross_id = ? order by position").all(result.cross_id) as {
      parent_role: string;
      position: number;
    }[];
    db.close();
    assert.deepEqual(
      parents.map((row) => row.parent_role),
      ["A", "B", "P3"],
    );
    assert.deepEqual(
      parents.map((row) => row.position),
      [1, 2, 3],
    );
    assert.deepEqual(counts(), before);
    wipe(query);
  });

  it("reports provider health without secrets and keeps prediction null", () => {
    const health = providerHealth();
    assert.equal(health.secrets, "OMITTED");
    assert.equal("api_key" in health, false);
    assert.equal(JSON.stringify(health).includes("XAI_API_KEY"), false);
    const gate = knowledgeRepository.evaluate({ query: "zzzz-no-target" });
    assert.equal(gate.prediction_probability, null);
  });

  it("collapses two concurrent misses into one research", async () => {
    const query = "Zz Concurrent 9f3";
    wipe(query);
    let calls = 0;
    const ask = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return cardFromModel({ known: false, display_name: query, summary: "not confirmed" }, query);
    };
    const [a, b] = await Promise.all([resolveQuery(query, ask), resolveQuery(query, ask)]);
    assert.equal(calls, 1);
    assert.equal(a.research_id, b.research_id);
    wipe(query);
  });
});
