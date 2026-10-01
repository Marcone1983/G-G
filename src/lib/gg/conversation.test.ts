import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { answerQuestion } from "./conversation/answer.ts";
import { classifyLiterature, conflictFromParents, createResearchMemory, searchEuropePmc, type WebProvider } from "./conversation/research.ts";
import { emptyContext } from "./conversation/router.ts";
import { openSqliteCorpus } from "./prediction/sqlite-reader.ts";

const corpus = openSqliteCorpus("data/gg-foundation.sqlite");

describe("conversation", () => {
  it("uses the database and does not search the web when the parents are resolved", async () => {
    let calls = 0;
    const web: WebProvider = { async search() { calls += 1; return { status: "ACQUIRED", records: [], query: "should-not-run" }; } };
    const result = await answerQuestion({
      message: "Analizza GMO × Blueberry Muffin",
      reader: corpus,
      web,
      parentIds: { a: 5759, b: 1927 },
      now: "2026-10-01T18:40:00.000Z",
      memory: createResearchMemory(),
    });
    assert.equal(calls, 0);
    assert.equal(result.web, "NOT_REQUIRED");
    assert.equal(result.database, "READ");
    assert.equal(result.prediction_probability, null);
    assert.equal(result.prediction_status, "ESTIMATE_NOT_PROBABILITY");
    assert.match(result.reply, /non è una probabilità/i);
  });

  it("keeps an ambiguous cross unresolved and reuses a later search", async () => {
    const memory = createResearchMemory();
    let calls = 0;
    const web: WebProvider = {
      async search(query) {
        calls += 1;
        return {
          status: "ACQUIRED",
          query,
          records: [{
            title: "TEST FIXTURE title, not a laboratory measurement",
            doi: null,
            pmid: null,
            year: "2020",
            source_name: "TEST",
            source_class: "UNKNOWN_SOURCE",
            url: null,
            claim_type: "LITERATURE_TITLE",
            value: null,
            governance: "PENDING",
            promoted_to_measurement: false,
          }],
        };
      },
    };
    const first = await answerQuestion({
      message: "Black Domina × Sugar Black Rose",
      reader: corpus,
      web,
      now: "2026-10-01T18:41:00.000Z",
      memory,
    });
    const second = await answerQuestion({
      message: "Black Domina × Sugar Black Rose",
      context: first.context,
      reader: corpus,
      web,
      now: "2026-10-01T18:41:30.000Z",
      memory,
    });
    assert.equal(first.prediction_status, "IDENTITY_AMBIGUOUS");
    assert.equal(first.records_saved_as, "PENDING_NOT_MEASUREMENT");
    assert.equal(first.records_acquired[0]?.promoted_to_measurement, false);
    assert.equal(calls, 1);
    assert.equal(second.web, "REUSED");
    assert.equal(calls, 1);
  });

  it("follows a parent swap and can audit the previous analysis", async () => {
    const first = await answerQuestion({
      message: "GMO × Blueberry Muffin",
      reader: corpus,
      parentIds: { a: 5759, b: 1927 },
      now: "2026-10-01T18:42:00.000Z",
      memory: createResearchMemory(),
    });
    const swapped = await answerQuestion({
      message: "e se uso Gelato invece di Blueberry Muffin",
      context: first.context,
      reader: corpus,
      now: "2026-10-01T18:42:10.000Z",
      memory: createResearchMemory(),
    });
    assert.equal(swapped.intent, "CROSS_ANALYSIS");
    assert.equal(swapped.context.current_cross?.a, "GMO");
    assert.equal(swapped.context.current_cross?.b, "Gelato");
    const audit = await answerQuestion({
      message: "perché",
      context: first.context,
      reader: corpus,
      now: "2026-10-01T18:42:20.000Z",
    });
    assert.equal(audit.intent, "AUDIT");
    assert.equal(audit.steps[0]?.status, "DONE");
  });

  it("does not replace a missing database with the web", async () => {
    let calls = 0;
    const web: WebProvider = { async search() { calls += 1; return { status: "ACQUIRED", records: [], query: "x" }; } };
    const result = await answerQuestion({ message: "Analizza A × B", reader: null, web, now: "2026-10-01T18:43:00.000Z" });
    assert.equal(result.database, "SCIENTIFIC_DB_UNAVAILABLE");
    assert.equal(calls, 0);
    assert.equal(result.prediction_probability, null);
  });

  it("stores conflicting parent claims without choosing one", () => {
    const conflict = conflictFromParents([
      { text: "Parent = Alpha", source: "breeder-a" },
      { text: "Parent = Beta", source: "breeder-b" },
    ]);
    assert.equal(conflict?.resolution_status, "UNRESOLVED");
    assert.equal(classifyLiterature({ source: "MED", pubType: "journal article" }), "PRIMARY_SCIENTIFIC_SOURCE");
  });

  it("does not invent a paper when Europe PMC fails or returns a real title", async () => {
    const live = await searchEuropePmc("cannabis cannabidiol", 2);
    if (live.status === "ACQUISITION_FAILED") {
      assert.equal(live.records.length, 0);
      return;
    }
    assert.ok(live.records.length > 0);
    for (const record of live.records) {
      assert.equal(record.value, null);
      assert.equal(record.promoted_to_measurement, false);
      assert.equal(record.governance, "PENDING");
      if (record.doi) assert.match(record.doi, /^10\./);
    }
  });
});

void emptyContext;
