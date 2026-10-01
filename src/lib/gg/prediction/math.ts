/** Documented numerical pieces. None of these invent a biological probability. */

export const PATTERN_WEIGHT_FORMULA =
  "independent_sources / (independent_sources + contradictions + 1). A pattern that is not promoted changes uncertainty notes only. It does not change the point estimate.";

export const MIDPARENT_ASSUMPTION =
  "ADDITIVE_MIDPARENT_UNCALIBRATED: the centre is the mean of the two parent medians of independent-group medians. Dominance, linkage and environment are not estimated.";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0 || q < 0 || q > 1) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

export function patternWeight(input: { independentSources: number; contradictions: number; promoted: boolean }): {
  weight: number | null;
  applied_to_estimate: false;
  formula: string;
} {
  if (!Number.isFinite(input.independentSources) || input.independentSources < 0) {
    return { weight: null, applied_to_estimate: false, formula: PATTERN_WEIGHT_FORMULA };
  }
  const contradictions = Number.isFinite(input.contradictions) && input.contradictions > 0 ? input.contradictions : 0;
  const weight = input.independentSources / (input.independentSources + contradictions + 1);
  return { weight, applied_to_estimate: false, formula: PATTERN_WEIGHT_FORMULA };
}

export function midParent(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return (left + right) / 2;
}

export function pearson(xs: number[], ys: number[]): { n: number; r: number | null; status: "COMPUTED" | "INSUFFICIENT" } {
  if (xs.length !== ys.length || xs.length < 5) return { n: xs.length, r: null, status: "INSUFFICIENT" };
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return { n, r: null, status: "INSUFFICIENT" };
  return { n, r: num / Math.sqrt(dx * dy), status: "COMPUTED" };
}

/** Seeded unit interval. Same seed, same stream. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMidParent(input: {
  left: number[];
  right: number[];
  seed: number;
  replicates: number;
}): { status: "COMPUTED" | "NOT_COMPUTABLE"; q05: number | null; q50: number | null; q95: number | null; seed: number; replicates: number } {
  if (input.left.length < 2 || input.right.length < 2 || input.replicates < 20) {
    return { status: "NOT_COMPUTABLE", q05: null, q50: null, q95: null, seed: input.seed, replicates: input.replicates };
  }
  const random = mulberry32(input.seed);
  const samples: number[] = [];
  for (let i = 0; i < input.replicates; i += 1) {
    const a = input.left[Math.floor(random() * input.left.length)]!;
    const b = input.right[Math.floor(random() * input.right.length)]!;
    samples.push((a + b) / 2);
  }
  return {
    status: "COMPUTED",
    q05: quantile(samples, 0.05),
    q50: quantile(samples, 0.5),
    q95: quantile(samples, 0.95),
    seed: input.seed,
    replicates: input.replicates,
  };
}

export function sensitivityByGroup(input: { left: number[]; right: number[] }): { parameter: string; absolute_delta: number }[] {
  const base = midParent(median(input.left), median(input.right));
  if (base === null) return [];
  const ranked: { parameter: string; absolute_delta: number }[] = [];
  const drop = (side: "parent_a" | "parent_b", values: number[]) => {
    if (values.length < 3) return;
    values.forEach((_, index) => {
      const kept = values.filter((__, i) => i !== index);
      const next = side === "parent_a"
        ? midParent(median(kept), median(input.right))
        : midParent(median(input.left), median(kept));
      if (next === null) return;
      ranked.push({ parameter: `${side}_group_${index}`, absolute_delta: Math.abs(next - base) });
    });
  };
  drop("parent_a", input.left);
  drop("parent_b", input.right);
  return ranked.sort((a, b) => b.absolute_delta - a.absolute_delta).slice(0, 8);
}

export function populationAtLeastOne(p: number | null, n: number | null, independent: boolean): {
  population_probability: number | null;
  status: "COMPUTED" | "NOT_COMPUTABLE";
  assumption: string | null;
} {
  if (p === null || n === null || n < 1 || p < 0 || p > 1) {
    return { population_probability: null, status: "NOT_COMPUTABLE", assumption: null };
  }
  if (!independent) {
    return { population_probability: null, status: "NOT_COMPUTABLE", assumption: "DEPENDENCE_NOT_MODELED" };
  }
  return { population_probability: 1 - (1 - p) ** n, status: "COMPUTED", assumption: "INDEPENDENT_BERNOULLI" };
}

export function bayesianBeta(input: {
  priorAlpha: number | null;
  priorBeta: number | null;
  successes: number;
  failures: number;
}): { posterior_mean: number | null; status: "COMPUTED" | "NOT_COMPUTABLE"; reason: string } {
  if (input.priorAlpha === null || input.priorBeta === null || input.priorAlpha <= 0 || input.priorBeta <= 0) {
    return { posterior_mean: null, status: "NOT_COMPUTABLE", reason: "NO_EMPIRICAL_PRIOR" };
  }
  if (input.successes < 0 || input.failures < 0) {
    return { posterior_mean: null, status: "NOT_COMPUTABLE", reason: "INVALID_COUNTS" };
  }
  const alpha = input.priorAlpha + input.successes;
  const beta = input.priorBeta + input.failures;
  return { posterior_mean: alpha / (alpha + beta), status: "COMPUTED", reason: "BETA_BINOMIAL_WITH_SUPPLIED_PRIOR" };
}

export function brier(probabilities: number[], outcomes: number[]): number | null {
  if (probabilities.length === 0 || probabilities.length !== outcomes.length) return null;
  let sum = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    const p = probabilities[i]!;
    const y = outcomes[i]!;
    if (p < 0 || p > 1 || (y !== 0 && y !== 1)) return null;
    sum += (p - y) ** 2;
  }
  return sum / probabilities.length;
}
