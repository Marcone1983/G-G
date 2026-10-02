import assert from "node:assert/strict";
import test from "node:test";

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { boundaryDenial, needsBoundedQuery } from "./boundary.ts";
import { classifyModelList } from "./embedding.ts";
import { assertAllowlisted, domainCoverage, gapsFromCounts, genomicsSummary, lifecycleRows, sumClasses, countRow } from "./inventory.ts";
import { assessPatternIndependence } from "./pattern-independence.ts";
import { versionedLookup, versionedStore } from "./versioned-cache.ts";
import { narrationContractViolation, narrateScientificReport, responseOutputText, SCIENTIFIC_PERSONA, scientificContext } from "./scientific-report.ts";
import { serverLanguageCredential } from "./server-credential.ts";
import { buildVisualization } from "./visualization.ts";
import { baselineDistance } from "./embedding.ts";

test("the language layer does not replace the scientific model", async () => {
  assert.equal(SCIENTIFIC_PERSONA.includes("I am a doctor"), false);
  assert.equal(SCIENTIFIC_PERSONA.includes("must not claim"), true);
  const report = { human_report: "deterministic", identity_status: "IDENTITY_AMBIGUOUS", prediction_probability: null, model_id: "gg-additive-midparent" };
  const context = scientificContext(report);
  assert.equal(context.prediction_probability, null);
  assert.equal(context.raw_measurements, "NOT_INCLUDED");
  let called = false;
  const narration = await narrateScientificReport(report, async () => {
    called = true;
    return new Response("no");
  }, undefined);
  assert.equal(called, false);
  assert.equal(narration.status, "AI_PROVIDER_NOT_CONFIGURED");
  assert.equal(narration.prediction_probability, null);
  assert.equal(narration.promoted_to_documented_fact, false);
  assert.equal(narration.evidence_class, "LANGUAGE_INTERPRETATION");
  const runtime = readFileSync(new URL("./runtime.server.ts", import.meta.url), "utf8");
  assert.equal(runtime.includes("scientificPing"), true);
  assert.equal(runtime.includes("productionCorpus"), false);
});

test("the boot screen is removed by React, not by a second DOM delete", () => {
  const root = readFileSync(new URL("../../routes/__root.tsx", import.meta.url), "utf8");
  assert.equal(root.includes(".remove()"), false);
  assert.equal(root.includes("removeChild"), false);
  assert.equal(root.includes('translate="no"'), true);
});

test("a short or empty measurement query is not a corpus download", () => {
  assert.equal(needsBoundedQuery("measurements", null), true);
  assert.equal(needsBoundedQuery("measurements", "a"), true);
  assert.equal(needsBoundedQuery("measurements", "th"), false);
  assert.equal(boundaryDenial("database/all")?.error, "DENIED");
  assert.equal(boundaryDenial("sql")?.error, "DENIED");
  assert.equal(boundaryDenial("measurements"), null);
});

test("duplicate rows are not independent replication", () => {
  const duplicated = assessPatternIndependence([
    { value: 1, sourceId: "s", labId: "l", lineageId: "g", method: "hplc", environment: "indoor" },
    { value: 1, sourceId: "s", labId: "l", lineageId: "g", method: "hplc", environment: "indoor" },
    { value: 1.1, sourceId: "s", labId: "l", lineageId: "g", method: "hplc", environment: "indoor" },
  ]);
  assert.equal(duplicated.independent_groups, 1);
  assert.equal(duplicated.replicated, false);
  assert.equal(duplicated.lifecycle, "CANDIDATE");
  assert.equal(duplicated.promoted, false);
  const contradicted = assessPatternIndependence([
    { value: 1, sourceId: "a", labId: "l1", lineageId: "g1", method: "hplc", environment: "indoor" },
    { value: 9, sourceId: "b", labId: "l2", lineageId: "g2", method: "hplc", environment: "indoor" },
  ]);
  assert.equal(contradicted.contradictions > 0, true);
  assert.equal(contradicted.lifecycle, "CONTRADICTED");
  const mixed = assessPatternIndependence([
    { value: 2, sourceId: "a", labId: "l1", lineageId: "g1", method: "hplc", environment: "indoor" },
    { value: 2.1, sourceId: "b", labId: "l2", lineageId: "g2", method: "gc-ms", environment: "indoor" },
  ]);
  assert.equal(mixed.replicated, false);
});

