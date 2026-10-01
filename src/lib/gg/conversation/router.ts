import { interpretMessage } from "../chat.ts";

export type Intent =
  | "CROSS_ANALYSIS"
  | "STRAIN_LOOKUP"
  | "AUDIT"
  | "PATTERN_SEARCH"
  | "HISTORICAL_CROSS_SEARCH"
  | "KNOWLEDGE_GAP"
  | "EXPLANATION";

export type ConversationContext = {
  conversation_id: string;
  user_id: string | null;
  scope: "PRIVATE";
  current_cross: { a: string; b: string; a_id: number | null; b_id: number | null } | null;
  current_traits: string[];
  last_analysis_id: string | null;
  knowledge_snapshot: string | null;
};

export function emptyContext(id = "local"): ConversationContext {
  return {
    conversation_id: id,
    user_id: null,
    scope: "PRIVATE",
    current_cross: null,
    current_traits: [],
    last_analysis_id: null,
    knowledge_snapshot: null,
  };
}

const AUDIT = /^(?:audit|controlla|verifica|perche|perché|da dove|ricontrolla|quanto sei sicuro|fai un controllo)/i;
const GAP = /non sappiamo|cosa manca|knowledge gap/i;
const PATTERN = /pattern/i;
const HISTORY = /incroci simili|storic/i;
const TRAIT = /pigmentazion|chemotip|terpen|cannabinoid/i;

export function routeMessage(message: string, context: ConversationContext): {
  intent: Intent;
  context: ConversationContext;
  text: string;
} {
  const text = message.replace(/\s+/g, " ").trim();
  if (AUDIT.test(text)) return { intent: "AUDIT", context, text };
  if (GAP.test(text)) return { intent: "KNOWLEDGE_GAP", context, text };
  const swap = text.match(/(?:uso|usa|metti)\s+(.+?)\s+invece di\s+(.+)/i);
  if (swap && context.current_cross) {
    const incoming = tidy(swap[1] ?? "");
    const outgoing = tidy(swap[2] ?? "");
    const cross = { ...context.current_cross };
    if (sameName(cross.b, outgoing)) {
      cross.b = incoming;
      cross.b_id = null;
    } else if (sameName(cross.a, outgoing)) {
      cross.a = incoming;
      cross.a_id = null;
    } else {
      cross.b = incoming;
      cross.b_id = null;
    }
    const next = { ...context, current_cross: cross };
    return { intent: "CROSS_ANALYSIS", context: next, text: `${cross.a} × ${cross.b}` };
  }
  if (TRAIT.test(text) && context.current_cross) {
    const trait = /pigmentazion/i.test(text) ? "pigmentation" : /terpen/i.test(text) ? "terpene" : "chemotype";
    return {
      intent: "CROSS_ANALYSIS",
      context: { ...context, current_traits: [...new Set([...context.current_traits, trait])] },
      text: `${context.current_cross.a} × ${context.current_cross.b}`,
    };
  }
  if (PATTERN.test(text)) return { intent: "PATTERN_SEARCH", context, text };
  if (HISTORY.test(text)) return { intent: "HISTORICAL_CROSS_SEARCH", context, text };
  const parsed = interpretMessage(text);
  if (parsed.kind === "cross") {
    return {
      intent: "CROSS_ANALYSIS",
      context: { ...context, current_cross: { a: parsed.a, b: parsed.b, a_id: null, b_id: null } },
      text,
    };
  }
  return { intent: "STRAIN_LOOKUP", context, text: parsed.query };
}

function tidy(value: string): string {
  return value.replace(/[?.!]+$/g, "").trim();
}

function sameName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
