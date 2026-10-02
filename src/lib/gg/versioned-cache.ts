export type CacheStamp = { snapshot: string; model: string };

export type Stored<T> = CacheStamp & { value: T };

export function versionedLookup<T>(
  store: Map<string, Stored<T>>,
  query: string,
  current: CacheStamp,
): { status: "HIT" | "MISS"; reason: "ABSENT" | "VERSION_MISMATCH" | "CURRENT"; invalidated: boolean; value: T | null } {
  const hit = store.get(query);
  if (!hit) return { status: "MISS", reason: "ABSENT", invalidated: false, value: null };
  if (hit.snapshot !== current.snapshot || hit.model !== current.model) {
    return { status: "MISS", reason: "VERSION_MISMATCH", invalidated: true, value: null };
  }
  return { status: "HIT", reason: "CURRENT", invalidated: false, value: hit.value };
}

export function versionedStore<T>(store: Map<string, Stored<T>>, query: string, current: CacheStamp, value: T) {
  store.set(query, { ...current, value });
}
