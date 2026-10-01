#!/usr/bin/env python3
"""Import the existing scientific corpus into PostgreSQL.

Status without DATABASE_URL: READY_TO_APPLY / BLOCKED_EXTERNAL.
This script does not invent rows and does not run unless a Postgres URL is set.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQLITE = ROOT / "data" / "gg-foundation.sqlite"
BASELINE = {
    "source_records": 783429,
    "samples": 762770,
    "measurements": 8750800,
    "canonical_entities": 20337,
    "aliases": 15974,
    "claims": 27782,
    "pedigree_edges": 28592,
}
JSON_VALUE_REPR = 4226354
TABLES = list(BASELINE)


def refuse(reason: str) -> int:
    print("STATUS READY_TO_APPLY")
    print(f"BLOCKED_EXTERNAL {reason}")
    print("IMPORT_EXECUTED false")
    return 2


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return refuse("DATABASE_URL")
    if url.startswith("http://") or url.startswith("sqlite:") or "gg-foundation.sqlite" in url:
        print("REFUSED plaintext or sqlite URL is not production Postgres")
        return 2
    try:
        import psycopg
    except ImportError:
        return refuse("PSYCOPG_NOT_INSTALLED")
    if not SQLITE.exists():
        return refuse("CORPUS_FILE_ABSENT")
    source = sqlite3.connect(f"file:{SQLITE}?mode=ro", uri=True)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            for name, expected in BASELINE.items():
                got = source.execute(f"select count(*) from {name}").fetchone()[0]
                if got != expected:
                    raise SystemExit(f"CORPUS_COUNT_MISMATCH {name} {got} != {expected}")
            for name in TABLES:
                cols = [row[1] for row in source.execute(f"pragma table_info({name})")]
                listed = ", ".join(cols)
                placeholders = ", ".join(["%s"] * len(cols))
                dest_cols = listed
                cur.execute("select count(*) from information_schema.tables where table_name = %s", (name,))
                if cur.fetchone()[0] != 1:
                    raise SystemExit(f"SCHEMA_NOT_APPLIED {name}")
                cur.execute(f"select count(*) from {name}")
                if cur.fetchone()[0]:
                    raise SystemExit(f"REFUSING_NONEMPTY_TABLE {name}")
                batch = []
                for row in source.execute(f"select {listed} from {name}"):
                    batch.append(tuple(row))
                    if len(batch) >= 2000:
                        cur.executemany(f"insert into {name} ({dest_cols}) values ({placeholders})", batch)
                        batch.clear()
                if batch:
                    cur.executemany(f"insert into {name} ({dest_cols}) values ({placeholders})", batch)
            conn.commit()
            for name, expected in BASELINE.items():
                cur.execute(f"select count(*) from {name}")
                got = cur.fetchone()[0]
                if got != expected:
                    raise SystemExit(f"POST_IMPORT_MISMATCH {name} {got}")
            cur.execute("select count(*) from measurements where raw_fidelity = 'JSON_VALUE_REPR'")
            fidelity = cur.fetchone()[0]
            if fidelity != JSON_VALUE_REPR:
                raise SystemExit(f"JSON_VALUE_REPR {fidelity} != {JSON_VALUE_REPR}")
    print("STATUS APPLIED")
    print("IMPORT_EXECUTED true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
