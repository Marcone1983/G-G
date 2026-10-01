import type { Claim, ClaimClass, Edge, KnowledgeSnapshot, Strain, Trait } from "./knowledge.ts";

export const DOMAINS = [
  "GENETICS",
  "BOTANY",
  "MORPHOLOGY",
  "PHENOLOGY",
  "CHEMOTYPE",
  "TERPENES",
  "FLAVONOIDS",
  "ANTHOCYANINS",
  "ENVIRONMENT",
  "BREEDING",
  "PEDIGREE",
  "CULTIVATION",
  "PHARMACOGNOSY",
  "PHYTOCHEMISTRY",
  "EVIDENCE",
  "PROVENANCE",
] as const;

export type Domain = (typeof DOMAINS)[number];

export type Epistemic =
  | "OBSERVED"
  | "SUPPORTED_INFERENCE"
  | "MODEL_PREDICTION"
  | "BREEDER_CLAIM"
  | "DATABASE_RECORD"
  | "LITERATURE"
  | "UNKNOWN";

export type Lens = {
  discipline: string;
  domain: Domain;
  epistemic: Epistemic;
  statement: string;
  record_count: number;
  applies_to_offspring: false;
};

export function classifyField(field: string): Domain {
  const key = field.toLowerCase();
  if (key.includes("terpen")) return "TERPENES";
  if (key.includes("flavon")) return "FLAVONOIDS";
  if (key.includes("anthocyan") || key.includes("pigment")) return "ANTHOCYANINS";
  if (key.includes("flower") || key.includes("phenolog")) return "PHENOLOGY";
  if (key.includes("morph")) return "MORPHOLOGY";
  if (key.includes("thc") || key.includes("cbd") || key.includes("chemo") || key.includes("synthase")) return "CHEMOTYPE";
  if (key.includes("parent") || key.includes("pedigree") || key.includes("lineage")) return "PEDIGREE";
  if (key.includes("environment") || key.includes("temperature")) return "ENVIRONMENT";
  return "EVIDENCE";
}

export function lineageGraph(strain: Strain | null, knowledge: KnowledgeSnapshot, depth = 3) {
  const nodes: { id: string; name: string; depth: number }[] = [];
  const links: { child_id: string; parent_id: string | null; relationship_type: string; epistemic: Epistemic; note: string }[] = [];
  const seen = new Set<string>();
  const walk = (id: string | null, level: number) => {
    if (!id || level > depth || seen.has(id)) return;
    seen.add(id);
    const node = knowledge.strains.find((item) => item.id === id);
    nodes.push({ id, name: node?.canonical_name ?? id, depth: level });
    for (const edge of knowledge.edges.filter((item) => item.child_id === id)) {
      links.push({
        child_id: edge.child_id,
        parent_id: edge.parent_id,
        relationship_type: edge.relationship_type,
        epistemic: edgeEpistemic(edge),
        note: edge.note,
      });
      walk(edge.parent_id, level + 1);
    }
  };
  walk(strain?.id ?? null, 0);
  return {
    root: strain?.id ?? null,
    genomic_percentage: null,
    nodes,
    links,
  };
}

function edgeEpistemic(edge: Edge): Epistemic {
  if (edge.relationship_type === "known_parent") return "SUPPORTED_INFERENCE";
  if (edge.relationship_type === "reported_parent" || edge.relationship_type === "probable_parent") return "BREEDER_CLAIM";
  return "UNKNOWN";
}

function traitsOf(traits: Trait[], dimension: string) {
  return traits.filter((trait) => trait.dimension.toLowerCase().includes(dimension));
}

