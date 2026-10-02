#!/usr/bin/env python3
"""Apply only the content_reports table. No drops. No measurement writes."""

from __future__ import annotations

import os
import sys
from pathlib import Path

SQL = (Path(__file__).with_name("012_content_reports.sql")).read_text()


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    print("DATABASE_URL", "PRESENT" if url else "ABSENT")
    if not url:
        print("CONTENT_REPORTS NOT_EXECUTED")
        return 2
    if "tupswxnfidpemjkzwgkx" not in url:
        print("CONTENT_REPORTS REFUSED")
        return 2
    import psycopg

    with psycopg.connect(url, connect_timeout=20) as conn:
        with conn.cursor() as cur:
            cur.execute("select to_regclass('public.content_reports')")
            before = cur.fetchone()[0]
            print("BEFORE", "PRESENT" if before else "ABSENT")
            cur.execute(SQL)
            cur.execute("select to_regclass('public.content_reports')")
            after = cur.fetchone()[0]
            print("AFTER", "PRESENT" if after else "ABSENT")
            cur.execute("select count(*) from public.measurements")
            print("MEASUREMENTS", int(cur.fetchone()[0]))
        conn.commit()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        text = str(error)
        secret = os.environ.get("DATABASE_URL", "")
        if secret:
            text = text.replace(secret, "[REDACTED]")
        print("CONTENT_REPORTS FAILED", text[:240])
        sys.exit(1)
