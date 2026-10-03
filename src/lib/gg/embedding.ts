import { cosine, embed } from "./engine.ts";
import { sanitizeProviderError } from "./scientific-report.ts";

export type EmbeddingStatus = "BASELINE_NOT_SEMANTIC_MODEL" | "NOT_CONFIGURED";

export type EmbeddingProvider = {
  model_id: string;
  version: string;
  dimension: number;
  distance: "cosine";
  status: EmbeddingStatus;
  embed(text: string): number[] | null;
};

export const hashingBaseline: EmbeddingProvider = {
  model_id: "gg-hashing-trick-v1",
  version: "1",
  dimension: 64,
  distance: "cosine",
  status: "BASELINE_NOT_SEMANTIC_MODEL",
  embed(text: string) {
    return embed(text);
  },
};

export function activeEmbedding(): EmbeddingProvider {
  return {
    model_id: "none",
    version: "0",
    dimension: 0,
    distance: "cosine",
    status: "NOT_CONFIGURED",
    embed() {
      return null;
    },
  };
}

export function semanticModelStatus() {
  return {
    provider: "NONE" as const,
    active: hashingBaseline.model_id,
    status: hashingBaseline.status,
    dimension: hashingBaseline.dimension,
    distance: hashingBaseline.distance,
    semantic_model: "NOT_CONFIGURED" as const,
    used_for_search: false as const,
    legacy_is_embedding: false as const,
    note: "gg-hashing-trick-v1 è LEGACY_FINGERPRINT e BASELINE_NOT_SEMANTIC_MODEL. Non è un embedding e non è un fallback di ricerca.",
  };
}

export function classifyModelList(ids: string[]) {
  const embedding = ids.filter((id) => /embed/i.test(id));
  return {
    provider: "xai" as const,
    models_seen: ids.length,
    embedding_models: embedding,
    semantic_model: embedding.length > 0 ? ("CONFIGURED" as const) : ("NOT_CONFIGURED" as const),
    legacy_fingerprint: hashingBaseline.model_id,
    legacy_is_embedding: false as const,
    required_provider_contract: "POST /v1/embeddings { model, input } -> data[].embedding number[]",
  };
}

export async function probeEmbeddingModels(fetchImpl: typeof fetch, apiKey: string | undefined) {
  if (!apiKey?.trim()) {
    return { ...classifyModelList([]), http: null as number | null, status: "NOT_CONFIGURED" as const, error: "XAI_API_KEY_ABSENT", embedding_catalog: "NOT_QUERIED" as const };
  }
  const headers = { authorization: `Bearer ${apiKey.trim()}` };
  const catalog = await fetchImpl("https://api.x.ai/v1/embedding-models", { headers });
  if (!catalog.ok) {
    const provider_error = sanitizeProviderError(catalog.status, await catalog.text());
    return { ...classifyModelList([]), http: catalog.status, status: "PROVIDER_ERROR" as const, error: provider_error, embedding_catalog: "ERROR" as const };
  }
  const payload = (await catalog.json()) as { models?: { id?: string }[]; data?: { id?: string }[] };
  const ids = (payload.models ?? payload.data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
  return {
    ...classifyModelList(ids),
    http: catalog.status,
    status: "QUERIED" as const,
    error: null as string | null,
    embedding_catalog: ids.length ? ("MODELS_PRESENT" as const) : ("QUERIED_EMPTY" as const),
  };
}

export async function probeLanguageModels(fetchImpl: typeof fetch, apiKey: string | undefined) {
  if (!apiKey?.trim()) {
    return {
      http: null as number | null,
      status: "NOT_CONFIGURED" as const,
      error: "LANGUAGE_CREDENTIAL_ABSENT" as string | null,
      language_models: [] as string[],
      selected_model: null as string | null,
    };
  }
  const catalog = await fetchImpl("https://api.x.ai/v1/language-models", { headers: { authorization: `Bearer ${apiKey.trim()}` } });
  if (!catalog.ok) {
    const provider_error = sanitizeProviderError(catalog.status, await catalog.text());
    return { http: catalog.status, status: "PROVIDER_ERROR" as const, error: provider_error, language_models: [] as string[], selected_model: null as string | null };
  }
  const payload = (await catalog.json()) as { models?: { id?: string }[]; data?: { id?: string }[] };
  const language_models = (payload.models ?? payload.data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
  const selected_model = language_models.includes("grok-4.5")
    ? "grok-4.5"
    : language_models.find((id) => /^grok-/i.test(id) && !/image|embed/i.test(id)) ?? null;
  return { http: catalog.status, status: "QUERIED" as const, error: null, language_models, selected_model };
}

export function baselineDistance(a: string, b: string): number | null {
  const left = hashingBaseline.embed(a);
  const right = hashingBaseline.embed(b);
  if (!left || !right) return null;
  return cosine(left, right);
}