export function assessCross(
  a: Strain | null,
  b: Strain | null,
  knowledge: KnowledgeSnapshot,
  crossType: string,
  options?: {
    distribution_emitted?: boolean;
    foundation?: { a: LabView | null; b: LabView | null };
  },
): {
  lenses: Lens[];
  lineage: { a: ReturnType<typeof lineageGraph>; b: ReturnType<typeof lineageGraph> };
  epistemic: Record<Epistemic, string[]>;
  sections: ReturnType<typeof reportSections>;
  knowledge_graph: {
    genomic_percentage: null;
    a: ReturnType<typeof knowledgeLinks>;
    b: ReturnType<typeof knowledgeLinks>;
  };
  pattern_scan: ReturnType<typeof patternScan>;
} {
  const parents = [a, b].filter((strain): strain is Strain => Boolean(strain));
  const claims = knowledge.claims.filter((claim) => parents.some((strain) => strain.id === claim.subject_id));
  const traits = knowledge.traits.filter((trait) => parents.some((strain) => strain.id === trait.strain_id));
  const measured = traits.filter((trait) => trait.measurement_type === "measured");
  const parentEdges = parents.flatMap((strain) => knowledge.edges.filter((edge) => edge.child_id === strain.id));
  const pedigreeEpistemic: Epistemic = parentEdges.some((edge) => edge.relationship_type === "known_parent") &&
    parentEdges.every((edge) => edge.relationship_type === "known_parent")
    ? "SUPPORTED_INFERENCE"
    : parentEdges.length
      ? "BREEDER_CLAIM"
      : "UNKNOWN";
  const geneticsOnParents = geneticsTouching(parents, knowledge);
  const anthocyaninTraits = traitsOf(traits, "anthocyanin");
  const floweringDeclared =
    (options?.foundation?.a?.declared_flowering_records ?? 0) + (options?.foundation?.b?.declared_flowering_records ?? 0);
  const floweringTexts =
    (options?.foundation?.a?.declared_flowering_distinct_texts ?? 0) + (options?.foundation?.b?.declared_flowering_distinct_texts ?? 0);
  const terpeneClass = classTotals(options?.foundation, "TERPENE");
  const lenses: Lens[] = [
    lens(
      "Breeder",
      "BREEDING",
      parents.some((strain) => strain.breeder) ? "BREEDER_CLAIM" : "UNKNOWN",
      parents.some((strain) => strain.breeder)
        ? `Breeder dichiarato: ${parents.map((strain) => `${strain.canonical_name}: ${strain.breeder ?? "non indicato"}`).join("; ")}. Non è una prova genomica.`
        : "Nessun breeder archiviato per i parent risolti.",
      parents.filter((strain) => strain.breeder).length,
    ),
    lens(
      "Geneticist",
      "GENETICS",
      geneticsOnParents.length ? "LITERATURE" : "UNKNOWN",
      geneticsOnParents.length
        ? `Letteratura che nomina almeno un parent: ${geneticsOnParents.length} su ${knowledge.genetics.length}. causal_claim è falso. Record genomici sul nome: ${options?.foundation?.a?.genomic_records ?? 0} e ${options?.foundation?.b?.genomic_records ?? 0}. Un pedigree dichiarato non è una prova genomica.`
        : `Nessuna associazione di letteratura nomina questi parent. Record genomici sul nome: ${options?.foundation?.a?.genomic_records ?? 0} e ${options?.foundation?.b?.genomic_records ?? 0}. Il pedigree dichiarato resta REPORTED.`,
      geneticsOnParents.length,
    ),
    lens(
      "Botanist",
      "BOTANY",
      parents.some((strain) => strain.catalog?.kind) || options?.foundation?.a?.declared_types || options?.foundation?.b?.declared_types
        ? "DATABASE_RECORD"
        : "UNKNOWN",
      parents.some((strain) => strain.catalog?.kind)
        ? `Tipo dichiarato in catalogo: ${parents.map((strain) => strain.catalog?.kind).filter(Boolean).join("; ")}. Non è una determinazione botanica.`
        : options?.foundation?.a?.declared_types || options?.foundation?.b?.declared_types
          ? `Tipi dichiarati distinti sul nome: ${options?.foundation?.a?.declared_types ?? 0} e ${options?.foundation?.b?.declared_types ?? 0}. Autoflower dichiarato: ${options?.foundation?.a?.autoflower_records ?? 0} e ${options?.foundation?.b?.autoflower_records ?? 0}. Sono DOCUMENTED, non osservazioni.`
          : "Nessun tipo botanico misurato.",
      parents.filter((strain) => strain.catalog?.kind).length,
    ),
    lens(
      "Horticulturist",
      "CULTIVATION",
      traitsOf(traits, "phenology").length ? "BREEDER_CLAIM" : parents.some((strain) => strain.catalog?.flower) ? "DATABASE_RECORD" : floweringDeclared ? "DATABASE_RECORD" : "UNKNOWN",
      [
        traitsOf(traits, "phenology").length || parents.some((strain) => strain.catalog?.flower)
          ? "La fioritura presente nello snapshot curato è un intervallo dichiarato, non un trial multisito."
          : null,
        floweringDeclared
          ? `Nel database ci sono ${floweringDeclared} dichiarazioni di fioritura legate al nome, con ${floweringTexts} testi distinti. Restano DOCUMENTED, non osservazioni, e non vengono fuse in un unico intervallo della cultivar né della progenie.`
          : traitsOf(traits, "phenology").length || parents.some((strain) => strain.catalog?.flower)
            ? null
            : "Nessun protocollo colturale archiviato.",
      ]
        .filter(Boolean)
        .join(" "),
      traitsOf(traits, "phenology").length + floweringDeclared,
    ),
    lens(
      "Herbalist",
      "PHARMACOGNOSY",
      "UNKNOWN",
      "Nessuna evidenza di effetti è interrogabile. Lo stato è NOT_AVAILABLE, non un effetto dedotto dal nome.",
      0,
    ),
    lens(
      "Phytochemist",
      "PHYTOCHEMISTRY",
      options?.foundation?.a?.numeric_measurements || options?.foundation?.b?.numeric_measurements
        ? "DATABASE_RECORD"
        : measured.some((trait) => trait.dimension === "chemotype")
          ? "OBSERVED"
          : claims.some((claim) => classifyField(claim.field) === "CHEMOTYPE")
            ? "LITERATURE"
            : parents.some((strain) => strain.catalog?.thc || strain.catalog?.cbd)
              ? "BREEDER_CLAIM"
              : "UNKNOWN",
      [
        labText(options?.foundation?.a, "Parent A"),
        labText(options?.foundation?.b, "Parent B"),
        measured.some((trait) => trait.dimension === "chemotype")
          ? "C'è anche una misura di chemotipo nello snapshot curato. Non diventa la distribuzione della progenie."
          : parents.some((strain) => strain.catalog?.thc || strain.catalog?.cbd)
            ? "THC/CBD di catalogo restano dichiarazioni, non laboratorio."
            : "Nessuna misura curata oltre a quanto elencato sui campioni.",
      ]
        .filter(Boolean)
        .join(" "),
      (options?.foundation?.a?.independent_samples ?? 0) + (options?.foundation?.b?.independent_samples ?? 0),
    ),
    lens(
      "Terpenes",
      "TERPENES",
      terpeneClass.numeric || terpeneClass.qualified || terpeneClass.zeros
        ? "DATABASE_RECORD"
        : traitsOf(traits, "terpene").some((trait) => trait.measurement_type === "measured")
          ? "OBSERVED"
          : "UNKNOWN",
      terpeneClass.numeric || terpeneClass.qualified || terpeneClass.zeros
        ? `Classe TERPENE sui campioni del nome: ${terpeneClass.numeric} numeri, ${terpeneClass.qualified} qualificati, ${terpeneClass.zeros} zeri scritti dalla fonte. ND non è zero. Nessun composto viene nominato. Non è il profilo della cultivar né della progenie.`
        : traitsOf(traits, "terpene").length
          ? "Sono archiviati solo i descrittori terpenici presenti nei trait. Nessun nome assente dal record viene aggiunto."
          : "Nessun profilo terpenico misurato. Nessun terpene viene nominato o quantificato.",
      terpeneClass.numeric || traitsOf(traits, "terpene").length,
    ),
    lens(
      "Flavonoids",
      "FLAVONOIDS",
      traitsOf(traits, "flavonoid").some((trait) => trait.measurement_type === "measured") ? "OBSERVED" : "UNKNOWN",
      traitsOf(traits, "flavonoid").length
        ? "Sono archiviati solo i flavonoidi presenti nei trait. Nessuna percentuale viene stimata."
        : "Nessun flavonoide misurato. Nessuna percentuale viene stimata.",
      traitsOf(traits, "flavonoid").length,
    ),
    lens(
      "Anthocyanins",
      "ANTHOCYANINS",
      anthocyaninTraits.some((trait) => trait.measurement_type === "measured") ? "OBSERVED" : "UNKNOWN",
      anthocyaninTraits.length
        ? "Antociani presenti solo se il trait è archiviato. Un fiore scuro non è un gene black e il viola non è il nero."
        : `Nessuna misura di antociani su questi parent. I record di letteratura (${knowledge.genetics.filter((item) => /anthocyan|pigment/i.test(`${item.trait} ${item.marker_or_gene}`)).length}) restano nella loro popolazione: correlazione non è causalità e non è un allele purple o black.`,
      anthocyaninTraits.length,
    ),
    lens(
      "Morphology",
      "MORPHOLOGY",
      traitsOf(traits, "morphology").length ? "BREEDER_CLAIM" : "UNKNOWN",
      traitsOf(traits, "morphology").length ? "Morfologia presente solo come dato dichiarato." : "Nessun descrittore morfologico archiviato.",
      traitsOf(traits, "morphology").length,
    ),
    lens(
      "Phenology",
      "PHENOLOGY",
      traitsOf(traits, "phenology").length ? "BREEDER_CLAIM" : parents.some((strain) => strain.catalog?.flower) ? "DATABASE_RECORD" : "UNKNOWN",
      parents.some((strain) => strain.catalog?.flower)
        ? `Fioritura dichiarata: ${parents.map((strain) => strain.catalog?.flower).filter(Boolean).join("; ")} giorni.`
        : traitsOf(traits, "phenology").length
          ? "Fioritura archiviata come intervallo del breeder, non come osservazione di questo incrocio."
          : "Fenologia assente.",
      traitsOf(traits, "phenology").length,
    ),
    lens(
      "Pedigree",
      "PEDIGREE",
      pedigreeEpistemic,
      "Gli archi in memoria sono dichiarati o, se known_parent, già accettati nel registro. Nel database i genitori dichiarati dei due nomi sono " +
        `${options?.foundation?.a?.reported_parents ?? 0} e ${options?.foundation?.b?.reported_parents ?? 0}. Non sono una percentuale genomica e il vecchio 0,45 è solo un peso euristico.`,
      parentEdges.length,
    ),
    lens(
      "Evidence",
      "EVIDENCE",
      claims.some((claim) => claim.claim_class === "OBSERVED_DATA")
        ? "OBSERVED"
        : claims.some((claim) => claim.claim_class === "SCIENTIFIC_LITERATURE")
          ? "LITERATURE"
          : claims.length
            ? "BREEDER_CLAIM"
            : "UNKNOWN",
      claims.length
        ? `Claim sui parent, per classe: ${countClasses(claims)}. Nessuna classe viene promossa a misura di laboratorio.`
        : "Nessun claim agganciato a questi due nomi.",
      claims.length,
    ),
    lens(
      "Provenance",
      "PROVENANCE",
      parents.some((strain) => strain.catalog?.source_url) || claims.some((claim) => claim.source_id) ? "DATABASE_RECORD" : "UNKNOWN",
      "Ogni claim e ogni scheda di catalogo tengono il source_id. Una riga di catalogo non è una prova genetica.",
      claims.filter((claim) => claim.source_id).length + parents.filter((strain) => strain.catalog?.source_url).length,
    ),
    lens(
      "Prediction",
      "BREEDING",
      options?.distribution_emitted ? "MODEL_PREDICTION" : "UNKNOWN",
      options?.distribution_emitted
        ? "È stata emessa una distribuzione di modello. Non è una frequenza osservata della progenie."
        : `Per questo ${crossType} non c'è una distribuzione: mancano misure confrontabili sui due parent.`,
      0,
    ),
    lens(
      "Uncertainty",
      "EVIDENCE",
      "UNKNOWN",
      "Identità ambigua, pedigree riportato e assenza di laboratorio restano incertezza. Il vuoto non viene riempito. Nessuna di queste incertezze diventa una percentuale.",
      0,
    ),
    lens(
      "Chemotype Analyst",
      "PHYTOCHEMISTRY",
      classTotals(options?.foundation, "CANNABINOID").numeric ? "DATABASE_RECORD" : "UNKNOWN",
      classTotals(options?.foundation, "CANNABINOID").numeric
        ? `Numeri di classe CANNABINOID sui campioni del nome: ${classTotals(options?.foundation, "CANNABINOID").numeric}. Descrizione dei campioni, non chemiotipo predetto della progenie.`
        : "Nessun chemiotipo osservato. PREDICTED_CHEMOTYPE resta chiuso.",
      classTotals(options?.foundation, "CANNABINOID").numeric,
    ),
    lens(
      "Evidence Analyst",
      "EVIDENCE",
      (options?.foundation?.a?.source_rows ?? 0) + (options?.foundation?.b?.source_rows ?? 0) ? "DATABASE_RECORD" : "UNKNOWN",
      `Righe ${options?.foundation?.a?.source_rows ?? 0} e ${options?.foundation?.b?.source_rows ?? 0}. Campioni indipendenti ${options?.foundation?.a?.independent_samples ?? 0} e ${options?.foundation?.b?.independent_samples ?? 0}. EXACT_IDENTITY resta ${options?.foundation?.a?.exact_identity ?? 0}. Un claim non è una misura.`,
      (options?.foundation?.a?.independent_samples ?? 0) + (options?.foundation?.b?.independent_samples ?? 0),
    ),
    lens(
      "Pattern Scientist",
      "EVIDENCE",
      "UNKNOWN",
      "I pattern di etichetta e i candidati restano LEGACY_NON_VALIDATED. Gli enunciati di letteratura non sono VALIDATED e non si applicano a questo incrocio.",
      0,
    ),
    lens(
      "Environment",
      "ENVIRONMENT",
      "UNKNOWN",
      "L'ambiente di questo incrocio non è un disegno sperimentale archiviato. La temperatura non viene generalizzata.",
      0,
    ),
  ];
  const epistemic = emptyEpistemic();
  for (const item of lenses) epistemic[item.epistemic].push(item.discipline);
  return {
    lenses,
    lineage: { a: lineageGraph(a, knowledge), b: lineageGraph(b, knowledge) },
    epistemic,
    sections: reportSections(lenses),
    knowledge_graph: {
      genomic_percentage: null,
      a: knowledgeLinks(a, knowledge),
      b: knowledgeLinks(b, knowledge),
    },
    pattern_scan: patternScan(knowledge),
  };
}

