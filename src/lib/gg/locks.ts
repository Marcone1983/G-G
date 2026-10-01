type Held = { owner: string; until: number };

const held = new Map<string, Held>();

export function lockStatus() {
  const configured = Boolean(process.env.REDIS_URL?.trim());
  return {
    redis: configured ? ("CONFIGURED_UNVERIFIED" as const) : ("NOT_CONFIGURED" as const),
    backend: configured ? ("redis_optional" as const) : ("process_memory" as const),
    scientific_source: "sqlite" as const,
  };
}

export function acquireLock(key: string, owner: string, ttlMs: number, now = Date.now()): { acquired: boolean; backend: string } {
  const current = held.get(key);
  if (current && current.until > now) return { acquired: false, backend: lockStatus().backend };
  held.set(key, { owner, until: now + ttlMs });
  return { acquired: true, backend: lockStatus().backend };
}

export function renewLock(key: string, owner: string, ttlMs: number, now = Date.now()): boolean {
  const current = held.get(key);
  if (!current || current.owner !== owner || current.until <= now) return false;
  current.until = now + ttlMs;
  return true;
}

export function releaseLock(key: string, owner = "local"): boolean {
  const current = held.get(key);
  if (!current || current.owner !== owner) return false;
  held.delete(key);
  return true;
}

export function tryLock(key: string, ttlMs: number, now = Date.now()) {
  return acquireLock(key, "local", ttlMs, now);
}
