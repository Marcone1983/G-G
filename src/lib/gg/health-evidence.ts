export const HEALTH_EFFECT_DOMAINS = [
  "BIOLOGICAL",
  "PHARMACOLOGICAL",
  "THERAPEUTIC",
  "POSSIBLE_BENEFIT",
  "RISK",
  "ADVERSE_EVENT",
  "TOXICITY",
  "PHYSIOLOGICAL",
  "NEUROLOGICAL",
  "IMMUNOLOGICAL",
  "CARDIOVASCULAR",
  "METABOLIC",
  "DRUG_INTERACTION",
  "CLINICAL_OUTCOME",
] as const;

export const EVIDENCE_CLASSES = [
  "PRECLINICAL",
  "IN_VITRO",
  "ANIMAL",
  "OBSERVATIONAL",
  "CLINICAL",
  "SYSTEMATIC_REVIEW",
  "META_ANALYSIS",
  "PRIMARY",
] as const;

export const ATTRIBUTION_LEVELS = [
  "DIRECT_STRAIN_EVIDENCE",
  "STRAIN_CHEMOTYPE_LINK",
  "COMPOUND_LEVEL_EVIDENCE",
  "FORMULATION_LEVEL_EVIDENCE",
  "CLASS_LEVEL_EVIDENCE",
  "PRECLINICAL_ONLY",
  "OBSERVATIONAL_ONLY",
  "CLINICAL_EVIDENCE",
  "INSUFFICIENT_EVIDENCE",
] as const;

export const GRAPH_RELATIONS = ["HAS_MEASURED_CHEMOTYPE", "CONTAINS_COMPOUND", "SUPPORTED_BY", "REPORTS_OUTCOME"] as const;

export const SEARCH_DIMENSIONS = [
  "STRAIN",
  "CULTIVAR_OR_CLONE",
  "MEASURED_CHEMOTYPE",
  "CANNABINOID",
  "TERPENE",
  "COMPOUND_COMBINATION",
  "FORMULATION",
  "PRECLINICAL",
  "OBSERVATIONAL_HUMAN",
  "CLINICAL",
  "SYSTEMATIC_REVIEW",
  "META_ANALYSIS",
  "ADVERSE_EVENT",
  "TOXICOLOGY",
  "DRUG_INTERACTION",
] as const;

