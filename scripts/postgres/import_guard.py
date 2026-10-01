"""Capacity gate for a future resumable import. This module does not connect by itself."""

PAUSE = "IMPORT_PAUSED_DISK_CAPACITY"


def gate(database_bytes, wal_bytes, disk_bytes, read_only):
    if read_only:
        return PAUSE
    if disk_bytes is None:
        return PAUSE
    used = database_bytes + wal_bytes
    if used >= disk_bytes * 0.9:
        return PAUSE
    return "CONTINUE"
