#!/usr/bin/env python3
"""One-shot idempotent runner. Not a resident daemon.

Run: python3 scripts/gg-worker.py
A second run on the same snapshot does not insert a second phase3 job
and does not duplicate offspring edges.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "gg-foundation.sqlite"
SNAPSHOT = "GGS-KNOWLEDGE-000005"
VERSION = "gg-worker-0.1.0"


def main() -> None:
    db = sqlite3.connect(DB)
    existing = db.execute(
        "select count(*) from jobs where job_type = 'phase3_worker' and output_snapshot = ? and job_status = 'SUCCEEDED'",
        (SNAPSHOT,),
    ).fetchone()[0]
    edges_before = db.execute("select count(*) from graph_edges where rel = 'OFFSPRING_OF'").fetchone()[0]
    db.execute(
        """insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
           select 'name', parent_norm, 'OFFSPRING_OF', 'entity', cast(child_canonical_id as text), 'REPORTED', 'src-ci-strains-pro'
           from pedigree_edges
           where child_canonical_id is not null and parent_norm != ''
             and not exists (
               select 1 from graph_edges g
               where g.rel = 'OFFSPRING_OF' and g.src_type = 'name' and g.src_id = pedigree_edges.parent_norm
                 and g.dst_type = 'entity' and g.dst_id = cast(pedigree_edges.child_canonical_id as text)
             )"""
    )
    edges_after = db.execute("select count(*) from graph_edges where rel = 'OFFSPRING_OF'").fetchone()[0]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if existing:
        db.execute(
            """insert into jobs (job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, finished_at, error, retry_count, worker_version)
               values ('phase3_worker_noop', 'SUCCEEDED', ?, ?, ?, ?, ?, null, 0, ?)""",
            (SNAPSHOT, SNAPSHOT, now, now, now, VERSION),
        )
    else:
        db.execute(
            """insert into jobs (job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, finished_at, error, retry_count, worker_version)
               values ('phase3_worker', 'SUCCEEDED', ?, ?, ?, ?, ?, null, 0, ?)""",
            (SNAPSHOT, SNAPSHOT, now, now, now, VERSION),
        )
    db.commit()
    print(
        {
            "worker": "CLI_NOT_DAEMON",
            "continuous": False,
            "offspring_before": edges_before,
            "offspring_after": edges_after,
            "noop": bool(existing),
        }
    )
    db.close()


if __name__ == "__main__":
    main()
