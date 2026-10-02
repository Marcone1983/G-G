import type { MachineReport } from "../prediction/orchestrator.ts";

const GENERATION = /^(G\d+|S\d+|F\d\+?|BC\d+|SSD)$/i;
const CANNABINOID = new Set(["delta_9_thc", "thc", "thca", "cbd", "cbda", "cbg", "cbga", "cbn", "cbc", "thcv", "cbdv", "cbl"]);
const TERPENE = new Set(["myrcene", "limonene", "pinene", "linalool", "caryophyllene", "humulene", "terpinolene", "ocimene", "bisabolol", "nerolidol", "camphene", "geraniol", "borneol"]);

export type ArchitectureReport = {
  schema_version: "gg-report-architecture-1";
  query_interpretation: { raw: string; intent: "CROSS" | "ENTITY"; generations: string[]; requested: string[] };
  identity_resolution: { status: string; parents: { role: "A" | "B" | "ENTITY"; query: string; status: string; candidates: { entity_id: string; canonical_name: string; identity_status: string }[] }[] };
  parent_profiles: ParentProfile[];
  pedigree_analysis: { class: "DOCUMENTED" | "REPORTED" | "PROBABLE" | "DISPUTED" | "UNKNOWN"; rows: number; genomic_percent: null; status: "NOT_COMPUTABLE"; reason: string };
  shared_ancestry: { status: "UNKNOWN" | "NOT_A_CROSS"; reason: string };
  trait_architecture: { compounds: string[]; note: string };
  generational_interpretation: { labels: string[]; nomenclature: string; stability_evidence: "ABSENT"; generation_implies_stability: false };
  segregation_analysis: { status: "NOT_APPLIED"; reason: string };
  cannabinoid_evidence: EvidenceLine[];
  terpene_evidence: EvidenceLine[];
  terpene_transmission: { status: "NOT_VALIDATED" | "NO_PARENT_EVIDENCE"; statement: string };
  historical_analogues: { status: "CONTEXT_ONLY" | "NOT_AVAILABLE"; count: number; rows: []; causal: false; reason: string };
  pattern_analysis: PatternLine[];
  conflicting_evidence: { kind: string; detail: string }[];
  scientific_model: { model_id: string; model_version: string; algorithm: string; calibration_status: "NOT_CALIBRATED" };
  predicted_progeny: { status: string; estimates: { compound: string; central_estimate: number | null; status: string }[]; not_a_phenotype: true };
  computable_probabilities: [];
  noncomputable_probabilities: { event: string; value: null; status: "NOT_COMPUTABLE"; reason: string }[];
  uncertainty: Record<"identity" | "pedigree" | "measurement" | "model" | "environment" | "progeny" | "ood" | "source", string>;
  sensitivity: { impact: "HIGH" | "MEDIUM" | "LOW"; factor: string; reason: string }[];
  known: string[];
  inferred: string[];
  unknown: string[];
  validation_requirements: string[];
  provenance: { knowledge_snapshot: string; model_id: string; model_version: string; prediction_id: string | null; prediction_probability: null };
  coverage: { entities_found: number; samples_found: number | null; measurements_found: number; numeric_values: number; terpene_measurements: number; cannabinoid_measurements: number; evidence_records: number; research_records: number | null; historical_crosses: number; patterns: number };
  visualization: {
    visualization_type: "PREDICTIVE_VISUALIZATION";
    label: "PREDICTIVE VISUALIZATION — NOT OBSERVED OFFSPRING";
    status: string;
    parents: string[];
    generation: string[];
    phenotype_features: "UNKNOWN";
    color_features: "UNKNOWN";
    morphology_features: "UNKNOWN";
    aroma_features: "UNKNOWN";
    confidence: null;
    uncertainty: string;
    model_version: string;
    knowledge_snapshot: string;
    image_model: "grok-imagine-image-2.0" | null;
    provider_class: string | null;
    image_persisted: false;
    not_observed_offspring: true;
    not_genetic_proof: true;
  };
};

type ParentProfile = {
  role: "A" | "B" | "ENTITY";
  canonical_name: string | null;
  entity_id: string | null;
  identity_status: string;
  aliases: null;
  breeder: null;
  source: null;
  pedigree: "SEE_PEDIGREE_SECTION";
  pedigree_confidence: null;
  source_count: number | null;
  sample_count: number | null;
  measurement_count: number | null;
  trait_coverage: string[];
  chemotype_coverage: string[];
  historical_cross_coverage: number | null;
  research_coverage: null;
  conflicting_identities: number;
};