type LabView = {
  source_rows: number;
  independent_samples: number;
  numeric_measurements: number;
  qualified_measurements: number;
  source_reported_zeros: number;
  reported_parents: number;
  genomic_records: number;
  declared_types?: number;
  autoflower_records?: number;
  exact_identity?: number;
  chemistry?: { klass: string; numeric_measurements: number; qualified_measurements: number; source_reported_zeros: number; independent_samples: number }[];
  declared_flowering_records?: number;
  declared_flowering_distinct_texts?: number;
};

function labText(slot: LabView | null | undefined, label: string) {
  if (!slot || slot.source_rows === 0) return null;
  const classes = (slot.chemistry ?? [])
    .map(
      (row) =>
        `${row.klass}: ${row.numeric_measurements} numeri, ${row.qualified_measurements} qualificati, ${row.source_reported_zeros} zeri di fonte`,
    )
    .join("; ");
  return `${label}: ${slot.independent_samples} campioni indipendenti, ${slot.numeric_measurements} numeri, ${slot.qualified_measurements} valori qualificati, ${slot.source_reported_zeros} zeri scritti dalla fonte.${classes ? ` Classi: ${classes}.` : ""} Non sono il profilo della cultivar né della progenie.`;
}

function classTotals(foundation: { a: LabView | null; b: LabView | null } | undefined, klass: string) {
  const totals = { numeric: 0, qualified: 0, zeros: 0 };
  for (const slot of [foundation?.a, foundation?.b]) {
    for (const row of slot?.chemistry ?? []) {
      if (row.klass !== klass) continue;
      totals.numeric += row.numeric_measurements;
      totals.qualified += row.qualified_measurements;
      totals.zeros += row.source_reported_zeros;
    }
  }
  return totals;
}

