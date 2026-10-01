import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HEALTH_RULES, healthRuleHolds, ruleIndex } from "./health-evidence.ts";

test("all 64 health evidence rules are implemented and hold", () => {
  assert.equal(HEALTH_RULES.length, 64);
  assert.equal(new Set(ruleIndex()).size, 64);
  const failed = ruleIndex().filter((id) => !healthRuleHolds(id));
  assert.deepEqual(failed, []);
});

test("health schema is prepared and not applied", () => {
  const sql = readFileSync(new URL("../../../scripts/postgres/007_health_evidence.sql", import.meta.url), "utf8");
  assert.equal(sql.includes("NOT APPLIED"), true);
  assert.equal(sql.includes("DIRECT_STRAIN_EVIDENCE"), true);
  assert.equal(sql.includes("CURES"), true);
  assert.equal(sql.includes("HAS_MEASURED_CHEMOTYPE"), true);
  assert.equal(sql.includes("testimony = false"), true);
});
