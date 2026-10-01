# Status

SQLite `data/gg-foundation.sqlite`, snapshot `GGS-KNOWLEDGE-000005`, is the scientific source of truth.

| Component | Status |
|---|---|
| Corpus counts | TESTED by `rawGuard`. 783429 source records, 8750800 measurements. |
| Raw cells | TESTED against the stored reconciliation. 8750800 matched, 0 writes. `JSON_VALUE_REPR` stays 4226354. |
| Catalog gap | NOT_AVAILABLE. 551 rows, `DECLARED_NOT_IN_FILE`. |
| Prediction probability | NOT_COMPUTABLE. Calibration is missing. |
| Genomics | NOT_AVAILABLE. |
| Postgres | NOT_CONFIGURED. `scripts/postgres/001_scientific.sql` is not applied. |
| Redis | NOT_CONFIGURED. Locks stay in the process. |
| Live provider | BLOCKED. A quota failure opens the circuit for 30 minutes. |

This is not production-ready. Production startup refuses a missing `DATABASE_URL` and a non-HTTPS public URL.