function lens(discipline: string, domain: Domain, epistemic: Epistemic, statement: string, record_count: number): Lens {
  return { discipline, domain, epistemic, statement, record_count, applies_to_offspring: false };
}

export function reportSections(lenses: Lens[]) {
  const item = (entry: Lens) => ({ discipline: entry.discipline, epistemic: entry.epistemic, statement: entry.statement });
  return {
    OBSERVED: lenses.filter((entry) => entry.epistemic === "OBSERVED").map(item),
    SUPPORTED_INFERENCE: lenses.filter((entry) => entry.epistemic === "SUPPORTED_INFERENCE").map(item),
    MODEL_PREDICTION: lenses.filter((entry) => entry.epistemic === "MODEL_PREDICTION").map(item),
    UNCERTAINTY: lenses
      .filter((entry) => entry.epistemic === "BREEDER_CLAIM" || entry.epistemic === "DATABASE_RECORD" || entry.epistemic === "LITERATURE")
      .map(item),
    UNKNOWN: lenses.filter((entry) => entry.epistemic === "UNKNOWN").map(item),
  };
}

export function knowledgeLinks(strain: Strain | null, knowledge: KnowledgeSnapshot) {
  const relations: { from: string; to: string | null; kind: string; epistemic: Epistemic; label: string }[] = [];
  if (!strain) return { strain_id: null as string | null, genomic_percentage: null as null, relations };
  for (const edge of knowledge.edges.filter((item) => item.child_id === strain.id)) {
    relations.push({
      from: strain.id,
      to: edge.parent_id,
      kind: "PARENT",
      epistemic: edgeEpistemic(edge),
      label: edge.relationship_type,
    });
  }
  for (const trait of knowledge.traits.filter((item) => item.strain_id === strain.id)) {
    const names = traitNames(trait);
    relations.push({
      from: strain.id,
      to: trait.id,
      kind: trait.dimension.toLowerCase().includes("terpen")
        ? "TERPENE"
        : trait.dimension.toLowerCase().includes("flavon")
          ? "FLAVONOID"
          : "TRAIT",
      epistemic: trait.measurement_type === "measured" ? "OBSERVED" : trait.measurement_type === "reported" ? "BREEDER_CLAIM" : "UNKNOWN",
      label: names ? `${trait.dimension}:${trait.trait_key}:${names}` : `${trait.dimension}:${trait.trait_key}`,
    });
  }
  for (const claim of knowledge.claims.filter((item) => item.subject_id === strain.id)) {
    relations.push({
      from: strain.id,
      to: claim.id,
      kind: "CLAIM",
      epistemic: claimEpistemic(claim.claim_class),
      label: `${claim.claim_class}:${claim.field}`,
    });
  }
  if (strain.catalog?.thc || strain.catalog?.cbd) {
    relations.push({
      from: strain.id,
      to: null,
      kind: "CHEMOTYPE_DECLARATION",
      epistemic: "BREEDER_CLAIM",
      label: [strain.catalog.thc ? `THC ${strain.catalog.thc}` : null, strain.catalog.cbd ? `CBD ${strain.catalog.cbd}` : null].filter(Boolean).join(", "),
    });
  }
  return { strain_id: strain.id, genomic_percentage: null as null, relations };
}

