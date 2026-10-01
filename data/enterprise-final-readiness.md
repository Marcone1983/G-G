# Production readiness

Result: NOT PRODUCTION READY. Exit code of `npm run production:readiness` is 2.

Actions run [36840208848](https://github.com/Marcone1983/G-G/actions/runs/36840208848): test PASS, apk FAIL. The debug compile ran out of heap at 512 MiB. The next commit raises the Gradle heap. That run is not PASS until it finishes.

| Component | Status |
|---|---|
| Git push to Marcone1983/G-G | PASS for git only |
| GitHub Actions | FAIL on the last completed run |
| Postgres schema `001_scientific.sql` and `002_memory.sql` | READY_TO_APPLY |
| Corpus import `scripts/postgres/import_corpus.py` | READY_TO_APPLY, exit 2, not imported |
| Research memory cloud table | READY_TO_APPLY, not migrated |
| Worker `scripts/postgres/worker.py` | NOT_DEPLOYED, exit 2 |
| Redis | BLOCKED_EXTERNAL |
| Backup / restore scripts | NOT_RUN, exit 2 |
| Public API | BLOCKED_EXTERNAL, no URL |
| Android release | BLOCKED_EXTERNAL, release refuses a missing https URL |
| xAI probe | HTTP 200 on one completion. Not a deployed pipeline |
| Prediction | NOT_COMPUTABLE |
| Genomics | NOT_AVAILABLE |

Local SQLite is not production.
