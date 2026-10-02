export type PatternObservation = {
  value: number;
  sourceId: string;
  labId: string;
  lineageId: string;
  method: string;
  environment: string;
};

export type IndependenceReport = {
  rows: number;
  independent_groups: number;
  duplicate_rows_collapsed: number;
  methods: string[];
  environments: string[];
  contradictions: number;
  replicated: boolean;
  lifecycle: "CANDIDATE" | "CONTRADICTED" | "REPLICATED_UNVALIDATED";
  promoted: false;
  reason: string;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Duplicate rows that share source, lab and lineage are one observation. Different methods are not replication. */
export function assessPatternIndependence(rows: PatternObservation[]): IndependenceReport {
  const groups = new Map<string, { method: string; environment: string; values: number[] }>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    const key = `${row.sourceId}\t${row.labId}\t${row.lineageId}`;
    const existing = groups.get(key);
    if (existing) existing.values.push(row.value);
    else groups.set(key, { method: row.method, environment: row.environment, values: [row.value] });
  }
  const finite = rows.filter((row) => Number.isFinite(row.value)).length;
  const methods = [...new Set([...groups.values()].map((group) => group.method))];
  const environments = [...new Set([...groups.values()].map((group) => group.environment))];
  const centres = [...groups.values()].map((group) => median(group.values));
  let contradictions = 0;
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = i + 1; j < centres.length; j += 1) {
      const left = groups.get([...groups.keys()][i]!)!;
      const right = groups.get([...groups.keys()][j]!)!;
      const leftMax = Math.max(...left.values);
      const leftMin = Math.min(...left.values);
      const rightMax = Math.max(...right.values);
      const rightMin = Math.min(...right.values);
      if (leftMax < rightMin || rightMax < leftMin) contradictions += 1;
    }
  }
  const sameMethod = methods.length <= 1;
  const sameEnvironment = environments.length <= 1;
  const replicated = groups.size >= 2 && sameMethod && sameEnvironment && contradictions === 0;
  const lifecycle = contradictions > 0 ? "CONTRADICTED" : replicated ? "REPLICATED_UNVALIDATED" : "CANDIDATE";
  return {
    rows: finite,
    independent_groups: groups.size,
    duplicate_rows_collapsed: Math.max(0, finite - groups.size),
    methods,
    environments,
    contradictions,
    replicated,
    lifecycle,
    promoted: false,
    reason: replicated
      ? "Independent groups agree. Promotion still requires human review. This function does not write VALIDATED."
      : contradictions > 0
        ? "Disjoint ranges across independent groups are contradictions, not replication."
        : "Same-source, same-lab or same-lineage copies do not increase independent support. Mixed methods or environments are not replication.",
  };
}
