export type LeakRow = { id: string; entity: string; family: string; lab: string; at: string; role: "train" | "test"; target_in_features: boolean };

export function leakagePaths(rows: LeakRow[]): string[] {
  const found = new Set<string>();
  const train = rows.filter((row) => row.role === "train");
  const test = rows.filter((row) => row.role === "test");
  for (const row of rows) {
    if (row.target_in_features) found.add("TARGET_IN_FEATURES");
  }
  for (const held of test) {
    if (train.some((row) => row.entity === held.entity)) found.add("SAME_ENTITY");
    if (train.some((row) => row.family === held.family)) found.add("SAME_FAMILY");
    if (train.some((row) => row.lab === held.lab)) found.add("SAME_LAB");
    if (train.some((row) => row.at > held.at)) found.add("FUTURE_IN_TRAIN");
  }
  return [...found];
}
