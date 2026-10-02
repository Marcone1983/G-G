# Checkpoint — language layer, 2026-10-02

Repository: https://github.com/Marcone1983/G-G
Branch: main
Public API measured this session: https://g-g-growverse420-4304.vercel.app
This checkpoint is not a completion claim.

## What was measured, not copied from an older audit

GET `/api/v1/diagnostics/env` HTTP 200 on 2026-10-02:

| field | value |
|---|---|
| LANGUAGE_CREDENTIAL | ABSENT |
| scientific_database_status | CONNECTED |
| SERVICE_ROLE_PRESENT | false |
| database_public | false |
| client_may_open_postgres | false |
| project_ref | tupswxnfidpemjkzwgkx |

GET `/api/v1/version` HTTP 200 the same session: `snapshot_id` `GGS-KNOWLEDGE-000005`, `postgres` `NOT_CONFIGURED`, `redis` `not_configured`, `embedding_status` `BASELINE_NOT_SEMANTIC_MODEL`, `embedding_model` `gg-hashing-trick-v1`. The hashing trick is not a semantic embedding. The version payload and the diagnostics payload disagree on whether Postgres is configured. Both responses were returned by production. They were not reconciled by invention.

Inventory previously measured by the scientific-inventory workflow, not re-counted in this commit: measurements 8750800 (numeric 6413733, qualifier 2337067), source_records 783429, samples 762770, canonical_entities 20337, aliases 15974, claims 27782, pedigree_edges 28592. No DROP and no TRUNCATE.

## Language layer

Narration runs only after retrieval. `prediction_probability` stays null. A narration is `LANGUAGE_INTERPRETATION` and `promoted_to_documented_fact` is false. The server credential prefers `XAI_API_KEY`, then a local Grok session file, else ABSENT. The session file is not in git and is not on Vercel. Production therefore answers `AI_PROVIDER_NOT_CONFIGURED` until a server credential exists on the Vercel process.

GitHub Actions secret `XAI_API_KEY` was empty in the deploy logs (the value line was blank; other secrets were masked). This process cannot set GitHub secrets (HTTP 403). The session token was not pasted into the workflow, the repo, or this file.

## Deploy fact

`vercel pull` on CLI 62.1.0 succeeded and wrote project settings. The next command, `vercel env ls`, returned HTTP 403 `forbidden` / `team_unauthorized` (`Could not retrieve Project Settings`). CLI 56.1.0 failed already on `vercel pull`. `DATABASE_URL` is already present on the Vercel project: diagnostics reports the scientific database CONNECTED. The workflow must not call `env ls` on this token. It must not print env files.

GitHub Actions job `apk` in `.github/workflows/ci.yml` failed because `assembleDebug` writes flavor APKs under `apk/<flavor>/debug/`, not `apk/debug/`.

## Charts in this commit

`artifacts/gg-language-layer-chart.jpg` and `artifacts/gg-prediction-chart.png` are language-layer pictures. They are not measurements, not phenotypes, and not evidence.

## Still not done

See the missing list in the commit that adds this file. Do not treat a zero as measured unless a query returned it. Absence is UNKNOWN or TABLE_ABSENT, not a trait value of zero. Pattern validation, calibration, observation units, Redis, semantic embeddings, production image generation, strain-by-strain coverage, and Android device/Play upload are not done.

## Measured after this checkpoint, 2026-10-02

`GET /api/v1/diagnostics/env` later returned `LANGUAGE_CREDENTIAL=SERVER`. The credential is present. It is not accepted for work.

`GET /api/v1/diagnostics/xai` after commit `7d392ef`: HTTP 200 from G&G, provider HTTP 403. `language_http` 403, `embedding_http` 403, responses `http` 403, `status=FAILED`, latency 87 ms. The sanitized provider text says the team has used all credits or reached its monthly spending limit. The team id was redacted. This process's own key still gets HTTP 200 on `/v1/responses` and `/v1/chat/completions`. It was not copied onto Vercel. Buying credits is an external action on the xAI team that owns the production key.

