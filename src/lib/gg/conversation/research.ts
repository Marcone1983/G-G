export type SourceClass =
  | "PRIMARY_SCIENTIFIC_SOURCE"
  | "SECONDARY_SCIENTIFIC_SOURCE"
  | "UNKNOWN_SOURCE";

export type LiteratureRecord = {
  title: string;
  doi: string | null;
  pmid: string | null;
  year: string | null;
  source_name: string | null;
  source_class: SourceClass;
  url: string | null;
  claim_type: "LITERATURE_TITLE";
  value: null;
  governance: "PENDING";
  promoted_to_measurement: false;
};

export type WebResult = {
  status: "ACQUIRED" | "ACQUISITION_FAILED" | "NOT_REQUIRED" | "REUSED";
  records: LiteratureRecord[];
  query: string | null;
};

export type WebProvider = {
  search(query: string): Promise<WebResult>;
};

export function classifyLiterature(input: { source?: string | null; pubType?: string | null }): SourceClass {
  const source = (input.source ?? "").toUpperCase();
  const kind = (input.pubType ?? "").toLowerCase();
  if (source === "MED" || source === "PMC" || kind.includes("journal")) return "PRIMARY_SCIENTIFIC_SOURCE";
  if (source === "PPR" || kind.includes("preprint") || kind.includes("review")) return "SECONDARY_SCIENTIFIC_SOURCE";
  return "UNKNOWN_SOURCE";
}

export function plainLiteratureTitle(title: string): string {
  return title
    .replace(/\u0026lt;/gi, "<")
    .replace(/\u0026gt;/gi, ">")
    .replace(/\u0026amp;/gi, "&")
    .replace(/\u0026quot;/gi, '"')
    .replace(/\u0026#39;|\u0026apos;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cannabisLiteratureTitle(title: string): boolean {
  return /\bcannabis\b|\bcannabinoid\b|\bhemp\b|\bmarijuana\b|\btetrahydrocannabinol\b|\bcannabidiol\b/i.test(plainLiteratureTitle(title));
}

export async function searchEuropePmc(query: string, limit = 5): Promise<WebResult> {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("resultType", "lite");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: "ACQUISITION_FAILED", records: [], query };
    const body = (await response.json()) as {
      resultList?: { result?: EuropePmcHit[] };
    };
    const hits = body.resultList?.result ?? [];
    return {
      status: hits.length ? "ACQUIRED" : "ACQUISITION_FAILED",
      query,
      records: hits.map(toRecord).filter((record) => record.title.length > 0),
    };
  } catch {
    return { status: "ACQUISITION_FAILED", records: [], query };
  }
}

type EuropePmcHit = {
  title?: string;
  doi?: string;
  pmid?: string;
  pubYear?: string;
  source?: string;
  pubType?: string;
};

function toRecord(hit: EuropePmcHit): LiteratureRecord {
  const doi = cleanId(hit.doi);
  return {
    title: plainLiteratureTitle(String(hit.title ?? "")),
    doi,
    pmid: cleanId(hit.pmid),
    year: cleanId(hit.pubYear),
    source_name: hit.source ?? null,
    source_class: classifyLiterature({ source: hit.source, pubType: hit.pubType }),
    url: doi ? `https://doi.org/${doi}` : null,
    claim_type: "LITERATURE_TITLE",
    value: null,
    governance: "PENDING",
    promoted_to_measurement: false,
  };
}

function cleanId(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export type ResearchSession = {
  research_id: string;
  query: string;
  records: LiteratureRecord[];
  retrieved_at: string;
  conflicts: ConflictRecord[];
};

export type ConflictRecord = {
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  resolution_status: "UNRESOLVED";
};

export function createResearchMemory() {
  const sessions = new Map<string, ResearchSession>();
  return {
    find(query: string, nowMs: number, maxAgeMs = 24 * 60 * 60 * 1000) {
      const found = sessions.get(normalize(query));
      if (!found) return null;
      const age = nowMs - Date.parse(found.retrieved_at);
      if (!Number.isFinite(age) || age > maxAgeMs) return null;
      return found;
    },
    save(session: ResearchSession) {
      const key = normalize(session.query);
      const previous = sessions.get(key);
      if (previous) {
        const seen = new Set(previous.records.map((record) => record.doi ?? record.title));
        session.records = [
          ...previous.records,
          ...session.records.filter((record) => !seen.has(record.doi ?? record.title)),
        ];
      }
      sessions.set(key, session);
      return session;
    },
    list() {
      return [...sessions.values()];
    },
  };
}

export function conflictFromParents(claims: { text: string; source: string }[]): ConflictRecord | null {
  const distinct = [...new Map(claims.map((claim) => [claim.text.toLowerCase(), claim])).values()];
  if (distinct.length < 2) return null;
  return {
    claim_a: distinct[0]!.text,
    claim_b: distinct[1]!.text,
    source_a: distinct[0]!.source,
    source_b: distinct[1]!.source,
    resolution_status: "UNRESOLVED",
  };
}

function normalize(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}
