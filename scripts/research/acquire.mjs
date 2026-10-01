import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import pg from "pg";
import { connectableUrl } from "../../src/lib/gg/prediction/pg-url.ts";

const SESSION = "acq-20261001-public-01";
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
  records.push({
    title: null,
    entity_name: null,
    numeric_value: null,
    unit: null,
    payload: {},
    ...record,
  });
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

function zipEntry(bytes, suffix) {
  const dir = mkdtempSync(join(tmpdir(), "gg-zip-"));
  const file = join(dir, "archive.zip");
  writeFileSync(file, bytes);
  return execFileSync("python3", ["-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nname=next(item for item in z.namelist() if item.endswith(sys.argv[2]))\nsys.stdout.buffer.write(z.read(name))", file, suffix], { maxBuffer: 2_000_000 }).toString("utf8");
}

function untar(bytes) {
  const inflated = gunzipSync(bytes);
  const files = [];
  let offset = 0;
  while (offset + 512 <= inflated.length) {
    const header = inflated.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*/, "");
    if (!name) break;
    const size = Number.parseInt(header.subarray(124, 136).toString("utf8").trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);
    offset += 512;
    const body = inflated.subarray(offset, offset + size);
    if ((type === "0" || type === "\0") && !name.split("/").at(-1).startsWith("._")) files.push({ name, body });
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

function parseBed(text, sourceId, kind) {
  let n = 0;
  const samples = new Set();
  const chromosomes = {};
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("track") || line.startsWith("browser")) continue;
    const [chrom, start, end, name, , strand] = line.split("\t");
    if (!chrom || !start || !end) continue;
    const sample = String(name ?? chrom).split(".")[0] || chrom;
    samples.add(sample);
    chromosomes[chrom] = (chromosomes[chrom] ?? 0) + 1;
    n += 1;
    addRecord({
      source_id: sourceId,
      external_id: `${kind}:${n}:${chrom}:${start}:${end}`,
      record_kind: "GENOMIC_INTERVAL",
      claim_type: "GENOMIC_EVIDENCE",
      knowledge_status: "OBSERVED_COORDINATE",
      entity_name: sample,
      title: name ?? kind,
      payload: { chromosome: chrom, start: Number(start), end: Number(end), strand: strand ?? null, feature: kind, resolved_to_catalog: "UNRESOLVED" },
    });
  }
  return { n, samples: samples.size, chromosomes };
}

async function europePmc(query, pages) {
  const seen = new Set();
  let cursor = "*";
  const found = [];
  for (let page = 0; page < pages; page += 1) {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=100&resultType=lite&cursorMark=${encodeURIComponent(cursor)}`;
    const data = await getJson(url);
    const batch = data.resultList?.result ?? [];
    if (batch.length === 0) break;
    for (const paper of batch) {
      const key = paper.doi || `${paper.source}:${paper.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(paper);
    }
    if (!data.nextCursorMark || data.nextCursorMark === cursor) break;
    cursor = data.nextCursorMark;
  }
  return { query, next_cursor: cursor, papers: found };
}

async function ncbiCount(database, term) {
  const data = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=${database}&term=${encodeURIComponent(term)}&retmode=json&retmax=0&tool=greed-gross`);
  return Number(data.esearchresult.count);
}

async function ncbiProjects() {
  const search = await getJson("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=bioproject&term=Cannabis%20sativa%5BOrganism%5D&retmode=json&retmax=300&tool=greed-gross");
  const ids = search.esearchresult.idlist ?? [];
  const projects = [];
  for (let index = 0; index < ids.length; index += 80) {
    const slice = ids.slice(index, index + 80);
    const summary = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=bioproject&id=${slice.join(",")}&retmode=json&tool=greed-gross`);
    const result = summary.result ?? {};
    for (const id of slice) {
      const item = result[id];
      if (!item) continue;
      projects.push({
        id,
        accession: item.project_acc ?? item.project_accession ?? null,
        title: item.project_title ?? item.title ?? null,
      });
    }
  }
  return projects;
}

