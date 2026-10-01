export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

const COOLDOWN_MS = 30 * 60 * 1000;
let state: CircuitState = "CLOSED";
let openedAt = 0;
let halfOpenProbe = false;

export function circuitAllowsCall(now = Date.now()): { allow: boolean; state: CircuitState } {
  if (state === "CLOSED") return { allow: true, state };
  if (now - openedAt >= COOLDOWN_MS) {
    state = "HALF_OPEN";
    if (!halfOpenProbe) {
      halfOpenProbe = true;
      return { allow: true, state };
    }
    return { allow: false, state };
  }
  return { allow: false, state: "OPEN" };
}

export function circuitRecord(kind: "SUCCESS" | "BLOCKED" | "FAILED", now = Date.now()) {
  if (kind === "BLOCKED") {
    state = "OPEN";
    openedAt = now;
    halfOpenProbe = false;
    return state;
  }
  if (kind === "SUCCESS") {
    state = "CLOSED";
    openedAt = 0;
    halfOpenProbe = false;
  }
  return state;
}

export function resetCircuitForTests() {
  state = "CLOSED";
  openedAt = 0;
  halfOpenProbe = false;
}
