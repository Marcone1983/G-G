#!/usr/bin/env python3
"""Ingest legally downloaded sources into data/gg-foundation.sqlite.

Raw CSVs stay on disk. The database indexes them. Empty cells are not zeroes.
Conflicting names are not merged. Patterns are never marked VALIDATED.
"""

from __future__ import annotations

import ast
import csv
import hashlib
import json
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cannlytics"
CATALOG = ROOT / "data" / "catalog.json"
DB_PATH = ROOT / "data" / "gg-foundation.sqlite"
METRICS = ROOT / "data" / "foundation-metrics.json"

PII = {
    "lab_phone",
    "lab_email",
    "lab_street",
    "lab_zipcode",
    "lab_address",
    "producer_address",
    "producer_street",
    "producer_zipcode",
    "distributor_address",
    "distributor_street",
    "distributor_zipcode",
    "lab_image_url",
    "images",
}

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


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("®", "").replace("'", "").replace("’", "")
    text = re.sub(r"[#_./]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^(the|strain)\s+", "", text)
    return text


def klass_of(compound: str, analysis: str | None) -> str:
    name = compound.lower()
    if name in CANNABINOIDS:
        return "CANNABINOID"
    if name in TERPENES:
        return "TERPENE"
    blob = f"{analysis or ''} {compound}".lower()
    if "flavon" in blob:
        return "FLAVONOID"
    if "anthocyan" in blob:
        return "ANTHOCYANIN"
    if "pesticide" in blob:
        return "PESTICIDE"
    if "heavy_metal" in blob or "heavy metal" in blob:
        return "HEAVY_METAL"
    if "solvent" in blob:
        return "RESIDUAL_SOLVENT"
    if "microb" in blob or "mycotoxin" in blob:
        return "MICROBE"
    if "terp" in blob:
        return "TERPENE"
    if "cannab" in blob or name.startswith(("thc", "cbd", "cbg", "cbn", "cbc")):
        return "CANNABINOID"
    return "OTHER"


def parse_value(raw: object) -> tuple[float | None, str | None]:
    if raw is None or isinstance(raw, bool):
        return None, None
    if isinstance(raw, (int, float)):
        if raw != raw:
            return None, None
        return float(raw), None
    text = str(raw).strip()
    if not text or text.lower() in {"n/a", "na", "none", "null", "-", "*not d9"}:
        return None, None
    upper = text.upper()
    if "LOQ" in upper or "LOD" in upper or upper in {"ND", "NT", "BLOQ"}:
        return None, text
    try:
        return float(text.replace("%", "").replace(",", "")), None
    except ValueError:
        return None, None


def connect() -> sqlite3.Connection:
    if DB_PATH.exists():
        DB_PATH.unlink()
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=OFF")
    db.executescript(
        """
        create table source_registry (
          source_id text primary key,
          name text not null,
          url text,
          license text,
          redistribution_status text not null,
          records_ingested integer not null,
          reason text not null,
          retrieved text
        );
        create table source_records (
          id integer primary key,
          source_id text not null,
          source_record_id text not null,
          file_name text,
          row_number integer,
          original_name text,
          name_norm text,
          breeder text,
          lab text,
          independence_group text,
          sample_id text,
          tested_at text,
          content_hash text not null,
          match_status text not null
        );
        create table canonical_entities (
          id integer primary key,
          entity_key text not null unique,
          display_name text not null,
          name_norm text not null,
          breeder text,
          identity_status text not null
        );
        create table entity_links (
          source_record_id integer not null,
          canonical_id integer,
          match_status text not null
        );
        create table claims (
          id integer primary key,
          source_record_id integer not null,
          field text not null,
          claim_text text not null,
          claim_status text not null
        );
        create table measurements (
          id integer primary key,
          source_record_id integer not null,
          compound text not null,
          klass text not null,
          value real,
          unit text,
          qualifier text,
          analysis text
        );
        create table pattern_candidates (
          id integer primary key,
          pattern_key text not null,
          hypothesis text not null,
          lifecycle text not null,
          sample_size integer not null,
          independent_sources integer not null,
          discovery_n integer not null,
          validation_n integer not null,
          discovery_mean real,
          validation_mean real,
          effect_size real,
          confidence_interval text,
          promoted_to_validated integer not null
        );
        """
    )
    return db


