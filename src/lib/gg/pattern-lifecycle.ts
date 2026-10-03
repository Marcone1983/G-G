export type PatternLifecycle = "HYPOTHESIS" | "CANDIDATE" | "SUPPORTED" | "REPLICATED" | "VALIDATED" | "CONTRADICTED" | "RETIRED";

export function classifyPattern(input: { support: number; contradictions: number; genomic: boolean; reviewed: boolean }): { lifecycle: PatternLifecycle; genetic_effect: false | true; promoted: false } {
  if (input.contradictions > 0) return { lifecycle: "CONTRADICTED", genetic_effect: false, promoted: false };
  if (input.genomic && input.reviewed) return { lifecycle: "VALIDATED", genetic_effect: true, promoted: false };
  if (input.support >= 2) return { lifecycle: "CANDIDATE", genetic_effect: false, promoted: false };
  return { lifecycle: "HYPOTHESIS", genetic_effect: false, promoted: false };
}