test("cache misses when the snapshot or model changes", () => {
  const store = new Map();
  const cold = versionedLookup(store, "gmo", { snapshot: "GGS-1", model: "1" });
  assert.equal(cold.status, "MISS");
  versionedStore(store, "gmo", { snapshot: "GGS-1", model: "1" }, { centre: 1 });
  const warm = versionedLookup(store, "gmo", { snapshot: "GGS-1", model: "1" });
  assert.equal(warm.status, "HIT");
  const moved = versionedLookup(store, "gmo", { snapshot: "GGS-2", model: "1" });
  assert.equal(moved.status, "MISS");
  assert.equal(moved.reason, "VERSION_MISMATCH");
  const model = versionedLookup(store, "gmo", { snapshot: "GGS-1", model: "2" });
  assert.equal(model.reason, "VERSION_MISMATCH");
});

test("visualization rejects raw text and a numeric probability", () => {
  assert.equal(buildVisualization({ prompt: "draw a plant" }).ok, false);
  const spec = buildVisualization({
    prediction_id: "p1",
    model_id: "gg-additive-midparent",
    model_version: "1",
    knowledge_snapshot: "GGS-KNOWLEDGE-000007",
    calibration_status: "NOT_CALIBRATED",
    prediction_probability: null,
    compounds: [{ name: "delta_9_thc", central_estimate: 1.03, status: "ESTIMATE" }],
  });
  assert.equal(spec.ok, true);
  if (spec.ok) {
    assert.equal(spec.spec.prediction_probability, null);
    assert.equal(spec.prompt.includes("Do not draw a plant"), true);
  }
  assert.equal(buildVisualization({
    prediction_id: "p1",
    model_id: "m",
    model_version: "1",
    knowledge_snapshot: "s",
    calibration_status: "NOT_CALIBRATED",
    prediction_probability: 0.8,
    compounds: [{ name: "thc", central_estimate: 1, status: "ESTIMATE" }],
  }).ok, false);
});

test("embedding model names are classified and the hashing fingerprint is not one", () => {
  const none = classifyModelList(["grok-4.5", "grok-imagine-image-2.0"]);
  assert.equal(none.semantic_model, "NOT_CONFIGURED");
  assert.equal(none.legacy_is_embedding, false);
  assert.deepEqual(none.embedding_models, []);
  const listed = classifyModelList(["grok-embedding-1"]);
  assert.equal(listed.semantic_model, "CONFIGURED");
  assert.equal(baselineDistance("blueberry", "blueberry") !== null, true);
});

test("inventory does not turn an absent table into zero and does not call coverage complete", () => {
  assert.throws(() => assertAllowlisted("measurements;drop"), /TABLE_NOT_ALLOWLISTED/);
  const absent = lifecycleRows(false, []);
  assert.equal(absent.every((row) => row.count === null && row.status === "TABLE_ABSENT"), true);
  const queried = lifecycleRows(true, [{ lifecycle: "CANDIDATE", n: 3 }]);
  assert.equal(queried.find((row) => row.category === "pattern_validated")?.count, 0);
  assert.equal(queried.find((row) => row.category === "pattern_validated")?.status, "QUERIED");
  assert.equal(sumClasses([{ klass: "cannabinoid", n: 4 }, { klass: "terpene", n: 2 }], /cannabin/i), 4);
  assert.equal(domainCoverage("qtl", 0, true).status, "ABSENT");
  assert.equal(domainCoverage("qtl", 9, true).status, "PARTIALLY_COVERED");
  assert.equal(domainCoverage("qtl", null, false).status, "NOT_MEASURED");
  const gaps = gapsFromCounts([countRow("canonical_entities", 10, "public.canonical_entities", "QUERIED"), countRow("protein_records", null, "public.protein_records", "TABLE_ABSENT")]);
  assert.equal(gaps.find((gap) => gap.category === "STRAINS")?.status, "PRESENT");
  assert.equal(gaps.find((gap) => gap.category === "GENES")?.count, null);
  assert.equal(gaps.find((gap) => gap.category === "GENES")?.status, "ABSENT");
  assert.equal(gaps.find((gap) => gap.category === "QTL")?.status, "NOT_MEASURED");
  const genomic = genomicsSummary([countRow("genome_assemblies", null, "public.genome_assemblies", "TABLE_ABSENT")]);
  assert.equal(genomic.records, null);
});

