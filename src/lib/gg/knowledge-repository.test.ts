import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createKnowledgeRepository, previewKnowledgeRepository } from "./knowledge-factory.ts";
import { supabaseKnowledgeRepository } from "./supabase-knowledge-repository.ts";
import { sqliteKnowledgeRepository } from "./sqlite-knowledge-repository.ts";

const METHODS = [
  "availability",
  "resolveEntity",
  "resolveQuery",
  "getEvidence",
  "getMeasurements",
  "getPedigree",
  "getClaims",
  "getPatterns",
  "getLiterature",
  "getLearnedKnowledge",
  "getHealthEvidence",
  "recordResearch",
  "createSnapshot",
] as const;

test("both adapters expose the same KnowledgeRepository methods", () => {
  for (const method of METHODS) {
    assert.equal(typeof supabaseKnowledgeRepository[method], "function");
    assert.equal(typeof sqliteKnowledgeRepository[method], "function");
  }
});

test("the factory can replace the repository without a preview fallback", () => {
  assert.equal(createKnowledgeRepository("supabase").id, "supabase_postgresql");
  assert.equal(createKnowledgeRepository("sqlite").role, "VERIFICATION_ONLY");
  assert.equal(previewKnowledgeRepository().id, "supabase_postgresql");
  assert.equal(previewKnowledgeRepository().role, "PRODUCTION");
});

test("supabase adapter without DATABASE_URL does not open the local corpus", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const source = readFileSync(new URL("./supabase-knowledge-repository.ts", import.meta.url), "utf8");
    assert.equal(source.includes("data/gg-foundation.sqlite"), false);
    assert.equal(source.includes("data/catalog.json"), false);
    assert.equal(source.includes("DatabaseSync"), false);
    const status = await supabaseKnowledgeRepository.availability();
    assert.equal(status.status, "NOT_CONFIGURED");
    assert.equal(status.source, "supabase_postgresql");
    assert.equal(status.project_ref, "tupswxnfidpemjkzwgkx");
    assert.equal(status.counts, null);
    assert.equal(status.fallback, "NONE");
    const lookup = await supabaseKnowledgeRepository.resolveEntity("Lemon Haze x Mango");
    assert.deepEqual(lookup.results, []);
    const snapshot = await supabaseKnowledgeRepository.createSnapshot();
    assert.equal(snapshot.written, false);
    const research = await supabaseKnowledgeRepository.recordResearch("none");
    assert.equal(research.stored, false);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("sqlite verification adapter reads an existing snapshot and does not write one", async () => {
  const lookup = await sqliteKnowledgeRepository.resolveEntity("Black Domina");
  assert.equal(lookup.corpus.role, "VERIFICATION_ONLY");
  assert.ok(Array.isArray(lookup.results));
  const snapshot = await sqliteKnowledgeRepository.createSnapshot();
  assert.equal(snapshot.written, false);
  assert.equal(snapshot.status, "EXISTING_NOT_REWRITTEN");
  const claims = await sqliteKnowledgeRepository.getClaims("Black Domina");
  assert.ok(claims);
});

test("preview screen code does not fall back to the sqlite file", () => {
  const screens = readFileSync(new URL("./services.server.ts", import.meta.url), "utf8");
  assert.equal(screens.includes("data/gg-foundation.sqlite"), false);
  assert.equal(screens.includes("data/catalog.json"), false);
  assert.equal(screens.includes("previewKnowledgeRepository"), true);
  const client = readFileSync(new URL("../../routes/index.tsx", import.meta.url), "utf8");
  assert.equal(client.includes("VITE_DATABASE_URL"), false);
  assert.equal(client.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
});
