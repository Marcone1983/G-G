export function privateAccess(actor: string | null, owner: string | null): "ALLOW" | "DENY" {
  if (!actor || !owner || actor !== owner) return "DENY";
  return "ALLOW";
}

export function providerMayReadPrivate(): "DENY" {
  return "DENY";
}