test("model text that invents a percent or a cultivation step is not a fact", async () => {
  assert.equal(narrationContractViolation("probability stays null"), null);
  const report = { human_report: "deterministic", identity_status: "IDENTITY_AMBIGUOUS", prediction_probability: 0.8 };
  let url = "";
  const narration = await narrateScientificReport(report, async (input) => {
    url = String(input);
    const text = JSON.stringify({ prose: "The cross is 22% likely. Use this nutrient schedule.", prediction_probability: null, promoted_to_documented_fact: false });
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), { status: 200, headers: { "content-type": "application/json" } });
  }, "test-key");
  assert.equal(url, "https://api.x.ai/v1/responses");
  assert.equal(narration.api, "POST /v1/responses");
  assert.equal(narration.status, "PROVIDER_ERROR");
  assert.equal(narration.contract_violation, "INVENTED_PERCENT");
  assert.equal(narration.text, "deterministic");
  assert.equal(narration.prediction_probability, null);
  assert.equal(narration.promoted_to_documented_fact, false);
  assert.equal(scientificContext(report).prediction_probability, null);
  assert.equal(scientificContext(report).raw_measurements, "NOT_INCLUDED");
  const invented = responseOutputText({ output: [{ type: "message", content: [{ type: "output_text", text: "{\"prediction_probability\":0.2,\"prose\":\"x\"}" }] }] });
  const bad = await narrateScientificReport(report, async () => {
    return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: invented }] }] }), { status: 200 });
  }, "test-key");
  assert.equal(bad.contract_violation, "INVENTED_PROBABILITY");
  assert.equal(bad.text, "deterministic");
});

test("an unexpired session file is the language credential only when the server key is absent", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gg-auth-"));
  const file = path.join(dir, "auth.json");
  writeFileSync(file, JSON.stringify({ session: { key: "session-token", expires_at: "2099-01-01T00:00:00.000Z" } }));
  const session = serverLanguageCredential({ GROK_AUTH_FILE: file });
  assert.equal(session.source, "GROK_SESSION");
  assert.equal(session.token, "session-token");
  const preferred = serverLanguageCredential({ XAI_API_KEY: "server-key", GROK_AUTH_FILE: file });
  assert.equal(preferred.source, "XAI_API_KEY");
  assert.equal(preferred.token, "server-key");
  writeFileSync(file, JSON.stringify({ session: { key: "old-token", expires_at: "2000-01-01T00:00:00.000Z" } }));
  const expired = serverLanguageCredential({ GROK_AUTH_FILE: file });
  assert.equal(expired.source, "ABSENT");
  assert.equal(expired.token, null);
});

test("production name search reads display_name, not a missing canonical_name column", () => {
  const source = readFileSync(new URL("./production-source.server.ts", import.meta.url), "utf8");
  const search = source.slice(source.indexOf("export async function productionNameSearch"));
  assert.match(search, /display_name/);
  assert.equal(search.includes("canonical_name ilike"), false);
  assert.match(source, /scientificPing/);
});