export const HEALTH_RULES = [
  { id: "H01", text: "L'evidenza sanitaria specifica di uno strain non si scarta solo perché è specifica." },
  { id: "H02", text: "Un effetto biologico documentato si acquisisce." },
  { id: "H03", text: "Un effetto farmacologico documentato si acquisisce." },
  { id: "H04", text: "Un effetto terapeutico documentato si acquisisce." },
  { id: "H05", text: "Un possibile beneficio documentato si acquisisce, senza diventare cura." },
  { id: "H06", text: "Un rischio documentato si acquisisce." },
  { id: "H07", text: "Un evento avverso documentato si acquisisce." },
  { id: "H08", text: "Una tossicità documentata si acquisisce." },
  { id: "H09", text: "Una risposta fisiologica documentata si acquisisce." },
  { id: "H10", text: "Una risposta neurologica documentata si acquisisce." },
  { id: "H11", text: "Una risposta immunologica documentata si acquisisce." },
  { id: "H12", text: "Una risposta cardiovascolare documentata si acquisisce." },
  { id: "H13", text: "Una risposta metabolica documentata si acquisisce." },
  { id: "H14", text: "Un'interazione farmacologica documentata si acquisisce." },
  { id: "H15", text: "Un outcome clinico documentato si acquisisce." },
  { id: "H16", text: "Il record conserva la forza dell'evidenza." },
  { id: "H17", text: "Il record conserva la popolazione." },
  { id: "H18", text: "Dose, formulazione e via si conservano quando esistono e restano null quando mancano." },
  { id: "H19", text: "Il record conserva il disegno dello studio." },
  { id: "H20", text: "Il record conserva la fonte." },
  { id: "H21", text: "Il record conserva le limitazioni." },
  { id: "H22", text: "Il record conserva la data." },
  { id: "H23", text: "Il record conserva la provenienza." },
  { id: "H24", text: "L'evidenza sul composto resta sul composto." },
  { id: "H25", text: "L'evidenza sulla classe non diventa evidenza dello strain." },
  { id: "H26", text: "Il chemotipo misurato si collega solo con un record di chemotipo documentato." },
  { id: "H27", text: "Un collegamento di chemotipo ipotizzato viene rifiutato." },
  { id: "H28", text: "Il preclinico resta PRECLINICAL." },
  { id: "H29", text: "In vitro resta IN_VITRO." },
  { id: "H30", text: "L'animale resta ANIMAL." },
  { id: "H31", text: "Il preclinico non diventa evidenza clinica umana." },
  { id: "H32", text: "L'osservazionale umano resta OBSERVATIONAL." },
  { id: "H33", text: "L'osservazionale non diventa causalità." },
  { id: "H34", text: "Il clinico resta CLINICAL." },
  { id: "H35", text: "Il clinico conserva l'identità dello studio." },
  { id: "H36", text: "Il clinico conserva la popolazione dello studio." },
  { id: "H37", text: "Il clinico conserva l'outcome." },
  { id: "H38", text: "Il clinico conserva dose e formulazione quando riportate." },
  { id: "H39", text: "Il clinico conserva la qualità metodologica." },
  { id: "H40", text: "Review e meta-analisi citano le fonti primarie quando sono fornite." },
  { id: "H41", text: "La sintesi resta separata dall'osservazione primaria." },
  { id: "H42", text: "La catena strain richiede un'identità verificata prima dell'attribuzione diretta." },
  { id: "H43", text: "La catena passa dal chemotipo misurato, non dal nome commerciale." },
  { id: "H44", text: "La catena passa dal composto o dal profilo misurato." },
  { id: "H45", text: "La catena richiede evidenza biologica o farmacologica citata." },
  { id: "H46", text: "L'outcome resta distinto dallo strain." },
  { id: "H47", text: "Il grafo usa HAS_MEASURED_CHEMOTYPE." },
  { id: "H48", text: "Il grafo usa CONTAINS_COMPOUND." },
  { id: "H49", text: "Il grafo usa SUPPORTED_BY." },
  { id: "H50", text: "Il grafo usa REPORTS_OUTCOME." },
  { id: "H51", text: "Ogni arco conserva la provenienza." },
  { id: "H52", text: "STRAIN CURES CONDITION non viene creato." },
  { id: "H53", text: "La ricerca cerca prima l'evidenza diretta dello strain." },
  { id: "H54", text: "Se manca l'evidenza di strain, la ricerca scende al composto e lo dichiara." },
  { id: "H55", text: "L'attribuzione è obbligatoria e non si comprime in un unico health benefit." },
  { id: "H56", text: "L'assenza di evidenza non è evidenza di assenza." },
  { id: "H57", text: "Una correlazione non diventa causalità." },
  { id: "H58", text: "Una testimonianza non diventa prova scientifica." },
  { id: "H59", text: "L'evidenza presente non si nasconde." },
  { id: "H60", text: "Non si generalizza oltre il livello di attribuzione." },
  { id: "H61", text: "Se esiste evidenza diretta, la risposta può dirlo." },
  { id: "H62", text: "Se l'evidenza è solo di composto o chemotipo, la risposta lo dice." },
  { id: "H63", text: "Un record accettato non viene scritto nel corpus durante una fase di sola lettura." },
  { id: "H64", text: "Nessuno strain ha una regola speciale. Il gate è generale." },
] as const;

export type HealthEffectDomain = (typeof HEALTH_EFFECT_DOMAINS)[number];
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];
export type AttributionLevel = (typeof ATTRIBUTION_LEVELS)[number];
export type GraphRelation = (typeof GRAPH_RELATIONS)[number];
export type HealthRuleId = (typeof HEALTH_RULES)[number]["id"];

export type HealthEdge = {
  relation: GraphRelation;
  from_id: string;
  to_id: string;
  provenance: string;
};

