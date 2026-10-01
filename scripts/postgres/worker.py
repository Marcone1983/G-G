#!/usr/bin/env python3
"""Persistent job claim for PostgreSQL. Not a process-local queue.

Without DATABASE_URL the process exits 2. It does not claim a sqlite job
and it does not call the provider.
"""

from __future__ import annotations

import os
import sys

CLAIM = """
update worker_jobs
set job_status = 'RUNNING', owner_token = %s, lease_until = now() + interval '60 seconds'
where id = (
  select id from worker_jobs
  where job_status in ('QUEUED', 'RETRYABLE')
    and (lease_until is null or lease_until < now())
  order by id
  for update skip locked
  limit 1
)
returning id, job_type, idempotency_key
"""


def main() -> int:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        print("STATUS NOT_DEPLOYED")
        print("BLOCKED_EXTERNAL DATABASE_URL")
        print("WORKER_RUNNING false")
        return 2
    if url.startswith("http://") or url.startswith("sqlite:"):
        print("REFUSED")
        return 2
    try:
        import psycopg
    except ImportError:
        print("STATUS NOT_DEPLOYED")
        print("BLOCKED_EXTERNAL PSYCOPG_NOT_INSTALLED")
        return 2
    owner = os.environ.get("WORKER_ID", "gg-worker")
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(CLAIM, (owner,))
            row = cur.fetchone()
        conn.commit()
    print("CLAIMED" if row else "IDLE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