async function main() {
  const uniprot = await getJson("https://rest.uniprot.org/uniprotkb/search?query=organism_id:3483+AND+reviewed:true&format=json&size=50");
  const proteins = uniprot.results ?? [];
  addSource({
    source_id: "uniprot-cannabis-reviewed",
    source_name: "UniProtKB reviewed Cannabis sativa",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://rest.uniprot.org/uniprotkb/search?query=organism_id:3483+AND+reviewed:true",
    license: "CC BY 4.0",
    decision: "ACCEPTED_METADATA",
    record_count: proteins.length,
    notes: "Protein catalog records. Not chemical measurements of a cultivar.",
  });
  for (const protein of proteins) {
    const gene = protein.genes?.[0]?.geneName?.value ?? null;
    addRecord({
      source_id: "uniprot-cannabis-reviewed",
      external_id: protein.primaryAccession,
      record_kind: "PROTEIN",
      claim_type: "GENOMIC_EVIDENCE",
      knowledge_status: "CATALOG_RECORD",
      entity_name: gene,
      title: protein.proteinDescription?.recommendedName?.fullName?.value ?? protein.uniProtkbId,
      numeric_value: protein.sequence?.length ?? null,
      unit: "amino_acids",
      payload: { accession: protein.primaryAccession, gene, organism_id: 3483, reviewed: true },
    });
  }

  const literatureQueries = [
    ["Cannabis sativa OPEN_ACCESS:Y", 2],
    ["cannabinoid synthase", 1],
    ["\"Cannabis sativa\" AND (terpene OR terpenes)", 1],
    ["\"Cannabis sativa\" AND (QTL OR GWAS)", 1],
    ["\"Cannabis sativa\" AND (transcriptome OR RNA-seq)", 1],
    ["\"Cannabis sativa\" AND (landrace OR domestication OR pedigree)", 1],
  ];
  const papers = new Map();
  const cursors = {};
  for (const [query, pages] of literatureQueries) {
    const result = await europePmc(query, pages);
    cursors[query] = { returned: result.papers.length, next_cursor: result.next_cursor };
    for (const paper of result.papers) {
      const key = paper.doi || `${paper.source}:${paper.id}`;
      if (!papers.has(key)) papers.set(key, paper);
    }
  }
  addSource({
    source_id: "europepmc-cannabis-metadata",
    source_name: "Europe PMC bibliographic metadata",
    source_type: "PRIMARY_LITERATURE",
    source_url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    license: "METADATA_ONLY",
    decision: "ACCEPTED_METADATA",
    record_count: papers.size,
    notes: "Titles, identifiers and open-access flags only. Full text and abstracts were not copied.",
  });
  for (const paper of papers.values()) {
    const key = paper.doi || `${paper.source}:${paper.id}`;
    addRecord({
      source_id: "europepmc-cannabis-metadata",
      external_id: key,
      record_kind: "PAPER",
      claim_type: "LITERATURE_TITLE",
      knowledge_status: "PENDING",
      title: paper.title ?? null,
      payload: {
        doi: paper.doi ?? null,
        pmid: paper.pmid ?? null,
        pmcid: paper.pmcid ?? null,
        year: paper.pubYear ?? null,
        journal: paper.journalTitle ?? null,
        is_open_access: paper.isOpenAccess === "Y",
        cited_by_count: paper.citedByCount ?? null,
        has_supplement: paper.hasSuppl === "Y",
      },
    });
  }

  const catalog = {
    ncbi_bioproject: await ncbiCount("bioproject", "Cannabis sativa[Organism]"),
    ncbi_sra: await ncbiCount("sra", "Cannabis sativa[Organism]"),
    ncbi_gene: await ncbiCount("gene", "Cannabis sativa[Organism]"),
    ncbi_assembly: await ncbiCount("assembly", "Cannabis sativa[Organism]"),
    ncbi_gds: await ncbiCount("gds", "Cannabis sativa[Organism]"),
  };
  const projects = await ncbiProjects();
  addSource({
    source_id: "ncbi-cannabis-sativa",
    source_name: "NCBI Cannabis sativa catalogs",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://www.ncbi.nlm.nih.gov/datasets/taxonomy/3483/",
    license: "US_GOVERNMENT_PUBLIC_DOMAIN",
    decision: "ACCEPTED_METADATA",
    record_count: projects.length,
    notes: "BioProject titles were stored. SRA runs, the 2 GB EDTA archive, and raw FASTA were not downloaded.",
  });
  for (const [name, count] of Object.entries(catalog)) {
    addRecord({
      source_id: "ncbi-cannabis-sativa",
      external_id: `count:${name}`,
      record_kind: "CATALOG_COUNT",
      claim_type: "REPORTED_FACT",
      knowledge_status: "CATALOG_RECORD",
      title: name,
      numeric_value: count,
      unit: "records",
      payload: { database: name },
    });
  }
  for (const project of projects) {
    if (!project.accession && !project.title) continue;
    addRecord({
      source_id: "ncbi-cannabis-sativa",
      external_id: project.accession || `bioproject:${project.id}`,
      record_kind: "BIOPROJECT",
      claim_type: "REPORTED_FACT",
      knowledge_status: "CATALOG_RECORD",
      title: project.title,
      payload: { accession: project.accession, resolved_to_catalog: "UNRESOLVED" },
    });
  }

  const gbifSpecies = await getJson("https://api.gbif.org/v1/species/match?name=Cannabis%20sativa");
  const gbifOccurrences = await getJson("https://api.gbif.org/v1/occurrence/search?taxonKey=5361880&limit=0");
  addSource({
    source_id: "gbif-cannabis-sativa",
    source_name: "GBIF Cannabis sativa",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://www.gbif.org/species/5361880",
    license: "MIXED_CC_BY_AND_CC_BY_NC",
    decision: "COUNT_ONLY",
    record_count: 1,
    notes: "Occurrence rows were not imported because constituent datasets include CC BY-NC.",
  });
  addRecord({
    source_id: "gbif-cannabis-sativa",
    external_id: "taxon:5361880",
    record_kind: "TAXON",
    claim_type: "REPORTED_FACT",
    knowledge_status: "CATALOG_RECORD",
    title: gbifSpecies.scientificName ?? "Cannabis sativa",
    entity_name: "Cannabis sativa",
    numeric_value: gbifOccurrences.count ?? null,
    unit: "occurrence_records_not_imported",
    payload: { usage_key: gbifSpecies.usageKey, status: gbifSpecies.status, rank: gbifSpecies.rank },
  });

  const figshare = await getJson("https://api.figshare.com/v2/articles/25909024");
  const figshareFiles = [
    ["csat_orientations.tsv", "https://ndownloader.figshare.com/files/46631524", "ORIENTATION"],
    ["cannabinoid_synthase_annotations.tar.gz", "https://ndownloader.figshare.com/files/46631539", "SYNTHASE"],
    ["INVs_query_coord.bed.tar.gz", "https://ndownloader.figshare.com/files/46631506", "INV"],
    ["INVTR_query_coord.bed.tar.gz", "https://ndownloader.figshare.com/files/46631509", "INVTR"],
    ["DUP_query_coord.bed.tar.gz", "https://ndownloader.figshare.com/files/46631512", "DUP"],
    ["TRANS_query_coord.bed.tar.gz", "https://ndownloader.figshare.com/files/46631503", "TRANS"],
  ];
  const figshareStats = [];
  for (const [name, url, kind] of figshareFiles) {
    const bytes = await getBytes(url);
    const digest = sha256(bytes);
    const sourceId = `figshare-${kind.toLowerCase()}`;
    if (name.endsWith(".tsv")) {
      const text = bytes.toString("utf8");
      const rows = text.trim().split("\n").slice(1);
      addSource({
        source_id: sourceId,
        source_name: name,
        source_type: "LAB_DATA",
        source_url: url,
        doi: "10.25452/figshare.plus.25909024",
        license: "CC0",
        decision: "ACCEPTED",
        file_sha256: digest,
        record_count: rows.length,
        notes: "Assembly orientation. Sample codes are not commercial cultivar identities.",
      });
      rows.forEach((row, index) => {
        const [, sample, chromosome, flip] = row.split("\t");
        addRecord({
          source_id: sourceId,
          external_id: `${index}:${sample}:${chromosome}`,
          record_kind: "ASSEMBLY_ORIENTATION",
          claim_type: "GENOMIC_EVIDENCE",
          knowledge_status: "OBSERVED_COORDINATE",
          entity_name: sample,
          title: `${sample} ${chromosome}`,
          payload: { chromosome, flip: flip === "True", resolved_to_catalog: "UNRESOLVED" },
        });
      });
      figshareStats.push({ name, sha256: digest, rows: rows.length });
      continue;
    }
    const members = untar(bytes).filter((file) => file.name.endsWith(".bed") || file.name.endsWith(".fasta"));
    let intervals = 0;
    const fasta = members.filter((file) => file.name.endsWith(".fasta"));
    addSource({
      source_id: sourceId,
      source_name: name,
      source_type: "LAB_DATA",
      source_url: url,
      doi: "10.25452/figshare.plus.25909024",
      license: "CC0",
      decision: "ACCEPTED_COORDINATES",
      file_sha256: digest,
      notes: "Coordinates stored. FASTA bases were counted and hashed, not stored. Not a chemotype measurement.",
    });
    for (const file of members.filter((item) => item.name.endsWith(".bed"))) {
      const parsed = parseBed(file.body.toString("utf8"), sourceId, kind);
      intervals += parsed.n;
    }
    sources.at(-1).record_count = intervals + fasta.length;
    for (const file of fasta) {
      const text = file.body.toString("utf8");
      const sequences = text.split(">").filter((part) => part.trim()).length;
      addRecord({
        source_id: sourceId,
        external_id: `fasta:${file.name}`,
        record_kind: "SEQUENCE_SUMMARY",
        claim_type: "GENOMIC_EVIDENCE",
        knowledge_status: "CATALOG_RECORD",
        title: file.name,
        numeric_value: sequences,
        unit: "sequences_not_stored",
        payload: { sha256: sha256(file.body), bases_stored: false },
      });
    }
    figshareStats.push({ name, sha256: digest, intervals, fasta: fasta.map((file) => file.name) });
  }
  addSource({
    source_id: "figshare-edta-not-downloaded",
    source_name: "EDTAOutput.tar.gz",
    source_type: "LAB_DATA",
    source_url: "https://ndownloader.figshare.com/files/46578868",
    doi: "10.25452/figshare.plus.25909024",
    license: "CC0",
    decision: "BLOCKED_SIZE",
    record_count: 0,
    notes: `File is ${figshare.files?.find((file) => file.name === "EDTAOutput.tar.gz")?.size ?? "about 2 GB"}. Not downloaded.`,
  });

  const zenodoBytes = await getBytes("https://zenodo.org/records/17645958/files/Shannon-Goddard/cannabis-intelligence-database-v1.0.1.zip?download=1");
  const csv = zipEntry(zenodoBytes, "cannabis_strains.csv");
  const strainRows = csv.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("strain_name,"));
  addSource({
    source_id: "zenodo-17645958",
    source_name: "Cannabis Intelligence Database",
    source_type: "COMMUNITY",
    source_url: "https://doi.org/10.5281/zenodo.17645958",
    doi: "10.5281/zenodo.17645958",
    license: "MIT",
    decision: "ACCEPTED_AS_UNVERIFIED",
    file_sha256: sha256(zenodoBytes),
    record_count: strainRows.length,
    notes: "The abstract claims 6772 strains. The CSV in the archive has the parsed row count. No measurement or pedigree was created. ORCID in the citation file is a placeholder.",
  });
  addRecord({
    source_id: "zenodo-17645958",
    external_id: "abstract-versus-file",
    record_kind: "CONFLICT",
    claim_type: "HYPOTHESIS",
    knowledge_status: "CONFLICT",
    title: "Abstract claims 6772 strains; the distributed CSV does not",
    numeric_value: strainRows.length,
    unit: "csv_rows",
    payload: { claimed_rows: 6772, observed_rows: strainRows.length },
  });
  strainRows.forEach((line, index) => {
    const [name, breeder, url] = line.split(",");
    addRecord({
      source_id: "zenodo-17645958",
      external_id: `row:${index + 1}`,
      record_kind: "BREEDER_NAME",
      claim_type: "BREEDER_CLAIM",
      knowledge_status: "NON_VERIFIED_INFORMATION",
      entity_name: name,
      title: `${name} · ${breeder}`,
      payload: { breeder, source_url: url, resolved_to_catalog: "NOT_MERGED" },
    });
  });

  addSource({
    source_id: "cannabis-compound-database",
    source_name: "Cannabis Compound Database",
    source_type: "SCIENTIFIC_DATABASE",
    source_url: "https://cannabisdatabase.ca/",
    license: "UNKNOWN",
    decision: "NOT_IMPORTED",
    record_count: 0,
    notes: "Described publicly as containing compound records. No redistribution license was verified, so no rows were copied.",
  });
  addSource({
    source_id: "opencannabis-1000-genomes",
    source_name: "Open Cannabis Project / 1000 Cannabis Genomes mirror",
    source_type: "GENOMIC_DATASET",
    source_url: "https://www.kaggle.com/datasets/bigquery/genomics-cannabis",
    license: "DISPUTED",
    decision: "NOT_IMPORTED",
    record_count: 0,
    notes: "A mirror is labeled CC0, but the underlying genotype release has unresolved contributor-consent history. Not imported.",
  });
  addSource({
    source_id: "dryad-10.5061-9p8cz8wfr",
    source_name: "Ren et al. domestication resequencing",
    source_type: "GENOMIC_DATASET",
    source_url: "https://doi.org/10.5061/dryad.9p8cz8wfr",
    doi: "10.5061/dryad.9p8cz8wfr",
    license: "CC0",
    decision: "BLOCKED_SIZE",
    record_count: 0,
    notes: "cannabis.final.vcf.gz is about 5.79 GB. Metadata recorded. Variants were not invented and the VCF was not downloaded.",
  });

  const summary = {
    research_session_id: SESSION,
    retrieved_at: new Date().toISOString(),
    embedding_status: "EMBEDDING_UNAVAILABLE",
    sources: sources.map((source) => ({
      source_id: source.source_id,
      license: source.license,
      decision: source.decision,
      record_count: source.record_count,
      doi: source.doi,
      sha256: source.file_sha256,
      notes: source.notes,
    })),
    records: records.length,
    by_kind: records.reduce((counts, record) => {
      counts[record.record_kind] = (counts[record.record_kind] ?? 0) + 1;
      return counts;
    }, {}),
    by_claim: records.reduce((counts, record) => {
      counts[record.claim_type] = (counts[record.claim_type] ?? 0) + 1;
      return counts;
    }, {}),
    literature_cursors: cursors,
    ncbi_catalog: catalog,
    figshare: figshareStats,
    gbif_occurrences_not_imported: gbifOccurrences.count ?? null,
    measurements_written: 0,
    canonical_entities_written: 0,
    prediction_features_added: 0,
  };
  mkdirSync("data/research", { recursive: true });
  writeFileSync(`data/research/${SESSION}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ session: SESSION, records: records.length, by_kind: summary.by_kind, measurements_written: 0 }));

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("DATABASE_URL ABSENT. Manifest written. Nothing inserted.");
    return;
  }
  const pool = new pg.Pool({ connectionString: connectableUrl(databaseUrl), max: 1, statement_timeout: 120_000 });
  const { readFileSync: readSql } = await import("node:fs");
  await pool.query(readSql(new URL("../postgres/009_research.sql", import.meta.url), "utf8"));
  await pool.query(readSql(new URL("../postgres/010_acquisition.sql", import.meta.url), "utf8"));
  await pool.query(
    `insert into research_sessions (research_id, query, knowledge_status, embedding_status, embedding_model, embedding_version)
     values ($1, $2, 'PENDING', 'EMBEDDING_UNAVAILABLE', null, null)
     on conflict (research_id) do nothing`,
    [SESSION, "public cannabis scientific acquisition"],
  );
  for (const source of sources) {
    await pool.query(
      `insert into acquisition_sources
         (source_id, research_id, source_name, source_type, source_url, doi, license, decision, file_sha256, record_count, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (source_id) do update set
         decision = excluded.decision,
         file_sha256 = excluded.file_sha256,
         record_count = excluded.record_count,
         notes = excluded.notes,
         retrieved_at = now()`,
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
  const check = await pool.query("select count(*)::int as n from acquisition_records");
  const measurements = await pool.query("select count(*)::bigint as n from measurements");
  console.log(JSON.stringify({ acquisition_records: check.rows[0].n, measurements: measurements.rows[0].n }));
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ACQUISITION_FAILED");
  process.exit(1);
});