def add_source(db: sqlite3.Connection, **row: object) -> None:
    db.execute(
        """insert into source_registry
        (source_id, name, url, license, redistribution_status, records_ingested, reason, retrieved)
        values (:source_id, :name, :url, :license, :redistribution_status, :records_ingested, :reason, :retrieved)""",
        row,
    )


def rejected(db: sqlite3.Connection) -> None:
    rows = [
        ("src-cannalib", "CannaLib", "https://cannalib.org/", None, "not_ingested", 0,
         "API anonima con rate limit. Header x-robots-tag noai. Il corpus pubblico è solo un conteggio aggregato, non un dump concesso. records_ingested resta 0.", "2026-09-30"),
        ("src-seedfinder", "Seedfinder", "https://seedfinder.eu/", None, "rejected", 0,
         "Nessun dump con licenza di riproduzione. Diritto sui database. Non copiato.", "2026-09-30"),
        ("src-phenodb", "PhenoDB", "https://phenodb.eu/", None, "rejected", 0,
         "Header x-robots-tag noai. Nessun dump aperto scaricato.", "2026-09-30"),
        ("src-strainpedia", "Strainpedia", "https://www.strainpedia.com/api/", None, "rejected", 0,
         "La URL è una pagina WordPress, non un dataset con licenza di copia massiva.", "2026-09-30"),
        ("src-strain-database", "Strain Database", "https://strain-database.com/", None, "rejected", 0,
         "Accesso dietro controllo anti-bot. Non aggirato.", "2026-09-30"),
        ("src-seed-city-scrape", "JonusNattapong cannabis-strains", "https://huggingface.co/datasets/JonusNattapong/cannabis-strains", "CC0 claimed by uploader", "rejected", 0,
         "Catalogo commerciale di Seed City copiato da terzi. La CC0 non è del titolare. Non ingerito.", "2026-09-30"),
        ("src-kushy", "Kushy cannabis-dataset", "https://github.com/kushyapp/cannabis-dataset", "MIT on repository", "rejected", 0,
         "Il CSV pubblica THC 127 e lunghe serie di zeri insieme a testi di marketing. Non è un certificato di laboratorio. Non ingerito come misura.", "2026-09-30"),
        ("src-snp-pdf", "RevGenomics Open Cannabis SNPs PDF", "https://future-cannabis.s3.amazonaws.com/downloads/RevGenomicsOpenCannabisSNPsData_v1_2.pdf", None, "rejected", 0,
         "PDF pubblico da 463930 byte senza licenza dichiarata negli header. Non copiato nel database.", "2026-09-30"),
        ("src-dryad-vergara-2020", "Vergara et al. 2020 Dryad", "https://doi.org/10.5061/dryad.sxksn0314", "CC0-1.0", "access_blocked", 0,
         "Licenza CC0 verificata sull'API Dryad. Il download dei file ha risposto 401. Nessun byte è stato salvato.", "2026-09-30"),
    ]
    for item in rows:
        add_source(
            db,
            source_id=item[0], name=item[1], url=item[2], license=item[3],
            redistribution_status=item[4], records_ingested=item[5], reason=item[6], retrieved=item[7],
        )


