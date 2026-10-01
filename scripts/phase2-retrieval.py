#!/usr/bin/env python3
"""Phase 2: sample-level independence and label patterns.

Does not delete raw rows, measurements, claims, or the earlier pattern_candidates table.
pattern_candidates.independent_sources counted distinct lab-name strings, not samples.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "gg-foundation.sqlite"
OUT = ROOT / "data" / "foundation-normalized.json"


def one(db: sqlite3.Connection, sql: str) -> int:
    return int(db.execute(sql).fetchone()[0])


def main() -> None:
    started = time.time()
    db = sqlite3.connect(DB)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA temp_store=FILE")
    db.execute("PRAGMA cache_size=-200000")
    before = {
        "source_records": one(db, "select count(*) from source_records"),
        "measurements": one(db, "select count(*) from measurements"),
        "numeric": one(db, "select count(*) from measurements where value is not null"),
        "old_patterns": one(db, "select count(*) from pattern_candidates"),
    }
    db.executescript(
        """
        drop table if exists observation_units;
        drop table if exists label_patterns;
        drop table if exists pattern_audit;
        create table observation_units (
          source_record_id integer primary key,
          unit_kind text not null,
          independence_group text not null,
          dataset_id text not null,
          lab text,
          sample_key text,
          tested_at text
        );
        create table label_patterns (
          pattern_key text primary key,
          name_norm text not null,
          compound text not null,
          klass text,
          measurement_rows integer not null,
          independent_samples integer not null,
          laboratories integer not null,
          datasets integer not null,
          discovery_samples integer not null,
          validation_samples integer not null,
          discovery_mean real,
          validation_mean real,
          lifecycle text not null,
          promoted_to_validated integer not null,
          hypothesis text not null
        );
        create table pattern_audit (
          id integer primary key,
          note text not null,
          old_candidate integer not null,
          old_supported integer not null,
          old_validated integer not null,
          old_independent_sources_meaning text not null
        );
        """
    )
    db.execute(
        """
        insert into observation_units (source_record_id, unit_kind, independence_group, dataset_id, lab, sample_key, tested_at)
        select id,
          case when source_id = 'src-cannlytics-results' then 'LAB_SAMPLE' else 'CATALOG_ROW' end,
          case when source_id = 'src-cannlytics-results'
            then 'lab|' || ifnull(lab, '') || '|' || ifnull(sample_id, '') || '|' || ifnull(tested_at, '') || '|' || ifnull(name_norm, '')
            else 'catalog|' || id end,
          source_id, lab, sample_id, tested_at
        from source_records
        """
    )
    db.execute("create index idx_obs_group on observation_units (independence_group)")
    db.execute("create index idx_obs_kind on observation_units (unit_kind)")
    db.execute("create index idx_claims_record on claims (source_record_id)")
    print("units", one(db, "select count(*) from observation_units"), flush=True)
    db.execute(
        """
        insert into label_patterns
        select
          name_norm || '|' || compound,
          name_norm,
          compound,
          klass,
          sum(rows_in_group),
          count(*),
          count(distinct lab),
          count(distinct dataset_id),
          sum(case when bucket <> 0 then 1 else 0 end),
          sum(case when bucket = 0 then 1 else 0 end),
          avg(case when bucket <> 0 then group_value end),
          avg(case when bucket = 0 then group_value end),
          case
            when count(*) >= 30 and count(distinct lab) >= 2
             and sum(case when bucket = 0 then 1 else 0 end) >= 5
             and sum(case when bucket <> 0 then 1 else 0 end) >= 15
            then 'SUPPORTED' else 'CANDIDATE' end,
          0,
          'Statistica delle etichette di laboratorio: media per campione indipendente, non profilo della cultivar, non causalità, non VALIDATED.'
        from (
          select
            r.name_norm as name_norm,
            m.compound as compound,
            m.klass as klass,
            u.independence_group as independence_group,
            r.lab as lab,
            r.source_id as dataset_id,
            avg(m.value) as group_value,
            count(*) as rows_in_group,
            (unicode(substr(u.independence_group, 12, 1)) + unicode(substr(u.independence_group, 24, 1))) % 5 as bucket
          from measurements m
          join source_records r on r.id = m.source_record_id
          join observation_units u on u.source_record_id = r.id
          where m.value is not null
            and u.unit_kind = 'LAB_SAMPLE'
            and r.name_norm is not null
            and r.name_norm != ''
          group by r.name_norm, m.compound, u.independence_group
        )
        group by name_norm, compound
        having count(*) >= 8
        """
    )
    db.execute("create index idx_label_patterns_name on label_patterns (name_norm)")
    old = db.execute(
        "select lifecycle, count(*) from pattern_candidates group by 1"
    ).fetchall()
    old_map = {k: v for k, v in old}
    db.execute(
        """insert into pattern_audit (note, old_candidate, old_supported, old_validated, old_independent_sources_meaning)
           values (?, ?, ?, ?, ?)""",
        (
            "pattern_candidates è stato conservato. La sua colonna independent_sources conta nomi di laboratorio distinti, non campioni. unknown-lab è un solo gruppo. label_patterns ricalcola per campione e non promuove VALIDATED.",
            int(old_map.get("CANDIDATE", 0)),
            int(old_map.get("SUPPORTED", 0)),
            one(db, "select count(*) from pattern_candidates where promoted_to_validated = 1"),
            "distinct laboratory name string, including the bucket unknown-lab",
        ),
    )
    for column in ("entity_ids", "claim_ids", "measurement_ids", "source_ids", "sample_group_ids"):
        try:
            db.execute(f"alter table semantic_cache add column {column} text")
        except sqlite3.OperationalError:
            pass
    db.execute(
        """insert or replace into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
           values ('gg-foundation-2', ?, ?, ?)""",
        (
            before["source_records"],
            before["measurements"],
            "Stessi record della fondazione. Aggiunti i gruppi di indipendenza per campione. La cache precedente gg-foundation-1 non è più valida.",
        ),
    )
    after = {
        "source_records": one(db, "select count(*) from source_records"),
        "measurements": one(db, "select count(*) from measurements"),
        "numeric": one(db, "select count(*) from measurements where value is not null"),
        "old_patterns": one(db, "select count(*) from pattern_candidates"),
    }
    if before != after:
        raise SystemExit(f"PERDITA {before} -> {after}")
    copied = one(db, "select count(*) from (select independence_group from observation_units where unit_kind='LAB_SAMPLE' group by 1 having count(*)>1)")
    report = {
        "snapshot_id": "gg-foundation-2",
        "raw_records_unchanged": after["source_records"],
        "measurements_unchanged": after["measurements"],
        "numeric_unchanged": after["numeric"],
        "information_loss": False,
        "observation_units": one(db, "select count(*) from observation_units"),
        "lab_source_rows": one(db, "select count(*) from observation_units where unit_kind='LAB_SAMPLE'"),
        "lab_independent_samples": one(db, "select count(distinct independence_group) from observation_units where unit_kind='LAB_SAMPLE'"),
        "catalog_rows": one(db, "select count(*) from observation_units where unit_kind='CATALOG_ROW'"),
        "sample_groups_with_duplicate_rows": copied,
        "duplicate_rows_collapsed": one(db, "select count(*) from observation_units where unit_kind='LAB_SAMPLE'")
        - one(db, "select count(distinct independence_group) from observation_units where unit_kind='LAB_SAMPLE'"),
        "cross_file_duplicate_sample_keys": one(
            db,
            """select count(*) from (
                 select u.lab, u.sample_key, u.tested_at
                 from observation_units u
                 join source_records s on s.id = u.source_record_id
                 where u.unit_kind = 'LAB_SAMPLE' and u.sample_key is not null and u.sample_key != ''
                 group by 1, 2, 3
                 having count(distinct s.file_name) > 1
               )""",
        ),
        "old_pattern_rows_kept": after["old_patterns"],
        "old_pattern_independent_sources_means": "distinct lab name, not independent samples",
        "label_patterns": one(db, "select count(*) from label_patterns"),
        "label_candidate": one(db, "select count(*) from label_patterns where lifecycle='CANDIDATE'"),
        "label_supported": one(db, "select count(*) from label_patterns where lifecycle='SUPPORTED'"),
        "label_validated": one(db, "select count(*) from label_patterns where promoted_to_validated=1"),
        "label_datasets_max": one(db, "select max(datasets) from label_patterns"),
        "seconds": round(time.time() - started, 1),
    }
    # The cross-file figure was measured before this script: 0 groups with the same lab+sample+date in more than one file.
    db.commit()
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    previous["phase2"] = report
    previous["snapshot_id"] = "gg-foundation-2"
    OUT.write_text(json.dumps(previous, indent=2))
    db.close()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
