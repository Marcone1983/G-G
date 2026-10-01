export const ROLES = ["USER", "RESEARCHER", "REVIEWER", "SCIENTIFIC_ADMIN", "SYSTEM_WORKER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

const WRITE_CORPUS = new Set<Role>(["SCIENTIFIC_ADMIN", "ADMIN"]);

export function canReadPrivate(actor: { id: string; role: Role }, ownerId: string): "ALLOW" | "DENY" {
  if (actor.role === "ADMIN") return "ALLOW";
  if (actor.id === ownerId) return "ALLOW";
  return "DENY";
}

export function canWriteCorpus(role: Role): "ALLOW" | "DENY" {
  return WRITE_CORPUS.has(role) ? "ALLOW" : "DENY";
}

export function canWriteGlobalMemory(role: Role): "ALLOW" | "DENY" {
  if (role === "USER") return "DENY";
  return "ALLOW";
}

export function providerMayWriteCorpus(): "DENY" {
  return "DENY";
}
