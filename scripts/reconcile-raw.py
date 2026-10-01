#!/usr/bin/env python3
"""Read-only comparison of raw CSV cells against stored measurements.

Does not update the database. Does not invent missing catalog rows.
"""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from phase3_migrate import RAW, load_ingest, raw_tokens  # noqa: E402

DB = ROOT / "data" / "gg-foundation.sqlite"
OUT = ROOT / "data" / "raw-reconciliation.json"


def main() -> int:
    csv.field_size_limit(10_000_000)
    ingest = load_ingest()
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    db.execute("pragma query_only=on")
    counts = {
        name: db.execute(f"select count(*) from {name}").fetchone()[0]
        for name in (
            "source_records",
            "samples",
            "measurements",
            "canonical_entities",
            "aliases",
            "claims",
            "pedigree_edges",
        )
    }
    orphans = {
        "measurements_without_source": db.execute(
            "select count(*) from measurements m left join source_records r on r.id = m.source_record_id where r.id is null"
        ).fetchone()[0],
        "aliases_without_entity": db.execute(
            "select count(*) from aliases a left join canonical_entities c on c.id = a.canonical_id where c.id is null"
        ).fetchone()[0],
        "pedigree_without_child": db.execute(
            "select count(*) from pedigree_edges e left join canonical_entities c on c.id = e.child_canonical_id where e.child_canonical_id is not null and c.id is null"
        ).fetchone()[0],
    }
    nd_as_number = db.execute("select count(*) from measurements where qualifier = 'ND' and value is not null").fetchone()[0]
    fidelity = {
        str(key): n
        for key, n in db.execute("select coalesce(raw_fidelity, 'NULL'), count(*) from measurements group by 1")
    }
    compared = 0
    exact = 0
    mismatch = 0
    order_mismatch = 0
    csv_rows_without_record = 0
    files = []
    for path in sorted(RAW.glob("*-results-latest.csv")):
        id_by_row = {
            int(row_number): int(rid)
            for row_number, rid in db.execute(
                "select row_number, id from source_records where file_name = ?",
                (path.name,),
            )
        }
        file_exact = 0
        file_mismatch = 0
        file_order = 0
        file_missing = 0
        pending: list[tuple[int, list[tuple[str, str, str]]]] = []

        def flush(batch: list[tuple[int, list[tuple[str, str, str]]]]) -> None:
            nonlocal file_exact, file_mismatch, file_order
            if not batch:
                return
            ids = [item[0] for item in batch]
            grouped: dict[int, list[tuple[str, str | None]]] = {rid: [] for rid in ids}
            placeholders = ",".join("?" * len(ids))
            for rid, compound, raw in db.execute(
                f"select source_record_id, compound, raw_cell_text from measurements where source_record_id in ({placeholders}) order by source_record_id, id",
                ids,
            ):
                grouped[int(rid)].append((str(compound), None if raw is None else str(raw)))
            for rid, tokens in batch:
                stored = grouped.get(rid, [])
                parsed = [compound for compound, _text, _fidelity in tokens]
                if [compound for compound, _raw in stored] != parsed:
                    file_order += 1
                    continue
                for (_compound, raw), (_name, text, _fidelity) in zip(stored, tokens):
                    if raw == text:
                        file_exact += 1
                    else:
                        file_mismatch += 1

        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            for number, row in enumerate(csv.DictReader(handle), start=1):
                rid = id_by_row.get(number)
                if rid is None:
                    file_missing += 1
                    continue
                pending.append((rid, raw_tokens(ingest, row)))
                if len(pending) >= 300:
                    flush(pending)
                    pending = []
            flush(pending)
        compared += file_exact + file_mismatch
        exact += file_exact
        mismatch += file_mismatch
        order_mismatch += file_order
        csv_rows_without_record += file_missing
        files.append(
            {
                "file": path.name,
                "csv_cell_exact": file_exact,
                "csv_cell_mismatch": file_mismatch,
                "compound_order_mismatch": file_order,
                "csv_rows_without_source_record": file_missing,
            }
        )
        print(json.dumps(files[-1]), flush=True)
    report = {
        "mode": "READ_ONLY",
        "writes": 0,
        "counts": counts,
        "orphans": orphans,
        "nd_with_numeric_value": nd_as_number,
        "stored_fidelity": fidelity,
        "cells_compared": compared,
        "csv_cell_exact": exact,
        "csv_cell_mismatch": mismatch,
        "compound_order_mismatch": order_mismatch,
        "csv_rows_without_source_record": csv_rows_without_record,
        "files": files,
        "catalog_gap": "DECLARED_NOT_IN_FILE",
        "status": "CSV_CELL_EXACT" if mismatch == 0 and order_mismatch == 0 else "CSV_CELL_MISMATCH",
    }
    OUT.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("cells_compared", "csv_cell_exact", "csv_cell_mismatch", "compound_order_mismatch", "status")}))
    return 0 if mismatch == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
