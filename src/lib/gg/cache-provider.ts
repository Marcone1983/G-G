export type CacheReadStatus = "HIT" | "MISS" | "STALE" | "INCOMPATIBLE" | "BYPASSED" | "NOT_CONFIGURED";

export function redisCacheStatus(env: NodeJS.ProcessEnv = process.env): { redis: "NOT_CONFIGURED" | "CONFIGURED_NOT_CONNECTED"; hit: false } {
  if (!env.REDIS_URL?.trim()) return { redis: "NOT_CONFIGURED", hit: false };
  return { redis: "CONFIGURED_NOT_CONNECTED", hit: false };
}

export function cacheCompatibility(stored: { model: string; snapshot: string; schema: string }, requested: { model: string; snapshot: string; schema: string }): "HIT" | "INCOMPATIBLE" {
  if (stored.model !== requested.model || stored.snapshot !== requested.snapshot || stored.schema !== requested.schema) return "INCOMPATIBLE";
  return "HIT";
}