type EvidenceLine = {
  compound: string;
  status: "MEASURED" | "UNKNOWN";
  parent_a_groups: number | null;
  parent_b_groups: number | null;
  measurement_count: number | null;
  central_estimate: number | null;
  unit: null;
  method: null;
  environment: "NOT_AVAILABLE";
  progeny_evidence: "ABSENT";
  transmission: "NOT_VALIDATED";
};

type PatternLine = {
  pattern_key: string;
  pattern_type: "CHEMOTYPE" | "NAME_IDENTITY";
  support_count: number;
  sample_count: number | null;
  support_means: "gruppi di indipendenza distinti, non una probabilità";
  sample_means: "righe lette, non una progenie e non un denominatore di probabilità";
  genetic_effect: false;
  epistemic: "HYPOTHESIS";
};

export function peelParent(parent: string): { name: string; labels: string[]; requested: string[] } {
  const requested: string[] = [];
  if (/terpen/i.test(parent)) requested.push("terpene");
  if (/cannabinoid/i.test(parent)) requested.push("cannabinoid");
  const cleaned = parent.replace(/\b(terpene profile|cannabinoid profile|profilo terpenico|profilo terpeni)\b/gi, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  const labels: string[] = [];
  while (parts.length > 1 && GENERATION.test(parts[parts.length - 1] ?? "")) labels.unshift(parts.pop()!.toUpperCase());
  while (parts.length > 1 && GENERATION.test(parts[0] ?? "")) labels.push(parts.shift()!.toUpperCase());
  if (!parts.length) return { name: parent.trim(), labels: [], requested };
  return { name: parts.join(" "), labels, requested };
}

export function buildArchitectureReport(report: MachineReport, raw: string, generations: string[]): ArchitectureReport {
  const labels = [...new Set(generations.map((item) => item.toUpperCase()))];
  const parents = report.parents.map((parent, index) => ({
    role: (index === 0 ? "A" : "B") as "A" | "B",
    query: parent.query,
    status: parent.status,
    candidates: parent.candidates.slice(0, 8).map((candidate) => ({
      entity_id: `entity:${candidate.canonical_id}`,
      canonical_name: candidate.display_name,
      identity_status: candidate.identity_status,
    })),
  }));
  const patterns = report.patterns_used.map((pattern) => patternLine(pattern as { pattern_key: string; independent_sources?: number; sample_size?: number }));
  const cannabinoids = report.traits.filter((trait) => CANNABINOID.has(trait.compound)).map((trait) => evidenceLine(trait));
  const terpenes = report.traits.filter((trait) => TERPENE.has(trait.compound)).map((trait) => evidenceLine(trait));
  const resolved = report.identity_status === "RESOLVED";
  const parentEvidence = report.traits.some((trait) => trait.parent_a_groups > 0 || trait.parent_b_groups > 0) || terpenes.length > 0;
  const shell = emptyCross(raw, report.knowledge_snapshot);
  shell.query_interpretation = { raw, intent: "CROSS", generations: labels, requested: [] };
  shell.identity_resolution = { status: report.identity_status, parents };
  shell.parent_profiles = parents.map((parent, index) => profile(parent, report, index));
  shell.pedigree_analysis = {
    class: report.pedigree.rows > 0 ? "REPORTED" : "UNKNOWN",
    rows: report.pedigree.rows,
    genomic_percent: null,
    status: "NOT_COMPUTABLE",
    reason: "Nessuna quantità genomica è calcolata da un parent riportato.",
  };
  shell.shared_ancestry = { status: "UNKNOWN", reason: "Nessun antenato condiviso è stato dimostrato. Non ne invento uno." };
  shell.trait_architecture = { compounds: report.traits.map((trait) => trait.compound), note: "Il nome non è una feature chimica. Un composto assente resta assente." };
  shell.generational_interpretation = { labels, nomenclature: labels.length ? labels.join(", ") : "ASSENTE", stability_evidence: "ABSENT", generation_implies_stability: false };
  shell.segregation_analysis = { status: "NOT_APPLIED", reason: report.segregation };
  shell.cannabinoid_evidence = cannabinoids;
  shell.terpene_evidence = terpenes;
  shell.terpene_transmission = parentEvidence
    ? { status: "NOT_VALIDATED", statement: "Parent evidence exists; direct progeny transmission is not validated." }
    : { status: "NO_PARENT_EVIDENCE", statement: "Nessuna evidenza parentale letta per la trasmissione. Non ne invento una." };
  shell.historical_analogues = {
    status: report.historical_crosses.status === "CONTEXT_ONLY" ? "CONTEXT_ONLY" : "NOT_AVAILABLE",
    count: report.historical_crosses.same_parent_pair_children,
    rows: [],
    causal: false,
    reason: report.historical_crosses.same_parent_pair_children > 0 ? "Conteggio di coppia senza misura di progenie. Nessun analogo inventato." : "Nessun analogo storico letto.",
  };
  shell.pattern_analysis = patterns;
  shell.conflicting_evidence = parents.filter((parent) => parent.candidates.length > 1).map((parent) => ({ kind: "IDENTITY", detail: `${parent.query}: ${parent.candidates.length} identità non fuse.` }));
  shell.scientific_model = { model_id: report.model_id, model_version: report.model_version, algorithm: "mid-parent dei gruppi numerici dei parentali, senza calibrazione su progenie", calibration_status: "NOT_CALIBRATED" };
  shell.predicted_progeny = { status: report.data_status, estimates: report.traits.map((trait) => ({ compound: trait.compound, central_estimate: trait.central_estimate, status: trait.status })), not_a_phenotype: true };
  shell.uncertainty.identity = resolved ? "identità unica sui record letti" : "più di un record, non fusi";
  shell.uncertainty.pedigree = report.pedigree.rows > 0 ? "pedigree riportato, non genomico" : "pedigree assente";
  shell.uncertainty.measurement = parentEvidence ? "medie di gruppo parentali, non progenie" : "gruppi numerici assenti";
  shell.known = parents.flatMap((parent) => parent.candidates.slice(0, 4).map((candidate) => `${candidate.canonical_name} id ${candidate.entity_id}`));
  shell.inferred = report.traits.filter((trait) => trait.central_estimate !== null).map((trait) => `${trait.compound}: stima non calibrata ${trait.central_estimate}. Non è una probabilità.`);
  shell.unknown = ["Contributo genomico: null. NOT_COMPUTABLE.", "Trasmissione alla progenie: non validata.", labels.length ? `Le etichette ${labels.join(", ")} non sono evidenza di stabilità.` : "Nessuna etichetta di generazione nella query."];
  shell.provenance = { knowledge_snapshot: report.knowledge_snapshot, model_id: report.model_id, model_version: report.model_version, prediction_id: report.prediction_id, prediction_probability: null };
  shell.coverage = {
    entities_found: parents.reduce((sum, parent) => sum + parent.candidates.length, 0),
    samples_found: null,
    measurements_found: report.traits.reduce((sum, trait) => sum + trait.parent_a_rows + trait.parent_b_rows, 0),
    numeric_values: report.traits.filter((trait) => trait.parent_a_median !== null || trait.parent_b_median !== null).length,
    terpene_measurements: terpenes.reduce((sum, row) => sum + (row.measurement_count ?? 0), 0),
    cannabinoid_measurements: cannabinoids.reduce((sum, row) => sum + (row.measurement_count ?? 0), 0),
    evidence_records: report.pedigree.rows,
    research_records: null,
    historical_crosses: report.historical_crosses.same_parent_pair_children,
    patterns: patterns.length,
  };
  shell.visualization.status = resolved ? "READY_FOR_PROVIDER" : "IDENTITY_NOT_UNIQUE";
  shell.visualization.parents = parents.map((parent) => parent.candidates[0]?.canonical_name ?? parent.query);
  shell.visualization.generation = labels;
  shell.visualization.model_version = report.model_version;
  shell.visualization.knowledge_snapshot = report.knowledge_snapshot;
  return shell;
}

export function buildEntityArchitecture(input: {
  raw: string;
  query: string;
  candidates: { id: string; canonical_name: string; identity_status: string }[];
  patterns: { compound: string; support: number; n: number }[];
  snapshot: string;
}): ArchitectureReport {
  const candidates = input.candidates.slice(0, 8).map((candidate) => ({ entity_id: candidate.id, canonical_name: candidate.canonical_name, identity_status: candidate.identity_status }));
  const status = candidates.length === 1 ? "RESOLVED" : candidates.length > 1 ? "IDENTITY_AMBIGUOUS" : "UNRESOLVED";
  const patterns: PatternLine[] = input.patterns.map((pattern) => ({
    pattern_key: `${input.query}:${pattern.compound}`,
    pattern_type: CANNABINOID.has(pattern.compound) || TERPENE.has(pattern.compound) ? "CHEMOTYPE" : "NAME_IDENTITY",
    support_count: pattern.support,
    sample_count: pattern.n,
    support_means: "gruppi di indipendenza distinti, non una probabilità",
    sample_means: "righe lette, non una progenie e non un denominatore di probabilità",
    genetic_effect: false,
    epistemic: "HYPOTHESIS",
  }));
  const report = emptyCross(input.raw, input.snapshot);
  report.query_interpretation.intent = "ENTITY";
  report.identity_resolution = { status, parents: [{ role: "ENTITY", query: input.query, status, candidates }] };
  report.parent_profiles = [{
    role: "ENTITY",
    canonical_name: status === "RESOLVED" ? candidates[0]?.canonical_name ?? null : null,
    entity_id: status === "RESOLVED" ? candidates[0]?.entity_id ?? null : null,
    identity_status: status,
    aliases: null,
    breeder: null,
    source: null,
    pedigree: "SEE_PEDIGREE_SECTION",
    pedigree_confidence: null,
    source_count: null,
    sample_count: null,
    measurement_count: patterns.reduce((sum, pattern) => sum + (pattern.sample_count ?? 0), 0),
    trait_coverage: patterns.map((pattern) => compoundOf(pattern.pattern_key)),
    chemotype_coverage: patterns.filter((pattern) => pattern.pattern_type === "CHEMOTYPE").map((pattern) => compoundOf(pattern.pattern_key)),
    historical_cross_coverage: null,
    research_coverage: null,
    conflicting_identities: status === "RESOLVED" ? 0 : candidates.length,
  }];
  report.pattern_analysis = patterns;
  report.cannabinoid_evidence = patterns.filter((pattern) => CANNABINOID.has(compoundOf(pattern.pattern_key))).map(patternEvidence);
  report.terpene_evidence = patterns.filter((pattern) => TERPENE.has(compoundOf(pattern.pattern_key))).map(patternEvidence);
  report.terpene_transmission = report.terpene_evidence.length
    ? { status: "NOT_VALIDATED", statement: "Parent evidence exists; direct progeny transmission is not validated." }
    : { status: "NO_PARENT_EVIDENCE", statement: "Nessuna evidenza terpenica letta su questo nome." };
  report.known = candidates.map((candidate) => `${candidate.canonical_name} id ${candidate.entity_id}`);
  report.conflicting_evidence = status === "IDENTITY_AMBIGUOUS" ? [{ kind: "IDENTITY", detail: `${input.candidates.length} identità non fuse.` }] : [];
  report.coverage.entities_found = input.candidates.length;
  report.coverage.patterns = patterns.length;
  report.coverage.cannabinoid_measurements = report.cannabinoid_evidence.reduce((sum, row) => sum + (row.measurement_count ?? 0), 0);
  report.coverage.terpene_measurements = report.terpene_evidence.reduce((sum, row) => sum + (row.measurement_count ?? 0), 0);
  report.visualization.status = "NOT_A_CROSS";
  return report;
}

export function narrativeFromReport(report: ArchitectureReport): string {
  const identity = report.identity_resolution.parents.map((parent) => {
    if (!parent.candidates.length) return `${parent.query}: nessun record.`;
    if (parent.status !== "RESOLVED") return `${parent.query}: ${parent.candidates.length} candidati. ${parent.candidates.map((candidate) => `${candidate.canonical_name} (id ${candidate.entity_id})`).join("; ")}.`;
    const chosen = parent.candidates[0];
    return chosen ? `${parent.query}: ${chosen.canonical_name} (id ${chosen.entity_id}).` : `${parent.query}: nessun record.`;
  }).join(" ");
  const generation = report.generational_interpretation.labels.length ? `Generazione ${report.generational_interpretation.labels.join(", ")}: nomenclatura, non stabilità.` : "Nessuna etichetta di generazione.";
  const estimates = report.predicted_progeny.estimates.filter((trait) => trait.central_estimate !== null).map((trait) => `${trait.compound} ${trait.central_estimate}`);
  const missing = report.predicted_progeny.estimates.filter((trait) => trait.central_estimate === null).map((trait) => trait.compound);
  const chemistry = estimates.length ? `Stima non calibrata: ${estimates.join(", ")}.` : `Senza stima: ${missing.join(", ") || "nessun composto di progenie"}.`;
  const pattern = report.pattern_analysis.length ? `Pattern ${report.pattern_analysis.length}. support_count = gruppi di indipendenza. sample_count = righe. Non è una probabilità e non è un effetto genetico.` : "Nessun pattern con supporto almeno 2.";
  return [identity, generation, chemistry, report.terpene_transmission.statement, pattern, `Pedigree ${report.pedigree_analysis.class}, righe ${report.pedigree_analysis.rows}, genomico null.`, `Probabilità null. Snapshot ${report.provenance.knowledge_snapshot}.`, report.visualization.label].join(" ");
}

export function predictiveImagePrompt(report: ArchitectureReport): string | null {
  if (report.visualization.status !== "READY_FOR_PROVIDER") return null;
  return [
    "Ultra-realistic botanical macro photograph of a cannabis inflorescence.",
    "Scientific botanical photography, natural trichomes, realistic pistils and bracts, natural light, shallow depth of field.",
    "Not a cartoon, not an illustration, not a fantasy flower, not a game asset.",
    `Parents named in the report: ${report.visualization.parents.join(" × ")}.`,
    `Generation labels, nomenclature only: ${report.visualization.generation.join(", ") || "none"}.`,
    "Pigmentation UNKNOWN. Morphology UNKNOWN. Aroma UNKNOWN. Do not invent a chemotype color, a terpene percentage, or a cannabinoid percentage.",
    "This is one plausible flower under high uncertainty, not a guaranteed offspring and not a photograph of a real plant.",
    "PREDICTIVE VISUALIZATION. NOT OBSERVED OFFSPRING. NOT GENETIC PROOF.",
  ].join(" ");
}

export function classifyImageHttp(status: number, body: string): { provider_class: string; billing: string | null } {
  const text = body.toLowerCase();
  if (status === 401) return { provider_class: "INVALID_CREDENTIAL", billing: null };
  if (status === 403 && /spending|credit|billing|quota/.test(text)) return { provider_class: "TEAM_SPENDING_BLOCKED", billing: "BLOCKED_EXTERNAL_BILLING" };
  if (status === 403) return { provider_class: "UNAUTHORIZED", billing: null };
  if (status === 429) return { provider_class: "RATE_LIMITED", billing: null };
  if (status >= 500) return { provider_class: "PROVIDER_UNAVAILABLE", billing: null };
  return { provider_class: "PROVIDER_ERROR", billing: null };
}

function patternLine(pattern: { pattern_key: string; independent_sources?: number; sample_size?: number }): PatternLine {
  const compound = compoundOf(pattern.pattern_key);
  return {
    pattern_key: pattern.pattern_key,
    pattern_type: CANNABINOID.has(compound) || TERPENE.has(compound) ? "CHEMOTYPE" : "NAME_IDENTITY",
    support_count: pattern.independent_sources ?? 0,
    sample_count: pattern.sample_size ?? null,
    support_means: "gruppi di indipendenza distinti, non una probabilità",
    sample_means: "righe lette, non una progenie e non un denominatore di probabilità",
    genetic_effect: false,
    epistemic: "HYPOTHESIS",
  };
}

function evidenceLine(trait: MachineReport["traits"][number]): EvidenceLine {
  const measured = trait.parent_a_groups > 0 || trait.parent_b_groups > 0;
  return { compound: trait.compound, status: measured ? "MEASURED" : "UNKNOWN", parent_a_groups: trait.parent_a_groups, parent_b_groups: trait.parent_b_groups, measurement_count: trait.parent_a_rows + trait.parent_b_rows, central_estimate: trait.central_estimate, unit: null, method: null, environment: "NOT_AVAILABLE", progeny_evidence: "ABSENT", transmission: "NOT_VALIDATED" };
}

function patternEvidence(pattern: PatternLine): EvidenceLine {
  return { compound: compoundOf(pattern.pattern_key), status: "MEASURED", parent_a_groups: pattern.support_count, parent_b_groups: null, measurement_count: pattern.sample_count, central_estimate: null, unit: null, method: null, environment: "NOT_AVAILABLE", progeny_evidence: "ABSENT", transmission: "NOT_VALIDATED" };
}

function profile(parent: ArchitectureReport["identity_resolution"]["parents"][number], report: MachineReport, index: number): ParentProfile {
  const chosen = parent.status === "RESOLVED" ? parent.candidates[0] : undefined;
  const traits = report.traits.filter((trait) => (index === 0 ? trait.parent_a_groups : trait.parent_b_groups) > 0);
  return {
    role: parent.role,
    canonical_name: chosen?.canonical_name ?? null,
    entity_id: chosen?.entity_id ?? null,
    identity_status: parent.status,
    aliases: null,
    breeder: null,
    source: null,
    pedigree: "SEE_PEDIGREE_SECTION",
    pedigree_confidence: null,
    source_count: null,
    sample_count: null,
    measurement_count: traits.reduce((sum, trait) => sum + (index === 0 ? trait.parent_a_rows : trait.parent_b_rows), 0),
    trait_coverage: traits.map((trait) => trait.compound),
    chemotype_coverage: traits.map((trait) => trait.compound),
    historical_cross_coverage: index === 0 ? report.historical_crosses.same_parent_pair_children : null,
    research_coverage: null,
    conflicting_identities: parent.status === "RESOLVED" ? 0 : parent.candidates.length,
  };
}

function emptyCross(raw: string, snapshot: string): ArchitectureReport {
  return {
    schema_version: "gg-report-architecture-1",
    query_interpretation: { raw, intent: "CROSS", generations: [], requested: [] },
    identity_resolution: { status: "UNRESOLVED", parents: [] },
    parent_profiles: [],
    pedigree_analysis: { class: "UNKNOWN", rows: 0, genomic_percent: null, status: "NOT_COMPUTABLE", reason: "Nessuna quantità genomica è calcolata da un parent riportato." },
    shared_ancestry: { status: "UNKNOWN", reason: "Antenato condiviso non letto." },
    trait_architecture: { compounds: [], note: "Il nome non è una feature chimica." },
    generational_interpretation: { labels: [], nomenclature: "ASSENTE", stability_evidence: "ABSENT", generation_implies_stability: false },
    segregation_analysis: { status: "NOT_APPLIED", reason: "Architettura di segregazione sconosciuta." },
    cannabinoid_evidence: [],
    terpene_evidence: [],
    terpene_transmission: { status: "NO_PARENT_EVIDENCE", statement: "Nessuna evidenza terpenica letta." },
    historical_analogues: { status: "NOT_AVAILABLE", count: 0, rows: [], causal: false, reason: "Nessun analogo storico letto." },
    pattern_analysis: [],
    conflicting_evidence: [],
    scientific_model: { model_id: "gg-additive-midparent", model_version: "1", algorithm: "mid-parent non calibrato", calibration_status: "NOT_CALIBRATED" },
    predicted_progeny: { status: "NOT_COMPUTABLE", estimates: [], not_a_phenotype: true },
    computable_probabilities: [],
    noncomputable_probabilities: [{ event: "progeny_chemotype", value: null, status: "NOT_COMPUTABLE", reason: "Nessuna calibrazione su progenie." }],
    uncertainty: { identity: "non risolta", pedigree: "non genomico", measurement: "non letta", model: "non calibrato", environment: "NOT_AVAILABLE", progeny: "assente", ood: "non valutata", source: "supabase_postgresql" },
    sensitivity: [
      { impact: "HIGH", factor: "identity", reason: "Un id diverso cambia quali righe entrano." },
      { impact: "HIGH", factor: "progeny observations", reason: "Senza progenie la probabilità resta null." },
      { impact: "MEDIUM", factor: "generation interpretation", reason: "G o S è nomenclatura finché non c'è un test di ripetibilità." },
      { impact: "LOW", factor: "pattern support", reason: "Il supporto non entra nella stima e non è una probabilità." },
    ],
    known: [],
    inferred: [],
    unknown: ["Contributo genomico: null. NOT_COMPUTABLE."],
    validation_requirements: ["Una sola identità per parentale.", "Misure di progenie con gruppo di indipendenza."],
    provenance: { knowledge_snapshot: snapshot, model_id: "gg-additive-midparent", model_version: "1", prediction_id: null, prediction_probability: null },
    coverage: { entities_found: 0, samples_found: null, measurements_found: 0, numeric_values: 0, terpene_measurements: 0, cannabinoid_measurements: 0, evidence_records: 0, research_records: null, historical_crosses: 0, patterns: 0 },
    visualization: { visualization_type: "PREDICTIVE_VISUALIZATION", label: "PREDICTIVE VISUALIZATION — NOT OBSERVED OFFSPRING", status: "NOT_REQUESTED", parents: [], generation: [], phenotype_features: "UNKNOWN", color_features: "UNKNOWN", morphology_features: "UNKNOWN", aroma_features: "UNKNOWN", confidence: null, uncertainty: "morfologia, pigmentazione e aroma non sono nel rapporto", model_version: "1", knowledge_snapshot: snapshot, image_model: null, provider_class: null, image_persisted: false, not_observed_offspring: true, not_genetic_proof: true },
  };
}

function compoundOf(key: string): string {
  const parts = key.split(":");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}
