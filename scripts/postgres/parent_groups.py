#!/usr/bin/env python3
"""Read independent-group counts for two names. No writes. No secrets."""

import os
import sys

NAMES = ("gmo", "blueberry muffin")
COMPOUND = "delta_9_thc"


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    print("DATABASE_URL", "PRESENT" if url else "ABSENT")
    if not url:
        return 2
    import psycopg

    conn = psycopg.connect(url, connect_timeout=30)
    try:
        with conn.cursor() as cur:
            for name in NAMES:
                cur.execute(
                    """
                    select count(*) as rows,
                           count(distinct coalesce(s.independence_group, s.source_id)) as groups
                    from measurements m
                    join source_records s on s.id = m.source_record_id
                    where s.name_norm = %s
                      and m.compound = %s
                      and m.value_status = 'NUMERIC'
                      and m.numeric_value is not null
                    """,
                    (name, COMPOUND),
                )
                rows, groups = cur.fetchone()
                print("GROUPS", name, "rows", rows, "independent_groups", groups)
        print("PROBE_READ_ONLY true")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