export function patternScan(knowledge: KnowledgeSnapshot) {
  const measured = knowledge.traits.filter((trait) => trait.measurement_type === "measured");
  const count = (dimension: string) => measured.filter((trait) => trait.dimension === dimension).length;
  return {
    engine: "gg-pattern-v1",
    auto_validated: false,
    offspring_table: false,
    applied_to_this_cross: false,
    stored_patterns: knowledge.patterns.map((pattern) => ({
      pattern_id: pattern.id,
      validation_status: pattern.validation_status,
      transferability: pattern.transferability,
      native_context: pattern.native_context,
    })),
    measured_by_dimension: {
      chemotype: count("chemotype"),
      terpene: count("terpene"),
      flavonoid: count("flavonoid"),
      anthocyanin: count("anthocyanin"),
      morphology: count("morphology"),
      phenology: count("phenology"),
    },
    note: "Un pattern resta nel contesto nativo. Non diventa un fatto del cross corrente e non si auto-valida.",
  };
}

function geneticsTouching(parents: Strain[], knowledge: KnowledgeSnapshot) {
  return knowledge.genetics.filter((gene) => {
    const blob = `${gene.population} ${gene.effect} ${gene.sample_note}`.toLowerCase();
    return parents.some((strain) => blob.includes(strain.canonical_name.toLowerCase()));
  });
}

