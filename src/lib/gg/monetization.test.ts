import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boundaryDenial, needsBoundedQuery, publicArchitecture } from "./boundary.ts";
import { MECHANISMS, closedMechanism, entitlementDocument, refuseClientPurchase } from "./monetization.ts";

describe("monetization catalog", () => {
  it("lists 50 closed mechanisms and ignores a client paid flag", () => {
    assert.equal(MECHANISMS.length, 50);
    assert.equal(new Set(MECHANISMS.map((entry) => entry.id)).size, 50);
    const document = entitlementDocument();
    assert.equal(document.tier, "FREE");
    assert.equal(document.granted_count, 0);
    assert.equal(document.prices_chosen, false);
    assert.equal(document.sells_evidence, false);
    for (const entry of MECHANISMS) {
      assert.equal(entry.granted, false);
      assert.equal(entry.price, null);
      assert.equal(entry.product_id, null);
      assert.equal(entry.sells_scientific_evidence, false);
      assert.equal(entry.sells_certainty, false);
      assert.equal(entry.changes_prediction, false);
      assert.equal(entry.cultivation_instructions, false);
    }
    const refused = refuseClientPurchase({ paid: true, tier: "PRO", purchase_token: "fake" });
    assert.equal(refused.verified, false);
    assert.equal(refused.entitlement_changed, false);
    assert.equal(closedMechanism("premium")?.status, "ENTITLEMENT_REQUIRED");
    assert.equal(closedMechanism("nope"), null);
  });
});

describe("private database boundary", () => {
  it("refuses raw database routes and unbounded measurement dumps", () => {
    assert.equal(boundaryDenial("raw-measurements")?.database, "PRIVATE");
    assert.equal(boundaryDenial("database/all")?.supabase_data_api, "NOT_THE_APPLICATION_API");
    assert.equal(boundaryDenial("internal-sql")?.error, "DENIED");
    assert.equal(boundaryDenial("strains/search"), null);
    assert.equal(needsBoundedQuery("measurements", ""), true);
    assert.equal(needsBoundedQuery("measurements", "gmo"), false);
    assert.equal(needsBoundedQuery("health", ""), false);
    const architecture = publicArchitecture();
    assert.equal(architecture.database_public, false);
    assert.equal(architecture.invented_domain, false);
    assert.equal(architecture.millions_of_users, "NOT_CLAIMED");
    assert.equal(architecture.credentials_in_client, false);
  });
});
