import type { KnowledgeSnapshot, Strain } from "./knowledge.ts";

export type ChatCard = {
  id: string;
  name: string;
  breeder: string | null;
  line: string;
  slot: "A" | "B" | "name";
};

export type ChatIntent =
  | { kind: "cross"; a: string; b: string }
  | { kind: "lookup"; query: string };

type ParentBlock = {
  role: string;
  query: string;
  resolution: {
    match_kind: string;
    strain_id: string | null;
    canonical_name: string | null;
    candidates: { id: string; name: string }[];
    candidate_count: number;
  };
};

export type ChatReport = {
  status: string;
  cache_status: string;
  knowledge_snapshot: string;
  pedigree_confidence: { value: number | null };
  chemotype: { percentage_status: string };
  parents: ParentBlock[];
  reproducibility: { seed: number };
  foundation_evidence?: {
    parent_a: {
      source_records?: number;
      source_rows?: number;
      numeric_measurements?: number;
      conflicting?: number;
      independent_samples?: number;
      independent_lab_samples?: number | null;
    } | null;
    parent_b: {
      source_records?: number;
      source_rows?: number;
      numeric_measurements?: number;
      conflicting?: number;
      independent_samples?: number;
      independent_lab_samples?: number | null;
    } | null;
  };
  sections?: {
    OBSERVED: { discipline: string; epistemic: string; statement: string }[];
    SUPPORTED_INFERENCE: { discipline: string; epistemic: string; statement: string }[];
    MODEL_PREDICTION: { discipline: string; epistemic: string; statement: string }[];
    UNCERTAINTY: { discipline: string; epistemic: string; statement: string }[];
    UNKNOWN: { discipline: string; epistemic: string; statement: string }[];
  };
};