function countClasses(claims: Claim[]): string {
  const counts = new Map<string, number>();
  for (const claim of claims) counts.set(claim.claim_class, (counts.get(claim.claim_class) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => `${name} ${count}`).join(", ");
}

function claimEpistemic(claimClass: ClaimClass): Epistemic {
  if (claimClass === "OBSERVED_DATA") return "OBSERVED";
  if (claimClass === "SCIENTIFIC_LITERATURE") return "LITERATURE";
  if (claimClass === "MODEL_PREDICTION") return "MODEL_PREDICTION";
  if (claimClass === "STATISTICAL_INFERENCE") return "SUPPORTED_INFERENCE";
  if (claimClass === "DOCUMENTED_FACT" || claimClass === "MARKETING_CLAIM" || claimClass === "USER_PROVIDED_OBSERVATION") return "BREEDER_CLAIM";
  return "UNKNOWN";
}

function traitNames(trait: Trait): string {
  const value = trait.value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const raw = record.name ?? record.compound ?? record.analyte;
  return typeof raw === "string" ? raw : "";
}

function emptyEpistemic(): Record<Epistemic, string[]> {
  return {
    OBSERVED: [],
    SUPPORTED_INFERENCE: [],
    MODEL_PREDICTION: [],
    BREEDER_CLAIM: [],
    DATABASE_RECORD: [],
    LITERATURE: [],
    UNKNOWN: [],
  };
}
