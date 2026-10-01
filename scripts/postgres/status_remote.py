#!/usr/bin/env python3
"""Supabase status and a rolled-back write probe. Never prints secrets."""

from __future__ import annotations

import os
import sys

EXPECTED_URL = "https://tupswxnfidpemjkzwgkx.supabase.co"
TABLES = [
    "source_records",
    "samples",
    "measurements",
    "canonical_entities",
    "aliases",
    "claims",
    "pedigree_edges",
    "global_research_memory",
    "knowledge_sections",
    "knowledge_cache",
    "corpus_audit",
]


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    project = os.environ.get("PROJECT_URL", "").strip().rstrip("/")
    print("DATABASE_URL", "PRESENT" if url else "ABSENT")
    if not project:
        print("PROJECT_URL ABSENT")
    elif project == EXPECTED_URL:
        print("PROJECT_URL MATCH")
    else:
        print("PROJECT_URL MISMATCH")
    if not url:
        print("WRITE_PROBE NOT_RUN")
        return 2
    import psycopg
    from psycopg import ClientCursor

    try:
        conn = psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor)
    except Exception as exc:
        sqlstate = getattr(exc, "sqlstate", None)
        print("CONNECT FAIL")
        print("SQLSTATE", sqlstate or "NONE")
        print("WRITE_PROBE NOT_RUN")
        return 1
    try:
        with conn.cursor() as cur:
            cur.execute("select current_setting('transaction_read_only'), pg_is_in_recovery(), current_database()")
            read_only, recovery, database = cur.fetchone()
            print("TRANSACTION_READ_ONLY", read_only)
            print("IN_RECOVERY", recovery)
            print("DATABASE_NAME", database)
            cur.execute("select pg_size_pretty(pg_database_size(current_database())), pg_database_size(current_database())")
            pretty, raw = cur.fetchone()
            print("DATABASE_SIZE", pretty)
            print("DATABASE_BYTES", raw)
            try:
                cur.execute("select coalesce(sum(size), 0) from pg_ls_waldir()")
                wal = cur.fetchone()[0]
                print("WAL_BYTES", wal)
            except Exception as exc:
                conn.rollback()
                print("WAL_BYTES UNAVAILABLE")
                print("WAL_SQLSTATE", getattr(exc, "sqlstate", None) or "NONE")
            cur.execute("select tablename from pg_tables where schemaname = 'public'")
            names = {row[0] for row in cur.fetchall()}
            for table in TABLES:
                if table not in names:
                    print(f"COUNT {table} ABSENT")
                    continue
                cur.execute(f"select count(*) from {table}")
                print(f"COUNT {table}", cur.fetchone()[0])
            print("DISK_QUOTA NOT_VISIBLE_FROM_SQL")
            try:
                cur.execute("create temp table gg_write_probe(id integer)")
                cur.execute("insert into gg_write_probe(id) values (1)")
                cur.execute("select count(*) from gg_write_probe")
                seen = cur.fetchone()[0]
                conn.rollback()
                cur.execute("select to_regclass('pg_temp.gg_write_probe')")
                left = cur.fetchone()[0]
                if seen == 1 and left is None and str(read_only).lower() == "off":
                    print("WRITE_PROBE PASS")
                    print("WRITE_PROBE_ROLLBACK PASS")
                    return 0
                print("WRITE_PROBE FAIL")
                print("WRITE_PROBE_SEEN", seen)
                print("WRITE_PROBE_LEFT", left)
                return 1
            except Exception as exc:
                conn.rollback()
                print("WRITE_PROBE FAIL")
                print("SQLSTATE", getattr(exc, "sqlstate", None) or "NONE")
                return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
