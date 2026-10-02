import { probeEmbeddingModels, probeLanguageModels } from "./embedding.ts";
import { configuredLanguageModel, responseOutputText } from "./scientific-report.ts";
import { serverLanguageCredential } from "./server-credential.ts";

export type XaiHealth = {
  provider: "xAI";
  configured: boolean;
  credential: "ABSENT" | "SERVER";
  authenticated: boolean;
  model: string | null;
  model_in_catalog: boolean | null;
  language_catalog: string;
  language_http: number | null;
  embedding_http: number | null;
  embedding_catalog: string;
  embedding_models: string[];
  request: "SUCCESS" | "FAILED" | "NOT_RUN";
  status: "HEALTHY" | "FAILED" | "NOT_CONFIGURED";
  latency_ms: number | null;
  http: number | null;
};

let cache: { at: number; value: XaiHealth } | null = null;

export async function xaiHealth(fetchImpl: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<XaiHealth> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const credential = serverLanguageCredential(env);
  const token = credential.token ?? undefined;
  const model = configuredLanguageModel(env);
  if (!token) {
    const value: XaiHealth = {
      provider: "xAI",
      configured: false,
      credential: "ABSENT",
      authenticated: false,
      model,
      model_in_catalog: null,
      language_catalog: "NOT_QUERIED",
      language_http: null,
      embedding_catalog: "NOT_QUERIED",
      embedding_http: null,
      embedding_models: [],
      request: "NOT_RUN",
      status: "NOT_CONFIGURED",
      latency_ms: null,
      http: null,
    };
    cache = { at: Date.now(), value };
    return value;
  }
  const [language, embeddings] = await Promise.all([
    probeLanguageModels(fetchImpl, token),
    probeEmbeddingModels(fetchImpl, token),
  ]);
  const authenticated = language.http === 200;
  const model_in_catalog = authenticated ? language.language_models.includes(model) : null;
  const started = Date.now();
  let request: XaiHealth["request"] = "FAILED";
  let http: number | null = null;
  try {
    const response = await fetchImpl("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 16,
        instructions: "Reply with the single word PING.",
        input: "PING",
      }),
    });
    http = response.status;
    if (response.ok) {
      const payload = await response.json();
      const text = responseOutputText(payload);
      request = text.toUpperCase().includes("PING") ? "SUCCESS" : "FAILED";
    }
  } catch {
    request = "FAILED";
    http = null;
  }
  const latency_ms = Date.now() - started;
  const value: XaiHealth = {
    provider: "xAI",
    configured: true,
    credential: "SERVER",
    authenticated: request === "SUCCESS",
    model,
    model_in_catalog,
    language_catalog: language.status,
    language_http: language.http,
    embedding_catalog: embeddings.embedding_catalog,
    embedding_http: embeddings.http,
    embedding_models: embeddings.embedding_models,
    request,
    status: request === "SUCCESS" ? "HEALTHY" : "FAILED",
    latency_ms,
    http,
  };
  cache = { at: Date.now(), value };
  return value;
}
