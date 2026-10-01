import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { privateAccess } from "./privacy.ts";
import { lockStatus } from "./locks.ts";

describe("production preparation does not pretend the cloud exists", () => {
  it("keeps the memory schema unapplied and the baseline explicit", () => {
    const memory = readFileSync("scripts/postgres/002_memory.sql", "utf8");
    const corpus = readFileSync("scripts/postgres/001_scientific.sql", "utf8");
    assert.match(memory, /NOT APPLIED/);
    assert.match(memory, /UNVERIFIED_AI_RESEARCH/);
    assert.match(memory, /enable row level security/);
    assert.equal(/for update skip locked/i.test(memory), false);
    assert.match(corpus, /NOT APPLIED/);
    assert.equal(memory.includes("DOCUMENTED"), false);
    const worker = readFileSync("scripts/postgres/worker.py", "utf8");
    assert.match(worker, /for update skip locked/);
  });

  it("does not treat a process lock or another user as production", () => {
    assert.equal(lockStatus().redis, "NOT_CONFIGURED");
    assert.equal(lockStatus().backend, "process_memory");
    assert.equal(privateAccess("user-a", "user-b"), "DENY");
    assert.equal(privateAccess("user-a", "user-a"), "ALLOW");
    const gradle = readFileSync("android/app/build.gradle.kts", "utf8");
    assert.match(gradle, /PRODUCTION_API_BASE_URL must be a public https URL/);
    assert.match(gradle, /10\.0\.2\.2:8080/);
  });
});
