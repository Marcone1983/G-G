# Owner action required

Nothing below is invented. The process does not have these values. Do not put server secrets in the Android APK.

| Secret | Why | Where | Scope |
|---|---|---|---|
| `DATABASE_URL` | Cloud Postgres, preferably the existing Supabase project. Format `postgres://` or `postgresql://`. | Supabase → Project Settings → Database → connection string. Put it in the server environment only. | SERVER_ONLY |
| `SUPABASE_URL` | Project URL if the API uses the Supabase client. Not a substitute for `DATABASE_URL` unless it is a postgres URL. | Supabase → Project Settings → API. | SERVER_ONLY for service use. The URL itself is not a password. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server migrations and bypass of RLS. | Supabase → Project Settings → API → service_role. | SERVER_ONLY. Never in the APK. |
| `SUPABASE_ANON_KEY` | Only if a client talks to Supabase directly. This app should call the HTTPS API instead. | Same API page. | CLIENT_SAFE only if RLS is on. Not required for the API-only design. |
| `REDIS_URL` or `VALKEY_URL` | Distributed lock and queue across API instances. Supabase does not provide this. | The host of that service. | SERVER_ONLY |
| `PRODUCTION_API_BASE_URL` | Public HTTPS origin for the Play build. Release stays blank until this is `https://`. | The real domain after the API is deployed. | CLIENT_SAFE (it is a URL, not a secret) |
| `STAGING_API_BASE_URL` | Separate staging origin. | Staging host. | CLIENT_SAFE |
| Android upload keystore `storePassword` and `keyPassword` | Sign the Play APK. | `android/keystore.properties`, not git. | SERVER_ONLY / release machine |
| GitHub Actions on this repository | Remote CI. | Repo → Settings → Actions, if the workflow is not running. | The workflow does not need a new token to run on push. |

`XAI_API_KEY` is already present in this environment. It is not printed here. A live call was not made. The last known provider state remains quota `BLOCKED`.

There is no Vercel token and no linked Vercel project in `.vercel/project.json`. A persistent worker should not be forced onto a serverless function. After Postgres exists, the worker process still needs a host that stays up.

Dev file `data/dev/research-memory.sqlite` is `DEV_FILE`, not the production database.
