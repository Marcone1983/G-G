import type { KnowledgeRepository } from "./knowledge-repository.ts";
import { sqliteKnowledgeRepository } from "./sqlite-knowledge-repository.ts";
import { supabaseKnowledgeRepository } from "./supabase-knowledge-repository.ts";

export type RepositoryKind = "sqlite" | "supabase";

export function createKnowledgeRepository(kind: RepositoryKind): KnowledgeRepository {
  if (kind === "sqlite") return sqliteKnowledgeRepository;
  return supabaseKnowledgeRepository;
}

export function previewKnowledgeRepository(): KnowledgeRepository {
  return createKnowledgeRepository("supabase");
}
