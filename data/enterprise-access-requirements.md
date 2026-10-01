# Owner action required

Verified on 2026-10-01 against https://github.com/Marcone1983/G-G branch main.

The system is not production-ready. `npm run production:readiness` exits 2.

These are absent in this environment: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, VALKEY_URL, VERCEL_TOKEN, PRODUCTION_API_BASE_URL, STAGING_API_BASE_URL. No `.vercel/project.json`. No Supabase project directory.

XAI_API_KEY is set. A models request and one chat completion to `grok-4` both returned HTTP 200. The key was not printed. That does not deploy a research worker.

GitHub Actions secrets cannot be written: HTTP 403 on the secrets API.

## SUPABASE

ACCESS REQUIRED: project connection
PERMISSION REQUIRED: database URI and service role
CREDENTIAL: DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY
WHERE TO GET IT: Supabase → Project Settings → Database, and API → service_role
WHERE TO CONFIGURE IT: server environment only, and GitHub Actions secrets if CI must migrate
SECURITY: server-only. Never in the APK.
AFTER ACCESS: apply the Postgres migration and import the existing corpus. Counts must match 783429, 762770, 8750800, 20337, 15974, 27782, 28592. No reconstruction.

## REDIS / VALKEY

ACCESS REQUIRED: a reachable Redis or Valkey
CREDENTIAL: REDIS_URL or VALKEY_URL
WHERE: the host of that service. Supabase does not include it.
SECURITY: server-only
AFTER ACCESS: two-process lock and one research job for two concurrent requests.

## PUBLIC API

ACCESS REQUIRED: a real HTTPS origin
CREDENTIAL: PRODUCTION_API_BASE_URL and STAGING_API_BASE_URL
WHERE: after an actual deploy. Vercel is not reachable from here.
SECURITY: the URL is public. Tokens are not.
AFTER ACCESS: release Android build. Until then assembleRelease fails on purpose.

## GITHUB ACTIONS SECRETS

ACCESS REQUIRED: permission to write Actions secrets, or set them yourself
CREDENTIAL: ANDROID_KEYSTORE_BASE64, ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
WHERE: https://github.com/Marcone1983/G-G/settings/secrets/actions
SECURITY: server-only. The keystore file stays out of git.
AFTER ACCESS: the release job can sign an APK. It still will not be a Play release until PRODUCTION_API_BASE_URL is https.

## VERCEL

ACCESS REQUIRED: VERCEL_TOKEN and an existing project, if the API is to be hosted there
WHERE: Vercel → Account → Tokens
SECURITY: server-only
AFTER ACCESS: deploy the API. A persistent worker will not be forced onto a serverless function.
