#!/usr/bin/env python3
"""Phase 3 additive migration.

Does not delete scientific rows. Does not invent observations.
No cultivar name is a special case. A new snapshot is published only
after the raw-cell pass, and GGS-KNOWLEDGE-000004 is left unchanged.
"""

from __future__ import annotations

import ast
import csv
import hashlib
import importlib.util
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "gg-foundation.sqlite"
BACKUP = ROOT / "data" / "backups" / "gg-foundation-pre-phase3.sqlite"
REPORT = ROOT / "data" / "phase3-report.json"
RAW = ROOT / "data" / "raw" / "cannlytics"
PREVIOUS = "GGS-KNOWLEDGE-000004"
SNAPSHOT = "GGS-KNOWLEDGE-000005"


def load_ingest():
    spec = importlib.util.spec_from_file_location("gg_ingest", ROOT / "scripts" / "ingest-foundation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def one(db: sqlite3.Connection, sql: str, args: tuple = ()) -> int:
    return int(db.execute(sql, args).fetchone()[0])


def cols(db: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in db.execute(f"pragma table_info({table})")}


def add_column(db: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    if name not in cols(db, table):
        db.execute(f"alter table {table} add column {name} {ddl}")


def counts(db: sqlite3.Connection) -> dict[str, int]:
    tables = [
        "source_records",
        "samples",
        "measurements",
        "canonical_entities",
        "pedigree_edges",
        "aliases",
        "claims",
        "identity_decisions",
        "graph_edges",
    ]
    return {table: one(db, f"select count(*) from {table}") for table in tables}


def backup(db: sqlite3.Connection) -> None:
    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    if BACKUP.exists() and BACKUP.stat().st_size > 1_000_000_000:
        return
    if BACKUP.exists():
        BACKUP.unlink()
    dest = sqlite3.connect(BACKUP)
    db.backup(dest)
    dest.close()


def raw_tokens(ingest, row: dict[str, str]) -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    raw = row.get("results") or ""
    parsed = None
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            try:
                parsed = ast.literal_eval(raw)
            except (ValueError, SyntaxError):
                parsed = None
    if isinstance(parsed, list) and parsed:
        for item in parsed:
            if not isinstance(item, dict):
                continue
            compound = str(item.get("key") or item.get("name") or "").strip()
            if not compound:
                continue
            value, qualifier = ingest.parse_value(item.get("value"))
            if value is None and not qualifier:
                continue
            cell = item.get("value")
            text = "" if cell is None else str(cell)
            out.append((compound[:80], text, "JSON_VALUE_REPR"))
        return out
    for key, cell in row.items():
        if key in ingest.PII or key in {"results", "analyses", "methods"}:
            continue
        compound = key.strip().lower()
        if compound not in ingest.CANNABINOIDS and compound not in ingest.TERPENES:
            continue
        value, qualifier = ingest.parse_value(cell)
        if value is None and not qualifier:
            continue
        out.append((compound[:80], "" if cell is None else str(cell), "CSV_CELL_EXACT"))
    return out


def backfill_raw(db: sqlite3.Connection, ingest) -> dict:
    already = one(db, "select count(*) from measurements where raw_cell_text is not null")
    if already == one(db, "select count(*) from measurements"):
        return {"status": "ALREADY_COMPLETE", "filled": already, "mismatched_records": 0}
    csv.field_size_limit(10_000_000)
    db.execute("drop table if exists raw_stage")
    db.execute(
        """create table raw_stage (
            measurement_id integer primary key,
            raw_cell_text text,
            fidelity text not null
        )"""
    )
    mismatched = 0
    matched_rows = 0
    examples: list[dict] = []
    files = sorted(RAW.glob("*-results-latest.csv"))
    for path in files:
        id_by_row = {
            int(row_number): int(rid)
            for row_number, rid in db.execute(
                "select row_number, id from source_records where file_name = ?",
                (path.name,),
            )
        }
        pending: list[tuple[int, list[tuple[str, str, str]]]] = []

        def flush(batch: list[tuple[int, list[tuple[str, str, str]]]]) -> None:
            nonlocal mismatched, matched_rows
            if not batch:
                return
            ids = [item[0] for item in batch]
            placeholders = ",".join("?" * len(ids))
            grouped: dict[int, list[tuple[int, str]]] = {rid: [] for rid in ids}
            for rid, mid, compound in db.execute(
                f"select source_record_id, id, compound from measurements where source_record_id in ({placeholders}) order by source_record_id, id",
                ids,
            ):
                grouped[int(rid)].append((int(mid), str(compound)))
            stage = []
            for rid, tokens in batch:
                stored = grouped.get(rid, [])
                compounds = [compound for compound, _text, _fidelity in tokens]
                if [compound for _mid, compound in stored] != compounds:
                    mismatched += 1
                    if len(examples) < 8:
                        examples.append(
                            {
                                "source_record_id": rid,
                                "parsed": compounds[:8],
                                "stored": [compound for _mid, compound in stored][:8],
                            }
                        )
                    continue
                for (mid, _compound), (_name, text, fidelity) in zip(stored, tokens):
                    stage.append((mid, text, fidelity))
                matched_rows += 1
            if stage:
                db.executemany("insert into raw_stage (measurement_id, raw_cell_text, fidelity) values (?, ?, ?)", stage)

        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            for number, row in enumerate(csv.DictReader(handle), start=1):
                rid = id_by_row.get(number)
                if rid is None:
                    continue
                pending.append((rid, raw_tokens(ingest, row)))
                if len(pending) >= 400:
                    flush(pending)
                    pending = []
            flush(pending)
        db.commit()
        print(f"raw {path.name} mismatched={mismatched} matched_records={matched_rows}", flush=True)

    staged = one(db, "select count(*) from raw_stage")
    db.execute(
        """update measurements
           set raw_cell_text = (select s.raw_cell_text from raw_stage s where s.measurement_id = measurements.id),
               raw_fidelity = (select s.fidelity from raw_stage s where s.measurement_id = measurements.id)
           where id in (select measurement_id from raw_stage)"""
    )
    db.execute("drop table raw_stage")
    db.commit()
    filled = one(db, "select count(*) from measurements where raw_cell_text is not null")
    return {
        "status": "PARTIAL" if mismatched else "COMPLETE",
        "filled": filled,
        "staged": staged,
        "mismatched_records": mismatched,
        "examples": examples,
        "fidelity": [dict(zip(["raw_fidelity", "n"], row)) for row in db.execute("select raw_fidelity, count(*) from measurements group by 1")],
    }


def value_status(db: sqlite3.Connection) -> None:
    db.execute(
        """update measurements
           set numeric_value = value,
               value_status = case
                 when qualifier is not null then 'QUALIFIED'
                 when value is null then 'MISSING'
                 when value = 0 and zero_semantics = 'SOURCE_REPORTED_ZERO' then 'REAL_ZERO'
                 when value is not null then 'NUMERIC'
                 else 'UNKNOWN'
               end,
               normalization_version = coalesce(normalization_version, 'gg-norm-1')
           where value_status is null"""
    )


def schema(db: sqlite3.Connection) -> None:
    add_column(db, "measurements", "numeric_value", "real")
    add_column(db, "measurements", "value_status", "text")
    add_column(db, "measurements", "normalization_version", "text")
    add_column(db, "measurements", "raw_fidelity", "text")
    add_column(db, "identity_decisions", "created_snapshot_id", "text")
    add_column(db, "identity_decisions", "review_status", "text")
    add_column(db, "source_registry", "access_status", "text")
    add_column(db, "source_registry", "usage_notes", "text")
    add_column(db, "source_registry", "independence_group", "text")
    add_column(db, "semantic_cache", "cache_type", "text")
    add_column(db, "semantic_cache", "embedding_version", "text")
    add_column(db, "semantic_cache", "expires_at", "text")
    add_column(db, "semantic_cache", "invalidated_at", "text")
    add_column(db, "semantic_cache", "invalidation_reason", "text")
    add_column(db, "retrieval_events", "latency_ms", "real")
    add_column(db, "retrieval_events", "cache_hit", "text")
    add_column(db, "retrieval_events", "entity_ids", "text")
    add_column(db, "retrieval_events", "evidence_ids", "text")
    add_column(db, "jobs", "finished_at", "text")
    add_column(db, "jobs", "worker_version", "text")
    add_column(db, "jobs", "input_hash", "text")
    add_column(db, "pedigree_edges", "score_kind", "text")
    add_column(db, "pedigree_edges", "reported_or_inferred", "text")
    add_column(db, "pedigree_edges", "snapshot_id", "text")
    db.executescript(
        """
        create table if not exists snapshot_manifests (
          snapshot_id text primary key,
          created_at text not null,
          schema_version text not null,
          parent_snapshot_id text,
          source_registry_hash text,
          dataset_hash text,
          measurements_hash text,
          identity_resolution_hash text,
          pedigree_hash text,
          evidence_hash text,
          graph_hash text,
          embedding_model text not null,
          embedding_version text not null,
          embedding_dimension integer not null,
          prediction_model_versions text not null,
          calibration_versions text,
          feature_schema_version text not null,
          immutable integer not null default 1,
          note text not null
        );
        create table if not exists compounds (
          compound_id text primary key,
          canonical_name text not null,
          chemical_class text not null,
          classification_status text not null,
          cas text,
          inchikey text,
          smiles text,
          source_provenance text not null
        );
        create table if not exists evidence_records (
          evidence_id text primary key,
          evidence_type text not null,
          evidence_level text not null,
          source_id text,
          dataset_id text,
          file_id text,
          record_id integer,
          sample_id text,
          publication_id text,
          independence_group text,
          source_lineage text,
          license text,
          retrieval_date text,
          content_hash text,
          parent_evidence_id text,
          supports_claim text,
          contradicts_claim text,
          created_snapshot_id text not null
        );
        create table if not exists genomic_datasets (
          dataset_id text primary key,
          source text,
          access_status text not null,
          cultivar_link text not null,
          note text not null
        );
        create table if not exists reference_genomes (
          assembly_id text primary key,
          organism text,
          note text not null
        );
        create table if not exists variants (
          variant_id text primary key,
          dataset_id text,
          note text
        );
        create table if not exists genes (
          gene_id text primary key,
          symbol text,
          note text
        );
        create table if not exists expression_samples (
          expression_sample_id text primary key,
          dataset_id text,
          cultivar_link text not null
        );
        create table if not exists feature_definitions (
          feature_id text primary key,
          name text not null,
          category text not null,
          unit text,
          derived_or_observed text not null,
          derivation_method text,
          snapshot_id text not null
        );
        create table if not exists target_feature_policy (
          target_id text not null,
          feature_name text not null,
          feature_role text not null,
          primary key (target_id, feature_name)
        );
        create table if not exists prediction_targets (
          target_id text primary key,
          name text not null,
          description text not null,
          target_type text not null,
          unit text,
          domain text not null,
          measurement_definition text not null,
          minimum_sample_count integer not null,
          minimum_independent_samples integer not null,
          minimum_independent_sources integer not null,
          allowed_features text not null,
          forbidden_features text not null,
          leakage_rules text not null,
          calibration_required integer not null,
          ood_required integer not null,
          status text not null
        );
        create table if not exists model_registry (
          model_id text primary key,
          name text not null,
          role text not null
        );
        create table if not exists model_versions (
          model_id text not null,
          version text not null,
          algorithm text not null,
          target_id text,
          training_snapshot text,
          feature_schema text,
          split_strategy text,
          hyperparameters text,
          metrics_json text,
          calibration_status text,
          ood_method text,
          status text not null,
          production_eligible integer not null default 0,
          limitations text not null,
          primary key (model_id, version)
        );
        create table if not exists training_runs (
          run_id text primary key,
          model_id text not null,
          target_id text,
          split_strategy text not null,
          training_groups integer,
          validation_groups integer,
          test_groups integer,
          independent_sources integer,
          leakage_blocked integer not null,
          status text not null,
          snapshot_id text not null,
          note text not null
        );
        create table if not exists calibration_runs (
          calibration_id text primary key,
          model_id text not null,
          method text,
          status text not null,
          coverage real,
          snapshot_id text not null
        );
        create table if not exists prediction_requests (
          id integer primary key,
          target_id text,
          query text,
          status text not null,
          reason_code text not null,
          knowledge_snapshot text not null,
          created_at text not null
        );
        create table if not exists prediction_explanations (
          prediction_request_id integer,
          explanation_json text not null,
          causal_claim integer not null default 0
        );
        create table if not exists pattern_assessments (
          store text not null,
          pattern_key text not null,
          scientific_status text not null,
          reason_code text not null,
          independent_replication integer not null,
          association_class text not null,
          p_value real,
          primary key (store, pattern_key)
        );
        create table if not exists pedigree_conflicts (
          id integer primary key,
          conflict_type text not null,
          child_canonical_id integer,
          parent_norm text,
          n integer,
          kept integer not null default 1,
          note text not null
        );
        create table if not exists data_quality_reports (
          id integer primary key,
          source_id text not null,
          row_count integer not null,
          report_json text not null,
          snapshot_id text not null,
          created_at text not null
        );
        create table if not exists audit_chain (
          id integer primary key,
          audit_event text not null,
          actor text not null,
          created_at text not null,
          input_snapshot text,
          output_snapshot text,
          version text not null
        );
        create table if not exists graph_relation_types (
          rel text primary key,
          description text not null
        );
        """
    )
    # The historical variants table from ingestion is empty and has no variant_id.
    # Keep it. Genomic variants live in genomic_variants so the empty table is not rebuilt.
    db.execute(
        """create table if not exists genomic_variants (
            variant_id text primary key,
            dataset_id text references genomic_datasets(dataset_id),
            note text not null
        )"""
    )
    db.execute(
        """create table if not exists genomic_samples (
            genomic_sample_id text primary key,
            dataset_id text references genomic_datasets(dataset_id),
            cultivar_link text not null,
            note text not null
        )"""
    )


def compounds_and_graph(db: sqlite3.Connection) -> dict:
    db.execute("delete from compounds")
    db.execute(
        """insert into compounds (compound_id, canonical_name, chemical_class, classification_status, source_provenance)
           select lower(compound), min(compound), coalesce(normalized_class, klass),
             case
               when coalesce(normalized_class, klass) in ('CANNABINOID', 'TERPENE')
                    and max(classification_reason) like '%dictionary%' then 'KNOWN'
               when coalesce(normalized_class, klass) = 'OTHER' then 'UNCERTAIN'
               else 'PANEL_ASSIGNED'
             end,
             'measurement_dictionary_gg-class-1'
           from measurements
           group by lower(compound)"""
    )
    relations = [
        ("HAS_ALIAS", "Alias dichiarato. Non è identità genetica."),
        ("HAS_BREEDER", "Breeder riportato sulla scheda."),
        ("HAS_SAMPLE", "Campione osservato, non la cultivar."),
        ("HAS_MEASUREMENT", "Misura del campione."),
        ("HAS_COMPOUND", "Composto misurato o nominato."),
        ("REPORTED_PARENT", "Pedigree dichiarato."),
        ("OFFSPRING_OF", "Indice inverso del parent dichiarato."),
        ("SUPPORTED_BY", "Fonte che sostiene un record di letteratura."),
        ("CONTRADICTED_BY", "Conflitto conservato."),
        ("PUBLISHED_IN", "Pubblicazione, quando esiste."),
        ("HAS_VARIANT", "Variante genomica. Vuoto se non c'è un dataset collegabile."),
        ("PREDICTED_BY", "Predizione. Non è evidenza."),
    ]
    db.executemany(
        "insert into graph_relation_types (rel, description) values (?, ?) on conflict(rel) do update set description = excluded.description",
        relations,
    )
    before = one(db, "select count(*) from graph_edges")
    db.execute(
        """insert into graph_edges (src_type, src_id, rel, dst_type, dst_id, evidence_level, source_id)
           select 'name', parent_norm, 'OFFSPRING_OF', 'entity', cast(child_canonical_id as text), 'REPORTED', 'src-ci-strains-pro'
           from pedigree_edges
           where child_canonical_id is not null and parent_norm is not null and parent_norm != ''
             and not exists (
               select 1 from graph_edges g
               where g.src_type = 'name' and g.src_id = pedigree_edges.parent_norm
                 and g.rel = 'OFFSPRING_OF' and g.dst_type = 'entity'
                 and g.dst_id = cast(pedigree_edges.child_canonical_id as text)
             )"""
    )
    after = one(db, "select count(*) from graph_edges")
    db.execute(
        """update pedigree_edges
           set score_kind = coalesce(score_kind, 'HEURISTIC_SCORE'),
               reported_or_inferred = coalesce(reported_or_inferred, 'BREEDER_REPORTED_PEDIGREE'),
               snapshot_id = coalesce(snapshot_id, ?)
           where score_kind is null or reported_or_inferred is null""",
        (PREVIOUS,),
    )
    db.execute("delete from pedigree_conflicts")
    db.execute(
        """insert into pedigree_conflicts (conflict_type, child_canonical_id, parent_norm, n, kept, note)
           select 'DUPLICATE_DECLARED_EDGE', child_canonical_id, parent_norm, count(*), 1,
                  'Duplicato conservato. Non è stato cancellato.'
           from pedigree_edges
           group by child_canonical_id, parent_norm
           having count(*) > 1"""
    )
    db.execute(
        """insert into pedigree_conflicts (conflict_type, child_canonical_id, parent_norm, n, kept, note)
           select 'SELF_PARENT', child_canonical_id, parent_norm, count(*), 1,
                  'Lo stesso identificatore compare come parent e offspring. Conservato come conflitto.'
           from pedigree_edges
           where parent_canonical_id is not null and parent_canonical_id = child_canonical_id
           group by child_canonical_id, parent_norm"""
    )
    return {
        "graph_edges_before": before,
        "graph_edges_after": after,
        "offspring_added": after - before,
        "compounds": one(db, "select count(*) from compounds"),
        "uncertain_compounds": one(db, "select count(*) from compounds where classification_status = 'UNCERTAIN'"),
        "flavonoid_compounds": one(db, "select count(*) from compounds where chemical_class = 'FLAVONOID'"),
        "anthocyanin_compounds": one(db, "select count(*) from compounds where chemical_class = 'ANTHOCYANIN'"),
        "pedigree_conflicts": one(db, "select count(*) from pedigree_conflicts"),
    }


def evidence(db: sqlite3.Connection) -> dict:
    db.execute("drop view if exists evidence_records")
    db.execute(
        """create table if not exists evidence_records (
          evidence_id text primary key,
          evidence_type text not null,
          evidence_level text not null,
          source_id text,
          dataset_id text,
          file_id text,
          record_id integer,
          sample_id text,
          publication_id text,
          independence_group text,
          source_lineage text,
          license text,
          retrieval_date text,
          content_hash text,
          parent_evidence_id text,
          supports_claim text,
          contradicts_claim text,
          created_snapshot_id text not null
        )"""
    )
    db.execute("delete from evidence_records where created_snapshot_id = ?", (SNAPSHOT,))
    db.execute(
        """insert into evidence_records
           (evidence_id, evidence_type, evidence_level, source_id, record_id, independence_group, source_lineage, license, content_hash, created_snapshot_id)
           select 'claim:' || c.id, 'REPORTED', 'REPORTED', r.source_id, c.source_record_id, u.independence_group, r.source_id,
                  s.license, r.content_hash, ?
           from claims c
           join source_records r on r.id = c.source_record_id
           left join observation_units u on u.source_record_id = r.id
           left join source_registry s on s.source_id = r.source_id""",
        (SNAPSHOT,),
    )
    db.execute(
        """insert into evidence_records
           (evidence_id, evidence_type, evidence_level, source_id, record_id, source_lineage, license, created_snapshot_id, supports_claim)
           select 'pedigree:' || e.id, 'REPORTED', 'DECLARED_PEDIGREE', 'src-ci-strains-pro', e.child_record_id, 'src-ci-strains-pro',
                  'CC BY 4.0', ?, 'parent:' || e.parent_norm
           from pedigree_edges e""",
        (SNAPSHOT,),
    )
    db.execute(
        """insert into evidence_records
           (evidence_id, evidence_type, evidence_level, source_id, publication_id, source_lineage, created_snapshot_id)
           select 'literature:' || id, 'DOCUMENTED', 'LITERATURE', source_id, id, source_id, ?
           from literature_records""",
        (SNAPSHOT,),
    )
    db.execute("drop view if exists measurement_evidence")
    db.execute(
        """create view measurement_evidence as
           select 'MEASURED' as evidence_level, m.id as evidence_id, m.source_record_id, r.source_id,
                  r.file_name, r.row_number, r.sample_id, u.independence_group,
                  m.compound, m.value, m.numeric_value, m.qualifier, m.unit, m.value_status,
                  m.zero_semantics, m.raw_cell_text, m.original_class, m.normalized_class
           from measurements m
           join source_records r on r.id = m.source_record_id
           left join observation_units u on u.source_record_id = r.id"""
    )
    return {
        "evidence_records": one(db, "select count(*) from evidence_records"),
        "measurement_evidence_is_view": True,
        "note": "Le misure restano nella loro tabella. Non sono state duplicate 8,7 milioni di volte.",
    }


def patterns(db: sqlite3.Connection) -> None:
    db.execute("delete from pattern_assessments where store = 'label_patterns'")
    db.execute(
        """insert into pattern_assessments (store, pattern_key, scientific_status, reason_code, independent_replication, association_class, p_value)
           select 'label_patterns', pattern_key, 'NOT_VALIDATABLE', 'LEGACY_MODULO_SPLIT_NOT_GROUP_AWARE', 0, 'ASSOCIATION', null
           from label_patterns"""
    )
    db.execute("delete from pattern_assessments where store = 'pattern_candidates'")
    db.execute(
        """insert into pattern_assessments (store, pattern_key, scientific_status, reason_code, independent_replication, association_class, p_value)
           select 'pattern_candidates', pattern_key,
             case when lifecycle = 'SUPPORTED' then 'INSUFFICIENT_EVIDENCE' else 'CANDIDATE' end,
             'LEGACY_MODULO_SPLIT_NOT_GROUP_AWARE', 0, 'ASSOCIATION', null
           from pattern_candidates"""
    )
    db.execute("drop view if exists pattern_registry")
    db.execute(
        """create view pattern_registry as
           select a.store, a.pattern_key as pattern_id, a.scientific_status, a.reason_code,
                  a.association_class, a.p_value, a.independent_replication
           from pattern_assessments a"""
    )


def targets_and_models(db: sqlite3.Connection) -> dict:
    def observed(compound: str) -> int:
        return one(
            db,
            """select count(*) from measurements m
               where lower(m.compound) = ? and m.value is not null""",
            (compound,),
        )

    def groups(compound: str) -> int:
        return one(
            db,
            """select count(distinct u.independence_group)
               from measurements m
               join observation_units u on u.source_record_id = m.source_record_id
               where lower(m.compound) = ? and m.value is not null and u.unit_kind = 'LAB_SAMPLE'""",
            (compound,),
        )

    specs = [
        ("sample_thca", "THCA on a labeled sample", "CONTINUOUS", "% or source unit", "chemistry", "thca", ["thca", "total_thc", "delta_9_thc"]),
        ("sample_cbd", "CBD on a labeled sample", "CONTINUOUS", "% or source unit", "chemistry", "cbd", ["cbd", "cbda", "total_cbd"]),
        ("sample_cbg", "CBG on a labeled sample", "CONTINUOUS", "% or source unit", "chemistry", "cbg", ["cbg", "cbga"]),
        ("sample_terpene_named", "A named terpene on a labeled sample", "CONTINUOUS", "% or source unit", "chemistry", "beta_myrcene", ["beta_myrcene", "total_terpenes"]),
        ("cultivar_thc", "THC of a cultivar, not of one label", "CONTINUOUS", None, "identity", "thca", ["thca", "delta_9_thc", "total_thc"]),
        ("flavonoid_concentration", "Flavonoid concentration", "CONTINUOUS", None, "chemistry", None, ["flavonoid"]),
        ("anthocyanin_concentration", "Anthocyanin concentration", "CONTINUOUS", None, "chemistry", None, ["anthocyanin"]),
        ("flowering_duration", "Flowering duration in days", "CONTINUOUS", "days", "phenology", None, ["flowering_duration"]),
        ("disease_susceptibility", "Disease susceptibility", "BINARY", None, "phenotype", None, ["disease"]),
        ("genomic_identity", "Genomic identity of two names", "BINARY", None, "genomics", None, ["variant", "genotype"]),
    ]
    db.execute("delete from prediction_targets")
    db.execute("delete from target_feature_policy")
    rows = []
    for target_id, name, target_type, unit, domain, compound, forbidden in specs:
        if compound is None:
            status = "NOT_AVAILABLE"
            obs = 0
            indep = 0
        else:
            obs = observed(compound)
            indep = groups(compound)
            if obs == 0:
                status = "NOT_AVAILABLE"
            elif target_id.startswith("cultivar"):
                status = "INSUFFICIENT_DATA"
            else:
                status = "MODEL_UNCALIBRATED"
        rows.append(
            (
                target_id,
                name,
                "Target definition. Status is computed from observed rows and model registry, not from a strain name.",
                target_type,
                unit,
                domain,
                "Observed measurement with provenance. Qualifiers are not numeric targets.",
                500,
                100,
                2,
                "non_target_features",
                "|".join(forbidden),
                "The target column and its totals are leakage.",
                1,
                1,
                status,
            )
        )
        for feature in forbidden:
            db.execute(
                "insert into target_feature_policy (target_id, feature_name, feature_role) values (?, ?, 'LEAKAGE_FORBIDDEN')",
                (target_id, feature),
            )
    db.executemany(
        """insert into prediction_targets
           (target_id, name, description, target_type, unit, domain, measurement_definition,
            minimum_sample_count, minimum_independent_samples, minimum_independent_sources,
            allowed_features, forbidden_features, leakage_rules, calibration_required, ood_required, status)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    features = [
        ("identity_status", "IDENTITY", "OBSERVED"),
        ("reported_parent_count", "PEDIGREE", "OBSERVED"),
        ("sample_independence_group", "SOURCE", "OBSERVED"),
        ("cannabinoid_measurement", "CHEMISTRY", "OBSERVED"),
        ("terpene_measurement", "TERPENE", "OBSERVED"),
        ("flavonoid_measurement", "FLAVONOID", "OBSERVED"),
        ("anthocyanin_measurement", "ANTHOCYANIN", "OBSERVED"),
        ("declared_flowering_text", "PHENOLOGY", "OBSERVED"),
        ("lab_name", "LAB", "CONTEXT"),
        ("source_id", "SOURCE", "CONTEXT"),
    ]
    db.execute("delete from feature_definitions")
    db.executemany(
        """insert into feature_definitions (feature_id, name, category, derived_or_observed, snapshot_id)
           values (?, ?, ?, ?, ?)""",
        [(name, name, category, kind, SNAPSHOT) for name, category, kind in features],
    )
    # Diagnostic baseline: median of THCA on a hash bucket of independence groups.
    # Not promoted. Identity of the label is not a genotype.
    sample = db.execute(
        """select u.independence_group as g, r.source_id as source, m.value as value
           from measurements m
           join source_records r on r.id = m.source_record_id
           join observation_units u on u.source_record_id = r.id
           where lower(m.compound) = 'thca' and m.value is not null and u.unit_kind = 'LAB_SAMPLE'
             and m.id % 200 = 0
           limit 8000"""
    ).fetchall()
    # The modulo above only thins rows for a diagnostic read. The split below is by group hash.
    grouped: dict[str, list[float]] = {}
    sources: dict[str, str] = {}
    for group, source, value in sample:
        grouped.setdefault(str(group), []).append(float(value))
        sources[str(group)] = str(source)
    train, test = [], []
    source_ids = set()
    for group, values in grouped.items():
        digest = hashlib.sha256(f"group|{group}".encode()).digest()[0]
        mean = sum(values) / len(values)
        if digest % 10 <= 6:
            train.append(mean)
        elif digest % 10 >= 9:
            test.append(mean)
        source_ids.add(sources[group])
    train_sorted = sorted(train)
    median = train_sorted[len(train_sorted) // 2] if train_sorted else None
    mae = None
    if median is not None and test:
        mae = sum(abs(value - median) for value in test) / len(test)
    db.execute("insert into model_registry (model_id, name, role) values ('baseline-median', 'Baseline median', 'DIAGNOSTIC') on conflict(model_id) do nothing")
    db.execute("delete from model_versions where model_id = 'baseline-median'")
    db.execute(
        """insert into model_versions
           (model_id, version, algorithm, target_id, training_snapshot, feature_schema, split_strategy, hyperparameters,
            metrics_json, calibration_status, ood_method, status, production_eligible, limitations)
           values ('baseline-median', '0.1.0', 'BaselineMedianModel', 'sample_thca', ?, 'gg-features-1', 'GROUP_SPLIT',
                   'none', ?, 'NOT_CALIBRATED', 'support_count_only', 'EVALUATED', 0, ?)""",
        (
            SNAPSHOT,
            json.dumps(
                {
                    "train_groups": len(train),
                    "test_groups": len(test),
                    "independent_sources_in_sample": len(source_ids),
                    "mae_vs_train_median": mae,
                    "median": median,
                    "r2": None,
                    "note": "Row thinning used id % 200 only to bound the diagnostic read. Split assignment is sha256(group), not id % 5.",
                }
            ),
            "Label is a product name, not a genotype. No interval. Not a cultivar prediction. Same-sample chemistry was not used as a feature, so this is only a constant baseline.",
        ),
    )
    db.execute(
        """insert into training_runs
           (run_id, model_id, target_id, split_strategy, training_groups, validation_groups, test_groups, independent_sources, leakage_blocked, status, snapshot_id, note)
           values ('run-baseline-median-thca', 'baseline-median', 'sample_thca', 'GROUP_SPLIT', ?, 0, ?, ?, 1, 'EVALUATED', ?, ?)""",
        (
            len(train),
            len(test),
            len(source_ids),
            SNAPSHOT,
            "Constant baseline. Leakage features were not inputs. Not production.",
        ),
    )
    db.execute(
        """insert into calibration_runs (calibration_id, model_id, method, status, coverage, snapshot_id)
           values ('cal-baseline-median-thca', 'baseline-median', null, 'NOT_CALIBRATED', null, ?)
           on conflict(calibration_id) do update set status = 'NOT_CALIBRATED', coverage = null""",
        (SNAPSHOT,),
    )
    return {
        "targets": [dict(zip(["target_id", "status"], row)) for row in db.execute("select target_id, status from prediction_targets order by 1")],
        "diagnostic_train_groups": len(train),
        "diagnostic_test_groups": len(test),
        "diagnostic_mae": mae,
        "production_models": one(db, "select count(*) from model_versions where status = 'PRODUCTION'"),
    }


def quality(db: sqlite3.Connection) -> list[dict]:
    db.execute("delete from data_quality_reports where snapshot_id = ?", (SNAPSHOT,))
    reports = []
    for source_id, license_status, access in db.execute("select source_id, license, access_status from source_registry"):
        rows = one(db, "select count(*) from source_records where source_id = ?", (source_id,))
        payload = {
            "row_count": rows,
            "valid_rows": rows,
            "invalid_rows": 0,
            "license_status": license_status,
            "access_status": access,
            "qualified_values": one(
                db,
                """select count(*) from measurements m join source_records r on r.id = m.source_record_id
                   where r.source_id = ? and m.qualifier is not null""",
                (source_id,),
            )
            if rows
            else 0,
            "zero_values": one(
                db,
                """select count(*) from measurements m join source_records r on r.id = m.source_record_id
                   where r.source_id = ? and m.zero_semantics = 'SOURCE_REPORTED_ZERO'""",
                (source_id,),
            )
            if rows
            else 0,
            "unit_known": one(
                db,
                """select count(*) from measurements m join source_records r on r.id = m.source_record_id
                   where r.source_id = ? and m.unit_status = 'KNOWN'""",
                (source_id,),
            )
            if rows
            else 0,
            "raw_cell_filled": one(
                db,
                """select count(*) from measurements m join source_records r on r.id = m.source_record_id
                   where r.source_id = ? and m.raw_cell_text is not null""",
                (source_id,),
            )
            if rows
            else 0,
        }
        reports.append({"source_id": source_id, **payload})
        db.execute(
            "insert into data_quality_reports (source_id, row_count, report_json, snapshot_id, created_at) values (?, ?, ?, ?, ?)",
            (source_id, rows, json.dumps(payload), SNAPSHOT, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        )
    return reports


def main() -> None:
    started = time.time()
    db = sqlite3.connect(DB_PATH)
    db.execute("pragma journal_mode=wal")
    db.execute("pragma synchronous=normal")
    print("backup", flush=True)
    backup(db)
    before = counts(db)
    print("schema", flush=True)
    schema(db)
    db.execute(
        """update identity_decisions
           set created_snapshot_id = coalesce(created_snapshot_id, ?),
               review_status = coalesce(review_status, 'AUTOMATIC_NOT_REVIEWED')
           where created_snapshot_id is null or review_status is null""",
        (PREVIOUS,),
    )
    db.execute(
        """update source_registry
           set access_status = case
                 when redistribution_status = 'rejected' then 'BLOCKED'
                 when redistribution_status = 'access_blocked' then 'BLOCKED'
                 when redistribution_status = 'not_ingested' then 'UNKNOWN'
                 when license like '%CC BY 4.0%' then 'CC_BY'
                 when license like '%CC0%' then 'CC0'
                 else 'UNKNOWN'
               end,
               independence_group = source_id,
               usage_notes = coalesce(usage_notes, reason)
           where access_status is null or independence_group is null"""
    )
    print("values", flush=True)
    value_status(db)
    db.commit()
    print("raw", flush=True)
    ingest = load_ingest()
    raw_report = backfill_raw(db, ingest)
    print("graph", flush=True)
    graph_report = compounds_and_graph(db)
    print("evidence", flush=True)
    evidence_report = evidence(db)
    patterns(db)
    print("models", flush=True)
    model_report = targets_and_models(db)
    print("quality", flush=True)
    quality_report = quality(db)
    db.execute(
        """insert into genomic_datasets (dataset_id, source, access_status, cultivar_link, note)
           values ('none', null, 'NOT_AVAILABLE', 'CULTIVAR_LINK_NOT_ESTABLISHED',
                   'No legally retrieved genomic dataset is linked to a cultivar in this snapshot.')
           on conflict(dataset_id) do nothing"""
    )
    after = counts(db)
    loss = {key: after[key] - before[key] for key in before if key != "graph_edges"}
    if any(delta != 0 for delta in loss.values()):
        raise SystemExit(f"ROW LOSS {loss}")
    orphans = {
        "measurements_without_record": one(db, "select count(*) from measurements m left join source_records r on r.id = m.source_record_id where r.id is null"),
        "claims_without_record": one(db, "select count(*) from claims c left join source_records r on r.id = c.source_record_id where r.id is null"),
        "qualified_with_value": one(db, "select count(*) from measurements where qualifier is not null and value is not null"),
        "nd_as_zero": one(db, "select count(*) from measurements where qualifier = 'ND' and value = 0"),
        "exact_identity": one(db, "select count(*) from identity_decisions where status = 'EXACT_IDENTITY'"),
        "flavonoid_rows": one(db, "select count(*) from measurements where normalized_class = 'FLAVONOID'"),
        "anthocyanin_rows": one(db, "select count(*) from measurements where normalized_class = 'ANTHOCYANIN'"),
        "production_models": one(db, "select count(*) from model_versions where production_eligible = 1"),
    }
    integrity = db.execute("pragma integrity_check").fetchone()[0]
    fk = db.execute("pragma foreign_key_check").fetchall()
    db.commit()
    try:
        db.execute("pragma wal_checkpoint(truncate)")
    except sqlite3.OperationalError as exc:
        print("checkpoint skipped", exc, flush=True)
    digest = hashlib.sha256()
    with DB_PATH.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    db.execute(
        """insert into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
           values (?, ?, ?, ?)
           on conflict(snapshot_id) do update set note = excluded.note""",
        (
            SNAPSHOT,
            after["source_records"],
            after["measurements"],
            "Phase 3. Raw cell text backfill, evidence index, prediction registry. 000004 unchanged. Prediction not production.",
        ),
    )
    db.execute(
        """insert into snapshot_manifests
           (snapshot_id, created_at, schema_version, parent_snapshot_id, dataset_hash, embedding_model, embedding_version,
            embedding_dimension, prediction_model_versions, calibration_versions, feature_schema_version, immutable, note)
           values (?, ?, 'gg-schema-3', ?, ?, 'gg-hashing-trick-v1', '1', 64, 'baseline-median@0.1.0', null, 'gg-features-1', 1, ?)
           on conflict(snapshot_id) do update set dataset_hash = excluded.dataset_hash, note = excluded.note""",
        (
            SNAPSHOT,
            now,
            PREVIOUS,
            digest.hexdigest(),
            "Hash is the SQLite file after checkpoint. It is not a claim that every scientific conflict is resolved.",
        ),
    )
    db.execute(
        """insert into jobs (job_type, job_status, input_snapshot, output_snapshot, started_at, completed_at, finished_at, error, retry_count, worker_version, input_hash)
           values ('phase3_migrate', 'SUCCEEDED', ?, ?, ?, ?, ?, null, 0, 'gg-worker-0.1.0', ?)""",
        (PREVIOUS, SNAPSHOT, now, now, now, digest.hexdigest()),
    )
    db.execute(
        """insert into audit_chain (audit_event, actor, created_at, input_snapshot, output_snapshot, version)
           values ('phase3_migrate', 'system', ?, ?, ?, 'gg-worker-0.1.0')""",
        (now, PREVIOUS, SNAPSHOT),
    )
    db.commit()
    gap = dict(
        zip(
            ["declared_rows", "records_in_file", "gap_count", "reason_code"],
            db.execute("select declared_rows, records_in_file, gap_count, reason_code from catalog_gaps limit 1").fetchone(),
        )
    )
    report = {
        "snapshot_id": SNAPSHOT,
        "previous_snapshot_untouched": PREVIOUS,
        "seconds": round(time.time() - started, 1),
        "before": before,
        "after": after,
        "information_loss": False,
        "raw": raw_report,
        "graph": graph_report,
        "evidence": evidence_report,
        "models": model_report,
        "quality_sources": len(quality_report),
        "orphans": orphans,
        "integrity_check": integrity,
        "foreign_key_violations": len(fk),
        "foreign_key_note": "Physical FOREIGN KEY rebuild of measurements was not executed. Orphan scan is the check. New genomic tables have foreign keys.",
        "catalog_gap": gap,
        "postgres": "NOT_CONFIGURED",
        "redis": "NOT_CONFIGURED",
        "worker": "CLI_NOT_DAEMON",
        "backup": str(BACKUP),
        "blockers": [
            {"class": "DATA_BLOCKER", "item": "genomics", "status": "NOT_AVAILABLE"},
            {"class": "DATA_BLOCKER", "item": "flavonoids", "status": "NOT_AVAILABLE"},
            {"class": "DATA_BLOCKER", "item": "anthocyanins", "status": "NOT_AVAILABLE"},
            {"class": "SCIENTIFIC_BLOCKER", "item": "prediction", "status": "NOT_COMPUTABLE"},
            {"class": "INFRASTRUCTURE_BLOCKER", "item": "postgres", "status": "DATABASE_URL unset"},
            {"class": "INFRASTRUCTURE_BLOCKER", "item": "redis", "status": "REDIS_URL unset"},
            {"class": "INFRASTRUCTURE_BLOCKER", "item": "https_public_host", "status": "NOT_READY"},
            {"class": "EXTERNAL_DEPENDENCY", "item": "semantic_embedding_model", "status": "hash baseline only"},
            {"class": "DATA_BLOCKER", "item": "catalog_551", "status": gap},
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps({"snapshot": SNAPSHOT, "seconds": report["seconds"], "raw": raw_report["status"], "integrity": integrity}, indent=2))
    db.close()


if __name__ == "__main__":
    main()