Ten name crosses against `POST /api/v1/predictions`, all HTTP 200, about 6 s, `prediction_probability` null, `calibration_status` NOT_CALIBRATED, snapshot `GGS-KNOWLEDGE-000007`, narration `PROVIDER_ERROR` HTTP 403, `stored_as_evidence` false. THC `NOT_COMPUTABLE`, central null, except none of them had a numeric centre. Identities were `IDENTITY_AMBIGUOUS` or `UNRESOLVED`, not `RESOLVED`. `OG Kush x Wedding Cake` was cache `HIT`. The other nine were `MISS`.

`POST /api/v1/conversation/message` with "Blueberry Muffin": HTTP 200, pipeline `RETRIEVAL_THEN_LANGUAGE`, probability null, narration `PROVIDER_ERROR`, credential `SERVER`.

`POST /api/v1/visualizations`: HTTP 503, `PROVIDER_ERROR`. Not a phenotype.

`GET /api/v1/version` before the snapshot fix: `postgres=CONNECTED`, `snapshot_id=GGS-KNOWLEDGE-000005` (declared constant). Predictions use `GGS-KNOWLEDGE-000007` from `knowledge_snapshots`. Those two ids are not the same fact.

## Checkpoint 2026-10-02 18:12 CEST — commit 934ee93 plus the download fix

Public origin still https://g-g-growverse420-4304.vercel.app. Snapshot on `GET /api/v1/patterns` is `GGS-KNOWLEDGE-000007`. It was not rewritten as a constant. Redis was not turned on. Play Billing was not linked.

Measured HTTP after commits `d23e14c`, `5d25e4b`, `934ee93`:

- Chat `lemon skunk x super silver haze`: Lemon Skunk is `entity:18030`. Super Silver Haze lists 8 candidates (`entity:13366` through `entity:19687`). `prediction_probability` null. No gate paragraph.
- Chat of the two unique names `DNA Genetics Seeds Lemon Skunk` (`entity:4096`) and `Delicious Seeds Critical Super Silver Haze` (`entity:3770`): no numeric groups for delta_9_thc, cbd, thca, cbda. The reply names those missing fields. Probability null. It does not call an empty row an estimate and it does not say "pattern letti: 0".
- `POST /api/v1/strains/search` `lemon skunk`: first hit `entity:18030` Lemon Skunk. Same id as the chat.
- `GET /api/v1/patterns`: 40 rows. First hypothesis `Blue Dream · delta_9_thc · supporto 14 · n 5520`. Support is distinct independence groups. n is row count. No `null` name. No label-aggregate card. Not a percentage and not a genetic effect.
- `Felina 32` was absent from the catalog. First search `origin=ACQUIRED`, `research_id=7`, Europe PMC, acquired `2026-10-02T16:06:07.775Z`, title about Felina 32 hemp, year 2025, doi 10.3390/molecules30204148. Second search `origin=REREAD`, same id and timestamp. Not a measurement and not a pedigree.
- `zzxqv-not-a-strain-9042`: zero rows. Note says absence is UNKNOWN, not zero. No card was invented.

`GET /api/apk` on production returned HTTP 500 because `*.apk` is gitignored, so the Vercel build had no file and `readFile` threw. The route now redirects to `/downloads/GreedAndGross-1.5.3.apk`. The signed release `public/downloads/GreedAndGross-1.5.3.apk` is the one exception to the apk ignore. Badging: `science.gg.breeding`, versionName 1.5.3, versionCode 9. The CI debug check was still pinned to 1.5.1 / 7 and is updated to 1.5.3 / 9.

Still not done, and not claimed: xAI production narration (provider HTTP 403, spending limit), calibration on progeny, Redis, semantic embeddings, Play Console upload, a probability that is not null.
