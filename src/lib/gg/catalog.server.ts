import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeName } from "./engine.ts";
import type { Edge, KnowledgeSnapshot, Source, Strain } from "./knowledge.ts";

type Row = {
  id: string;
  name: string;
  alias: string | null;
  breeder: string | null;
  parents: string[];
  thc: string | null;
  cbd: string | null;
  flower: string | null;
  kind: string | null;
  auto: boolean;
  url: string | null;
};

type FileShape = {
  source_name: string;
  license: string;
  attribution: string;
  source_url: string;
  retrieved: string;
  rows_in_source: number;
  records: Row[];
};

let cachedFile: FileShape | null = null;

function readCatalog(): FileShape {
  if (cachedFile) return cachedFile;
  const file = path.join(process.cwd(), "data/catalog.json");
  cachedFile = JSON.parse(readFileSync(file, "utf8")) as FileShape;
  return cachedFile;
}

const SOURCE_ID = "src-ci-strains-pro";

export function mergeOpenCatalog(base: KnowledgeSnapshot): KnowledgeSnapshot {
  const file = readCatalog();
  const source: Source = {
    id: SOURCE_ID,
    name: "CI-Strains-Pro — Cannabis Intelligence Database",
    url: file.source_url,
    source_type: "open_catalog",
    publisher: "Shannon Goddard",
    license: file.license,
    terms_status: "CC_BY_4_0",
    robots_status: "NOT_APPLICABLE_PUBLISHED_DATASET",
    access_method: "bulk_csv",
    tier: "C",
    legal_usage_status: "OPEN_CATALOG_WITH_ATTRIBUTION",
    retrieved: file.retrieved,
  };
  const strains: Strain[] = file.records.map((row) => {
    const parents = row.parents.filter(Boolean);
    const bits = [
      row.breeder ? `Breeder dichiarato: ${row.breeder}.` : "Breeder non indicato.",
      parents.length ? `Parent dichiarati: ${parents.join(" × ")}.` : "Parent non dichiarati in questa scheda.",
      row.thc ? `THC dichiarato ${row.thc}. Non è una misura di laboratorio.` : null,
      row.cbd ? `CBD dichiarato ${row.cbd}. Non è una misura di laboratorio.` : null,
      row.flower ? `Fioritura dichiarata ${row.flower} giorni.` : null,
      row.kind ? `Tipo dichiarato: ${row.kind}.` : null,
      row.auto ? "Scheda marcata autoflower." : null,
    ].filter((bit): bit is string => Boolean(bit));
    return {
      id: row.id,
      canonical_name: row.name,
      aliases: row.alias ? [row.alias] : [],
      identity_status: "PROBABLE_IDENTITY",
      record_role: "open_catalog",
      breeder: row.breeder,
      summary: `Scheda del catalogo aperto ${file.source_name} (${file.license}). ${bits.join(" ")}`,
      catalog: {
        parents,
        thc: row.thc,
        cbd: row.cbd,
        flower: row.flower,
        kind: row.kind,
        auto: Boolean(row.auto),
        source_url: row.url,
      },
    };
  });
  const all = [...base.strains, ...strains];
  const byName = new Map<string, Strain[]>();
  for (const strain of all) {
    const key = normalizeName(strain.canonical_name);
    const list = byName.get(key);
    if (list) list.push(strain);
    else byName.set(key, [strain]);
  }
  const edges: Edge[] = [...base.edges];
  for (const strain of strains) {
    (strain.catalog?.parents ?? []).forEach((parent, index) => {
      const hits = (byName.get(normalizeName(parent)) ?? []).filter((hit) => hit.id !== strain.id);
      const unique = hits.length === 1 ? hits[0]! : null;
      edges.push({
        id: `${strain.id}-p${index}`,
        child_id: strain.id,
        parent_id: unique?.id ?? null,
        relationship_type: "reported_parent",
        confidence: 0.45,
        source_id: SOURCE_ID,
        note: unique
          ? `Parent dichiarato «${parent}» nel catalogo aperto. 0.45 è un peso euristico del resolver, non una probabilità e non un contributo genomico.`
          : `Parent dichiarato «${parent}». Il nome non è univoco o non ha una sola scheda, quindi non è stato collegato.`,
      });
    });
  }
  return {
    ...base,
    snapshot_id: "ggs-snap-1.2.0",
    sources: [...base.sources, source],
    strains: all,
    edges,
    catalog_meta: {
      source_name: file.source_name,
      license: file.license,
      attribution: file.attribution,
      source_url: file.source_url,
      retrieved: file.retrieved,
      source_rows: file.rows_in_source,
      loaded_records: strains.length,
      note: "THC, CBD e pedigree del catalogo sono dichiarazioni di breeder o seed bank. Non sono misure di laboratorio e non sono percentuali genomiche.",
    },
  };
}
