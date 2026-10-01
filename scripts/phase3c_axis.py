#!/usr/bin/env python3
"""Identity axis clarification. Does not rewrite legacy status and does not invent rows.

CANONICAL_MATCH is a duplicate entity-key, not a scientific identity state.
scientific_status maps it to PROBABLE_MATCH and keeps the legacy value.
EXACT_IDENTITY stays at zero. No new knowledge snapshot: no observation changed.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "gg-foundation.sqlite"
REPORT = ROOT / "data" / "phase3-reconciliation.json"
SNAPSHOT = "GGS-KNOWLEDGE-000005"


def columns(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(f"pragma table_info({table})")}


def add_column(db: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    if name not in columns(db, table):
        db.execute(f"alter table {table} add column {name} {ddl}")


def one(db: sqlite3.Connection, sql: str, args: tuple = ()) -> int:
    return int(db.execute(sql, args).fetchone()[0])


def main() -> None:
    started = time.time()
    before = {
        "source_records": None,
        "measurements": None,
        "identity_decisions": None,
    }
    db = sqlite3.connect(DB)
    db.execute("pragma journal_mode=wal")
    for key in before:
        before[key] = one(db, f"select count(*) from {key}")
    add_column(db, "identity_decisions", "scientific_status", "text")
    add_column(db, "identity_decisions", "axis_note", "text")
    add_column(db, "identity_decisions", "human_review_required", "integer")
    add_column(db, "identity_decisions", "human_review_status", "text")
    updated = db.execute(
        """update identity_decisions
           set scientific_status = case status
                 when 'CANONICAL_MATCH' then 'PROBABLE_MATCH'
                 when 'EXACT_IDENTITY' then 'EXACT_IDENTITY'
                 when 'PROBABLE_MATCH' then 'PROBABLE_MATCH'
                 when 'POSSIBLE_MATCH' then 'POSSIBLE_MATCH'
                 when 'CONFLICTING_IDENTITY' then 'CONFLICTING_IDENTITY'
                 when 'UNRESOLVED' then 'UNRESOLVED'
                 else 'UNRESOLVED'
               end,
               axis_note = case status
                 when 'CANONICAL_MATCH' then 'LEGACY_STATUS_IS_DUPLICATE_KEY_NOT_A_SCIENTIFIC_STATE'
                 else 'LEGACY_STATUS_ALREADY_ON_SCIENTIFIC_AXIS'
               end,
               human_review_required = case when status = 'CONFLICTING_IDENTITY' then 1 else 0 end,
               human_review_status = coalesce(human_review_status, coalesce(review_status, 'NOT_REVIEWED'))
           where scientific_status is null"""
    ).rowcount
    db.execute("drop view if exists identity_scientific")
    db.execute(
        """create view identity_scientific as
           select source_record_id as record_id,
                  status as legacy_status,
                  scientific_status,
                  heuristic_score as score,
                  score_kind,
                  axis_note,
                  human_review_required,
                  human_review_status,
                  created_snapshot_id as snapshot_id,
                  'record' as axis
           from identity_decisions"""
    )
    db.execute(
        """create table if not exists split_registry (
             split_id text primary key,
             split_method text not null,
             grouping_method text not null,
             family_leakage_check text not null,
             pedigree_leakage_check text not null,
             note text not null,
             snapshot_id text not null
           )"""
    )
    db.execute(
        """insert into split_registry
           (split_id, split_method, grouping_method, family_leakage_check, pedigree_leakage_check, note, snapshot_id)
           values ('diagnostic-thca-independence-group', 'GROUP_SPLIT', 'independence_group',
                   'NOT_AVAILABLE', 'NOT_AVAILABLE',
                   'Lab samples are not linked into pedigree connected components. A family holdout is not computable. The diagnostic median split uses only the sample independence group.',
                   ?)
           on conflict(split_id) do update set note = excluded.note""",
        (SNAPSHOT,),
    )
    db.execute(
        """insert into audit_events (action, subject, meta_json, created_at)
           values ('identity_scientific_axis', ?, ?, ?)""",
        (
            SNAPSHOT,
            json.dumps({"updated_null_rows": updated, "legacy_status_rewritten": False, "new_snapshot": False}),
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        ),
    )
    after = {key: one(db, f"select count(*) from {key}") for key in before}
    if before != after:
        raise SystemExit(f"ROW CHANGE {before} {after}")
    scientific = [
        {"status": row[0], "n": row[1]}
        for row in db.execute("select scientific_status, count(*) n from identity_decisions group by 1 order by 2 desc")
    ]
    legacy = [
        {"status": row[0], "n": row[1]}
        for row in db.execute("select status, count(*) n from identity_decisions group by 1 order by 2 desc")
    ]
    exact = one(db, "select count(*) from identity_decisions where scientific_status = 'EXACT_IDENTITY'")
    qualifiers = [
        {"qualifier": row[0], "n": row[1], "numeric_values": row[2]}
        for row in db.execute(
            """select qualifier, count(*), sum(value is not null)
               from measurements where qualifier is not null group by 1 order by 2 desc"""
        )
    ]
    db.commit()
    report = {
        "phase": "3C-4D-continuation",
        "snapshot_id": SNAPSHOT,
        "new_snapshot_published": False,
        "reason_no_new_snapshot": "No observation, measurement, or legacy identity status changed. scientific_status is a derived axis.",
        "seconds": round(time.time() - started, 3),
        "rows_before": before,
        "rows_after": after,
        "information_loss": False,
        "identity_rows_annotated": updated,
        "legacy_identity": legacy,
        "scientific_identity": scientific,
        "exact_identity": exact,
        "qualifiers_all_non_numeric": all(row["numeric_values"] in (0, None) for row in qualifiers),
        "qualifiers": qualifiers,
        "family_leakage": "NOT_AVAILABLE",
        "prediction_production_models": one(db, "select count(*) from model_versions where production_eligible = 1"),
    }
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps({"exact_identity": exact, "annotated": updated, "seconds": report["seconds"]}))
    db.close()


if __name__ == "__main__":
    main()
