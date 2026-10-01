import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { openApiDocument } from "./openapi.ts";

describe("api contract", () => {
  it("documents every runtime route, including docs", () => {
    const source = readFileSync(new URL("./http.server.ts", import.meta.url), "utf8");
    const documented = new Set(Object.keys(openApiDocument().paths as Record<string, unknown>));
    const runtime = new Set<string>();
    for (const match of source.matchAll(/path === "([^"]+)"/g)) runtime.add(`/${match[1]}`);
    for (const match of source.matchAll(/path === "([^"]+)" \|\| path === "([^"]+)"/g)) {
      runtime.add(`/${match[1]}`);
      runtime.add(`/${match[2]}`);
    }
    const prefixes = ["models/", "strains/", "crosses/", "predictions/", "tools/", "entities/", "disciplines/", "research/", "knowledge/crosses/"];
    for (const prefix of prefixes) {
      if (source.includes(`path.startsWith("${prefix}")`)) runtime.add(`/${prefix}{id}`);
    }
    assert.ok(documented.has("/docs"));
    assert.ok(runtime.has("/docs"));
    const missing = [...runtime].filter((path) => !path.includes("{id}") && !documented.has(path));
    assert.deepEqual(missing, []);
    assert.equal(documented.has("/evidence/ingest"), false);
  });
});
