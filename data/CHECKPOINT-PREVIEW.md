# Checkpoint — Preview source of truth

Date: 2026-10-01

Repository: https://github.com/Marcone1983/G-G

Branch: main

## Process

The 502 `no_target` happened because the Node process on port 8080 had exited.
A disconnected client raised an unhandled `aborted` / `ECONNRESET`, and Node 22 ends the process on an unhandled rejection.
`scripts/preview-guard.mjs` keeps the server up for that class of error.
`scripts/preview-supervisor.mjs` is started with `setsid` from `startup.sh`, parent pid 1, and starts `npm run dev` again if it still exits.
It also posts the proxy target to port 8080, because the detached process is not an `agent_descendant`.


The preview starts with `/workspace/startup.sh`, which runs `npm run dev`.
That command is `node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080`.

`with-app-env.mjs` copies only `VITE_` keys from `.grok/app-env.json`.
`DATABASE_URL`, `PROJECT_URL` and `SUPABASE_SERVICE_ROLE_KEY` are ignored if placed there.
Vite does not expose non-`VITE_` variables to the browser.

## Why the preview cannot see the GitHub secrets

GitHub injects a repository secret only into a workflow job that names `${{ secrets.NAME }}`.
The secret value cannot be read back by the API, by this sandbox, or by the Vite process.
Copying it into a file, an artifact, or the frontend would publish it. That path is refused.

`npm run server:env` prints only booleans. It does not open SQLite and it does not print values.

GitHub Actions remains the runtime that can query Supabase, through `.github/workflows/supabase-status.yml`.
The last verified counts are source_records 783429, samples 762770, measurements 1960000.
canonical_entities, aliases, claims and pedigree_edges were 0. The import was not resumed.

## Scientific source

Preview screens read Supabase only when `DATABASE_URL` is present in the server process and points at project `tupswxnfidpemjkzwgkx`.
Otherwise the status is `NOT_CONFIGURED` and `fallback=NONE`.
A platform database URL for a different host is refused. It is not a second corpus.
