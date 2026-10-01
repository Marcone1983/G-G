#!/usr/bin/env python3
"""Apply the unapplied scientific schema. No deletes. No secret output."""

from __future__ import annotations

import os
import sys
from pathlib import Path

FILES = ["007_health_evidence.sql", "008_enterprise.sql"]
EXPECTED = [
    "health_evidence",
    "health_evidence_edges",
    "import_runs",
    "entity_resolution_candidates",
    "model_registry",
    "model_calibration_records",
    "research_sources",
    "knowledge_growth",
]


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    print("DATABASE_URL", "PRESENT" if url else "ABSENT")
    if not url:
        print("SCHEMA_APPLIED false")
        return 2
    import psycopg
    from psycopg import ClientCursor

    root = Path(__file__).resolve().parent
    conn = psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor)
    try:
        conn.execute("set default_transaction_read_only = off")
        with conn.cursor() as cur:
            cur.execute("select current_setting('transaction_read_only')")
            read_only = str(cur.fetchone()[0]).lower()
            print("TRANSACTION_READ_ONLY", read_only)
            if read_only == "on":
                print("SCHEMA_APPLIED false")
                return 1
            for name in FILES:
                sql = (root / name).read_text()
                body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
                upper = body.upper()
                if "DROP " in upper or "TRUNCATE " in upper or "DELETE FROM" in upper:
                    print("REFUSED_DESTRUCTIVE", name)
                    return 1
                cur.execute(sql)
                print("APPLIED", name)
            conn.commit()
            for table in EXPECTED:
                cur.execute("select to_regclass(%s)", (f"public.{table}",))
                print("TABLE", table, "PRESENT" if cur.fetchone()[0] else "ABSENT")
        print("SCHEMA_APPLIED true")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
