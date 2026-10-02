import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interpretMessage } from "./chat.ts";

describe("interpretMessage", () => {
  it("takes the cultivar out of an Italian question", () => {
    const heard = interpretMessage("cosa mi sai dire sulla blue dream");
    assert.equal(heard.kind, "lookup");
    if (heard.kind === "lookup") assert.equal(heard.query, "blue dream");
  });

  it("still reads a cross after the question", () => {
    const heard = interpretMessage("cosa mi sai dire su lemon skunk x super silver haze");
    assert.equal(heard.kind, "cross");
    if (heard.kind === "cross") {
      assert.equal(heard.a, "lemon skunk");
      assert.equal(heard.b, "super silver haze");
    }
  });
});
