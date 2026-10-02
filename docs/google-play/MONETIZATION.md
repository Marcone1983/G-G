# Monetization

Nothing is for sale in this build.

Competitor evidence read on 2026-10-02, not a price recommendation: GrowBuddy's Play listing shows Premium at $2.99/month and Professional at $8.99/month. That app is a cultivation journal. G&G is not that product, so those prices are not a template.

Unit economics are not calculated. Image and research cost per user were not measured. No revenue, margin, LTV or MRR is claimed.

A later test grid can include €4.99, €7.99, €9.99, €14.99, €19.99 and €29.99. None of those figures is a chosen launch price.

Launch stack that exists now: free scientific read API, plus a server catalog of 50 mechanisms (`GET /api/v1/entitlements`). Every mechanism is `granted: false`, `price: null`, `product_id: null`, `NOT_FOR_SALE`. A client field cannot flip a tier (`POST /api/v1/billing/play/verify` returns unverified). Using a paid mechanism returns 402. Play Billing stays off until a public listing and real product ids exist. Nothing in the catalog sells evidence, a probability, or cultivation instructions.

Paid features, if added later, may add quota, history, export, seats and visualization count. They must not hide uncertainty or sell a probability that the model did not compute. In-app digital goods must use Play Billing. Lab, university, enterprise API, white-label and SSO stay server contracts and are not sold in the app.
