#!/usr/bin/env python3
"""Read-only Supabase status. Never prints the connection string."""

from __future__ import annotations

import os
import sys

TABLES = [
    "source_records",
    "samples",
    "measurements",
    "canonical_entities",
    "aliases",
    "claims",
    "pedigree_edges",
    "global_research_memory",
]


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    print("DATABASE_URL", "PRESENT" if url else "ABSENT")
    if not url:
        return 2
    import psycopg
    from psycopg import ClientCursor

    with psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor) as conn:
        with conn.cursor() as cur:
            cur.execute("select current_setting('transaction_read_only'), pg_is_in_recovery()")
            read_only, recovery = cur.fetchone()
            print("TRANSACTION_READ_ONLY", read_only)
            print("IN_RECOVERY", recovery)
            cur.execute("select pg_size_pretty(pg_database_size(current_database()))")
            print("DATABASE_SIZE", cur.fetchone()[0])
            cur.execute(
                "select tablename from pg_tables where schemaname = 'public' order by tablename"
            )
            names = {row[0] for row in cur.fetchall()}
            for table in TABLES:
                if table not in names:
                    print(f"COUNT {table} ABSENT")
                    continue
                cur.execute(f"select count(*) from {table}")
                print(f"COUNT {table}", cur.fetchone()[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
