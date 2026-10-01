#!/usr/bin/env python3
"""Additive unification of the scientific store.

Does not delete rows. SQLite stays the durable source of truth because
DATABASE_URL is not configured and PostgreSQL is not running.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "gg-foundation.sqlite"
BACKUP_DIR = ROOT / "data" / "backups"
BACKUP = BACKUP_DIR / "gg-foundation-pre-unify.sqlite"
MANIFEST = BACKUP_DIR / "pre-unify-manifest.json"
REPORT = ROOT / "data" / "unify-reconciliation.json"
SNAPSHOT = "GGS-KNOWLEDGE-000003"
RESOLVER = "gg-identity-1"


def one(db: sqlite3.Connection, sql: str) -> int:
    return int(db.execute(sql).fetchone()[0])


def counts(db: sqlite3.Connection) -> dict[str, int]:
    names = [
        "source_records",
        "measurements",
        "samples",
        "canonical_entities",
        "pedigree_edges",
        "aliases",
        "claims",
        "observation_units",
    ]
    return {name: one(db, f"select count(*) from {name}") for name in names}


def column_exists(db: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in db.execute(f"pragma table_info({table})"))


def add_column(db: sqlite3.Connection, table: str, column: str, typedef: str) -> None:
    if not column_exists(db, table, column):
        db.execute(f"alter table {table} add column {column} {typedef}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def backup(before: dict[str, int]) -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if BACKUP.exists() and MANIFEST.exists():
        print("backup already present", BACKUP, flush=True)
        return
    print("backup start", flush=True)
    source = sqlite3.connect(DB)
    target = sqlite3.connect(BACKUP)
    source.backup(target)
    target.close()
    source.close()
    digest = sha256_file(BACKUP)
    MANIFEST.write_text(json.dumps({"counts": before, "sha256": digest, "bytes": BACKUP.stat().st_size}, indent=2))
    print("backup done", digest, flush=True)


def hash_files(db: sqlite3.Connection) -> int:
    mapping: dict[str, Path] = {"data/catalog.json": ROOT / "data" / "catalog.json"}
    for path in (ROOT / "data" / "raw" / "cannlytics").glob("*.csv"):
        mapping[path.name] = path
    updated = 0
    for name, path in mapping.items():
        if not path.exists():
            continue
        digest = sha256_file(path)
        size = path.stat().st_size
        cursor = db.execute(
            "update files set byte_size = ?, sha256 = ?, role = 'RAW' where file_name = ?",
            (size, digest, name),
        )
        updated += cursor.rowcount
    return updated


def main() -> None:
    started = time.time()
    db = sqlite3.connect(DB)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    before = counts(db)
    db.close()
    backup(before)
    db = sqlite3.connect(DB)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    add_column(db, "files", "byte_size", "integer")
    add_column(db, "files", "sha256", "text")
    add_column(db, "files", "role", "text")
    add_column(db, "measurements", "zero_semantics", "text")
    add_column(db, "canonical_entities", "homonym_status", "text")
    db.executescript(
        """
        create table if not exists identity_decisions (
          source_record_id integer primary key,
          status text not null,
          method text not null,
          heuristic_score real,
          score_kind text not null,
          resolver_version text not null,
          decided_at text not null,
          explanation text not null
        );
        create table if not exists literature_records (
          id text primary key,
          source_id text not null,
          kind text not null,
          statement text not null,
          population text,
          causal_claim integer not null
        );
        create table if not exists graph_edges (
          id integer primary key,
          src_type text not null,
          src_id text not null,
          rel text not null,
          dst_type text not null,
          dst_id text not null,
          evidence_level text not null,
          source_id text
        );
        create table if not exists analysis_log (
          id integer primary key,
          snapshot_id text not null,
          cache_key text,
          kind text not null,
          report_json text not null,
          created_at text not null
        );
        create table if not exists audit_events (
          id integer primary key,
          action text not null,
          subject text,
          meta_json text not null,
          created_at text not null
        );
        create table if not exists retrieval_events (
          id integer primary key,
          snapshot_id text not null,
          query text not null,
          method text not null,
          result_json text not null,
          created_at text not null
        );
        """
    )
    db.execute(
        """
        update measurements
        set zero_semantics = 'SOURCE_REPORTED_ZERO'
        where value = 0 and qualifier is null and zero_semantics is null
        """
    )
    db.execute(
        """
        insert or ignore into identity_decisions
          (source_record_id, status, method, heuristic_score, score_kind, resolver_version, decided_at, explanation)
        select source_record_id, status, 'existing_resolution_row', null, 'NOT_A_PROBABILITY', ?, '2026-09-30',
          'Stato già presente sul record. Non è una probabilità e non fonde i campioni.'
        from identity_resolution
        """,
        (RESOLVER,),
    )
    db.execute(
        """
        update canonical_entities
        set homonym_status = 'DISTINCT_ENTITY'
        where exists (
          select 1 from canonical_entities other
          where other.name_norm = canonical_entities.name_norm
            and other.id != canonical_entities.id
            and ifnull(other.breeder, '') != ifnull(canonical_entities.breeder, '')
        )
        """
    )
    db.execute(
        "update canonical_entities set homonym_status = 'PROBABLE_IDENTITY' where homonym_status is null"
    )
    literature = [
        ("gen-b-locus", "src-demeijer-2003", "genetic_association", "Modello un locus B nel materiale inbred dello studio. causal_claim falso. Non si trasferisce alle cultivar commerciali.", "Inbred CBD puri o THC puri, de Meijer 2003", 0),
        ("gen-o-locus", "src-demeijer-2009", "genetic_association", "Locus O nel materiale degli autori. causal_claim falso.", "Cannabinoid-free × cloni ad alto contenuto, de Meijer 2009", 0),
        ("gen-propyl", "src-demeijer-2016", "genetic_association", "Estensione del modello chemotipo. Nessuna percentuale di cultivar.", "Programma de Meijer 2016", 0),
        ("gen-laverty-structure", "src-laverty-2019", "genomic_map", "THCAS e CBDAS in una regione a bassa ricombinazione nella mappa Purple Kush × Finola. Non è il genotipo di un nome commerciale.", "Purple Kush × Finola", 0),
        ("gen-kim-antho", "src-kim-2025", "expression_environment", "Antociani dipendenti dalla temperatura in una popolazione. Non è un gene black.", "Popolazione inbred day-neutral, Kim 2025", 0),
        ("gen-gagalova-2024", "src-gagalova-2024", "expression_correlation", "Correlazione di espressione con antociani fogliari in quattro varietà. Non è causalità e non colora un omonimo.", "Quattro varietà, foglie, Gagalova 2024", 0),
    ]
    db.executemany(
        "insert or ignore into literature_records (id, source_id, kind, statement, population, causal_claim) values (?, ?, ?, ?, ?, ?)",
        literature,
    )
    db.execute("delete from graph_edges")
    db.execute(
        """
        insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
        select 'entity', cast(canonical_id as text), 'HAS_ALIAS', 'alias', alias_norm, 'REPORTED', 'src-ci-strains-pro' from aliases
        """
    )
    db.execute(
        """
        insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
        select 'entity', cast(child_canonical_id as text), 'REPORTED_PARENT', 'name', parent_norm, 'REPORTED', 'src-ci-strains-pro'
        from pedigree_edges where child_canonical_id is not null
        """
    )
    db.execute(
        """
        insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
        select 'entity', cast(id as text), 'HAS_BREEDER', 'breeder', breeder, 'REPORTED', 'src-ci-strains-pro'
        from canonical_entities where breeder is not null and breeder != ''
        """
    )
    db.execute(
        """
        insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
        select 'publication', source_id, 'SUPPORTS', 'literature', id, 'LITERATURE', source_id
        from literature_records
        """
    )
    db.execute("create index if not exists idx_graph_src on graph_edges (src_type, src_id)")
    db.execute("create index if not exists idx_entities_norm on canonical_entities (name_norm)")
    db.execute("drop view if exists evidence_records")
    db.execute("drop view if exists pattern_registry")
    db.execute(
        """
        create view evidence_records as
        select 'MEASURED' as evidence_level, 'measurement' as kind, m.id as evidence_id,
               m.source_record_id, u.independence_group, r.source_id, r.file_name, r.sample_id,
               m.compound, m.value, m.qualifier, m.unit, m.zero_semantics
        from measurements m
        join source_records r on r.id = m.source_record_id
        join observation_units u on u.source_record_id = r.id
        union all
        select 'REPORTED', 'claim', c.id, c.source_record_id, u.independence_group, r.source_id, r.file_name, r.sample_id,
               c.field, null, null, null, null
        from claims c
        join source_records r on r.id = c.source_record_id
        left join observation_units u on u.source_record_id = r.id
        """
    )
    db.execute(
        """
        create view pattern_registry as
        select 'label_patterns' as store, pattern_key as pattern_id, lifecycle, promoted_to_validated, name_norm, hypothesis
        from label_patterns
        union all
        select 'pattern_candidates', pattern_key, lifecycle, promoted_to_validated,
               substr(pattern_key, 1, instr(pattern_key, '|') - 1), hypothesis
        from pattern_candidates
        union all
        select 'curated_literature', id, 'SUPPORTED', 0, null, statement
        from literature_records
        """
    )
    hashed = hash_files(db)
    db.execute(
        """
        insert or replace into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
        values (?, ?, ?, ?)
        """,
        (
            SNAPSHOT,
            before["source_records"],
            before["measurements"],
            "Snapshot unico. Componenti: catalogo ggs-snap-1.2.0 e fondazione gg-foundation-2. Immutabile. I precedenti snapshot restano.",
        ),
    )
    after = counts(db)
    if before != after:
        raise SystemExit(f"PERDITA {before} -> {after}")
    check = sqlite3.connect(f"file:{BACKUP}?mode=ro", uri=True)
    backed = counts(check)
    check.close()
    if backed != before:
        raise SystemExit(f"BACKUP DIVERSO {backed} != {before}")
    report = {
        "snapshot_id": SNAPSHOT,
        "persistence": "sqlite_file",
        "postgres": "NOT_CONFIGURED",
        "before": before,
        "after": after,
        "backup_counts": backed,
        "information_loss": False,
        "files_hashed": hashed,
        "source_reported_zeros": one(db, "select count(*) from measurements where zero_semantics = 'SOURCE_REPORTED_ZERO'"),
        "qualified_with_value": one(db, "select count(*) from measurements where qualifier is not null and value is not null"),
        "identity_decisions": one(db, "select count(*) from identity_decisions"),
        "distinct_entities": one(db, "select count(*) from canonical_entities where homonym_status = 'DISTINCT_ENTITY'"),
        "graph_edges": one(db, "select count(*) from graph_edges"),
        "literature_records": one(db, "select count(*) from literature_records"),
        "seconds": round(time.time() - started, 1),
    }
    db.commit()
    db.close()
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