def catalog(db: sqlite3.Connection) -> dict[str, list[int]]:
    payload = json.loads(CATALOG.read_text())
    by_name: dict[str, list[int]] = {}
    records = 0
    for row in payload["records"]:
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        norm = normalize(name)
        breeder = row.get("breeder") or None
        key = f"{norm}|{normalize(breeder or '')}"
        entity = db.execute("select id from canonical_entities where entity_key = ?", (key,)).fetchone()
        if entity:
            canonical_id = int(entity[0])
            match = "CANONICAL_MATCH"
        else:
            status = "PROBABLE_IDENTITY" if breeder else "UNRESOLVED_IDENTITY"
            cur = db.execute(
                "insert into canonical_entities (entity_key, display_name, name_norm, breeder, identity_status) values (?, ?, ?, ?, ?)",
                (key, name, norm, breeder, status),
            )
            canonical_id = int(cur.lastrowid)
            match = "SOURCE_RECORD"
        by_name.setdefault(norm, []).append(canonical_id)
        digest = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
        cur = db.execute(
            """insert into source_records
            (source_id, source_record_id, file_name, row_number, original_name, name_norm, breeder, lab, independence_group, sample_id, tested_at, content_hash, match_status)
            values (?, ?, ?, ?, ?, ?, ?, null, ?, null, null, ?, ?)""",
            ("src-ci-strains-pro", row["id"], "data/catalog.json", records + 1, name, norm, breeder, "src-ci-strains-pro", digest, match),
        )
        rid = int(cur.lastrowid)
        db.execute("insert into entity_links (source_record_id, canonical_id, match_status) values (?, ?, ?)", (rid, canonical_id, match))
        parents = [p for p in row.get("parents") or [] if p]
        if parents:
            db.execute(
                "insert into claims (source_record_id, field, claim_text, claim_status) values (?, ?, ?, ?)",
                (rid, "reported_parents", " × ".join(parents), "DOCUMENTED"),
            )
        if row.get("thc"):
            db.execute(
                "insert into claims (source_record_id, field, claim_text, claim_status) values (?, ?, ?, ?)",
                (rid, "catalog_thc", f"THC dichiarato {row['thc']}. Non è un laboratorio.", "DOCUMENTED"),
            )
        if row.get("cbd"):
            db.execute(
                "insert into claims (source_record_id, field, claim_text, claim_status) values (?, ?, ?, ?)",
                (rid, "catalog_cbd", f"CBD dichiarato {row['cbd']}. Non è un laboratorio.", "DOCUMENTED"),
            )
        records += 1
    add_source(
        db,
        source_id="src-ci-strains-pro",
        name="CI-Strains-Pro",
        url=payload.get("source_url"),
        license=payload.get("license"),
        redistribution_status="ingested",
        records_ingested=records,
        reason="CC BY 4.0. Schede di catalogo, non misure di laboratorio. I THC dichiarati restano claim.",
        retrieved=payload.get("retrieved") or "2026-09-30",
    )
    return by_name


def link_status(norm: str, index: dict[str, list[int]]) -> tuple[str, int | None]:
    hits = index.get(norm) or []
    unique = list(dict.fromkeys(hits))
    if len(unique) == 1:
        return "POSSIBLE_MATCH", unique[0]
    if len(unique) > 1:
        return "CONFLICTING_IDENTITY", None
    return "UNRESOLVED", None


def measurements_from_row(row: dict[str, str]) -> list[tuple[str, str, float | None, str | None, str | None, str | None]]:
    out: list[tuple[str, str, float | None, str | None, str | None, str | None]] = []
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
            value, qualifier = parse_value(item.get("value"))
            if value is None and not qualifier:
                continue
            unit = item.get("unit")
            unit_text = str(unit).strip() if unit else None
            analysis = str(item.get("analysis") or "") or None
            out.append((compound, klass_of(compound, analysis), value, unit_text, qualifier, analysis))
        return out
    for key, cell in row.items():
        if key in PII or key in {"results", "analyses", "methods"}:
            continue
        compound = key.strip().lower()
        if compound not in CANNABINOIDS and compound not in TERPENES:
            continue
        value, qualifier = parse_value(cell)
        if value is None and not qualifier:
            continue
        out.append((compound, klass_of(compound, None), value, None, qualifier, None))
    return out


def labs(db: sqlite3.Connection, index: dict[str, list[int]]) -> int:
    inserted = 0
    record_sql = """insert into source_records
      (source_id, source_record_id, file_name, row_number, original_name, name_norm, breeder, lab, independence_group, sample_id, tested_at, content_hash, match_status)
      values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)"""
    measure_sql = """insert into measurements (source_record_id, compound, klass, value, unit, qualifier, analysis) values (?, ?, ?, ?, ?, ?, ?)"""
    link_sql = "insert into entity_links (source_record_id, canonical_id, match_status) values (?, ?, ?)"
    files = sorted(RAW.glob("*-results-latest.csv"))
    for path in files:
        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            reader = csv.DictReader(handle)
            batch_records = []
            batch_measures = []
            batch_links = []
            for number, row in enumerate(reader, start=1):
                name = (row.get("strain_name") or row.get("product_name") or "").strip()
                norm = normalize(name)
                lab = (row.get("lab") or "").strip() or None
                group = lab or "unknown-lab"
                sample = (row.get("sample_id") or row.get("sample_hash") or row.get("results_hash") or f"{path.name}:{number}")
                tested = (row.get("date_tested") or row.get("date") or "")[:40] or None
                digest = hashlib.sha256(f"{path.name}:{number}:{sample}:{name}".encode()).hexdigest()
                match, canonical = link_status(norm, index) if norm else ("UNRESOLVED", None)
                batch_records.append(("src-cannlytics-results", sample, path.name, number, name or None, norm or None, lab, group, sample, tested, digest, match))
                if len(batch_records) >= 2000:
                    before = db.execute("select max(id) from source_records").fetchone()[0] or 0
                    db.executemany(record_sql, batch_records)
                    ids = list(range(before + 1, before + 1 + len(batch_records)))
                    for rid, item in zip(ids, batch_records):
                        # match is last, name_norm is index 5
                        pass
                    # recompute links from stored match by re-query is slower; attach using parallel lists
                    batch_records = []
                inserted += 1
                if inserted % 50000 == 0:
                    print(f"rows {inserted}", flush=True)
        print(path.name, "seen", flush=True)
    return inserted