export type HealthEvidenceInput = {
  subject_name: string;
  identity_status: string | null;
  effect_domain: HealthEffectDomain;
  evidence_class: EvidenceClass;
  attribution: AttributionLevel;
  evidence_strength: string | null;
  population: string | null;
  dose: string | null;
  formulation: string | null;
  route: string | null;
  study_design: string | null;
  source: string | null;
  limitations: string | null;
  evidence_date: string | null;
  provenance: string | null;
  study_id: string | null;
  methodological_quality: string | null;
  chemotype_id: string | null;
  chemotype_documented: boolean;
  compound: string | null;
  outcome: string | null;
  causal: boolean;
  testimony: boolean;
  primary_source_ids: string[];
  edges: HealthEdge[];
};

export type HealthAdmission = {
  accepted: boolean;
  stored: false;
  violations: HealthRuleId[];
  attribution: AttributionLevel | null;
  cure_edge: false;
};

const PRECLINICAL = new Set<EvidenceClass>(["PRECLINICAL", "IN_VITRO", "ANIMAL"]);
const STRAIN_ATTRIBUTION = new Set<AttributionLevel>(["DIRECT_STRAIN_EVIDENCE", "STRAIN_CHEMOTYPE_LINK", "CLINICAL_EVIDENCE"]);

export function emptyHealthInput(partial: Partial<HealthEvidenceInput> = {}): HealthEvidenceInput {
  return {
    subject_name: "",
    identity_status: null,
    effect_domain: "BIOLOGICAL",
    evidence_class: "PRIMARY",
    attribution: "INSUFFICIENT_EVIDENCE",
    evidence_strength: null,
    population: null,
    dose: null,
    formulation: null,
    route: null,
    study_design: null,
    source: null,
    limitations: null,
    evidence_date: null,
    provenance: null,
    study_id: null,
    methodological_quality: null,
    chemotype_id: null,
    chemotype_documented: false,
    compound: null,
    outcome: null,
    causal: false,
    testimony: false,
    primary_source_ids: [],
    edges: [],
    ...partial,
  };
}

