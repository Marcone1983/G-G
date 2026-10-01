# Checkpoint — Preview source of truth

Date: 2026-10-01

Repository: https://github.com/Marcone1983/G-G

Branch: main

## What changed

The preview screens and `GET /api/v1/foundation` no longer read `data/catalog.json` or `data/gg-foundation.sqlite`.

If the server process has no `DATABASE_URL`, the answer is `NOT_CONFIGURED`, `fallback=NONE`, counts null. Empty production tables stay empty. They are not filled from the local corpus.

## Credentials

GitHub repository secrets are injected only into GitHub Actions jobs that name them. This preview process does not receive those secrets. The app-builder platform injects its own `DATABASE_URL` only on deploy, and that database is not the Supabase project `tupswxnfidpemjkzwgkx`. It must not become a second scientific database.

`scripts/with-app-env.mjs` forwards only `VITE_` keys from `.grok/app-env.json`. A database URL placed there would not be loaded, and must not be committed.

## Not in this commit

Chat screenshots under `attachments/` and the runtime file `.grok/status`.

The sqlite corpus, raw CSV files, and the Android keystore stay out of git.
