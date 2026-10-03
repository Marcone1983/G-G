export type CalibrationInput = {
  fixture: boolean;
  approved: boolean;
  predicted: number | null;
  observed: number | null;
};

export function calibrate(rows: CalibrationInput[]): { calibration_status: "NOT_CALIBRATED" | "CALIBRATED"; brier: number | null; n: number; excluded_fixtures: number } {
  const excluded = rows.filter((row) => row.fixture).length;
  const usable = rows.filter((row) => !row.fixture && row.approved && row.predicted !== null && row.observed !== null);
  if (!usable.length) return { calibration_status: "NOT_CALIBRATED", brier: null, n: 0, excluded_fixtures: excluded };
  let score = 0;
  for (const row of usable) {
    const error = (row.predicted as number) - (row.observed as number);
    score += error * error;
  }
  return { calibration_status: "CALIBRATED", brier: score / usable.length, n: usable.length, excluded_fixtures: excluded };
}
