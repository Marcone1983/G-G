# Play policy audit — G&G as implemented

This is a feature audit, not a conclusion that cannabis data is allowed or forbidden by itself.

Market context, not precedent: GrowBuddy is listed on Google Play with AI chat, plant notes and subscriptions (Premium listed at $2.99/month and Professional at $8.99/month on the Play listing read on 2026-10-02). Grow with Jane is listed with diaries, community features and a Pro subscription. Those listings do not decide G&G.

## Policies used

- Illegal activities: apps must not facilitate or promote illegal activities. Examples include sale or purchase of illegal drugs, and instructions for growing or manufacturing illegal drugs. https://support.google.com/googleplay/android-developer/answer/9878877
- Marijuana: apps must not facilitate the sale of marijuana or marijuana products, regardless of legality. Examples include an in-app cart, arranging delivery or pickup, and facilitating sale of THC products. https://support.google.com/googleplay/android-developer/answer/9878810
- AI-generated content: apps that generate content with AI must offer in-app reporting of offensive content, without leaving the app. https://support.google.com/googleplay/android-developer/answer/13985936

## What the repository actually does

G&G is a native Kotlin client plus a server that reads a scientific corpus: identity, pedigree, chemistry measurements, evidence, candidate patterns and a mid-parent estimate. Probability stays null when the model is not calibrated. The Android client has no scientific engine and no WebView core. There is no shopping cart, no delivery, no seed shop, and no grow schedule, feeding recipe, pest treatment or harvest guide in the app screens.

| Feature | What exists | Policy | Status |
|---|---|---|---|
| Scientific strain and chemistry database | Corpus and read APIs | Not a sale and not grow instructions | CLEAR for the database itself |
| Pedigree and identity | Edges kept as reported, ambiguous names not fused | Reference function | CLEAR |
| Breeding estimate | Median of parent groups, not a probability | Analysis, not a cultivation recipe | CLEAR if it does not add grow instructions |
| Literature metadata | Titles, DOI, PMID stored as metadata, not as measurements | Reference | CLEAR |
| Conversational answers | Server replies from the corpus | AI-generated text | REQUIRES_REVIEW under the AI policy; reporting screen added |
| Predictive image | Not generated in this change. Model `grok-imagine-image` is listed by the provider | AI image | REQUIRES_REVIEW until generation and reporting are both live |
| User observations | Account-scoped notes | UGC if users can publish them to others. Current notes are private | CLEAR while they stay private |
| Health or pharmacology claims | Not a diagnosis product. Chemistry rows are measurements | Do not present them as treatment | CLEAR if the UI keeps that boundary |
| Commerce | None | Marijuana sale policy | NOT_APPLICABLE today |
| Subscriptions | Screen shows FREE and refuses a local upgrade | Play Billing when a digital subscription is sold | NOT_APPLICABLE until a product is sold. PLAY_POLICY_RISK if a subscription is added outside Play Billing |
| Advertising | None | Ads policy | NOT_APPLICABLE |

Ambiguity: the illegal-activities examples name "instructions for growing or manufacturing illegal drugs" without defining scientific breeding discussion. A pedigree or a chemotype table is not those instructions. A future chat reply that tells someone how to cultivate would be POLICY_RISK. That reply is not a feature of the current screens.

No developer email, phone, website or D-U-N-S is recorded here. The postal identity supplied for documentation is 420WHITE LLC, 8 The Green, 19901 Dover, Delaware, United States. If the Play Console account is a different legal entity, that is a blocker for store submission.