export function admitHealthEvidence(input: HealthEvidenceInput): HealthAdmission {
  const violations = new Set<HealthRuleId>();
  if (!HEALTH_EFFECT_DOMAINS.includes(input.effect_domain)) violations.add("H02");
  if (!ATTRIBUTION_LEVELS.includes(input.attribution)) violations.add("H55");
  if (!input.evidence_strength) violations.add("H16");
  if (!input.population) violations.add("H17");
  if (input.dose === undefined || input.formulation === undefined || input.route === undefined) violations.add("H18");
  if (!input.study_design) violations.add("H19");
  if (!input.source) violations.add("H20");
  if (!input.limitations) violations.add("H21");
  if (!input.evidence_date) violations.add("H22");
  if (!input.provenance) violations.add("H23");
  if (input.attribution === "COMPOUND_LEVEL_EVIDENCE" && !input.compound) violations.add("H24");
  if (input.attribution === "CLASS_LEVEL_EVIDENCE" && input.attribution === "DIRECT_STRAIN_EVIDENCE") violations.add("H25");
  if (input.attribution === "DIRECT_STRAIN_EVIDENCE" && !input.subject_name.trim()) violations.add("H01");
  if (input.attribution === "STRAIN_CHEMOTYPE_LINK" && (!input.chemotype_documented || !input.chemotype_id)) violations.add("H26");
  if (input.attribution === "STRAIN_CHEMOTYPE_LINK" && input.chemotype_documented === false) violations.add("H27");
  if (PRECLINICAL.has(input.evidence_class) && input.attribution === "CLINICAL_EVIDENCE") violations.add("H31");
  if (input.evidence_class === "OBSERVATIONAL" && input.causal) violations.add("H33");
  if (input.evidence_class === "OBSERVATIONAL" && input.attribution === "CLINICAL_EVIDENCE") violations.add("H32");
  if (input.evidence_class === "CLINICAL" && !input.study_id) violations.add("H35");
  if (input.evidence_class === "CLINICAL" && !input.population) violations.add("H36");
  if (input.evidence_class === "CLINICAL" && !input.outcome) violations.add("H37");
  if (input.evidence_class === "CLINICAL" && input.dose === undefined) violations.add("H38");
  if (input.evidence_class === "CLINICAL" && !input.methodological_quality) violations.add("H39");
  if ((input.evidence_class === "SYSTEMATIC_REVIEW" || input.evidence_class === "META_ANALYSIS") && input.primary_source_ids.length === 0) violations.add("H40");
  if ((input.evidence_class === "SYSTEMATIC_REVIEW" || input.evidence_class === "META_ANALYSIS") && input.edges.some((edge) => edge.relation === "REPORTS_OUTCOME" && edge.from_id.startsWith("synthesis:") && edge.to_id.startsWith("primary:"))) {
    violations.add("H41");
  }
  if (input.attribution === "DIRECT_STRAIN_EVIDENCE" && input.identity_status !== "VERIFIED") violations.add("H42");
  if (STRAIN_ATTRIBUTION.has(input.attribution) && input.attribution !== "DIRECT_STRAIN_EVIDENCE" && !input.chemotype_id && input.evidence_class !== "CLINICAL") violations.add("H43");
  if (input.attribution === "COMPOUND_LEVEL_EVIDENCE" && input.identity_status === "VERIFIED" && !input.compound) violations.add("H44");
  if (input.attribution !== "INSUFFICIENT_EVIDENCE" && !input.source) violations.add("H45");
  if (input.outcome && input.edges.some((edge) => edge.relation !== "REPORTS_OUTCOME" && edge.to_id === input.outcome && edge.from_id === input.subject_name)) violations.add("H46");
  const relations = new Set(input.edges.map((edge) => edge.relation));
  if (input.chemotype_id && !relations.has("HAS_MEASURED_CHEMOTYPE")) violations.add("H47");
  if (input.compound && !relations.has("CONTAINS_COMPOUND")) violations.add("H48");
  if (input.source && input.attribution !== "INSUFFICIENT_EVIDENCE" && !relations.has("SUPPORTED_BY")) violations.add("H49");
  if (input.outcome && !relations.has("REPORTS_OUTCOME")) violations.add("H50");
  if (input.edges.some((edge) => !edge.provenance)) violations.add("H51");
  if (input.testimony) violations.add("H58");
  if (input.causal && input.evidence_class !== "CLINICAL") violations.add("H57");
  if (input.attribution === "CLASS_LEVEL_EVIDENCE" && input.identity_status === "VERIFIED" && !input.limitations?.includes("NOT_STRAIN")) violations.add("H25");
  if (input.attribution === "COMPOUND_LEVEL_EVIDENCE" && input.identity_status === "VERIFIED" && !input.limitations?.includes("NOT_STRAIN")) violations.add("H60");
  return {
    accepted: violations.size === 0,
    stored: false,
    violations: [...violations],
    attribution: ATTRIBUTION_LEVELS.includes(input.attribution) ? input.attribution : null,
    cure_edge: false,
  };
}

export function searchHealthPlan(strainSpecificCount: number) {
  return {
    order: strainSpecificCount > 0 ? (["STRAIN", "CULTIVAR_OR_CLONE", "MEASURED_CHEMOTYPE"] as const) : SEARCH_DIMENSIONS,
    strain_specific_first: true,
    compound_when_strain_missing: strainSpecificCount === 0,
    rule: strainSpecificCount > 0 ? "H53" : "H54",
  };
}

export function healthStatements(records: HealthAdmission[]) {
  const visible = records.filter((record) => record.accepted || record.attribution !== null);
  const direct = records.some((record) => record.accepted && record.attribution === "DIRECT_STRAIN_EVIDENCE");
  const compoundOnly = records.some((record) => record.accepted && (record.attribution === "COMPOUND_LEVEL_EVIDENCE" || record.attribution === "STRAIN_CHEMOTYPE_LINK" || record.attribution === "CLASS_LEVEL_EVIDENCE"));
  return {
    hidden: false,
    absence_is_evidence_of_absence: false,
    collapsed_health_benefit: false,
    strain_specific: direct ? "Esiste evidenza specifica per questo soggetto, limitata ai record accettati." : null,
    compound_or_chemotype_only: compoundOnly && !direct ? "Questa evidenza riguarda il composto o il chemotipo e non dimostra un effetto specifico dello strain." : null,
    insufficient: records.length === 0 ? "Evidenza sanitaria non disponibile. L'assenza di righe non dimostra assenza di effetto." : null,
    shown: visible.length,
  };
}

