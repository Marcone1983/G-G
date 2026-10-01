import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { baselineDistance, semanticModelStatus } from "./embedding.ts";
import { runIdempotentJob } from "./jobs.ts";

describe("platform contracts", () => {
  it("does not call the hashing trick a semantic model", () => {
    const status = semanticModelStatus();
    assert.equal(status.semantic_model, "NOT_CONFIGURED");
    assert.equal(status.status, "BASELINE_NOT_SEMANTIC_MODEL");
    const distance = baselineDistance("same token", "same token");
    assert.ok(distance != null && Math.abs(distance - 1) < 1e-9);
  });

  it("runs one job once and does not duplicate a success", async () => {
    let calls = 0;
    const payload = { nonce: `platform-job-${Date.now()}-${Math.random()}` };
    const first = await runIdempotentJob({
      type: "platform_contract_probe",
      payload,
      work: () => {
        calls += 1;
        return { output: { ok: true } };
      },
    });
    const second = await runIdempotentJob({
      type: "platform_contract_probe",
      payload,
      work: () => {
        calls += 1;
        return { output: { ok: true } };
      },
    });
    assert.equal(first.status, "SUCCEEDED");
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.id, first.id);
    assert.equal(calls, 1);
  });
});
