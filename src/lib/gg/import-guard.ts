export const IMPORT_PAUSED_DISK_CAPACITY = "IMPORT_PAUSED_DISK_CAPACITY";

export function importCapacityGate(databaseBytes: number, walBytes: number, diskBytes: number | null, readOnly: boolean) {
  if (readOnly || diskBytes === null) return IMPORT_PAUSED_DISK_CAPACITY;
  if (databaseBytes + walBytes >= diskBytes * 0.9) return IMPORT_PAUSED_DISK_CAPACITY;
  return "CONTINUE";
}
