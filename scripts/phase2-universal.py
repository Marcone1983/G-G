#!/usr/bin/env python3
"""Additive Phase 2 migration. No deletes. No strain-specific rules.

Identity axis (one truth, copied to source_records, identity_decisions,
identity_resolution and entity_links):

- PROBABLE_MATCH: catalog row that created name|breeder key. Not exact identity.
- CANONICAL_MATCH: later catalog row with the same entity_key.
- POSSIBLE_MATCH / CONFLICTING_IDENTITY / UNRESOLVED: lab rows, unchanged.
- EXACT_IDENTITY: not assigned. No evidence meets that bar.
- DISTINCT_ENTITY: homonym axis on the entity, not a record decision.
- score_kind stays NOT_A_PROBABILITY.

klass stays the ingested class. normalized_class is the corrected class.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "gg-foundation.sqlite"
CATALOG = ROOT / "data" / "catalog.json"
REPORT = ROOT / "data" / "phase2-reconciliation.json"
SNAPSHOT = "GGS-KNOWLEDGE-000004"

CANNABINOIDS = {
    "cbc", "cbca", "cbcv", "cbd", "cbda", "cbdv", "cbdva", "cbg", "cbga", "cbl", "cbla", "cbn", "cbna", "cbt",
    "delta_8_thc", "delta_9_thc", "delta_10_thc", "thca", "thcv", "thcva", "total_thc", "total_cbd",
    "total_cannabinoids", "sum_of_cannabinoids",
}
TERPENES = {
    "alpha_bisabolol", "alpha_cedrene", "alpha_humulene", "alpha_ocimene", "alpha_phellandrene", "alpha_pinene",
    "alpha_terpinene", "beta_caryophyllene", "beta_myrcene", "beta_ocimene", "beta_pinene", "borneol", "camphene",
    "camphor", "caryophyllene_oxide", "cedrol", "cineole", "citral", "citronellol", "d_limonene", "delta_3_carene",
    "eucalyptol", "fenchol", "geraniol", "geranyl_acetate", "guaiol", "isopulegol", "linalool", "nerolidol",
    "ocimene", "p_cymene", "terpinolene", "total_terpenes", "trans_nerolidol", "valencene",
}


def columns(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(f"pragma table_info({table})")}


def add_column(db: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    if name not in columns(db, table):
        db.execute(f"alter table {table} add column {name} {ddl}")


def one(db: sqlite3.Connection, sql: str) -> int:
    return int(db.execute(sql).fetchone()[0])


def main() -> None:
    started = time.time()
    db = sqlite3.connect(DB_PATH)
    db.execute("pragma journal_mode=wal")
    before = {
        "source_records": one(db, "select count(*) from source_records"),
        "samples": one(db, "select count(*) from samples"),
        "measurements": one(db, "select count(*) from measurements"),
        "canonical_entities": one(db, "select count(*) from canonical_entities"),
        "pedigree_edges": one(db, "select count(*) from pedigree_edges"),
        "aliases": one(db, "select count(*) from aliases"),
        "claims": one(db, "select count(*) from claims"),
    }
    misclassified_before = int(
        db.execute(
            f"""select count(*) from measurements
                where klass = 'TERPENE' and lower(compound) in ({",".join("?" * len(CANNABINOIDS))})""",
            tuple(sorted(CANNABINOIDS)),
        ).fetchone()[0]
    )

    add_column(db, "source_records", "record_role", "text")
    add_column(db, "measurements", "original_class", "text")
    add_column(db, "measurements", "normalized_class", "text")
    add_column(db, "measurements", "classification_reason", "text")
    add_column(db, "measurements", "classification_version", "text")
    add_column(db, "measurements", "unit_original", "text")
    add_column(db, "measurements", "unit_normalized", "text")
    add_column(db, "measurements", "unit_status", "text")
    add_column(db, "measurements", "raw_cell_text", "text")
    add_column(db, "measurements", "parser_version", "text")
    add_column(db, "canonical_entities", "entity_class", "text")

    db.execute(
        """create table if not exists identity_vocabulary (
            term text primary key,
            axis text not null,
            definition text not null
        )"""
    )
    vocabulary = [
        ("SOURCE_RECORD", "record_role", "Ogni riga ingerita resta un record di fonte. Non è una decisione di identità."),
        ("EXACT_IDENTITY", "match_decision", "Non assegnata. Servirebbe un identificatore stabile, non un nome."),
        ("PROBABLE_MATCH", "match_decision", "La riga ha creato la chiave nome|breeder. Lo score non è una probabilità."),
        ("CANONICAL_MATCH", "match_decision", "Stessa entity_key di una riga già vista. Duplicato di chiave, non fusione di omonimi."),
        ("POSSIBLE_MATCH", "match_decision", "Il nome di laboratorio coincide con una sola entità di catalogo. Non è identità certa."),
        ("CONFLICTING_IDENTITY", "match_decision", "Il nome coincide con più entità. Nessuna viene scelta."),
        ("UNRESOLVED", "match_decision", "Nessuna entità di catalogo con quel nome normalizzato."),
        ("DISTINCT_ENTITY", "homonym", "Stesso name_norm, breeder diverso. Non si fondono."),
        ("PROBABLE_IDENTITY", "entity", "Entità di catalogo non confermata da un identificatore esterno."),
    ]
    db.executemany("insert into identity_vocabulary (term, axis, definition) values (?, ?, ?) on conflict(term) do update set axis=excluded.axis, definition=excluded.definition", vocabulary)

    # One identity truth. Only rows still labelled SOURCE_RECORD are the creators.
    creators = db.execute(
        """update identity_decisions
           set status = 'PROBABLE_MATCH',
               method = 'name_plus_breeder_key',
               score_kind = 'NOT_A_PROBABILITY',
               explanation = 'Riga che ha creato la chiave nome|breeder. EXACT_IDENTITY non è assegnata. Lo score non è una probabilità.'
           where source_record_id in (select id from source_records where match_status = 'SOURCE_RECORD')"""
    ).rowcount
    db.execute(
        """update source_records
           set record_role = 'SOURCE_RECORD',
               match_status = (select d.status from identity_decisions d where d.source_record_id = source_records.id)
           where exists (select 1 from identity_decisions d where d.source_record_id = source_records.id)"""
    )
    db.execute(
        """update entity_links
           set match_status = (select d.status from identity_decisions d where d.source_record_id = entity_links.source_record_id)
           where exists (select 1 from identity_decisions d where d.source_record_id = entity_links.source_record_id)"""
    )
    db.execute(
        """update identity_resolution
           set status = (select d.status from identity_decisions d where d.source_record_id = identity_resolution.source_record_id)
           where exists (select 1 from identity_decisions d where d.source_record_id = identity_resolution.source_record_id)"""
    )
    db.execute(
        """update canonical_entities
           set entity_class = 'UNKNOWN_ENTITY'
           where entity_class is null"""
    )

    db.execute(
        """update measurements
           set original_class = coalesce(original_class, klass),
               unit_original = unit,
               unit_normalized = case when unit is null or trim(unit) = '' then null else unit end,
               unit_status = case when unit is null or trim(unit) = '' then 'NOT_PROVIDED' else 'KNOWN' end,
               parser_version = coalesce(parser_version, 'gg-parse-1')
           where original_class is null or unit_status is null"""
    )

    cannabinoid_sql = ",".join("?" * len(CANNABINOIDS))
    terpene_sql = ",".join("?" * len(TERPENES))
    db.execute(
        f"""update measurements
            set normalized_class = case
                  when lower(compound) in ({cannabinoid_sql}) then 'CANNABINOID'
                  when lower(compound) in ({terpene_sql}) then 'TERPENE'
                  when lower(compound) like '%flavon%' then 'FLAVONOID'
                  when lower(compound) like '%anthocyan%' then 'ANTHOCYANIN'
                  when lower(coalesce(analysis, '')) like '%pesticide%' then 'PESTICIDE'
                  when lower(coalesce(analysis, '')) like '%heavy_metal%' or lower(coalesce(analysis, '')) like '%heavy metal%' then 'HEAVY_METAL'
                  when lower(coalesce(analysis, '')) like '%solvent%' then 'RESIDUAL_SOLVENT'
                  when lower(coalesce(analysis, '')) like '%microb%' or lower(coalesce(analysis, '')) like '%mycotoxin%' then 'MICROBE'
                  else 'OTHER'
                end,
                classification_version = 'gg-class-1',
                classification_reason = case
                  when lower(compound) in ({cannabinoid_sql}) and klass != 'CANNABINOID'
                    then 'compound_dictionary_overrides_analysis_panel'
                  when lower(compound) in ({cannabinoid_sql}) then 'compound_dictionary'
                  when lower(compound) in ({terpene_sql}) then 'compound_dictionary'
                  else 'analysis_panel_or_residual'
                end
            where normalized_class is null""",
        tuple(sorted(CANNABINOIDS)) + tuple(sorted(TERPENES)) + tuple(sorted(CANNABINOIDS)) + tuple(sorted(CANNABINOIDS)) + tuple(sorted(TERPENES)),
    )

    misclassified_after = int(
        db.execute(
            f"""select count(*) from measurements
                where normalized_class = 'TERPENE' and lower(compound) in ({cannabinoid_sql})""",
            tuple(sorted(CANNABINOIDS)),
        ).fetchone()[0]
    )

    db.executescript(
        """
        drop view if exists cannabinoids;
        drop view if exists terpenes;
        drop view if exists flavonoids;
        drop view if exists anthocyanins;
        drop view if exists metabolites;
        create view cannabinoids as
          select id, source_record_id, compound, value, unit, qualifier, analysis, original_class, normalized_class
          from measurements where normalized_class = 'CANNABINOID';
        create view terpenes as
          select id, source_record_id, compound, value, unit, qualifier, analysis, original_class, normalized_class
          from measurements where normalized_class = 'TERPENE';
        create view flavonoids as
          select id, source_record_id, compound, value, unit, qualifier, analysis, original_class, normalized_class
          from measurements where normalized_class = 'FLAVONOID';
        create view anthocyanins as
          select id, source_record_id, compound, value, unit, qualifier, analysis, original_class, normalized_class
          from measurements where normalized_class = 'ANTHOCYANIN';
        create view metabolites as
          select id, source_record_id, compound, coalesce(normalized_class, klass) as klass, value, unit, qualifier, analysis
          from measurements;
        drop view if exists pattern_registry;
        create view pattern_registry as
          select 'label_patterns' as store, pattern_key as pattern_id, 'LEGACY_NON_VALIDATED' as scientific_status,
                 lifecycle as legacy_lifecycle, promoted_to_validated, name_norm, hypothesis
          from label_patterns
          union all
          select 'pattern_candidates', pattern_key, 'LEGACY_NON_VALIDATED', lifecycle, promoted_to_validated,
                 substr(pattern_key, 1, instr(pattern_key, '|') - 1), hypothesis
          from pattern_candidates
          union all
          select 'curated_literature', id, 'LITERATURE_NOT_VALIDATED', 'SUPPORTED', 0, null, statement
          from literature_records;
        create table if not exists catalog_gaps (
          id integer primary key,
          source_id text not null,
          declared_rows integer not null,
          records_in_file integer not null,
          empty_name_rows integer not null,
          ingested_rows integer not null,
          gap_count integer not null,
          reason_code text not null,
          raw_representation text,
          parser_version text not null,
          source_sha256 text not null,
          decided_at text not null
        );
        create table if not exists jobs (
          id integer primary key,
          job_type text not null,
          job_status text not null,
          input_snapshot text,
          output_snapshot text,
          started_at text,
          completed_at text,
          error text,
          retry_count integer not null default 0
        );
        create table if not exists integrity_reports (
          id integer primary key,
          checked_at text not null,
          check_name text not null,
          orphan_count integer not null,
          note text not null
        );
        """
    )

    payload = json.loads(CATALOG.read_text())
    records = payload["records"]
    declared = int(payload["rows_in_source"])
    empty_name = sum(1 for row in records if not str(row.get("name") or "").strip())
    sha = hashlib.sha256(CATALOG.read_bytes()).hexdigest()
    ingested = one(db, "select count(*) from source_records where source_id = 'src-ci-strains-pro'")
    gap = declared - len(records)
    db.execute("delete from catalog_gaps where source_id = 'src-ci-strains-pro' and reason_code = 'DECLARED_NOT_IN_FILE'")
    db.execute(
        """insert into catalog_gaps
           (source_id, declared_rows, records_in_file, empty_name_rows, ingested_rows, gap_count, reason_code, raw_representation, parser_version, source_sha256, decided_at)
           values (?, ?, ?, ?, ?, ?, 'DECLARED_NOT_IN_FILE', null, 'gg-catalog-1', ?, ?)""",
        ( "src-ci-strains-pro", declared, len(records), empty_name, ingested, gap, sha, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
    )

    db.execute(
        """insert into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
           values (?, ?, ?, ?)
           on conflict(snapshot_id) do update set note = excluded.note""",
        (
            SNAPSHOT,
            before["source_records"],
            before["measurements"],
            "Top-level snapshot. Components: catalog cc-by-4.0, foundation gg-foundation-2, identity gg-identity-2, class gg-class-1. EXACT_IDENTITY=0. Prediction remains NOT_COMPUTABLE.",
        ),
    )

    # Indexes. Unique content hash only if still unique.
    distinct_hash = one(db, "select count(distinct content_hash) from source_records")
    if distinct_hash == before["source_records"]:
        db.execute("create unique index if not exists idx_records_hash on source_records(content_hash)")
    dup_links = one(db, "select count(*) from (select source_record_id from entity_links group by 1 having count(*) > 1)")
    if dup_links == 0:
        db.execute("create unique index if not exists idx_links_record_unique on entity_links(source_record_id)")
    db.execute("create index if not exists idx_graph_dst on graph_edges(dst_type, dst_id)")
    db.execute("create index if not exists idx_graph_rel on graph_edges(rel)")
    db.execute("create index if not exists idx_measure_normclass on measurements(normalized_class)")
    db.execute("create index if not exists idx_measure_zero on measurements(zero_semantics)")

    t0 = time.perf_counter()
    db.execute("select count(*) from graph_edges where dst_type = 'literature'").fetchone()
    graph_ms = (time.perf_counter() - t0) * 1000

    orphans = {
        "aliases_without_entity": one(db, "select count(*) from aliases a left join canonical_entities c on c.id = a.canonical_id where c.id is null"),
        "claims_without_record": one(db, "select count(*) from claims c left join source_records r on r.id = c.source_record_id where r.id is null"),
        "samples_without_record": one(db, "select count(*) from samples s left join source_records r on r.id = s.source_record_id where r.id is null"),
        "measurements_without_record": one(db, "select count(*) from measurements m left join source_records r on r.id = m.source_record_id where r.id is null"),
        "pedigree_without_entity": one(db, "select count(*) from pedigree_edges e left join canonical_entities c on c.id = e.child_canonical_id where e.child_canonical_id is not null and c.id is null"),
        "decisions_without_record": one(db, "select count(*) from identity_decisions d left join source_records r on r.id = d.source_record_id where r.id is null"),
        "status_mismatch": one(db, "select count(*) from source_records r join identity_decisions d on d.source_record_id = r.id where r.match_status != d.status"),
    }
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for name, count in orphans.items():
        db.execute(
            "insert into integrity_reports (checked_at, check_name, orphan_count, note) values (?, ?, ?, ?)",
            (now, name, count, "Physical FOREIGN KEY rebuild of measurements was not executed. This is the orphan scan."),
        )

    db.execute(
        """insert into jobs (job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, error, retry_count)
           values ('phase2_universal_migration', 'SUCCEEDED', 'GGS-KNOWLEDGE-000003', ?, ?, ?, null, 0)""",
        (SNAPSHOT, now, now),
    )
    db.commit()

    after_counts = {
        "source_records": one(db, "select count(*) from source_records"),
        "samples": one(db, "select count(*) from samples"),
        "measurements": one(db, "select count(*) from measurements"),
        "canonical_entities": one(db, "select count(*) from canonical_entities"),
        "pedigree_edges": one(db, "select count(*) from pedigree_edges"),
        "aliases": one(db, "select count(*) from aliases"),
        "claims": one(db, "select count(*) from claims"),
    }
    decisions = [dict(zip(["status", "n"], row)) for row in db.execute("select status, count(*) n from identity_decisions group by 1 order by 1")]
    classes = [dict(zip(["normalized_class", "n"], row)) for row in db.execute("select normalized_class, count(*) n from measurements group by 1 order by n desc")]
    report = {
        "snapshot_id": SNAPSHOT,
        "seconds": round(time.time() - started, 1),
        "before": before,
        "after": after_counts,
        "row_loss": before != after_counts,
        "creators_relabelled_probable_match": creators,
        "misclassified_cannabinoid_as_terpene_before": misclassified_before,
        "misclassified_cannabinoid_as_terpene_after": misclassified_after,
        "identity_decisions": decisions,
        "exact_identity": one(db, "select count(*) from identity_decisions where status = 'EXACT_IDENTITY'"),
        "normalized_classes": classes,
        "unit_status": [dict(zip(["unit_status", "n"], row)) for row in db.execute("select unit_status, count(*) n from measurements group by 1")],
        "qualified_with_value": one(db, "select count(*) from measurements where qualifier is not null and value is not null"),
        "catalog_gap": {"declared": declared, "in_file": len(records), "empty_name": empty_name, "ingested": ingested, "missing_from_file": gap, "reason": "DECLARED_NOT_IN_FILE", "raw_available": False},
        "orphans": orphans,
        "duplicate_entity_links": dup_links,
        "graph_dst_lookup_ms": round(graph_ms, 2),
        "raw_cell_text_backfill": "NOT_RUN",
        "foreign_keys_enforced": False,
        "foreign_key_note": "SQLite cannot add FOREIGN KEY to an existing 8.7M-row table without a rewrite. Orphan scan is the integrity check.",
    }
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    db.close()


if __name__ == "__main__":
    main()
