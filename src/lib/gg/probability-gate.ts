export function canComputeProbability(input: {
  calibrated: boolean;
  independent_replicates: number;
  leakage: boolean;
  proposed: number | null;
}) {
  const reasons: string[] = [];
  if (!input.calibrated) reasons.push("CALIBRATION");
  if (input.independent_replicates < 2) reasons.push("INDEPENDENT_REPLICATES");
  if (input.leakage) reasons.push("LEAKAGE");
  if (input.proposed == null || Number.isNaN(input.proposed)) reasons.push("NO_MODEL_OUTPUT");
  const allowed = reasons.length === 0;
  return {
    allowed,
    probability: allowed ? input.proposed : null,
    prediction_status: allowed ? ("COMPUTABLE" as const) : ("NOT_COMPUTABLE" as const),
    reasons,
  };
}
