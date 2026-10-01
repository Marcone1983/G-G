/**
 * Regression fixture and cited literature. Not the cultivar catalog.
 * Catalog, samples, measurements and identity live only in data/gg-foundation.sqlite.
 * Names in this file are fixture records. They are not resolver special cases.
 */

export const KNOWLEDGE_ROLE = "REGRESSION_FIXTURE_AND_LITERATURE" as const;
export const SCIENTIFIC_SOURCE_OF_TRUTH = "sqlite:data/gg-foundation.sqlite" as const;

export const SNAPSHOT_ID = "ggs-snap-1.0.1";
export const MODEL_ID = "gg-sci-engine";
export const MODEL_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.0.0";
export const ENGINE_VERSION = "1.0.0";

export type IdentityStatus =
  | "CONFIRMED_IDENTITY"
  | "HIGH_CONFIDENCE_IDENTITY"
  | "PROBABLE_IDENTITY"
  | "AMBIGUOUS_IDENTITY"
  | "CONFLICTING_IDENTITY"
  | "UNRESOLVED_IDENTITY"
  | "IDENTITY_UNVERIFIED";

export type ParentRelation =
  | "known_parent"
  | "probable_parent"
  | "reported_parent"
  | "disputed_parent"
  | "unknown_parent";

export type ClaimClass =
  | "DOCUMENTED_FACT"
  | "OBSERVED_DATA"
  | "SCIENTIFIC_LITERATURE"
  | "USER_PROVIDED_OBSERVATION"
  | "MODEL_ASSUMPTION"
  | "MODEL_PREDICTION"
  | "STATISTICAL_INFERENCE"
  | "HYPOTHESIS"
  | "REPLICATED_PATTERN"
  | "VALIDATED_PATTERN"
  | "MARKETING_CLAIM";

export type Source = {
  id: string;
  name: string;
  url: string;
  source_type: string;
  publisher: string;
  license: string;
  terms_status: string;
  robots_status: string;
  access_method: string;
  tier: string;
  legal_usage_status: string;
  retrieved: string;
};

export type Strain = {
  id: string;
  canonical_name: string;
  aliases: string[];
  identity_status: IdentityStatus;
  record_role: string;
  breeder: string | null;
  summary: string;
  catalog?: {
    parents: string[];
    thc: string | null;
    cbd: string | null;
    flower: string | null;
    kind: string | null;
    auto: boolean;
    source_url: string | null;
  };
};

export type Edge = {
  id: string;
  child_id: string;
  parent_id: string | null;
  relationship_type: ParentRelation;
  confidence: number;
  source_id: string;
  note: string;
};

export type Claim = {
  id: string;
  subject_type: string;
  subject_id: string;
  field: string;
  claim_text: string;
  claim_class: ClaimClass;
  evidence_level: number;
  measurement_kind: "measured" | "reported" | "estimated" | "unknown";
  source_id: string;
  contradicts_claim_id: string | null;
  governance_status: string;
};

export type Trait = {
  id: string;
  strain_id: string;
  dimension: string;
  trait_key: string;
  value: Record<string, unknown>;
  measurement_type: "measured" | "reported" | "marketing" | "model_estimate";
  confidence: number;
  source_id: string;
  environment: Record<string, unknown>;
};

export type GeneticAssociation = {
  id: string;
  marker_or_gene: string;
  trait: string;
  effect: string;
  population: string;
  study: string;
  sample_note: string;
  source_id: string;
  replication_status: string;
  causal_claim: false;
};

export type Pattern = {
  id: string;
  pattern_type: string;
  hypothesis: string;
  validation_status: string;
  transferability: string;
  native_context: string;
  independent_support_count: number;
  lineage_count: number;
  source_count: number;
  contradiction_count: number;
};

export type CatalogMeta = {
  source_name: string;
  license: string;
  attribution: string;
  source_url: string;
  retrieved: string;
  source_rows: number;
  loaded_records: number;
  note: string;
};

export type KnowledgeSnapshot = {
  snapshot_id: string;
  sources: Source[];
  strains: Strain[];
  edges: Edge[];
  claims: Claim[];
  traits: Trait[];
  genetics: GeneticAssociation[];
  patterns: Pattern[];
  excluded_sources: { id: string; reason: string }[];
  catalog_meta: CatalogMeta | null;
};

