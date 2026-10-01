#!/usr/bin/env python3
"""Normalize the already ingested foundation database.

Does not delete source_records, measurements, claims, or raw files.
Does not turn null into zero. Does not merge different samples.
"""

from __future__ import annotations

import json
import sqlite3
import struct
import time
import unicodedata
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "gg-foundation.sqlite"
CATALOG = ROOT / "data" / "catalog.json"
OUT = ROOT / "data" / "foundation-normalized.json"
SNAPSHOT = "gg-foundation-1"

PUBLICATIONS = [
    ("src-demeijer-2003", "de Meijer et al. 2003", "https://doi.org/10.1093/genetics/163.1.335", "Genetics", "citation_only"),
    ("src-demeijer-2009", "de Meijer, Hammond & Sutton 2009", "https://doi.org/10.1007/s10681-009-9894-7", "Euphytica", "citation_only"),
    ("src-demeijer-2016", "de Meijer & Hammond 2016", "https://doi.org/10.1007/s10681-016-1721-3", "Euphytica", "citation_only"),
    ("src-vanbakel-2011", "van Bakel et al. 2011", "https://doi.org/10.1186/gb-2011-12-10-r102", "Genome Biology", "citation_only"),
    ("src-laverty-2019", "Laverty et al. 2019", "https://doi.org/10.1101/gr.242594.118", "Genome Research", "citation_only"),
    ("src-grassa-2021", "Grassa et al. 2021", "https://doi.org/10.1111/nph.17243", "New Phytologist", "citation_only"),
    ("src-kim-2025", "Kim et al. 2025", "https://doi.org/10.1186/s42238-025-00311-w", "Journal of Cannabis Research", "citation_only"),
    ("src-gagalova-2024", "Gagalova et al. 2024", "https://doi.org/10.1002/pld3.70016", "Plant Direct", "citation_only"),
    ("src-sarma-2020", "Sarma et al. 2020", "https://doi.org/10.1021/acs.jnatprod.9b01200", "Journal of Natural Products", "citation_only"),
    ("src-sensi-bd-2018", "Sensi Seeds — Black Domina, 2018/2020", "https://sensiseeds.com/en/blog/black-domina-with-the-power-of-the-four-indica-hearts/", "Sensi Seeds", "citation_only"),
]


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("®", "").replace("'", "").replace("’", "")
    text = re.sub(r"[#_./]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"^(the|strain)\s+", "", text)


def signed(n: int) -> int:
    n &= 0xFFFFFFFF
    return n - 0x100000000 if n >= 0x80000000 else n


def fnv(text: str) -> int:
    h = signed(0x811C9DC5)
    for unit in text.encode("utf-16-le"):
        pass
    units = memoryview(text.encode("utf-16-le")).cast("H")
    for unit in units:
        h = signed(h ^ unit)
        h = signed(h * 0x01000193)
    return h & 0xFFFFFFFF


def embed(text: str) -> list[float]:
    dims = 64
    vector = [0.0] * dims
    tokens = [token for token in normalize(text).split(" ") if token]
    grams: set[str] = set()
    for token in tokens:
        grams.add(f"w:{token}")
        padded = f" {token} "
        for i in range(len(padded) - 2):
            grams.add(f"c:{padded[i:i+3]}")
    for gram in grams:
        h = fnv(gram)
        slot = h % dims
        vector[slot] += 1 if (h & 1) == 0 else -1
    norm = sum(x * x for x in vector) ** 0.5 or 1
    return [x / norm for x in vector]


def one(db: sqlite3.Connection, sql: str) -> int:
    return int(db.execute(sql).fetchone()[0])


def main() -> None:
    started = time.time()
    db = sqlite3.connect(DB)
    before = {
        "source_records": one(db, "select count(*) from source_records"),
        "measurements": one(db, "select count(*) from measurements"),
        "numeric_measurements": one(db, "select count(*) from measurements where value is not null"),
        "qualifiers": one(db, "select count(*) from measurements where qualifier is not null"),
        "claims": one(db, "select count(*) from claims"),
        "canonical_entities": one(db, "select count(*) from canonical_entities"),
    }
    db.executescript(
        """
        drop view if exists cannabinoids;
        drop view if exists terpenes;
        drop view if exists flavonoids;
        drop view if exists anthocyanins;
        drop view if exists metabolites;
        drop view if exists measurement_trace;
        drop table if exists aliases;
        drop table if exists breeders;
        drop table if exists seedbanks;
        drop table if exists pedigree_edges;
        drop table if exists phenotypes;
        drop table if exists morphology;
        drop table if exists phenology;
        drop table if exists samples;
        drop table if exists files;
        drop table if exists datasets;
        drop table if exists publications;
        drop table if exists genomic_samples;
        drop table if exists variants;
        drop table if exists expression_data;
        drop table if exists predictions;
        drop table if exists identity_resolution;
        drop table if exists entity_vectors;
        drop table if exists semantic_cache;
        drop table if exists knowledge_snapshots;

        create table datasets (
          dataset_id text primary key,
          name text not null,
          url text,
          license text,
          redistribution_status text not null,
          records_ingested integer not null,
          reason text not null
        );
        create table files (
          id integer primary key,
          dataset_id text not null,
          file_name text not null,
          row_count integer not null
        );
        create table breeders (
          id integer primary key,
          name text not null unique,
          name_norm text not null
        );
        create table seedbanks (
          id integer primary key,
          name text not null
        );
        create table aliases (
          id integer primary key,
          canonical_id integer not null,
          source_record_id integer not null,
          alias text not null,
          alias_norm text not null
        );
        create table samples (
          id integer primary key,
          source_record_id integer not null unique,
          sample_key text,
          lab text,
          tested_at text,
          file_name text,
          row_number integer
        );
        create table pedigree_edges (
          id integer primary key,
          child_record_id integer not null,
          child_canonical_id integer,
          parent_text text not null,
          parent_norm text not null,
          parent_canonical_id integer,
          relationship_type text not null,
          identity_status text not null
        );
        create table phenotypes (
          id integer primary key,
          source_record_id integer not null,
          field text not null,
          original_text text not null,
          claim_status text not null
        );
        create table morphology (
          id integer primary key,
          source_record_id integer,
          original_text text
        );
        create table phenology (
          id integer primary key,
          source_record_id integer not null,
          field text not null,
          original_text text not null,
          claim_status text not null
        );
        create table publications (
          id text primary key,
          name text not null,
          url text,
          publisher text,
          usage text not null
        );
        create table genomic_samples (id integer primary key, note text);
        create table variants (id integer primary key, note text);
        create table expression_data (id integer primary key, note text);
        create table predictions (
          id integer primary key,
          note text not null
        );
        create table identity_resolution (
          source_record_id integer primary key,
          status text not null,
          canonical_id integer,
          prior_status text not null
        );
        create table entity_vectors (
          canonical_id integer primary key,
          dims integer not null,
          vector blob not null
        );
        create table semantic_cache (
          id integer primary key,
          query text not null,
          normalized_query text not null,
          embedding blob,
          retrieved_json text not null,
          evidence_json text not null,
          answer text not null,
          source_refs text not null,
          snapshot_id text not null,
          confidence real,
          created_at text not null,
          invalidation_status text not null
        );
        create table knowledge_snapshots (
          snapshot_id text primary key,
          raw_records integer not null,
          measurements integer not null,
          note text not null
        );
        """
    )
    db.execute("insert into datasets select source_id, name, url, license, redistribution_status, records_ingested, reason from source_registry")
    db.execute(
        "insert into files (dataset_id, file_name, row_count) select source_id, coalesce(file_name, ''), count(*) from source_records group by source_id, file_name"
    )
    db.execute(
        """insert into samples (source_record_id, sample_key, lab, tested_at, file_name, row_number)
           select id, sample_id, lab, tested_at, file_name, row_number
           from source_records where source_id = 'src-cannlytics-results'"""
    )
    db.execute(
        """insert into identity_resolution (source_record_id, status, canonical_id, prior_status)
           select r.id,
             case r.match_status
               when 'SOURCE_RECORD' then 'CANONICAL_MATCH'
               when 'CANONICAL_MATCH' then 'CANONICAL_MATCH'
               when 'POSSIBLE_MATCH' then 'POSSIBLE_MATCH'
               when 'CONFLICTING_IDENTITY' then 'CONFLICTING_IDENTITY'
               else 'UNRESOLVED'
             end,
             l.canonical_id,
             r.match_status
           from source_records r
           left join entity_links l on l.source_record_id = r.id"""
    )
    breeders = db.execute("select distinct breeder from source_records where breeder is not null and breeder != ''").fetchall()
    db.executemany("insert into breeders (name, name_norm) values (?, ?)", [(name, normalize(name)) for (name,) in breeders])
    db.executemany("insert into publications (id, name, url, publisher, usage) values (?, ?, ?, ?, ?)", PUBLICATIONS)
    db.execute(
        "insert into knowledge_snapshots (snapshot_id, raw_records, measurements, note) values (?, ?, ?, ?)",
        (SNAPSHOT, before["source_records"], before["measurements"], "Snapshot dei dati ingeriti. Le predizioni operative restano in gg_predictions e non sono state riscritte."),
    )
    db.execute("insert into predictions (note) values (?)", ("Nessuna predizione è stata copiata qui. Lo storico operativo resta nella tabella gg_predictions dell'app, solo in inserimento.",))

    catalog = json.loads(CATALOG.read_text())
    by_external = {
        row[0]: row[1]
        for row in db.execute("select source_record_id, id from source_records where source_id = 'src-ci-strains-pro'")
    }
    canonical_of = {
        row[0]: row[1]
        for row in db.execute(
            """select r.source_record_id, l.canonical_id
               from source_records r join entity_links l on l.source_record_id = r.id
               where r.source_id = 'src-ci-strains-pro'"""
        )
    }
    name_index: dict[str, list[int]] = {}
    for cid, norm in db.execute("select id, name_norm from canonical_entities"):
        name_index.setdefault(norm, []).append(cid)
    alias_rows = []
    pheno_rows = []
    flower_rows = []
    for row in catalog["records"]:
        rid = by_external.get(row["id"])
        cid = canonical_of.get(row["id"])
        if not rid or not cid:
            continue
        alias = (row.get("alias") or "").strip()
        if alias:
            alias_rows.append((cid, rid, alias, normalize(alias)))
        kind = (row.get("kind") or "").strip()
        if kind:
            pheno_rows.append((rid, "declared_type", kind, "DOCUMENTED"))
        if row.get("auto"):
            pheno_rows.append((rid, "autoflower_flag", "autoflower dichiarato in catalogo", "DOCUMENTED"))
        flower = (row.get("flower") or "").strip()
        if flower:
            flower_rows.append((rid, "flowering_days_declared", flower, "DOCUMENTED"))
    db.executemany("insert into aliases (canonical_id, source_record_id, alias, alias_norm) values (?, ?, ?, ?)", alias_rows)
    db.executemany("insert into phenotypes (source_record_id, field, original_text, claim_status) values (?, ?, ?, ?)", pheno_rows)
    db.executemany("insert into phenology (source_record_id, field, original_text, claim_status) values (?, ?, ?, ?)", flower_rows)

    pedigree = []
    for claim_id, record_id, text in db.execute("select id, source_record_id, claim_text from claims where field = 'reported_parents'"):
        child = db.execute("select canonical_id from entity_links where source_record_id = ?", (record_id,)).fetchone()
        child_id = child[0] if child else None
        for part in str(text).split(" × "):
            parent = part.strip()
            if not parent:
                continue
            norm = normalize(parent)
            hits = list(dict.fromkeys(name_index.get(norm, [])))
            if len(hits) == 1:
                status, parent_id = "POSSIBLE_MATCH", hits[0]
            elif len(hits) > 1:
                status, parent_id = "CONFLICTING_IDENTITY", None
            else:
                status, parent_id = "UNRESOLVED", None
            pedigree.append((record_id, child_id, parent, norm, parent_id, "reported_parent", status))
    db.executemany(
        """insert into pedigree_edges
           (child_record_id, child_canonical_id, parent_text, parent_norm, parent_canonical_id, relationship_type, identity_status)
           values (?, ?, ?, ?, ?, ?, ?)""",
        pedigree,
    )

    vectors = []
    for cid, name in db.execute("select id, display_name from canonical_entities"):
        blob = struct.pack(f"<{64}f", *embed(name))
        vectors.append((cid, 64, blob))
    db.executemany("insert into entity_vectors (canonical_id, dims, vector) values (?, ?, ?)", vectors)

    db.executescript(
        """
        create index idx_alias_norm on aliases (alias_norm);
        create index idx_breeder_norm on breeders (name_norm);
        create index idx_records_breeder on source_records (breeder);
        create index idx_pedigree_child on pedigree_edges (child_canonical_id);
        create index idx_pedigree_parent on pedigree_edges (parent_norm);
        create index idx_identity_status on identity_resolution (status);
        create index idx_measure_klass on measurements (klass, compound);
        create index idx_sample_key on samples (sample_key);
        create index idx_cache_query on semantic_cache (normalized_query, snapshot_id, invalidation_status);
        create view cannabinoids as
          select id, source_record_id, compound, value, unit, qualifier, analysis
          from measurements where klass = 'CANNABINOID';
        create view terpenes as
          select id, source_record_id, compound, value, unit, qualifier, analysis
          from measurements where klass = 'TERPENE';
        create view flavonoids as
          select id, source_record_id, compound, value, unit, qualifier, analysis
          from measurements where klass = 'FLAVONOID';
        create view anthocyanins as
          select id, source_record_id, compound, value, unit, qualifier, analysis
          from measurements where klass = 'ANTHOCYANIN';
        create view metabolites as
          select id, source_record_id, compound, klass, value, unit, qualifier, analysis
          from measurements;
        create view measurement_trace as
          select m.id as measurement_id, m.compound, m.klass, m.value, m.qualifier,
                 r.id as source_record_id, r.source_record_id as external_id, r.source_id as dataset_id,
                 r.file_name, r.row_number, r.original_name, s.sample_key, l.canonical_id
          from measurements m
          join source_records r on r.id = m.source_record_id
          left join samples s on s.source_record_id = r.id
          left join entity_links l on l.source_record_id = r.id;
        """
    )
    after = {
        "source_records": one(db, "select count(*) from source_records"),
        "measurements": one(db, "select count(*) from measurements"),
        "numeric_measurements": one(db, "select count(*) from measurements where value is not null"),
        "qualifiers": one(db, "select count(*) from measurements where qualifier is not null"),
        "claims": one(db, "select count(*) from claims"),
        "canonical_entities": one(db, "select count(*) from canonical_entities"),
    }
    if before != after:
        raise SystemExit(f"PERDITA: {before} -> {after}")
    trace = one(db, "select count(*) from measurement_trace")
    if trace != before["measurements"]:
        raise SystemExit(f"TRACCIA INCOMPLETA {trace} != {before['measurements']}")
    distinct = one(
        db,
        """select count(*) from canonical_entities c
           where exists (
             select 1 from canonical_entities o
             where o.name_norm = c.name_norm and o.id != c.id and ifnull(o.breeder, '') != ifnull(c.breeder, '')
           )""",
    )
    report = {
        "snapshot_id": SNAPSHOT,
        "raw_records_unchanged": after["source_records"],
        "measurements_unchanged": after["measurements"],
        "numeric_measurements_unchanged": after["numeric_measurements"],
        "qualifiers_unchanged": after["qualifiers"],
        "claims_unchanged": after["claims"],
        "canonical_entities": after["canonical_entities"],
        "trace_rows": trace,
        "information_loss": False,
        "aliases": one(db, "select count(*) from aliases"),
        "breeders": one(db, "select count(*) from breeders"),
        "seedbanks": one(db, "select count(*) from seedbanks"),
        "samples": one(db, "select count(*) from samples"),
        "files": one(db, "select count(*) from files"),
        "datasets": one(db, "select count(*) from datasets"),
        "pedigree_edges": one(db, "select count(*) from pedigree_edges"),
        "pedigree_unresolved": one(db, "select count(*) from pedigree_edges where identity_status = 'UNRESOLVED'"),
        "pedigree_possible": one(db, "select count(*) from pedigree_edges where identity_status = 'POSSIBLE_MATCH'"),
        "pedigree_conflicts": one(db, "select count(*) from pedigree_edges where identity_status = 'CONFLICTING_IDENTITY'"),
        "phenotypes": one(db, "select count(*) from phenotypes"),
        "phenology": one(db, "select count(*) from phenology"),
        "morphology": one(db, "select count(*) from morphology"),
        "publications": one(db, "select count(*) from publications"),
        "genomic_samples": one(db, "select count(*) from genomic_samples"),
        "variants": one(db, "select count(*) from variants"),
        "expression_rows": one(db, "select count(*) from expression_data"),
        "entity_vectors": one(db, "select count(*) from entity_vectors"),
        "semantic_cache_rows": one(db, "select count(*) from semantic_cache"),
        "vector_backend": "in_process_cosine_v1",
        "pgvector": False,
        "identity": {
            row[0]: row[1]
            for row in db.execute("select status, count(*) from identity_resolution group by 1")
        },
        "distinct_entities_same_name_different_breeder": distinct,
        "cannabinoid_view": one(db, "select count(*) from cannabinoids"),
        "terpene_view": one(db, "select count(*) from terpenes"),
        "flavonoid_view": one(db, "select count(*) from flavonoids"),
        "anthocyanin_view": one(db, "select count(*) from anthocyanins"),
        "seconds": round(time.time() - started, 1),
        "database_bytes": DB.stat().st_size,
    }
    db.commit()
    db.close()
    OUT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
