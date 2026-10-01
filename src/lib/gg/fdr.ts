/** Benjamini-Hochberg. A missing p-value stays missing. This is not a causal test. */
export function benjaminiHochberg(pValues: Array<number | null>, q = 0.05): {
  method: "BENJAMINI_HOCHBERG";
  q: number;
  adjusted: Array<number | null>;
  rejected: boolean[];
} | { status: "NOT_APPLICABLE"; reason: string } {
  if (!(q > 0 && q < 1)) return { status: "NOT_APPLICABLE", reason: "Q_OUT_OF_RANGE" };
  const indexed = pValues
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value != null && item.value >= 0 && item.value <= 1);
  if (indexed.length < 2) return { status: "NOT_APPLICABLE", reason: "FEWER_THAN_TWO_TESTS" };
  const ordered = [...indexed].sort((a, b) => a.value - b.value);
  const m = ordered.length;
  const adjusted = new Array<number | null>(pValues.length).fill(null);
  let running = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    const raw = (ordered[i]!.value * m) / (i + 1);
    running = Math.min(running, raw);
    adjusted[ordered[i]!.index] = Math.min(1, running);
  }
  return {
    method: "BENJAMINI_HOCHBERG",
    q,
    adjusted,
    rejected: adjusted.map((value) => value != null && value <= q),
  };
}
