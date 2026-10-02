import type { GapCategory } from "./knowledge-gaps.ts";
import { findKnowledgeGaps, type GapInput } from "./knowledge-gaps.ts";

export const COUNTABLE_TABLES = [
  "source_records",
  "samples",
  "measurements",
  "canonical_entities",
  "aliases",
  "pedigree_edges",
  "claims",
  "pattern_candidates",
  "knowledge_snapshots",
  "model_versions",
  "knowledge_cache",
  "scientific_records",
  "structural_variants",
  "genome_assemblies",
  "protein_records",
  "research_papers",
  "expression_studies",
  "chemical_observations",
  "scientific_features",
  "prediction_records",
  "observation_units",
  "health_evidence",
  "acquisition_records",
  "acquisition_sources",
  "catalog_gaps",
  "calibration_runs",
  "global_research_memory",
  "jobs",
  "worker_jobs",
  "content_reports",
] as const;

export type CountStatus = "QUERIED" | "TABLE_ABSENT" | "NOT_MEASURED" | "QUERY_FAILED";

export type CountRow = {
  category: string;
  count: number | null;
  source: string;
  last_updated: string;
  status: CountStatus;
};

const IDENTIFIER = /^[a-z_]{1,63}$/;

export function assertAllowlisted(table: string): asserts table is (typeof COUNTABLE_TABLES)[number] {
  if (!IDENTIFIER.test(table) || !COUNTABLE_TABLES.includes(table as (typeof COUNTABLE_TABLES)[number])) {
    throw new Error("TABLE_NOT_ALLOWLISTED");
  }
}

export function countRow(category: string, count: number | null, source: string, status: CountStatus, lastUpdated = "NOT_STORED"): CountRow {
  if (status !== "QUERIED" && count !== null) throw new Error("COUNT_WITHOUT_QUERY");
  return { category, count, source, last_updated: lastUpdated, status };
}

export function sumClasses(rows: { klass: string; n: number }[], pattern: RegExp): number {
  return rows.reduce((sum, row) => (pattern.test(row.klass) ? sum + row.n : sum), 0);
}

const LIFECYCLES = ["CANDIDATE", "SUPPORTED", "REPLICATED", "VALIDATED", "CONTRADICTED", "RETIRED"] as const;

export function lifecycleRows(tablePresent: boolean, grouped: { lifecycle: string; n: number }[]): CountRow[] {
  if (!tablePresent) {
    return LIFECYCLES.map((lifecycle) => countRow(`pattern_${lifecycle.toLowerCase()}`, null, "public.pattern_candidates", "TABLE_ABSENT"));
  }
  const by = new Map(grouped.map((row) => [row.lifecycle.toUpperCase(), row.n]));
  return LIFECYCLES.map((lifecycle) => countRow(`pattern_${lifecycle.toLowerCase()}`, by.get(lifecycle) ?? 0, "public.pattern_candidates.lifecycle", "QUERIED"));
}

export type DomainEvidence = { domain: string; records: number | null; status: "ABSENT" | "WEAK" | "PARTIALLY_COVERED" | "NOT_MEASURED"; note: string };

export function domainCoverage(domain: string, records: number | null, measured: boolean): DomainEvidence {
  if (!measured || records === null) {
    return { domain, records: null, status: "NOT_MEASURED", note: "No query ran for this domain." };
  }
  if (records === 0) return { domain, records: 0, status: "ABSENT", note: "The queried source returned no matching records. This is not a completeness score." };
  if (records < 5) return { domain, records, status: "WEAK", note: "Records exist. Independence and replication were not scored. WELL_COVERED is not assigned." };
  return { domain, records, status: "PARTIALLY_COVERED", note: "More than four records matched. WELL_COVERED is not assigned without independent replication." };
}

const GAP_SOURCE: Partial<Record<GapCategory, string>> = {
  STRAINS: "canonical_entities",
  ALIASES: "aliases",
  PEDIGREES: "pedigree_edges",
  PARENTS: "pedigree_edges",
  CANNABINOIDS: "cannabinoid_measurements",
  TERPENES: "terpene_measurements",
  FLAVONOIDS: "flavonoid_measurements",
  ANTHOCYANINS: "anthocyanin_measurements",
  CHEMOTYPE: "chemotype_measurements",
  PHENOTYPES: "phenotype_measurements",
  GENES: "protein_records",
  QTL: "qtl_records",
  GENE_EXPRESSION: "expression_studies",
  SCIENTIFIC_PAPERS: "research_papers",
  CLINICAL_EVIDENCE: "health_evidence",
  PREDICTION_OUTCOMES: "prediction_records",
  CROSSES: "pedigree_edges",
};

export function gapsFromCounts(rows: CountRow[]) {
  const by = new Map(rows.map((row) => [row.category, row]));
  const input: Partial<Record<GapCategory, GapInput>> = {};
  for (const [gap, category] of Object.entries(GAP_SOURCE) as [GapCategory, string][]) {
    const row = by.get(category);
    if (!row) input[gap] = { count: null, status: "NOT_MEASURED", source: category };
    else if (row.status === "TABLE_ABSENT") input[gap] = { count: null, status: "TABLE_ABSENT", source: row.source };
    else if (row.status === "QUERIED") input[gap] = { count: row.count, status: "QUERIED", source: row.source };
    else input[gap] = { count: null, status: "NOT_MEASURED", source: row.source };
  }
  return findKnowledgeGaps(input);
}

export function genomicsSummary(rows: CountRow[]) {
  const names = ["genome_assemblies", "structural_variants", "protein_records", "expression_studies"];
  const tables = names.map((name) => rows.find((row) => row.category === name) ?? countRow(name, null, `public.${name}`, "NOT_MEASURED"));
  if (tables.every((row) => row.status === "NOT_MEASURED")) {
    return { data_status: "NOT_MEASURED" as const, records: null, tables, fallback: "NONE" as const, source: "supabase_postgresql" as const };
  }
  if (tables.every((row) => row.status === "TABLE_ABSENT")) {
    return { data_status: "TABLE_ABSENT" as const, records: null, tables, fallback: "NONE" as const, source: "supabase_postgresql" as const };
  }
  const queried = tables.filter((row) => row.status === "QUERIED");
  if (queried.length === 0) {
    return {
      data_status: tables.every((row) => row.status === "TABLE_ABSENT") ? ("TABLE_ABSENT" as const) : ("NOT_MEASURED" as const),
      records: null,
      tables,
      fallback: "NONE" as const,
      source: "supabase_postgresql" as const,
    };
  }
  const records = queried.reduce((sum, row) => sum + (row.count ?? 0), 0);
  return {
    data_status: queried.length === tables.length ? ("QUERIED" as const) : ("PARTIAL_TABLES" as const),
    records,
    tables,
    fallback: "NONE" as const,
    source: "supabase_postgresql" as const,
  };
}
