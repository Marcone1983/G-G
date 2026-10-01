import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const SESSION = "acq-20261001-public-02";
const USER_AGENT = "GG-research/1.0 (scientific metadata acquisition)";
const sources = [];
const records = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function addSource(source) {
  sources.push({ record_count: 0, file_sha256: null, doi: null, notes: null, ...source });
}

function addRecord(record) {
  records.push({ title: null, entity_name: null, numeric_value: null, unit: null, payload: {}, ...record });
}

async function getBytes(url, attempt = 0) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if ((response.status === 429 || response.status === 503) && attempt < 6) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return getBytes(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${new URL(url).host}`);
  return Buffer.from(await response.arrayBuffer());
}

async function getJson(url) {
  return JSON.parse((await getBytes(url)).toString("utf8"));
}

function xlsxRows(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "gg-xlsx-"));
  const file = join(dir, "book.xlsx");
  writeFileSync(file, bytes);
  const raw = execFileSync("python3", ["-c", `
import json, sys, zipfile
from xml.etree import ElementTree as ET
ns={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
x=zipfile.ZipFile(sys.argv[1])
ss=[]
if "xl/sharedStrings.xml" in x.namelist():
    root=ET.fromstring(x.read("xl/sharedStrings.xml"))
    for si in root.findall("m:si", ns):
        ss.append("".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
sheet=ET.fromstring(x.read("xl/worksheets/sheet1.xml"))
rows=[]
for row in sheet.findall("m:sheetData/m:row", ns):
    vals=[]
    for c in row.findall("m:c", ns):
        t=c.get("t"); v=c.find("m:v", ns)
        text=""
        if v is not None and v.text:
            text=ss[int(v.text)] if t=="s" else v.text
        vals.append(text)
    rows.append(vals)
sys.stdout.write(json.dumps(rows))
`, file], { maxBuffer: 8_000_000 });
  return JSON.parse(raw.toString("utf8"));
}

async function main() {
  const previous = JSON.parse(readFileSync(new URL("../../data/research/acq-20261001-public-01.json", import.meta.url), "utf8"));
  let papers = 0;
  for (const [query, cursor] of Object.entries(previous.literature_cursors ?? {})) {
    const data = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=100&resultType=lite&cursorMark=${encodeURIComponent(cursor.next_cursor)}`);
    for (const paper of data.resultList?.result ?? []) {
      const key = paper.doi || `${paper.source}:${paper.id}`;
      papers += 1;
      addRecord({
        source_id: "europepmc-page-02",
        external_id: key,
        record_kind: "PAPER",
        claim_type: "LITERATURE_TITLE",
        knowledge_status: "PENDING",
        title: paper.title ?? null,
        payload: { doi: paper.doi ?? null, pmid: paper.pmid ?? null, year: paper.pubYear ?? null, is_open_access: paper.isOpenAccess === "Y", query },
      });
    }
  }
  addSource({
    source_id: "europepmc-page-02",
    source_name: "Europe PMC resumed cursors",
    source_type: "PRIMARY_LITERATURE",
    source_url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    license: "METADATA_ONLY",
    decision: "ACCEPTED_METADATA",
    record_count: papers,
    notes: "Next page of each saved cursor. Titles only. Duplicates are ignored on insert.",
  });

  const assemblySearch = await getJson("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=assembly&term=Cannabis%20sativa%5BOrganism%5D&retmode=json&retmax=40&tool=greed-gross");
  const assemblyIds = assemblySearch.esearchresult.idlist ?? [];
  const assemblySummary = assemblyIds.length
    ? await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=assembly&id=${assemblyIds.join(",")}&retmode=json&tool=greed-gross`)
    : { result: {} };
  const assemblies = assemblyIds.map((id) => assemblySummary.result?.[id]).filter(Boolean);
  addSource({
    source_id: "ncbi-assemblies",
    source_name: "NCBI Assembly Cannabis sativa",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://www.ncbi.nlm.nih.gov/assembly/?term=Cannabis+sativa",
    license: "US_GOVERNMENT_PUBLIC_DOMAIN",
    decision: "ACCEPTED_METADATA",
    record_count: assemblies.length,
    notes: "Assembly accessions only. Contigs and VCF were not downloaded.",
  });
  for (const item of assemblies) {
    const accession = item.assemblyaccession || item.assemblyaccession || item.uid;
    addRecord({
      source_id: "ncbi-assemblies",
      external_id: String(accession),
      record_kind: "GENOME_ASSEMBLY",
      claim_type: "GENOMIC_EVIDENCE",
      knowledge_status: "CATALOG_RECORD",
      title: item.assemblyname || item.organism || null,
      entity_name: item.speciesname || "Cannabis sativa",
      payload: { accession, taxid: item.taxid ?? 3483, resolved_to_catalog: "UNRESOLVED" },
    });
  }

  const ensembl = await getJson("https://rest.ensembl.org/info/genomes/taxonomy/Cannabis%20sativa?content-type=application/json");
  const genome = Array.isArray(ensembl) ? ensembl[0] : null;
  addSource({
    source_id: "ensembl-plants-cs10",
    source_name: "Ensembl Plants Cannabis sativa female",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://plants.ensembl.org/Cannabis_sativa_female/Info/Index",
    license: "CC BY 4.0",
    decision: "ACCEPTED_METADATA",
    record_count: genome ? 1 : 0,
    notes: "Reference assembly metadata. Gene sequences were not copied.",
  });
  if (genome) {
    addRecord({
      source_id: "ensembl-plants-cs10",
      external_id: genome.assembly_accession,
      record_kind: "GENOME_ASSEMBLY",
      claim_type: "GENOMIC_EVIDENCE",
      knowledge_status: "CATALOG_RECORD",
      title: genome.display_name,
      entity_name: "Cannabis sativa female",
      numeric_value: genome.base_count ?? null,
      unit: "assembly_bases",
      payload: { assembly_name: genome.assembly_name, genebuild: genome.genebuild, resolved_to_catalog: "UNRESOLVED" },
    });
  }

  const gdsSearch = await getJson("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gds&term=Cannabis%20sativa%5BOrganism%5D&retmode=json&retmax=200&tool=greed-gross");
  const gdsIds = gdsSearch.esearchresult.idlist ?? [];
  let gdsCount = 0;
  addSource({
    source_id: "ncbi-geo",
    source_name: "NCBI GEO DataSets Cannabis sativa",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://www.ncbi.nlm.nih.gov/gds/?term=Cannabis+sativa",
    license: "US_GOVERNMENT_PUBLIC_DOMAIN",
    decision: "ACCEPTED_METADATA",
    notes: "Series titles only. Expression matrices were not downloaded.",
  });
  for (let index = 0; index < gdsIds.length; index += 80) {
    const slice = gdsIds.slice(index, index + 80);
    const summary = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gds&id=${slice.join(",")}&retmode=json&tool=greed-gross`);
    for (const id of slice) {
      const item = summary.result?.[id];
      if (!item) continue;
      gdsCount += 1;
      addRecord({
        source_id: "ncbi-geo",
        external_id: item.accession || `gds:${id}`,
        record_kind: "EXPRESSION_SERIES",
        claim_type: "GENOMIC_EVIDENCE",
        knowledge_status: "CATALOG_RECORD",
        title: item.title || item.summary || null,
        numeric_value: Number(item.n_samples ?? item.samples?.length ?? 0) || null,
        unit: "samples_not_downloaded",
        payload: { taxon: item.taxon ?? null, resolved_to_catalog: "UNRESOLVED" },
      });
    }
  }
  sources.at(-1).record_count = gdsCount;

  const gcmsZip = await getBytes("https://zenodo.org/records/17505720/files/GC_MS_data.zip?download=1");
  const dir = mkdtempSync(join(tmpdir(), "gg-gcms-"));
  const zipFile = join(dir, "gcms.zip");
  writeFileSync(zipFile, gcmsZip);
  const sheet = execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read('GC_MS_data/hemp-gcms-original.xlsx'))", zipFile], { maxBuffer: 2_000_000 });
  const rows = xlsxRows(sheet);
  const headers = rows[0] ?? [];
  let signals = 0;
  let notDetected = 0;
  for (const row of rows.slice(1)) {
    const compound = row[0];
    if (!compound) continue;
    headers.slice(1).forEach((sample, offset) => {
      const raw = row[offset + 1];
      const value = raw === undefined || raw === "" ? null : Number(raw);
      if (value === null || Number.isNaN(value)) return;
      if (value === 0) {
        notDetected += 1;
        return;
      }
      signals += 1;
      addRecord({
        source_id: "zenodo-17505720-gcms",
        external_id: `${sample}:${compound}`,
        record_kind: "RELATIVE_SIGNAL",
        claim_type: "MEASUREMENT",
        knowledge_status: "REPORTED_WITHOUT_UNIT",
        title: compound,
        entity_name: sample,
        numeric_value: value,
        unit: null,
        payload: {
          matrix: "hemp_seed_extract_gcms",
          not_a_flower_chemotype: true,
          resolved_to_catalog: "UNRESOLVED",
          feature_status: "NOT_A_MODEL_FEATURE",
          feature_reason: "The file does not state the unit, and the sample code is not a resolved cultivar.",
        },
      });
    });
  }
  addSource({
    source_id: "zenodo-17505720-gcms",
    source_name: "Thai and foreign hemp seed-extract GC/MS",
    source_type: "LAB_DATA",
    source_url: "https://doi.org/10.5281/zenodo.17505720",
    doi: "10.5281/zenodo.17505720",
    license: "CC BY 4.0",
    decision: "ACCEPTED_RELATIVE_SIGNALS",
    file_sha256: sha256(gcmsZip),
    record_count: signals,
    notes: `Non-zero signals stored. ${notDetected} zeros were not stored as concentrations. Transpose sheets were not imported.`,
  });

  addSource({
    source_id: "myleslab-cannabis-labelling",
    source_name: "MylesLab cannabis labelling chemistry",
    source_type: "LAB_DATA",
    source_url: "https://github.com/MylesLab/cannabis-labelling",
    license: "UNKNOWN",
    decision: "NOT_IMPORTED",
    record_count: 0,
    notes: "GitHub license endpoint returned 404. The spreadsheet was not copied.",
  });
  addSource({
    source_id: "massive-msv000093886",
    source_name: "GNPS cannabis metabolomics",
    source_type: "LAB_DATA",
    source_url: "https://doi.org/10.25345/C50P0X24D",
    doi: "10.25345/C50P0X24D",
    license: "CC0",
    decision: "BLOCKED_SIZE",
    record_count: 0,
    notes: "About 3.73 GB. Not downloaded.",
  });

  const summary = {
    research_session_id: SESSION,
    continues: previous.research_session_id,
    records: records.length,
    by_kind: records.reduce((counts, record) => {
      counts[record.record_kind] = (counts[record.record_kind] ?? 0) + 1;
      return counts;
    }, {}),
    not_detected_zeros_not_stored: notDetected,
    measurements_table_written: 0,
    sources: sources.map((source) => ({ source_id: source.source_id, decision: source.decision, license: source.license, record_count: source.record_count })),
  };
  writeFileSync(`data/research/${SESSION}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ session: SESSION, records: records.length, by_kind: summary.by_kind, zeros_not_stored: notDetected }));

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("DATABASE_URL ABSENT. Manifest written. Nothing inserted.");
    return;
  }
  const pool = new pg.Pool({ connectionString: connectableUrl(databaseUrl), max: 1, statement_timeout: 120_000 });
  await pool.query(readFileSync(new URL("../postgres/009_research.sql", import.meta.url), "utf8"));
  await pool.query(readFileSync(new URL("../postgres/010_acquisition.sql", import.meta.url), "utf8"));
  await pool.query(
    `insert into research_sessions (research_id, query, knowledge_status, embedding_status)
     values ($1, $2, 'PENDING', 'EMBEDDING_UNAVAILABLE')
     on conflict (research_id) do nothing`,
    [SESSION, "public acquisition continuation"],
  );
  for (const source of sources) {
    await pool.query(
      `insert into acquisition_sources
         (source_id, research_id, source_name, source_type, source_url, doi, license, decision, file_sha256, record_count, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (source_id) do update set record_count = excluded.record_count, notes = excluded.notes, retrieved_at = now()`,
      [source.source_id, SESSION, source.source_name, source.source_type, source.source_url, source.doi, source.license, source.decision, source.file_sha256, source.record_count, source.notes],
    );
  }
  for (let index = 0; index < records.length; index += 200) {
    const slice = records.slice(index, index + 200);
    const values = [];
    const params = [];
    slice.forEach((record, offset) => {
      const base = offset * 9;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9}::jsonb)`);
      params.push(record.source_id, record.external_id, record.record_kind, record.claim_type, record.knowledge_status, record.title, record.entity_name, record.numeric_value, JSON.stringify(record.payload));
    });
    await pool.query(
      `insert into acquisition_records
         (source_id, external_id, record_kind, claim_type, knowledge_status, title, entity_name, numeric_value, payload)
       values ${values.join(",")}
       on conflict (source_id, external_id) do nothing`,
      params,
    );
  }
  await pool.query(
    `insert into knowledge_snapshots (snapshot_id, raw_records, measurements, note)
     select 'GGS-KNOWLEDGE-000006', count(*)::int, (select count(*)::int from measurements),
            'Acquisition sessions added separate records. The measurement table was not modified.'
     from source_records
     on conflict (snapshot_id) do nothing`,
  );
  const check = await pool.query("select (select count(*)::int from acquisition_records) as acquired, (select count(*)::bigint from measurements) as measurements, (select snapshot_id from knowledge_snapshots where snapshot_id = 'GGS-KNOWLEDGE-000006') as snapshot");
  console.log(JSON.stringify(check.rows[0]));
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ACQUISITION_FAILED");
  process.exit(1);
});
