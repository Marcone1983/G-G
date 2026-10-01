import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { knowledgeRepository } from "./repository.ts";

describe("one repository surface", () => {
  it("keeps the HTTP scientific routes on the repository and refuses a probability", () => {
    const source = readFileSync(new URL("./http.server.ts", import.meta.url), "utf8");
    assert.equal(source.includes('from "./brain.ts"'), false);
    assert.equal(source.includes('from "./foundation.server.ts"'), false);
    assert.equal(source.includes('from "./resolve.ts"'), false);
    assert.equal(source.includes('from "./predict.ts"'), false);
    assert.equal(source.includes('from "./unified.ts"'), false);
    const genomics = knowledgeRepository.getGenomics();
    assert.equal(genomics.data_status, "NOT_AVAILABLE");
    assert.equal(genomics.records, 0);
    const prediction = knowledgeRepository.evaluate({ query: "repository-gate" });
    assert.equal(prediction.probability, null);
    assert.equal(prediction.prediction_probability, null);
  });
});
