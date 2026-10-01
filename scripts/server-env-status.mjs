import { pathToFileURL } from "node:url";

const EXPECTED_PROJECT = "https://tupswxnfidpemjkzwgkx.supabase.co";
const PROJECT_REF = "tupswxnfidpemjkzwgkx";

function present(name) {
  const value = process.env[name];
  return Boolean(value && value.trim());
}

export function serverEnvStatus() {
  const project = (process.env.PROJECT_URL || "").trim().replace(/\/$/, "");
  const database = (process.env.DATABASE_URL || "").trim();
  return {
    DATABASE_URL_PRESENT: present("DATABASE_URL"),
    PROJECT_URL_PRESENT: present("PROJECT_URL"),
    SERVICE_ROLE_PRESENT: present("SUPABASE_SERVICE_ROLE_KEY"),
    PROJECT_URL_MATCH: project === EXPECTED_PROJECT,
    DATABASE_URL_PROJECT_REF: database.includes(PROJECT_REF),
    SQLITE_FALLBACK: "NONE",
    SECRET_SOURCE: "process.env",
    PREVIEW_SECRET_CHANNEL: "UNAVAILABLE",
    REQUIRED_SERVER_ENV: "DATABASE_URL",
  };
}

const status = serverEnvStatus();
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  for (const [key, value] of Object.entries(status)) console.log(`${key}=${value}`);
}
