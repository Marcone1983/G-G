import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { circuitAllowsCall, circuitRecord, resetCircuitForTests } from "./circuit.ts";
import { assertRuntimeConfig } from "./config.ts";
import { benjaminiHochberg } from "./fdr.ts";
import { privateAccess, providerMayReadPrivate } from "./privacy.ts";

describe("production controls", () => {
  it("opens the circuit on quota and does not invent a prior correction", () => {
    resetCircuitForTests();
    assert.equal(circuitAllowsCall().allow, true);
    circuitRecord("BLOCKED", 1_000);
    assert.equal(circuitAllowsCall(1_000 + 1000).allow, false);
    assert.equal(circuitAllowsCall(1_000 + 31 * 60 * 1000).state, "HALF_OPEN");
    const corrected = benjaminiHochberg([0.01, 0.04, 0.2], 0.05);
    assert.equal("adjusted" in corrected, true);
    assert.equal(benjaminiHochberg([null], 0.05).status, "NOT_APPLICABLE");
  });

  it("refuses a dangerous production config and another user's row", () => {
    assert.equal(assertRuntimeConfig({ NODE_ENV: "development" }).status, "NOT_PRODUCTION");
    assert.equal(assertRuntimeConfig({ NODE_ENV: "production", API_BASE_URL: "http://example.test" }).status, "REFUSED");
    assert.equal(assertRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://local", XAI_API_KEY: "secret", API_BASE_URL: "https://example.test" }).status, "ACCEPTED");
    assert.equal(privateAccess("user-a", "user-b"), "DENY");
    assert.equal(privateAccess("user-a", "user-a"), "ALLOW");
    assert.equal(providerMayReadPrivate(), "DENY");
  });

  it("keeps the verified raw reconciliation and does not promote JSON cells", () => {
    const report = JSON.parse(readFileSync(new URL("../../../data/raw-reconciliation.json", import.meta.url), "utf8")) as {
      cells_compared: number;
      csv_cell_exact: number;
      csv_cell_mismatch: number;
      writes: number;
      stored_fidelity: Record<string, number>;
      nd_with_numeric_value: number;
    };
    assert.equal(report.cells_compared, 8750800);
    assert.equal(report.csv_cell_exact, 8750800);
    assert.equal(report.csv_cell_mismatch, 0);
    assert.equal(report.writes, 0);
    assert.equal(report.nd_with_numeric_value, 0);
    assert.equal(report.stored_fidelity.JSON_VALUE_REPR, 4226354);
    assert.equal(report.stored_fidelity.CSV_CELL_EXACT, 4524446);
  });
});