export function interpretMessage(message: string): ChatIntent {
  const text = message.replace(/\s+/g, " ").trim();
  const stripped = text.replace(/^(?:analizza|fammi|vorrei|calcola)\s+/i, "");
  const voiced = stripped.match(/^(?:incrocia|incrocio(?:\s+tra)?|cross)\s+(.+?)\s+(?:con|e|x|per)\s+(.+)$/i);
  if (voiced?.[1] && voiced[2]) return { kind: "cross", a: tidy(voiced[1]), b: tidy(voiced[2]) };
  const times = stripped.split(/\s*[×✕]\s*|\s+x\s+/i);
  if (
    times.length === 2 &&
    tidy(times[0] ?? "").length >= 2 &&
    tidy(times[1] ?? "").length >= 2 &&
    !/^(chi|cosa|che|cerca|pedigree|dimmi|scheda)/i.test(times[0] ?? "")
  ) {
    return { kind: "cross", a: tidy(times[0] ?? ""), b: tidy(times[1] ?? "") };
  }
  const query = tidy(text.replace(/^(?:cerca|scheda|pedigree(?:\s+di)?|chi\s+è|cos'?\s*è|cosa\s+sai(?:\s+di|\s+su)?|parlami\s+di)\s+/i, ""));
  return { kind: "lookup", query: query || text };
}

function tidy(value: string): string {
  return value
    .replace(/[.?!]+$/g, "")
    .replace(/^(?:il|la|lo|i|gli|parent\s*[ab])\s+/i, "")
    .trim();
}

export function renderCross(report: ChatReport, knowledge: KnowledgeSnapshot): { reply: string; cards: ChatCard[] } {
  const cards = report.parents.flatMap((parent) => cardsFor(parent, knowledge));
  const lines = [
    `Ho letto «${report.parents.map((parent) => parent.query).join(" × ")}» sul catalogo aperto e sul registro G&G. I nomi omonimi non vengono fusi.`,
  ];
  for (const parent of report.parents) {
    lines.push(parentSentence(parent, knowledge));
  }
  const chosen = report.parents
    .map((parent) => (parent.resolution.strain_id ? knowledge.strains.find((strain) => strain.id === parent.resolution.strain_id) : null))
    .filter((strain): strain is Strain => Boolean(strain));
  if (chosen.length) {
    lines.push(chosen.map((strain) => factLine(strain)).join("\n"));
  }
  lines.push(
    `Il motore non stima la chimica della progenie: ${report.chemotype.percentage_status}. I THC scritti sulle schede restano dichiarazioni di vendita. Un terpene o un antociano senza analisi resta ignoto, non zero.`,
  );
  lines.push(
    `Stato ${report.status}. Confidenza di pedigree ${report.pedigree_confidence.value === null ? "non calcolata" : report.pedigree_confidence.value}: non è una percentuale genomica.`,
  );
  if (report.sections) {
    const uncertain = report.sections.UNCERTAINTY.map((item) => `${item.discipline} [${item.epistemic}]`).join(", ");
    const unknown = report.sections.UNKNOWN.map((item) => item.discipline).join(", ");
    lines.push(
      `Osservato: ${report.sections.OBSERVED.length}. Inferenza supportata: ${report.sections.SUPPORTED_INFERENCE.length}. Predizione di modello: ${report.sections.MODEL_PREDICTION.length}.`,
    );
    if (uncertain) lines.push(`Non stabilito, e non promosso a fatto: ${uncertain}.`);
    if (unknown) lines.push(`Senza record, quindi ignoto: ${unknown}.`);
  }
  lines.push(`Cache ${report.cache_status}. Snapshot ${report.knowledge_snapshot}. Seed ${report.reproducibility.seed}.`);
  const labA = report.foundation_evidence?.parent_a;
  const labB = report.foundation_evidence?.parent_b;
  if (labA || labB) {
    lines.push(
      `Nel database ci sono ${labA?.source_rows ?? labA?.source_records ?? 0} righe per il primo nome (${labA?.independent_samples ?? labA?.independent_lab_samples ?? "n/d"} campioni) e ${labB?.source_rows ?? labB?.source_records ?? 0} per il secondo (${labB?.independent_samples ?? labB?.independent_lab_samples ?? "n/d"} campioni), con ${labA?.numeric_measurements ?? 0} e ${labB?.numeric_measurements ?? 0} numeri. Sono etichette di laboratorio, non la progenie. La probabilità resta non calcolabile.`,
    );
  }
  if (cards.length) lines.push("Scegli la scheda giusta qui sotto. Solo allora il nome è univoco.");
  return { reply: lines.join("\n\n"), cards };
}

export function renderLookup(query: string, knowledge: KnowledgeSnapshot): { reply: string; cards: ChatCard[] } {
  const norm = query.trim().toLowerCase();
  const exact = knowledge.strains.filter((strain) => sameName(strain, norm));
  const pool = exact.length
    ? exact
    : knowledge.strains.filter((strain) => {
        const name = `${strain.canonical_name} ${strain.aliases.join(" ")}`.toLowerCase();
        return norm.length >= 3 && name.includes(norm);
      });
  const ordered = [...pool].sort((a, b) => prefer(a, b)).slice(0, 8);
  const cards: ChatCard[] = ordered.map((strain) => ({
    id: strain.id,
    name: strain.canonical_name,
    breeder: strain.breeder,
    line: factLine(strain),
    slot: "name",
  }));
  if (!pool.length) {
    return {
      reply: `«${query}» non è nel catalogo aperto né nel registro G&G. Non invento un pedigree e non gli assegno un THC.`,
      cards: [],
    };
  }
  const meta = knowledge.catalog_meta;
  const scope = meta ? `${meta.loaded_records} schede ${meta.source_name}, ${meta.license}` : "catalogo";
  const lead = exact.length
    ? `«${query}» compare in ${exact.length} schede su ${scope}. Non ne scelgo una al posto tuo.`
    : `Nessuna scheda si chiama esattamente «${query}». Nel catalogo ne ho ${pool.length} che contengono quel testo. Le prime sono sotto.`;
  return {
    reply: `${lead}\n\n${ordered.map((strain) => factLine(strain)).join("\n")}\n\nUn tap sulla scheda la fissa come parent, oppure aprila fra le cultivar.`,
    cards,
  };
}

function cardsFor(parent: ParentBlock, knowledge: KnowledgeSnapshot): ChatCard[] {
  const ids = [
    ...(parent.resolution.strain_id ? [parent.resolution.strain_id] : []),
    ...parent.resolution.candidates.map((candidate) => candidate.id),
  ];
  const seen = new Set<string>();
  const cards: ChatCard[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const strain = knowledge.strains.find((item) => item.id === id);
    if (!strain) continue;
    cards.push({
      id: strain.id,
      name: strain.canonical_name,
      breeder: strain.breeder,
      line: factLine(strain),
      slot: parent.role === "B" ? "B" : "A",
    });
  }
  return cards;
}

function parentSentence(parent: ParentBlock, knowledge: KnowledgeSnapshot): string {
  const count = parent.resolution.candidate_count;
  if (parent.resolution.match_kind === "UNRESOLVED" || count === 0) {
    return `Parent ${parent.role} «${parent.query}»: nessuna scheda. Il pedigree resta vuoto.`;
  }
  if (parent.resolution.strain_id) {
    const strain = knowledge.strains.find((item) => item.id === parent.resolution.strain_id);
    return `Parent ${parent.role}: uso «${strain?.canonical_name ?? parent.query}»${strain?.breeder ? ` di ${strain.breeder}` : ""}. Match ${parent.resolution.match_kind}.`;
  }
  return `Parent ${parent.role} «${parent.query}»: ${count} schede diverse. Non le fondo.`;
}

function factLine(strain: Strain): string {
  const catalog = strain.catalog;
  const parents = catalog?.parents.length ? catalog.parents.join(" × ") : "non dichiarati";
  const chem = [
    catalog?.thc ? `THC dichiarato ${catalog.thc}` : null,
    catalog?.cbd ? `CBD dichiarato ${catalog.cbd}` : null,
    catalog?.flower ? `fioritura dichiarata ${catalog.flower} giorni` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${strain.canonical_name}${strain.breeder ? ` · ${strain.breeder}` : ""} — parent ${parents}${chem ? `. ${chem}` : ""}. ${strain.record_role === "open_catalog" ? "Fonte catalogo, non laboratorio" : strain.record_role}.`;
}

function sameName(strain: Strain, raw: string): boolean {
  return strain.canonical_name.toLowerCase() === raw || strain.aliases.some((alias) => alias.toLowerCase() === raw);
}

function prefer(a: Strain, b: Strain): number {
  const rank = (strain: Strain) => (strain.id.startsWith("ggs-") ? 0 : 2) + (strain.catalog?.parents.length ? 0 : 1);
  return rank(a) - rank(b) || a.canonical_name.localeCompare(b.canonical_name);
}
