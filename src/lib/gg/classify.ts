import { normalizeName } from "./engine.ts";

export const PARSER_VERSION = "gg-query-parser-v2";

export type QueryType =
  | "STRAIN_NAME"
  | "ALIAS"
  | "CROSS"
  | "MULTI_PARENT_CROSS"
  | "BREEDER_QUERY"
  | "PEDIGREE_QUERY"
  | "CHEMISTRY_QUERY"
  | "PHENOTYPE_QUERY"
  | "GENETICS_QUERY"
  | "PATTERN_QUERY"
  | "COMBINATION_QUERY"
  | "GENERAL_SCIENTIFIC_QUERY"
  | "UNKNOWN_QUERY";

export type ClassifiedQuery = {
  original_query: string;
  normalized_query: string;
  query_type: QueryType;
  parser_version: typeof PARSER_VERSION;
  parser_confidence: null;
  score_kind: "NOT_A_PROBABILITY";
  parents: string[];
  marker: string | null;
  slash_rejected: boolean;
  raw_name: string;
  normalization_operations: string[];
};

function tidy(value: string): string {
  return value
    .replace(/[.?!]+$/g, "")
    .replace(/^(?:incrocio(?:\s+tra)?|cross|analizza|fammi|vorrei)\s+/i, "")
    .trim();
}

function namePart(value: string): boolean {
  return value.length >= 2 && /[a-z]/i.test(value);
}

const PRODUCT_QUALIFIER = /^(?:feminized|fem|auto|automatic|autos|regular|reg|fast|fastflowering|seeds?|strain)$/i;

export function splitCombination(query: string): [string, string] | null {
  const text = query.replace(/\s+/g, " ").trim();
  if (/\s+[x×✕]\s+/i.test(text) || /\bcrossed with\b/i.test(text) || /\bincrociat/i.test(text)) return null;
  const parts = text.split(/\s+\+\s+/).map(tidy).filter(Boolean);
  if (parts.length !== 2 || !parts.every(namePart)) return null;
  if (PRODUCT_QUALIFIER.test(parts[0]!) || PRODUCT_QUALIFIER.test(parts[1]!)) return null;
  return [parts[0]!, parts[1]!];
}

export function normalizationAudit(raw: string): { raw_name: string; normalized_name: string; normalization_operations: string[] } {
  const normalized = normalizeName(raw);
  const operations: string[] = [];
  if (raw.normalize("NFKD") !== raw) operations.push("nfkd");
  if (/[A-Z]/.test(raw)) operations.push("casefold");
  if (/\+/.test(raw)) operations.push("plus_kept_in_raw_name");
  if (/\+/.test(raw) && !normalized.includes("+")) operations.push("plus_removed_from_lookup_key");
  if (/[×✕/]/.test(raw) || /[^a-z0-9+\s]/i.test(raw)) operations.push("punctuation_folded_for_lookup");
  return { raw_name: raw, normalized_name: normalized, normalization_operations: operations };
}

export function splitCrossParts(query: string): { parents: string[]; marker: string } | null {
  const text = query.replace(/\s+/g, " ").trim();
  const voiced = text.match(/^(?:incrocia|incrocio(?:\s+tra)?|cross)\s+(.+?)\s+(?:con|e|x|per)\s+(.+)$/i);
  if (voiced?.[1] && voiced?.[2]) {
    const parents = [tidy(voiced[1]), tidy(voiced[2])];
    if (parents.every(namePart)) return { parents, marker: "cross" };
  }
  const crossed = text.match(/^(.*?)\s+(?:crossed with|crossed to|incrociat[oa]\s+con)\s+(.*)$/i);
  if (crossed?.[1] && crossed?.[2]) {
    const parents = [tidy(crossed[1]), tidy(crossed[2])];
    if (parents.every(namePart)) return { parents, marker: "crossed with" };
  }
  const parts = text.split(/\s+[x×✕]\s+/i).map(tidy).filter(namePart);
  if (parts.length >= 2 && parts.length === text.split(/\s+[x×✕]\s+/i).length) return { parents: parts, marker: "x" };
  const conjunction = text.split(/\s+and\s+/i).map(tidy).filter(namePart);
  if (conjunction.length === 2 && conjunction.length === text.split(/\s+and\s+/i).length) return { parents: conjunction, marker: "and" };
  return null;
}

export function classifyQuery(query: string): ClassifiedQuery {
  const original = query.replace(/\s+/g, " ").trim();
  const audit = normalizationAudit(original);
  const base = {
    original_query: original,
    normalized_query: audit.normalized_name,
    raw_name: audit.raw_name,
    normalization_operations: audit.normalization_operations,
    parser_version: PARSER_VERSION,
    parser_confidence: null,
    score_kind: "NOT_A_PROBABILITY" as const,
    slash_rejected: /\/|\u2044/.test(original) && !/https?:\/\//i.test(original),
  };
  const split = splitCrossParts(original);
  if (split && split.parents.length >= 3) {
    return { ...base, query_type: "MULTI_PARENT_CROSS", parents: split.parents, marker: split.marker };
  }
  if (split && split.parents.length === 2) {
    return { ...base, query_type: "CROSS", parents: split.parents, marker: split.marker };
  }
  const combination = splitCombination(original);
  if (combination) {
    return { ...base, query_type: "COMBINATION_QUERY", parents: [...combination], marker: "+" };
  }
  if (base.slash_rejected) return { ...base, query_type: "UNKNOWN_QUERY", parents: [], marker: null };
  if (/^(?:breeder|seedbank|banca semi)\b/i.test(original)) return { ...base, query_type: "BREEDER_QUERY", parents: [], marker: null };
  if (/\b(?:genom|snp|allele|qtl|genotip)/i.test(original)) return { ...base, query_type: "GENETICS_QUERY", parents: [], marker: null };
  if (/\b(?:thc|cbd|thca|cbda|terpen|cannabinoid|flavonoid|antocian)/i.test(original)) {
    return { ...base, query_type: "CHEMISTRY_QUERY", parents: [], marker: null };
  }
  if (/\b(?:fenotipo|phenotype|fioritura|flowering|morfolog)/i.test(original)) {
    return { ...base, query_type: "PHENOTYPE_QUERY", parents: [], marker: null };
  }
  if (/\b(?:pedigree|parentage|lineage|discenden)/i.test(original)) return { ...base, query_type: "PEDIGREE_QUERY", parents: [], marker: null };
  if (/\bpattern\b/i.test(original)) return { ...base, query_type: "PATTERN_QUERY", parents: [], marker: null };
  if (base.normalized_query.length >= 2) return { ...base, query_type: "GENERAL_SCIENTIFIC_QUERY", parents: [], marker: null };
  return { ...base, query_type: "UNKNOWN_QUERY", parents: [], marker: null };
}

export function refineQueryType(queryType: QueryType, hits: { match_kind: string }[]): QueryType {
  if (queryType !== "GENERAL_SCIENTIFIC_QUERY") return queryType;
  if (hits.some((hit) => hit.match_kind === "EXACT")) return "STRAIN_NAME";
  if (hits.some((hit) => hit.match_kind === "ALIAS")) return "ALIAS";
  return "UNKNOWN_QUERY";
}

export function providerBlock(message: string): boolean {
  return /spending-limit|personal-team-blocked|\b403\b|\b429\b|quota/i.test(message);
}
