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
