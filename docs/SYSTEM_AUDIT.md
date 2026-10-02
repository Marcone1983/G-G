# SYSTEM AUDIT

Measured on 2026-10-02. A zero below is a query result. `TABLE_ABSENT` and `NOT_MEASURED` are not zeroes. This file does not say the system is the most accurate.

## Production API

Origin: `https://g-g-growverse420-4304.vercel.app`

Commit `16e6c25` deployment status from GitHub: Vercel success, target `https://vercel.com/growverse420-4304/g-g/4QCDBCGVDHUn5QByfx5RtYE9AP4D`.

After that deployment:

| Request | HTTP | Result |
|---|---|---|
| `GET /api/v1/measurements` | 400 | `QUERY_REQUIRED`. No rows. |
| `GET /api/v1/measurements?q=a` | 400 | `QUERY_REQUIRED`. |
| `GET /api/v1/database/all` | 403 | `DENIED`. |
| `GET /api/v1/sql` | 403 | `DENIED`. |
| `GET /api/v1/embeddings` | 200 | `XAI_API_KEY_ABSENT` on Vercel. `models_seen` 0. Not an embedding model. |

Before that deployment, the same origin returned raw measurement rows, including `raw_cell_text`, for `GET /api/v1/measurements`. That response is no longer the live one.

`GET /api/v1/foundation` on the previous deployment: measurements 8750800, canonical_entities 20337, source_records 783429, samples 762770. The inventory below re-queried those tables.

## Database inventory

Workflow: `scientific-inventory` run `37000731000`, conclusion success. Read-only. `DATABASE_URL` was masked.

| Category | Count | Status | Last updated | Source |
|---|---|---|---|---|
| source_records | 783429 | QUERIED | NOT_STORED | public.source_records |
| samples | 762770 | QUERIED | NOT_STORED | public.samples |
| measurements | 8750800 | QUERIED | NOT_STORED | public.measurements |
| canonical_entities | 20337 | QUERIED | NOT_STORED | public.canonical_entities |
| aliases | 15974 | QUERIED | NOT_STORED | public.aliases |
| pedigree_edges | 28592 | QUERIED | NOT_STORED | public.pedigree_edges |
| claims | 27782 | QUERIED | NOT_STORED | public.claims |
| pattern_candidates | 1468 | QUERIED | 2026-10-01 19:23:45.952023+00 | public.pattern_candidates |
| pattern CANDIDATE | 1468 | QUERIED | NOT_STORED | lifecycle |
| pattern SUPPORTED | 0 | QUERIED | NOT_STORED | lifecycle |
| pattern REPLICATED | 0 | QUERIED | NOT_STORED | lifecycle |
| pattern VALIDATED | 0 | QUERIED | NOT_STORED | lifecycle |
| pattern CONTRADICTED | 0 | QUERIED | NOT_STORED | lifecycle |
| pattern RETIRED | 0 | QUERIED | NOT_STORED | lifecycle |
| knowledge_snapshots | 2 | QUERIED | NOT_STORED | public.knowledge_snapshots |
| model_versions | 0 | QUERIED | NOT_STORED | public.model_versions |
| knowledge_cache | 0 | QUERIED | NOT_STORED | public.knowledge_cache |
| scientific_records | 76075 | QUERIED | NOT_STORED | public.scientific_records |
| structural_variants | 73477 | QUERIED | NOT_STORED | public.structural_variants |
| genome_assemblies | 35 | QUERIED | NOT_STORED | public.genome_assemblies |
| protein_records | 48 | QUERIED | NOT_STORED | public.protein_records |
| research_papers | 1098 | QUERIED | NOT_STORED | public.research_papers |
| expression_studies | 153 | QUERIED | NOT_STORED | public.expression_studies |
| chemical_observations | 136 | QUERIED | NOT_STORED | public.chemical_observations |
| scientific_features | 63631 | QUERIED | NOT_STORED | public.scientific_features |
| prediction_records | 1 | QUERIED | 2026-10-01 19:24:43.846624+00 | public.prediction_records |
| observation_units | 0 | QUERIED | NOT_STORED | public.observation_units |
| health_evidence | 0 | QUERIED | NOT_STORED | public.health_evidence |
| acquisition_records | 76075 | QUERIED | NOT_STORED | public.acquisition_records |
| acquisition_sources | 22 | QUERIED | NOT_STORED | public.acquisition_sources |
| catalog_gaps | 0 | QUERIED | NOT_STORED | public.catalog_gaps |
| calibration_runs | 0 | QUERIED | NOT_STORED | public.calibration_runs |
| global_research_memory | 0 | QUERIED | NOT_STORED | public.global_research_memory |
| jobs | 0 | QUERIED | NOT_STORED | public.jobs |
| worker_jobs | 0 | QUERIED | NOT_STORED | public.worker_jobs |
| content_reports | null | TABLE_ABSENT | NOT_STORED | public.content_reports |

