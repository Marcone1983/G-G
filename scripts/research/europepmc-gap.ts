const query = "cannabis flavonoid biosynthesis";
const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=5&resultType=lite`;
const response = await fetch(url);
if (!response.ok) {
  console.log(JSON.stringify({ status: "ACQUISITION_FAILED", http: response.status, measurements_written: 0 }));
  process.exit(1);
}
const payload = (await response.json()) as {
  hitCount?: number;
  resultList?: { result?: { id?: string; source?: string; title?: string; doi?: string; pubYear?: string }[] };
};
const records = (payload.resultList?.result ?? []).map((row) => ({
  source_id: "europepmc",
  external_id: row.id ?? null,
  source: row.source ?? null,
  title: row.title ?? null,
  doi: row.doi ?? null,
  publication_year: row.pubYear ?? null,
  license: "EUROPE_PMC_METADATA",
  knowledge_status: "UNREVIEWED",
  model_eligibility: "NOT_ELIGIBLE",
  measurements_written: 0,
}));
console.log(JSON.stringify({
  query,
  retrieved_at: new Date().toISOString(),
  http: response.status,
  hit_count: payload.hitCount ?? null,
  stored_as_evidence: false,
  measurements_written: 0,
  records,
}));