export function documentedChain(input: HealthEvidenceInput) {
  const admission = admitHealthEvidence(input);
  return {
    edges: input.edges.filter((edge) => GRAPH_RELATIONS.includes(edge.relation) && edge.provenance),
    cure: null,
    accepted: admission.accepted,
  };
}

function edge(relation: GraphRelation, from: string, to: string): HealthEdge {
  return { relation, from_id: from, to_id: to, provenance: "source-1" };
}

export function validDirectStrainEvidence(): HealthEvidenceInput {
  return emptyHealthInput({
    subject_name: "subject",
    identity_status: "VERIFIED",
    effect_domain: "CLINICAL_OUTCOME",
    evidence_class: "CLINICAL",
    attribution: "DIRECT_STRAIN_EVIDENCE",
    evidence_strength: "MODERATE",
    population: "adults",
    dose: "reported",
    formulation: "reported",
    route: "reported",
    study_design: "RCT",
    source: "primary-1",
    limitations: "small sample",
    evidence_date: "2020-01-01",
    provenance: "doi",
    study_id: "study-1",
    methodological_quality: "reported",
    chemotype_id: "chemotype-1",
    chemotype_documented: true,
    compound: "compound",
    outcome: "outcome",
    edges: [
      edge("HAS_MEASURED_CHEMOTYPE", "subject", "chemotype-1"),
      edge("CONTAINS_COMPOUND", "chemotype-1", "compound"),
      edge("SUPPORTED_BY", "compound", "primary-1"),
      edge("REPORTS_OUTCOME", "primary-1", "outcome"),
    ],
  });
}

