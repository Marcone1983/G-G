import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("hard-code detector", () => {
  it("rejects strain names in production logic", () => {
    const result = spawnSync("node", ["scripts/hardcode-scan.mjs", "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.failures, []);
    assert.ok(report.classified.some((row) => row.klass === "TEST" || row.klass === "FIXTURE"));
  });
});