Measurement classes, one `GROUP BY` of `normalized_class`/`klass`:

| Class | Rows |
|---|---|
| CANNABINOID | 3863630 |
| TERPENE | 2933023 |
| PESTICIDE | 1133331 |
| MICROBE | 273302 |
| RESIDUAL_SOLVENT | 248850 |
| OTHER | 218947 |
| HEAVY_METAL | 79717 |

Class-name filters: flavonoid 0, anthocyanin 0, phenotype 0. Those zeroes mean no class label matched. They are not a claim about the text inside `OTHER`. The chemotype filter summed CANNABINOID and TERPENE to 6796653. That is the same rows counted twice under one label, not a third dataset.

Embedding columns found: `research_sessions.embedding_status`, `embedding_model`, `embedding_version`. No vector count was queried. Embeddings count: `NOT_MEASURED`.

Entity coverage percentages were not queried. Do not divide 28592 by 20337.

## Knowledge coverage

Title matches on `research_papers` only. `WELL_COVERED` was not assigned.

ABSENT: botany 0, nmr 0. WEAK: proteomics 2, phytochemistry 4, gwas 2, anthocyanin 3, hplc 3. PARTIALLY_COVERED: physiology 5, genetics 6, genomics 24, transcriptomics 7, metabolomics 13, biosynthesis 39, qtl 7, flavonoid 7, chemotype 10, pharmacology 5.

Europe PMC search `cannabis flavonoid biosynthesis` returned HTTP 200, hit_count 697, 5 metadata records kept in the workflow log only. `measurements_written` 0. `stored_as_evidence` false. Nothing was inserted.

## Prediction

`POST /api/v1/predictions` with parent names GMO and Blueberry Muffin, after the previous deployment and still the live engine for that route: HTTP 200, `prediction_probability` null, `calibration_status` NOT_CALIBRATED, `identity_status` IDENTITY_AMBIGUOUS, `central_estimate` null, `status` NOT_COMPUTABLE, `cache_status` MISS, snapshot `GGS-KNOWLEDGE-000007`, embedding model `gg-hashing-trick-v1`. Parent groups 0. This run did not reproduce a chemical median.

## Embeddings and cache

This environment called `GET https://api.x.ai/v1/models` HTTP 200, 14 models, 0 names containing `embed`. The hashing fingerprint is not an embedding. Vercel has no `XAI_API_KEY`. Redis on the previous `/api/v1/cache` response: `NOT_CONFIGURED`. `knowledge_cache` count 0. A versioned cache unit test changes a snapshot and records a MISS. Production hit rate was not measured.

## Image

`grok-imagine-image-2.0` generated one chart from a structured spec in this environment. HTTP 200. 124514 bytes. `image/jpeg`. Probability in the spec: null. File: `artifacts/gg-prediction-chart.png`. The public API cannot generate an image until `XAI_API_KEY` is set on Vercel. The chart is not a laboratory measurement.

## Android

`assembleEmulatorDebug`: BUILD SUCCESSFUL. `app-emulator-debug.apk` 11397240 bytes. `assembleProductionRelease` and `bundleProductionRelease` with `PRODUCTION_API_BASE_URL=https://g-g-growverse420-4304.vercel.app`: BUILD SUCCESSFUL. APK 8228271 bytes. AAB 7868568 bytes. No device install. No Play upload.

## Not verified

Load test, p50/p95/p99, millions of users, Play approval, calibration, validated patterns, semantic precision/recall, production image generation, `content_reports` (table absent).
