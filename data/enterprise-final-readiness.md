# Production readiness

Result: NOT PRODUCTION READY. Exit code of `npm run production:readiness` is 2.

| Component | Code exists | Configured | Deployed | Reachable | Tested in production | Status |
|---|---|---|---|---|---|---|
| GitHub Marcone1983/G-G | yes | yes | yes | yes | push verified | PASS for git only |
| GitHub Actions | yes | yes | the workflow runs | yes | last run failed | FAIL |
| PostgreSQL / Supabase | schema file | no | no | no | no | BLOCKED_EXTERNAL |
| Corpus import | local sqlite only | no | no | local file only | local counts only | DEV_ONLY |
| Global research memory | code | no cloud table | no | no | file test only | DEV_ONLY |
| Private memory | code | no | no | no | unit only | TEST_ONLY |
| Redis / Valkey | process lock | no | no | no | no | BLOCKED_EXTERNAL |
| Queue | sqlite jobs | no | no | no | local | DEV_ONLY |
| Worker | code | no | no | no | no | NOT_RUN |
| xAI key | yes | key present | not a product endpoint | HTTP 200 on one completion | probe only | NOT a deployed pipeline |
| Public API | routes in repo | no URL | no | no | no | BLOCKED_EXTERNAL |
| Android debug | yes | emulator URL | not Play | local apk | local build | DEV_ONLY |
| Android release | gate added | URL absent | no | no | release build must fail | BLOCKED_EXTERNAL |
| Signing secrets in Actions | local keystore | not writable by this token | no | no | no | BLOCKED_EXTERNAL |
| Backup / restore of cloud | no | no | no | no | no | NOT_RUN |
| Prediction | gate | no calibrated model | no | n/a | probability null | NOT_COMPUTABLE |
| Genomics | schema only | no data | no | no | no | NOT_AVAILABLE |

Local SQLite, the dev memory file, and a debug APK are not production.
