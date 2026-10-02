import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type LanguageCredential = {
  token: string | null;
  source: "XAI_API_KEY" | "GROK_SESSION" | "ABSENT";
};

export function serverLanguageCredential(env: NodeJS.ProcessEnv = process.env): LanguageCredential {
  const fromEnv = env.XAI_API_KEY?.trim();
  if (fromEnv) return { token: fromEnv, source: "XAI_API_KEY" };
  const file = env.GROK_AUTH_FILE?.trim() || path.join(homedir(), ".grok", "auth.json");
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, { key?: string; expires_at?: string }>;
    for (const entry of Object.values(data)) {
      const key = entry?.key?.trim();
      if (!key) continue;
      const expiry = entry.expires_at ? Date.parse(entry.expires_at) : Number.NaN;
      if (Number.isFinite(expiry) && expiry < Date.now()) continue;
      return { token: key, source: "GROK_SESSION" };
    }
  } catch {
    /* no session file on this host */
  }
  return { token: null, source: "ABSENT" };
}
