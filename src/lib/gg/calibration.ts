export type ClassPair = { predicted: number; observed: 0 | 1 };

export function brierScore(pairs: ClassPair[]): number | null {
  if (pairs.length === 0) return null;
  return pairs.reduce((sum, pair) => sum + (pair.predicted - pair.observed) ** 2, 0) / pairs.length;
}

export function expectedCalibrationError(pairs: ClassPair[], bins = 10): { status: "NOT_CALIBRATED" | "COMPUTED"; ece: number | null; bins: { count: number; mean_predicted: number | null; fraction_positive: number | null }[] } {
  if (pairs.length < bins) return { status: "NOT_CALIBRATED", ece: null, bins: [] };
  const width = 1 / bins;
  const groups = Array.from({ length: bins }, () => [] as ClassPair[]);
  for (const pair of pairs) {
    const index = Math.min(bins - 1, Math.floor(pair.predicted / width));
    groups[index]!.push(pair);
  }
  let ece = 0;
  const out = groups.map((group) => {
    if (group.length === 0) return { count: 0, mean_predicted: null, fraction_positive: null };
    const mean = group.reduce((sum, pair) => sum + pair.predicted, 0) / group.length;
    const fraction = group.reduce((sum, pair) => sum + pair.observed, 0) / group.length;
    ece += (group.length / pairs.length) * Math.abs(mean - fraction);
    return { count: group.length, mean_predicted: mean, fraction_positive: fraction };
  });
  return { status: "COMPUTED", ece, bins: out };
}

export function continuousBrierRefused(): { status: "NOT_APPLICABLE"; reason: "CONTINUOUS_TARGET" } {
  return { status: "NOT_APPLICABLE", reason: "CONTINUOUS_TARGET" };
}

export function regressionDiagnostics(rows: { predicted: number; observed: number }[]): {
  status: "NOT_CALIBRATED";
  mae: null;
  rmse: null;
  brier: "NOT_APPLICABLE";
} | {
  status: "COMPUTED";
  mae: number;
  rmse: number;
  brier: "NOT_APPLICABLE";
} {
  if (rows.length < 2) return { status: "NOT_CALIBRATED", mae: null, rmse: null, brier: "NOT_APPLICABLE" };
  const errors = rows.map((row) => row.predicted - row.observed);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
  return { status: "COMPUTED", mae, rmse, brier: "NOT_APPLICABLE" };
}

export function intervalCoverage(rows: { observed: number; lower: number; upper: number }[]): { status: "NOT_CALIBRATED" | "COMPUTED"; coverage: number | null } {
  if (rows.length < 2) return { status: "NOT_CALIBRATED", coverage: null };
  const covered = rows.filter((row) => row.observed >= row.lower && row.observed <= row.upper).length;
  return { status: "COMPUTED", coverage: covered / rows.length };
}
