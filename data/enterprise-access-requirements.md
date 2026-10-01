# Production database

PRODUCTION DATABASE = SUPABASE POSTGRESQL

Project: tupswxnfidpemjkzwgkx
Public URL: https://tupswxnfidpemjkzwgkx.supabase.co
HTTPS probe of /rest/v1/: 401 without a key. That only shows the project host exists.
PostgreSQL connection: NOT_EXECUTED

Credentials in this environment:
DATABASE_URL = ABSENT
SUPABASE_SERVICE_ROLE_KEY = ABSENT

The importer uses DATABASE_URL. A publishable key cannot create tables or import the corpus.
The sqlite corpus is not in git, so a GitHub Actions secret alone cannot import the 8750800 measurements.

Required secret name: DATABASE_URL
Value: Supabase → Project Settings → Database → Connection string → URI
Where: the environment that runs the import, server-only. Not git, not the APK, not chat.