const SENSI = "src-sensi-black-domina";

function strain(
  id: string,
  canonical_name: string,
  aliases: string[],
  record_role: string,
  breeder: string | null,
  summary: string,
): Strain {
  return {
    id,
    canonical_name,
    aliases,
    identity_status: "PROBABLE_IDENTITY",
    record_role,
    breeder,
    summary,
  };
}

const STRAINS: Strain[] = [
  strain("ggs-og-kush", "OG Kush", ["OGK"], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessun laboratorio è attaccato a questa scheda."),
  strain("ggs-wedding-cake", "Wedding Cake", [], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessuna misura è attaccata a questa scheda."),
  strain("ggs-super-lemon-haze", "Super Lemon Haze", [], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessuna misura è attaccata a questa scheda."),
  strain("ggs-purple-punch", "Purple Punch", [], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessuna misura è attaccata a questa scheda."),
  strain("ggs-sugar-black-rose", "Sugar Black Rose", [], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessuna misura è attaccata a questa scheda."),
  strain("ggs-lsd", "LSD", [], "public_name_only", null, "Nome di registro usato nei casi di regressione. Nessuna misura è attaccata a questa scheda."),
  strain("ggs-finola", "Finola", [], "literature_anchored", null, "Nome di registro. In questo snapshot non ha un pedigree collegato e non ha misure di laboratorio."),
  strain("ggs-gelato", "Gelato", [], "public_name_only", null, "Omonimo di registro. Non è fuso con Gelato #33. Nessun profilo chimico è attaccato a questa scheda."),
  strain(
    "ggs-gelato-33",
    "Gelato #33",
    ["Gelato 33", "Gelato#33"],
    "public_name_only",
    null,
    "Nome pubblico. Nessun pedigree verificato è attaccato a questa scheda di regressione.",
  ),
  strain(
    "ggs-black-domina",
    "Black Domina",
    ["Black Domina®"],
    "literature_anchored",
    "Sensi Seeds",
    "Scheda di regressione ancorata a una dichiarazione del breeder. Non è un genotipo e non è un profilo di laboratorio.",
  ),
  strain(
    "ggs-black-domina-98",
    "Black Domina '98",
    ["Black Domina 98", "BD98"],
    "public_name_only",
    null,
    "Etichetta usata nei casi di regressione G&G. Non è stata fusa con Black Domina. Nessun pedigree verificato in questo snapshot.",
  ),
];

const EDGES: Edge[] = ["Northern Lights", "Ortega", "Hash Plant", "Afghani"].map((parent, index) => ({
  id: `edge-bd-${index}`,
  child_id: "ggs-black-domina",
  parent_id: null,
  relationship_type: "reported_parent" as const,
  confidence: 0.45,
  source_id: SENSI,
  note: `Parent dichiarato «${parent}». 0.45 è un peso euristico, non una probabilità e non una percentuale genomica.`,
}));

const CLAIMS: Claim[] = [
  {
    id: "clm-bd-sensi",
    subject_type: "strain",
    subject_id: "ggs-black-domina",
    field: "reported_pedigree",
    claim_text:
      "La pagina Sensi Seeds (2018, aggiornata 2020) descrive Black Domina come incrocio a quattro vie lanciato nel 1996 e indica Northern Lights, Ortega, Hash Plant e un Afghani. È la dichiarazione del breeder, non una genotipizzazione.",
    claim_class: "DOCUMENTED_FACT",
    evidence_level: 2,
    measurement_kind: "reported",
    source_id: SENSI,
    contradicts_claim_id: "clm-bd-sa",
    governance_status: "CURATED",
  },
  {
    id: "clm-bd-sa",
    subject_type: "strain",
    subject_id: "ggs-black-domina",
    field: "reported_pedigree",
    claim_text:
      "Un'altra scheda commerciale riporta un parent diverso per lo stesso nome. Le due dichiarazioni restano entrambe. Nessuna viene scelta.",
    claim_class: "DOCUMENTED_FACT",
    evidence_level: 1,
    measurement_kind: "reported",
    source_id: SENSI,
    contradicts_claim_id: "clm-bd-sensi",
    governance_status: "CURATED",
  },
];

const TRAITS: Trait[] = [
  {
    id: "trait-bd-flower",
    strain_id: "ggs-black-domina",
    dimension: "phenology",
    trait_key: "flowering",
    value: { declared_interval_days: "breeder interval", note: "intervallo dichiarato, non un trial" },
    measurement_type: "reported",
    confidence: 0.45,
    source_id: SENSI,
    environment: {},
  },
];

const GENETICS: GeneticAssociation[] = [
  {
    id: "gen-gagalova-2024",
    marker_or_gene: "anthocyanin pathway literature",
    trait: "pigment class in a studied population",
    effect: "association reported in that population",
    population: "unrelated mapping population",
    study: "Gagalova 2024",
    sample_note: "Not these named parents. Not transferred.",
    source_id: "src-gagalova-2024",
    replication_status: "NOT_REPLICATED_HERE",
    causal_claim: false,
  },
];

const PATTERNS: Pattern[] = [
  {
    id: "pat-regression-context",
    pattern_type: "LITERATURE_CONTEXT",
    hypothesis: "Un pattern letto in una popolazione non si trasferisce a un nome di catalogo.",
    validation_status: "HYPOTHESIS",
    transferability: "NOT_TRANSFERABLE",
    native_context: "regression fixture",
    independent_support_count: 0,
    lineage_count: 0,
    source_count: 1,
    contradiction_count: 0,
  },
];

const SOURCES: Source[] = [
  {
    id: SENSI,
    name: "Sensi Seeds — Black Domina, 2018/2020",
    url: "https://sensiseeds.com/en/cannabis-seeds/sensi-seeds/black-domina",
    source_type: "breeder_publication",
    publisher: "Sensi Seeds",
    license: "page terms",
    terms_status: "BREEDER_PAGE",
    robots_status: "NOT_BULK_COPIED",
    access_method: "citation",
    tier: "C",
    legal_usage_status: "CITATION_NOT_MIRROR",
    retrieved: "2020",
  },
  {
    id: "src-gagalova-2024",
    name: "Gagalova 2024 pigment literature",
    url: "",
    source_type: "peer_reviewed",
    publisher: "literature",
    license: "citation",
    terms_status: "CITATION",
    robots_status: "NOT_BULK_COPIED",
    access_method: "citation",
    tier: "A",
    legal_usage_status: "CITATION",
    retrieved: "2024",
  },
  {
    id: "src-demeijer-2003",
    name: "de Meijer et al. 2003",
    url: "",
    source_type: "peer_reviewed",
    publisher: "literature",
    license: "citation",
    terms_status: "CITATION",
    robots_status: "NOT_BULK_COPIED",
    access_method: "citation",
    tier: "A",
    legal_usage_status: "CITATION",
    retrieved: "2003",
  },
  {
    id: "src-laverty-2019",
    name: "Laverty et al. 2019",
    url: "",
    source_type: "peer_reviewed",
    publisher: "literature",
    license: "citation",
    terms_status: "CITATION",
    robots_status: "NOT_BULK_COPIED",
    access_method: "citation",
    tier: "A",
    legal_usage_status: "CITATION",
    retrieved: "2019",
  },
  {
    id: "src-kim-2025",
    name: "Kim 2025 temperature literature",
    url: "",
    source_type: "peer_reviewed",
    publisher: "literature",
    license: "citation",
    terms_status: "CITATION",
    robots_status: "NOT_BULK_COPIED",
    access_method: "citation",
    tier: "A",
    legal_usage_status: "CITATION",
    retrieved: "2025",
  },
];

export const REGRESSION_CROSSES: [string, string][] = [
  ["Black Domina '98", "Sugar Black Rose"],
  ["Gelato #33", "Wedding Cake"],
  ["OG Kush", "Super Lemon Haze"],
  ["Purple Punch", "Gelato #33"],
  ["OG Kush", "Wedding Cake"],
];

export function buildSnapshot(): KnowledgeSnapshot {
  return {
    snapshot_id: SNAPSHOT_ID,
    sources: SOURCES,
    strains: STRAINS,
    edges: EDGES,
    claims: CLAIMS,
    traits: TRAITS,
    genetics: GENETICS,
    patterns: PATTERNS,
    excluded_sources: [
      { id: "src-seedfinder", reason: "rejected_not_ingested" },
      { id: "src-kushy", reason: "rejected_not_ingested" },
    ],
    catalog_meta: null,
  };
}
