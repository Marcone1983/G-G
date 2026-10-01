import { benjaminiHochberg } from "./fdr.ts";

export function postgresPreflight(env: Record<string, string | undefined> = process.env) {
  const url = env.DATABASE_URL?.trim() ?? "";
  if (!url) return { status: "NOT_CONFIGURED" as const, connect: false as const, reason: "DATABASE_URL" };
  if (!/^postgres(ql)?:\/\//i.test(url)) return { status: "REFUSED" as const, connect: false as const, reason: "NOT_A_POSTGRES_URL" };
  return { status: "CONFIGURED_NOT_MIGRATED" as const, connect: false as const, reason: "NO_LIVE_MIGRATION" };
}

const MODEL_EDGES: Record<string, string[]> = {
  DRAFT: ["TRAINING"],
  TRAINING: ["VALIDATION"],
  VALIDATION: ["CALIBRATION_REQUIRED"],
  CALIBRATION_REQUIRED: ["CALIBRATED", "RETIRED"],
  CALIBRATED: ["PRODUCTION", "RETIRED"],
  PRODUCTION: ["RETIRED"],
  RETIRED: [],
};

export function transitionModel(from: string, to: string) {
  if (!MODEL_EDGES[from]?.includes(to)) return { ok: false as const, status: "REJECTED" as const };
  return { ok: true as const, status: to };
}

export function backoffMs(attempt: number, jitterMs: number) {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
  return base + Math.max(0, jitterMs);
}

export function featureLineage(feature: { name: string; sources: string[]; usesTarget: boolean; usesFuture: boolean; usesProgenyOutcome: boolean }) {
  const violations: string[] = [];
  if (feature.usesTarget) violations.push("TARGET_LEAKAGE");
  if (feature.usesFuture) violations.push("TEMPORAL_LEAKAGE");
  if (feature.usesProgenyOutcome) violations.push("POST_OUTCOME_LEAKAGE");
  return { feature: feature.name, sources: feature.sources, violations, promotable: violations.length === 0 };
}

export function patternPromotion(input: { humanReview: boolean; pValues: Array<number | null> }) {
  if (!input.humanReview) return { status: "NOT_PROMOTED" as const, reason: "HUMAN_REVIEW_REQUIRED" };
  const fdr = benjaminiHochberg(input.pValues);
  if ("status" in fdr) return { status: "NOT_PROMOTED" as const, reason: fdr.reason };
  return { status: "REVIEWABLE" as const, reason: null, adjusted: fdr.adjusted };
}

export function genomicProxyRefused(source: "name" | "photo" | "pedigree" | "f1") {
  return { data_status: "NOT_AVAILABLE" as const, reason: "PROXY_IS_NOT_GENOTYPE" as const, source };
}

export function externalUrlAllowed(raw: string): { allowed: boolean; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: "MALFORMED" };
  }
  if (url.protocol !== "https:") return { allowed: false, reason: "NOT_HTTPS" };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "169.254.169.254" || host === "0.0.0.0" || host === "::1") {
    return { allowed: false, reason: "SSRF" };
  }
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return { allowed: false, reason: "SSRF" };
  return { allowed: true, reason: "PUBLIC_HTTPS" };
}

export function redactSecrets(text: string) {
  return text.replace(/\b(?:sk|xai)-[A-Za-z0-9_\-]{8,}\b/g, "[redacted]");
}
