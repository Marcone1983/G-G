#!/usr/bin/env python3
"""Postgres is not opened unless DATABASE_URL is set. This does not invent a host."""

from __future__ import annotations

import os
import sys


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("STATUS NOT_CONFIGURED")
        print("DEPENDENCY DATABASE_URL")
        print("SQLITE_REMAINS_SOURCE_OF_TRUTH data/gg-foundation.sqlite")
        return 3
    print("STATUS CONFIGURED_NOT_MIGRATED")
    print("NEXT compare row counts before any copy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