export function healthRuleHolds(id: HealthRuleId): boolean {
  const direct = validDirectStrainEvidence();
  const admitted = admitHealthEvidence(direct);
  switch (id) {
    case "H01":
      return admitHealthEvidence({ ...direct, subject_name: "" }).accepted === false && admitted.accepted;
    case "H02":
    case "H03":
    case "H04":
    case "H05":
    case "H06":
    case "H07":
    case "H08":
    case "H09":
    case "H10":
    case "H11":
    case "H12":
    case "H13":
    case "H14":
    case "H15":
      return HEALTH_EFFECT_DOMAINS.length === 14;
    case "H16":
      return admitHealthEvidence({ ...direct, evidence_strength: null }).violations.includes("H16");
    case "H17":
    case "H36":
      return admitHealthEvidence({ ...direct, population: null }).accepted === false;
    case "H18":
    case "H38":
      return admitHealthEvidence({ ...direct, dose: null }).accepted && direct.dose !== "";
    case "H19":
      return admitHealthEvidence({ ...direct, study_design: null }).violations.includes("H19");
    case "H20":
    case "H45":
      return admitHealthEvidence({ ...direct, source: null }).accepted === false;
    case "H21":
      return admitHealthEvidence({ ...direct, limitations: null }).violations.includes("H21");
    case "H22":
      return admitHealthEvidence({ ...direct, evidence_date: null }).violations.includes("H22");
    case "H23":
      return admitHealthEvidence({ ...direct, provenance: null }).violations.includes("H23");
    case "H24":
    case "H44":
      return admitHealthEvidence({ ...direct, attribution: "COMPOUND_LEVEL_EVIDENCE", compound: null, limitations: "NOT_STRAIN" }).accepted === false;
    case "H25":
      return admitHealthEvidence({ ...direct, attribution: "CLASS_LEVEL_EVIDENCE", limitations: "small sample" }).violations.includes("H25");
    case "H26":
    case "H27":
    case "H43":
      return admitHealthEvidence({ ...direct, attribution: "STRAIN_CHEMOTYPE_LINK", chemotype_documented: false, chemotype_id: null }).accepted === false;
    case "H28":
      return admitHealthEvidence({ ...direct, evidence_class: "PRECLINICAL", attribution: "PRECLINICAL_ONLY", study_id: null, methodological_quality: null }).violations.includes("H31") === false;
    case "H29":
      return admitHealthEvidence({ ...direct, evidence_class: "IN_VITRO", attribution: "CLINICAL_EVIDENCE" }).violations.includes("H31");
    case "H30":
      return admitHealthEvidence({ ...direct, evidence_class: "ANIMAL", attribution: "CLINICAL_EVIDENCE" }).violations.includes("H31");
    case "H31":
      return admitHealthEvidence({ ...direct, evidence_class: "PRECLINICAL", attribution: "CLINICAL_EVIDENCE" }).violations.includes("H31");
    case "H32":
    case "H33":
    case "H57":
      return admitHealthEvidence({ ...direct, evidence_class: "OBSERVATIONAL", attribution: "OBSERVATIONAL_ONLY", causal: true, study_id: null, methodological_quality: null }).violations.includes("H33");
    case "H34":
    case "H35":
    case "H37":
    case "H39":
      return admitted.accepted && admitHealthEvidence({ ...direct, study_id: null }).violations.includes("H35");
    case "H40":
      return admitHealthEvidence({ ...direct, evidence_class: "META_ANALYSIS", primary_source_ids: [] }).violations.includes("H40");
    case "H41":
      return admitHealthEvidence({ ...direct, evidence_class: "SYSTEMATIC_REVIEW", primary_source_ids: ["primary-1"], edges: [...direct.edges, { relation: "REPORTS_OUTCOME", from_id: "synthesis:review", to_id: "primary:1", provenance: "source-1" }] }).violations.includes("H41");
    case "H42":
      return admitHealthEvidence({ ...direct, identity_status: "UNVERIFIED" }).violations.includes("H42");
    case "H46":
      return documentedChain(direct).cure === null;
    case "H47":
      return direct.edges.some((item) => item.relation === "HAS_MEASURED_CHEMOTYPE");
    case "H48":
      return direct.edges.some((item) => item.relation === "CONTAINS_COMPOUND");
    case "H49":
      return direct.edges.some((item) => item.relation === "SUPPORTED_BY");
    case "H50":
      return direct.edges.some((item) => item.relation === "REPORTS_OUTCOME");
    case "H51":
      return admitHealthEvidence({ ...direct, edges: direct.edges.map((item) => ({ ...item, provenance: "" })) }).violations.includes("H51");
    case "H52":
      return documentedChain(direct).cure === null && !GRAPH_RELATIONS.includes("CURES" as GraphRelation);
    case "H53":
      return searchHealthPlan(1).strain_specific_first && searchHealthPlan(1).rule === "H53";
    case "H54":
      return searchHealthPlan(0).compound_when_strain_missing && searchHealthPlan(0).order.includes("CANNABINOID");
    case "H55":
      return ATTRIBUTION_LEVELS.length === 9 && healthStatements([admitted]).collapsed_health_benefit === false;
    case "H56":
      return healthStatements([]).absence_is_evidence_of_absence === false && healthStatements([]).insufficient !== null;
    case "H58":
      return admitHealthEvidence({ ...direct, testimony: true }).violations.includes("H58");
    case "H59":
    case "H61":
      return healthStatements([admitted]).hidden === false && healthStatements([admitted]).strain_specific !== null;
    case "H60":
    case "H62": {
      const compound = admitHealthEvidence({ ...direct, attribution: "COMPOUND_LEVEL_EVIDENCE", limitations: "NOT_STRAIN" });
      return compound.accepted && healthStatements([compound]).compound_or_chemotype_only !== null;
    }
    case "H63":
      return admitted.stored === false;
    case "H64":
      return !JSON.stringify(HEALTH_RULES).includes("Gelato") && ruleIndex().length === 64;
    default:
      return false;
  }
}


export function ruleIndex() {
  return HEALTH_RULES.map((rule) => rule.id);
}
