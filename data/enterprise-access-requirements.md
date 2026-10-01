# Production database

The decision is already made.

PRODUCTION DATABASE = SUPABASE POSTGRESQL

SQLite is not an alternative. It remains only the local import source.

## Status

Provider: Supabase PostgreSQL
Implementation: scripts/postgres/001_scientific.sql and scripts/postgres/002_memory.sql
Credentials detected: NO
Connection test: NOT_EXECUTED
Migration: NOT_EXECUTED
Import: NOT_EXECUTED
Verification: NOT_EXECUTED
Blocker: DATABASE_URL is absent in this environment
Required user action: provide the Supabase Postgres connection as DATABASE_URL. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are also needed for the server. Never put the service role in git or in the APK.

Where to copy DATABASE_URL: Supabase → Project Settings → Database → Connection string → URI
Where to copy SUPABASE_URL: Project Settings → API → Project URL
Where to copy SUPABASE_SERVICE_ROLE_KEY: Project Settings → API → service_role
Where they must live: server environment only
