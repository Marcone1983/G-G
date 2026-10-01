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

export function baselineDistance(a: string, b: string): number | null {
  const left = hashingBaseline.embed(a);
  const right = hashingBaseline.embed(b);
  if (!left || !right) return null;
  return cosine(left, right);
}