def main() -> None:
    started = time.time()
    csv.field_size_limit(10_000_000)
    db = connect()
    rejected(db)
    index = catalog(db)
    db.commit()
    print("catalog canonicals", db.execute("select count(*) from canonical_entities").fetchone()[0], flush=True)
    # Lab ingest rewritten inline below for correct id capture.
    record_sql = """insert into source_records
      (source_id, source_record_id, file_name, row_number, original_name, name_norm, breeder, lab, independence_group, sample_id, tested_at, content_hash, match_status)
      values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)"""
    measure_sql = "insert into measurements (source_record_id, compound, klass, value, unit, qualifier, analysis) values (?, ?, ?, ?, ?, ?, ?)"
    link_sql = "insert into entity_links (source_record_id, canonical_id, match_status) values (?, ?, ?)"
    lab_rows = 0
    for path in sorted(RAW.glob("*-results-latest.csv")):
        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            reader = csv.DictReader(handle)
            recs: list[tuple] = []
            measures: list[tuple] = []
            links: list[tuple] = []
            metas: list[tuple[str, int | None]] = []
            for number, row in enumerate(reader, start=1):
                name = (row.get("strain_name") or row.get("product_name") or "").strip()
                norm = normalize(name)
                lab = (row.get("lab") or "").strip() or None
                sample = (row.get("sample_id") or row.get("sample_hash") or row.get("results_hash") or f"{path.name}:{number}")[:180]
                tested = (row.get("date_tested") or row.get("date") or "")[:40] or None
                digest = hashlib.sha256(f"{path.name}:{number}:{sample}:{name}".encode()).hexdigest()
                match, canonical = link_status(norm, index) if norm else ("UNRESOLVED", None)
                recs.append(("src-cannlytics-results", sample, path.name, number, name or None, norm or None, lab, lab or "unknown-lab", sample, tested, digest, match))
                metas.append((match, canonical))
                parsed = measurements_from_row(row)
                measures.append(parsed)
                if len(recs) >= 1000:
                    flush(db, record_sql, measure_sql, link_sql, recs, measures, metas, links)
                    recs, measures, metas = [], [], []
                lab_rows += 1
                if lab_rows % 40000 == 0:
                    db.commit()
                    print(f"lab {lab_rows}", flush=True)
            if recs:
                flush(db, record_sql, measure_sql, link_sql, recs, measures, metas, links)
        db.commit()
        print("done", path.name, flush=True)
    add_source(
        db,
        source_id="src-cannlytics-results",
        name="Cannlytics cannabis_results",
        url="https://huggingface.co/datasets/cannlytics/cannabis_results",
        license="CC BY 4.0",
        redistribution_status="ingested",
        records_ingested=lab_rows,
        reason="CSV curated per stato, CC BY 4.0. Telefono, email e indirizzi non sono stati copiati. Le celle vuote non sono diventate zero. <LOQ resta un qualificatore, non una concentrazione.",
        retrieved="2026-09-30",
    )
    print("patterns", flush=True)
    db.executescript(
        """
        create index idx_records_norm on source_records (name_norm);
        create index idx_records_source on source_records (source_id);
        create index idx_measures_record on measurements (source_record_id);
        create index idx_measures_compound on measurements (compound);
        create index idx_links_record on entity_links (source_record_id);
        """
    )
    db.execute(
        """
        insert into pattern_candidates
        (pattern_key, hypothesis, lifecycle, sample_size, independent_sources, discovery_n, validation_n, discovery_mean, validation_mean, effect_size, confidence_interval, promoted_to_validated)
        select
          name_norm || '|' || compound,
          'Nei campioni etichettati «' || name_norm || '» il composto ' || compound || ' è stato misurato. È una statistica delle etichette, non il profilo vero della cultivar e non una causa.',
          case when validation_n >= 5 and validation_labs >= 1 and discovery_n >= 15 and discovery_labs >= 2 then 'SUPPORTED' else 'CANDIDATE' end,
          discovery_n + validation_n,
          labs,
          discovery_n,
          validation_n,
          discovery_mean,
          validation_mean,
          null,
          null,
          0
        from (
          select
            r.name_norm as name_norm,
            m.compound as compound,
            count(*) as n,
            count(distinct r.independence_group) as labs,
            sum(case when r.id % 5 = 0 then 1 else 0 end) as validation_n,
            sum(case when r.id % 5 <> 0 then 1 else 0 end) as discovery_n,
            count(distinct case when r.id % 5 = 0 then r.independence_group end) as validation_labs,
            count(distinct case when r.id % 5 <> 0 then r.independence_group end) as discovery_labs,
            avg(case when r.id % 5 <> 0 then m.value end) as discovery_mean,
            avg(case when r.id % 5 = 0 then m.value end) as validation_mean
          from measurements m
          join source_records r on r.id = m.source_record_id
          where m.value is not null and r.name_norm is not null and r.name_norm != '' and r.source_id = 'src-cannlytics-results'
          group by r.name_norm, m.compound
          having count(*) >= 20 and count(distinct r.independence_group) >= 2
        )
        """
    )
    db.commit()
    metrics = collect(db, time.time() - started)
    METRICS.write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))
    db.close()


