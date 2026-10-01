import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importCapacityGate } from "./import-guard.ts";
import { previewKnowledgeRepository } from "./knowledge-factory.ts";

test("foundation stays NOT_CONFIGURED without DATABASE_URL", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const corpus = await previewKnowledgeRepository().availability();
    assert.equal(corpus.status, "NOT_CONFIGURED");
    assert.equal(corpus.source, "supabase_postgresql");
    assert.equal(corpus.fallback, "NONE");
    assert.equal(corpus.counts, null);
    const lookup = await previewKnowledgeRepository().resolveEntity("Lemon Haze x Mango");
    assert.deepEqual(lookup.results, []);
    const measurements = await previewKnowledgeRepository().getMeasurements("Lemon Haze x Mango");
    assert.equal(measurements && typeof measurements === "object" && "fallback" in measurements && measurements.fallback, "NONE");
    const pedigree = await previewKnowledgeRepository().getPedigree("Lemon Haze x Mango");
    assert.equal(pedigree && typeof pedigree === "object" && "genomic" in pedigree && pedigree.genomic, "NOT_AVAILABLE");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("health source separates the app database from the scientific database", () => {
  const source = readFileSync(new URL("./runtime.server.ts", import.meta.url), "utf8");
  assert.equal(source.includes("scientific_database"), true);
  assert.equal(source.includes("app_database"), true);
  assert.equal(source.includes("PGLite non sostituisce Supabase"), true);
  assert.equal(source.includes('checks.database, "healthy"'), false);
});

test("chat source does not invent a probability and does not open sqlite", () => {
  const source = readFileSync(new URL("./services.server.ts", import.meta.url), "utf8");
  assert.equal(source.includes("prediction_status: \"NOT_COMPUTABLE\""), true);
  assert.equal(source.includes("previewKnowledgeRepository"), true);
  assert.equal(source.includes("data/gg-foundation.sqlite"), false);
  assert.equal(source.includes("data/catalog.json"), false);
});

test("preview scientific routes do not call the sqlite repository", () => {
  const source = readFileSync(new URL("./http.server.ts", import.meta.url), "utf8");
  const retrieve = source.slice(source.indexOf('path === "retrieve"'), source.indexOf('path === "entities"'));
  assert.equal(retrieve.includes("previewKnowledgeRepository"), true);
  assert.equal(retrieve.includes("knowledgeRepository"), false);
  assert.equal(source.includes("data/gg-foundation.sqlite"), false);
  assert.equal(source.includes("data/catalog.json"), false);
  assert.equal(source.includes("VITE_DATABASE_URL"), false);
  assert.equal(source.includes("VITE_SUPABASE_SERVICE_ROLE_KEY"), false);
});

test("import checkpoint is prepared and not started", () => {
  const sql = readFileSync(new URL("../../../scripts/postgres/006_import_checkpoint.sql", import.meta.url), "utf8");
  assert.equal(sql.includes("NOT APPLIED"), true);
  assert.equal(sql.includes("IMPORT_PAUSED_DISK_CAPACITY"), true);
  assert.equal(importCapacityGate(90, 5, 100, false), "IMPORT_PAUSED_DISK_CAPACITY");
  assert.equal(importCapacityGate(10, 1, 100, true), "IMPORT_PAUSED_DISK_CAPACITY");
  assert.equal(importCapacityGate(10, 1, 100, false), "CONTINUE");
});
