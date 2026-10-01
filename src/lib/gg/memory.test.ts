import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResearchMemory, providerErrorClass } from "./memory.ts";
import { canReadPrivate, canWriteCorpus, providerMayWriteCorpus } from "./rbac.ts";
import { scientificWriteAllowed } from "./write-gate.ts";
import { productionReadiness } from "./production-readiness.ts";

describe("research memory stays outside the corpus", () => {
  it("stores one unverified result and reuses it without a second provider call", async () => {
    const memory = ResearchMemory.isolated();
    const calls = { n: 0 };
    const ask = () => {
      calls.n += 1;
      return { status: "SUCCESS" as const, response: "unverified note", model: "test-model" };
    };
    const first = await memory.answer({ raw: "Example unknown knowledge query", snapshotId: "TEST-SNAPSHOT", providerName: "TEST_PROVIDER", call: ask });
    assert.equal(first.cache_hit, false);
    assert.equal(first.provider_called, true);
    assert.equal(first.memory_write_status, "VERIFIED");
    assert.equal(first.entry?.knowledge_status, "UNVERIFIED_AI_RESEARCH");
    assert.equal(first.entry?.provider, "TEST_PROVIDER");
    const second = await memory.answer({ raw: "  example   UNKNOWN knowledge query ", snapshotId: "TEST-SNAPSHOT", providerName: "TEST_PROVIDER", call: ask });
    assert.equal(second.cache_hit, true);
    assert.equal(second.provider_called, false);
    assert.equal(second.entry?.memory_id, first.entry?.memory_id);
    assert.equal(calls.n, 1);
    const blocked = await memory.answer({ raw: "another missing query", snapshotId: "TEST-SNAPSHOT", providerName: "TEST_PROVIDER", call: () => ({ status: "BLOCKED" as const, response: null, model: "test-model" }) });
    assert.equal(blocked.memory_write_status, "NOT_WRITTEN");
    assert.equal(memory.lookup("another missing query", "TEST-SNAPSHOT"), null);
    const other = memory.lookup("Example unknown knowledge query", "TEST-SNAPSHOT", "PRIVATE", "user-b");
    assert.equal(other, null);
  });

  it("deduplicates one concurrent miss and keeps failures out of knowledge", async () => {
    const memory = ResearchMemory.isolated();
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const call = async () => {
      calls += 1;
      await gate;
      return { status: "SUCCESS" as const, response: "shared", model: "test-model" };
    };
    const pending = Promise.all([
      memory.answer({ raw: "Same research key", snapshotId: "TEST-SNAPSHOT", providerName: "TEST_PROVIDER", call }),
      memory.answer({ raw: "same   research key", snapshotId: "TEST-SNAPSHOT", providerName: "TEST_PROVIDER", call }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const [a, b] = await pending;
    assert.equal(calls, 1);
    assert.equal(a?.entry?.memory_id, b?.entry?.memory_id);
    assert.equal(providerErrorClass("503 timeout"), "RETRYABLE");
    assert.equal(providerErrorClass("403 spending-limit"), "BLOCKED");
  });

  it("reports not ready without writing the corpus", () => {
    const report = productionReadiness();
    assert.equal(report.status, "NOT_READY");
    assert.equal(report.production_eligible, false);
    assert.equal(report.counts.measurements, 8750800);
    assert.equal(report.counts.source_records, 783429);
    assert.equal(report.counts.samples, 762770);
    assert.equal(report.counts.canonical_entities, 20337);
    assert.equal(report.counts.aliases, 15974);
    assert.equal(report.counts.claims, 27782);
    assert.equal(report.counts.pedigree_edges, 28592);
    assert.equal(report.components.probability, null);
    assert.ok(report.blockers.includes("CALIBRATION_NOT_CALIBRATED"));
    assert.ok(report.blockers.includes("POSTGRES_NOT_CONFIGURED"));
    assert.ok(report.blockers.includes("REDIS_NOT_CONFIGURED"));
    assert.ok(report.blockers.includes("PRODUCTION_API_URL_ABSENT"));
  });

  it("keeps a file-backed hit after the first handle is closed", async () => {
    const file = `data/dev/memory-restart-${Date.now()}.sqlite`;
    let calls = 0;
    const first = ResearchMemory.devFile(file);
    await first.answer({
      raw: "shared global question",
      snapshotId: "TEST-SNAPSHOT",
      providerName: "TEST_PROVIDER",
      call: () => {
        calls += 1;
        return { status: "SUCCESS" as const, response: "unverified", model: "test-model", requestId: "req-1" };
      },
    });
    const reopened = ResearchMemory.devFile(file);
    const hit = await reopened.answer({
      raw: "shared global question",
      snapshotId: "TEST-SNAPSHOT",
      providerName: "TEST_PROVIDER",
      call: () => {
        calls += 1;
        return { status: "SUCCESS" as const, response: "should-not-run", model: "test-model" };
      },
    });
    assert.equal(hit.cache_hit, true);
    assert.equal(hit.provider_called, false);
    assert.equal(calls, 1);
    assert.equal(reopened.environment, "DEV_FILE");
    assert.equal(reopened.lookup("shared global question", "TEST-SNAPSHOT", "PRIVATE", "user-b"), null);
    assert.equal(canReadPrivate({ id: "a", role: "USER" }, "b"), "DENY");
    assert.equal(canWriteCorpus("USER"), "DENY");
    assert.equal(providerMayWriteCorpus(), "DENY");
    assert.equal(scientificWriteAllowed("measurements", "AI").allowed, false);
    assert.equal(reopened.mark(String(hit.entry?.memory_id), "STALE"), true);
  });
});
