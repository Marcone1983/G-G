#!/usr/bin/env python3
"""Copy the verified sqlite corpus into Supabase PostgreSQL.

Without DATABASE_URL it exits 2 and writes nothing.
Tables that already match the baseline are skipped.
The sqlite file is never modified and nothing is truncated.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQLITE = Path(os.environ.get("CORPUS_PATH", ROOT / "data/gg-foundation.sqlite"))
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
ORDER = list(BASELINE)
CLAIMS_MAP = {
    "id": "id",
    "source_record_id": "source_record_id",
    "field": "field",
    "claim_text": "claim_text",
    "claim_status": "claim_status",
    "value": "claim_text",
    "claim_class": "claim_status",
}


def refuse(reason: str) -> int:
    print("STATUS READY_TO_APPLY")
    print(f"BLOCKED_EXTERNAL {reason}")
    print("IMPORT_EXECUTED false")
    return 2


def write_batch(conn, cur, name: str, listed: str, rows: list):
    import psycopg
    from psycopg import ClientCursor

    url = os.environ["DATABASE_URL"]
    attempts = 0
    while True:
        try:
            conn.execute("set transaction read write")
            with cur.copy(f"copy {name} ({listed}) from stdin") as copy:
                for row in rows:
                    copy.write_row(row)
            conn.commit()
            return True, conn, cur
        except psycopg.errors.ReadOnlySqlTransaction:
            conn.rollback()
            attempts += 1
            if attempts >= 3:
                print("READ_ONLY_DATABASE", name)
                print("IMPORT_EXECUTED false")
                return False, conn, cur
            conn.close()
            conn = psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor)
            conn.execute("set statement_timeout = 0")
            conn.execute("set default_transaction_read_only = off")
            cur = conn.cursor()


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return refuse("DATABASE_URL")
    if url.startswith("http://") or url.startswith("sqlite:"):
        print("REFUSED")
        return 2
    try:
        import psycopg
        from psycopg import ClientCursor
    except ImportError:
        return refuse("PSYCOPG_NOT_INSTALLED")
    if not SQLITE.exists():
        return refuse("CORPUS_FILE_ABSENT")
    source = sqlite3.connect(f"file:{SQLITE}?mode=ro", uri=True)
    for name, expected in BASELINE.items():
        got = source.execute(f"select count(*) from {name}").fetchone()[0]
        if got != expected:
            print(f"CORPUS_COUNT_MISMATCH {name} {got} {expected}")
            return 1
    conn = psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor)
    conn.execute("set statement_timeout = 0")
    conn.execute("set default_transaction_read_only = off")
    cur = conn.cursor()
    cur.execute("select current_setting('transaction_read_only')")
    if str(cur.fetchone()[0]).lower() == "on":
        print("WRITE_PROBE FAIL")
        print("TRANSACTION_READ_ONLY on")
        print("IMPORT_EXECUTED false")
        return 1
    print("TRANSACTION_READ_ONLY off")
    cur.execute(Path(__file__).with_name("003_align_sqlite.sql").read_text())
    conn.commit()
    remote = {}
    for name in ORDER:
        cur.execute(f"select count(*) from {name}")
        remote[name] = cur.fetchone()[0]
        print(f"BEFORE {name} {remote[name]}")
    if remote == BASELINE:
        print("STATUS ALREADY_IMPORTED")
        print("IMPORT_EXECUTED false")
        print("row_loss false")
        return 0
    if any(remote[name] > BASELINE[name] for name in ORDER):
        print("REFUSING_REMOTE_HAS_MORE_ROWS")
        return 1
    for name in ORDER:
        if remote[name] == BASELINE[name]:
            print(f"SKIP {name}")
            continue
        sqlite_cols = [row[1] for row in source.execute(f"pragma table_info({name})")]
        cur.execute(
            "select column_name from information_schema.columns where table_schema = 'public' and table_name = %s",
            (name,),
        )
        postgres_cols = {row[0] for row in cur.fetchall()}
        if name == "claims":
            dest = [col for col in ("id", "source_record_id", "field", "claim_text", "claim_status", "value", "claim_class") if col in postgres_cols]
            select = ", ".join(CLAIMS_MAP[col] for col in dest)
        else:
            dest = [col for col in sqlite_cols if col in postgres_cols]
            missing = [col for col in sqlite_cols if col not in postgres_cols]
            if missing:
                print("COLUMN_NOT_IN_POSTGRES", name, ",".join(missing))
                return 1
            select = ", ".join(dest)
        listed = ", ".join(dest)
        cur.execute(f"select id from {name}")
        present = {row[0] for row in cur.fetchall()}
        id_index = dest.index("id")
        copied = 0
        pending = []
        for row in source.execute(f"select {select} from {name}"):
            if row[id_index] in present:
                continue
            pending.append(row)
            if len(pending) < 20000:
                continue
            ok, conn, cur = write_batch(conn, cur, name, listed, pending)
            if not ok:
                return 1
            copied += len(pending)
            pending.clear()
            print(f"COPIED {name} {copied}")
            cur.execute("select pg_database_size(current_database())")
            size = int(cur.fetchone()[0])
            print("DATABASE_BYTES", size)
            if size > 6_500_000_000:
                print("PAUSED_DISK")
                print("IMPORT_EXECUTED partial")
                return 3
        if pending:
            ok, conn, cur = write_batch(conn, cur, name, listed, pending)
            if not ok:
                return 1
            copied += len(pending)
            print(f"COPIED {name} {copied}")
    for name, expected in BASELINE.items():
        cur.execute(f"select count(*) from {name}")
        seen = cur.fetchone()[0]
        print(f"AFTER {name} {seen}")
        if seen != expected:
            print(f"POST_IMPORT_MISMATCH {name} {seen} {expected}")
            print("row_loss true")
            return 1
    cur.execute("select count(*) from measurements where raw_fidelity = 'JSON_VALUE_REPR'")
    fidelity = cur.fetchone()[0]
    cur.execute("select count(*) from measurements where qualifier in ('ND', '<LOQ', '<LOD') and value is not null")
    bad = cur.fetchone()[0]
    print("JSON_VALUE_REPR", fidelity)
    print("QUALIFIER_WITH_VALUE", bad)
    if fidelity != JSON_VALUE_REPR or bad:
        print("row_loss true")
        return 1
    print("STATUS APPLIED")
    print("IMPORT_EXECUTED true")
    print("row_loss false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