def flush(db, record_sql, measure_sql, link_sql, recs, measures, metas, _links) -> None:
    before = db.execute("select coalesce(max(id), 0) from source_records").fetchone()[0]
    db.executemany(record_sql, recs)
    measure_rows = []
    link_rows = []
    for offset, (parsed, meta) in enumerate(zip(measures, metas), start=1):
        rid = before + offset
        match, canonical = meta
        link_rows.append((rid, canonical, match))
        for compound, klass, value, unit, qualifier, analysis in parsed:
            measure_rows.append((rid, compound[:80], klass, value, unit, qualifier, analysis))
    if link_rows:
        db.executemany(link_sql, link_rows)
    if measure_rows:
        db.executemany(measure_sql, measure_rows)


def collect(db: sqlite3.Connection, seconds: float) -> dict:
    def one(sql: str) -> int:
        return int(db.execute(sql).fetchone()[0])

    return {
        "raw_source_records": one("select count(*) from source_records"),
        "canonical_entities": one("select count(*) from canonical_entities"),
        "duplicate_links": one("select count(*) from entity_links where match_status = 'CANONICAL_MATCH'"),
        "unresolved": one("select count(*) from entity_links where match_status = 'UNRESOLVED'"),
        "conflicts": one("select count(*) from entity_links where match_status = 'CONFLICTING_IDENTITY'"),
        "possible_name_matches": one("select count(*) from entity_links where match_status = 'POSSIBLE_MATCH'"),
        "claims": one("select count(*) from claims"),
        "measurements": one("select count(*) from measurements"),
        "numeric_measurements": one("select count(*) from measurements where value is not null"),
        "below_loq": one("select count(*) from measurements where qualifier is not null"),
        "cannabinoid_measurements": one("select count(*) from measurements where klass = 'CANNABINOID' and value is not null"),
        "terpene_measurements": one("select count(*) from measurements where klass = 'TERPENE' and value is not null"),
        "flavonoid_measurements": one("select count(*) from measurements where klass = 'FLAVONOID' and value is not null"),
        "anthocyanin_measurements": one("select count(*) from measurements where klass = 'ANTHOCYANIN' and value is not null"),
        "genomic_samples": 0,
        "variants": 0,
        "publications_in_this_database": 0,
        "candidate_patterns": one("select count(*) from pattern_candidates where lifecycle = 'CANDIDATE'"),
        "supported_patterns": one("select count(*) from pattern_candidates where lifecycle = 'SUPPORTED'"),
        "validated_patterns": one("select count(*) from pattern_candidates where promoted_to_validated = 1"),
        "sources": [dict(zip(["source_id", "records_ingested", "redistribution_status", "reason"], row)) for row in db.execute("select source_id, records_ingested, redistribution_status, reason from source_registry order by source_id")],
        "ingest_seconds": round(seconds, 1),
        "database_bytes": DB_PATH.stat().st_size,
    }


if __name__ == "__main__":
    main()
