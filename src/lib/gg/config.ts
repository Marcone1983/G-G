const PRODUCTION_REQUIRED = ["DATABASE_URL", "XAI_API_KEY"] as const;

export function assertRuntimeConfig(env: Record<string, string | undefined> = process.env): {
  status: "NOT_PRODUCTION" | "ACCEPTED" | "REFUSED";
  missing: string[];
  reason: string | null;
} {
  if (env.NODE_ENV !== "production") {
    return { status: "NOT_PRODUCTION", missing: [], reason: null };
  }
  const missing = PRODUCTION_REQUIRED.filter((key) => !env[key]?.trim());
  const base = env.API_BASE_URL?.trim() ?? env.GG_PUBLIC_BASE_URL?.trim() ?? "";
  if (base.startsWith("http://")) {
    return { status: "REFUSED", missing, reason: "PRODUCTION_REQUIRES_HTTPS" };
  }
  if (missing.length > 0) return { status: "REFUSED", missing: [...missing], reason: "MISSING_PRODUCTION_ENV" };
  return { status: "ACCEPTED", missing: [], reason: null };
}
