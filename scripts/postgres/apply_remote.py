#!/usr/bin/env python3
"""Apply the existing Postgres schema to Supabase.

Reads DATABASE_URL from the environment. Prints only PRESENT/ABSENT and
query results that are not credentials. Never prints the connection string.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    ROOT / "scripts/postgres/001_scientific.sql",
    ROOT / "scripts/postgres/002_memory.sql",
    ROOT / "scripts/postgres/003_align_sqlite.sql",
    ROOT / "scripts/postgres/004_sections.sql",
    ROOT / "scripts/postgres/005_corpus_audit.sql",
]
EXPECTED_URL = "https://tupswxnfidpemjkzwgkx.supabase.co"
TABLES = [
    "source_records",
    "samples",
    "measurements",
    "canonical_entities",
    "aliases",
    "claims",
    "pedigree_edges",
]


def redact(text: str) -> str:
    hidden = [
        os.environ.get("DATABASE_URL", ""),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        os.environ.get("PROJECT_URL", ""),
    ]
    for secret in hidden:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    return text


def presence() -> None:
    print("DATABASE_URL", "PRESENT" if os.environ.get("DATABASE_URL", "").strip() else "ABSENT")
    project = os.environ.get("PROJECT_URL", "").strip().rstrip("/")
    if not project:
        print("PROJECT_URL ABSENT")
    elif project == EXPECTED_URL:
        print("PROJECT_URL MATCH")
    else:
        print("PROJECT_URL MISMATCH")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    print("SUPABASE_SERVICE_ROLE_KEY", "PRESENT" if key else "ABSENT")


def main() -> int:
    presence()
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("SUPABASE_CONNECTION NOT_EXECUTED")
        return 2
    if url.startswith("http://") or url.startswith("sqlite:"):
        print("SUPABASE_CONNECTION REFUSED")
        return 2
    from urllib.parse import urlparse

    parsed = urlparse(url)
    print("DATABASE_HOST", parsed.hostname or "ABSENT")
    try:
        print("DATABASE_PORT", parsed.port or "DEFAULT")
    except ValueError:
        print("DATABASE_PORT UNPARSED")
    try:
        import psycopg
        from psycopg import ClientCursor
    except ImportError:
        print("SUPABASE_CONNECTION NOT_EXECUTED")
        print("BLOCKED_EXTERNAL PSYCOPG_NOT_INSTALLED")
        return 2
    try:
        with psycopg.connect(url, connect_timeout=30, cursor_factory=ClientCursor) as conn:
            with conn.cursor() as cur:
                cur.execute("select current_setting('server_version')")
                print("POSTGRES_VERSION", cur.fetchone()[0])
                cur.execute("select current_database(), current_user")
                database, user = cur.fetchone()
                print("DATABASE_NAME", database)
                print("DATABASE_USER", user)
                for path in FILES:
                    sql = path.read_text()
                    cur.execute(sql)
                conn.commit()
                cur.execute(
                    "select tablename from pg_tables where schemaname = 'public' order by tablename"
                )
                names = [row[0] for row in cur.fetchall()]
                print("PUBLIC_TABLES", ",".join(names))
                for table in TABLES:
                    if table not in names:
                        print(f"COUNT {table} ABSENT")
                        continue
                    cur.execute(f"select count(*) from {table}")
                    print(f"COUNT {table}", cur.fetchone()[0])
        print("MIGRATION EXECUTED")
        print("IMPORT NOT_EXECUTED")
        return 0
    except Exception as error:
        message = redact(str(error))
        if "Network is unreachable" in message or "IPv6" in message:
            print("SUPABASE_CONNECTION FAIL_IPV6")
        else:
            print("SUPABASE_CONNECTION FAIL")
        print(message[:400])
        return 1


if __name__ == "__main__":
    sys.exit(main())
