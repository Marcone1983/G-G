import { cosine, embed } from "./engine.ts";

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
  return hashingBaseline;
}

export function semanticModelStatus() {
  return {
    provider: "NONE" as const,
    active: hashingBaseline.model_id,
    status: hashingBaseline.status,
    dimension: hashingBaseline.dimension,
    distance: hashingBaseline.distance,
    semantic_model: "NOT_CONFIGURED" as const,
    note: "Il trucco di hashing non è un modello semantico. La similarità non è una probabilità.",
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
    return { ...classifyModelList([]), http: catalog.status, status: "PROVIDER_ERROR" as const, error: "EMBEDDING_CATALOG_HTTP", embedding_catalog: "ERROR" as const };
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

export function baselineDistance(a: string, b: string): number | null {
  const left = hashingBaseline.embed(a);
  const right = hashingBaseline.embed(b);
  if (!left || !right) return null;
  return cosine(left, right);
}
