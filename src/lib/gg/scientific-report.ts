export const SCIENTIFIC_PERSONA = [
  "GREED & GROSS SCIENTIFIC INTELLIGENCE ENGINE.",
  "Reason with methods from cannabis genetics, plant genetics, breeding, backcrossing, pedigree analysis, botany, plant biology, plant physiology, phytochemistry, pharmacognosy, pharmacology, cannabinoid science, terpene science, flavonoid science, anthocyanin biology, molecular biology, genomics, transcriptomics, proteomics, metabolomics, QTL, GWAS, gene expression, biochemical pathways, plant pathology, genotype by environment, statistics and literature analysis.",
  "This is a domain-expert reasoning configuration. It must not claim a medical, pharmacy, biology, genetics or breeder licence, and must not claim to be a human doctor, physician, pharmacist, geneticist, botanist or breeder.",
  "The structured scientific result is authoritative. Do not invent a second prediction, a percentage, a DOI, a PMID, an author or a study result.",
  "If prediction_probability is null, it stays null. Confidence is not a probability. Pedigree is not a genome. An image is not genotype evidence. A generation label is not stability. Repeated rows are not independent replications.",
  "Separate FACT, REPORTED DATA, MODEL INFERENCE, ASSUMPTION, HYPOTHESIS, UNKNOWN, NOT_COMPUTABLE, LIMITATION and PROVENANCE.",
  "Absence of a record is UNKNOWN, not a zero trait. Do not force a positive or a negative result.",
  "Do not give cultivation, nutrient, lighting, harvest, sale or procurement instructions.",
  "In-vitro, animal and association findings are not human clinical efficacy.",
  "Your reply is a language interpretation of the supplied context. It is not a documented fact and must not be stored as a measurement.",
].join(" ");

export type LanguageUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  server_side_tools: number | null;
  cost_in_usd_ticks: number | null;
};

export type Narration = {
  status: "AI_PROVIDER_NOT_CONFIGURED" | "NARRATED" | "PROVIDER_ERROR";
  role: "LANGUAGE_LAYER_NOT_THE_MODEL";
  api: "POST /v1/responses";
  model: string | null;
  http: number | null;
  latency_ms: number | null;
  usage: LanguageUsage | null;
  prediction_probability: null;
  evidence_class: "LANGUAGE_INTERPRETATION";
  promoted_to_documented_fact: false;
  contract_violation: string | null;
  text: string;
};

const CONTRACT_RULES: { code: string; pattern: RegExp }[] = [
  { code: "INVENTED_PERCENT", pattern: /\d+(?:[.,]\d+)?\s*%/ },
  { code: "CULTIVATION_INSTRUCTION", pattern: /\b(nutrient schedule|lighting schedule|how to grow|when to harvest|feed schedule)\b/i },
  { code: "FAKE_CREDENTIAL", pattern: /\bI am a (doctor|physician|pharmacist|geneticist|botanist|breeder)\b/i },
];

export function narrationContractViolation(text: string): string | null {
  for (const rule of CONTRACT_RULES) {
    if (rule.pattern.test(text)) return rule.code;
  }
  return null;
}

export function configuredLanguageModel(env: NodeJS.ProcessEnv = process.env): string {
  const chosen = env.XAI_LANGUAGE_MODEL?.trim();
  return chosen || "grok-4.5";
}

function slimTraits(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((row) => {
    const trait = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      compound: trait.compound ?? null,
      status: trait.status ?? null,
      central_estimate: trait.central_estimate ?? null,
      parent_a_groups: trait.parent_a_groups ?? null,
      parent_b_groups: trait.parent_b_groups ?? null,
    };
  });
}

function slimParents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((row) => {
    const parent = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      query: parent.query ?? null,
      status: parent.status ?? null,
      candidate_count: Array.isArray(parent.candidates) ? parent.candidates.length : null,
    };
  });
}

export function scientificContext(report: Record<string, unknown>) {
  return {
    intent: "scientific_report",
    identity_status: report.identity_status ?? null,
    data_status: report.data_status ?? null,
    prediction_probability: null,
    calibration_status: report.calibration_status ?? "NOT_CALIBRATED",
    model_id: report.model_id ?? null,
    model_version: report.model_version ?? null,
    knowledge_snapshot: report.knowledge_snapshot ?? null,
    cache_status: report.cache_status ?? null,
    traits: slimTraits(report.traits),
    parents: slimParents(report.parents),
    patterns_used_count: Array.isArray(report.patterns_used) ? report.patterns_used.length : null,
    historical_crosses: report.historical_crosses ?? null,
    measured_row_count: typeof report.measured_row_count === "number" ? report.measured_row_count : null,
    pedigree_edge_count: typeof report.pedigree_edge_count === "number" ? report.pedigree_edge_count : null,
    claim_count: typeof report.claim_count === "number" ? report.claim_count : null,
    assumptions: report.assumptions ?? [],
    limitations: report.limitations ?? [],
    known: "Only fields present in this object. Counts are not raw rows.",
    unknown: report.data_status === "NOT_COMPUTABLE" || report.identity_status !== "RESOLVED" ? "Identity or evidence is insufficient." : null,
    contradictions: [],
    classes: ["FACT", "REPORTED_DATA", "MODEL_INFERENCE", "ASSUMPTION", "HYPOTHESIS", "UNKNOWN", "NOT_COMPUTABLE", "LIMITATION", "PROVENANCE"],
    database_credentials: "NOT_INCLUDED",
    raw_measurements: "NOT_INCLUDED",
    evidence_class_of_your_reply: "LANGUAGE_INTERPRETATION",
  };
}

export function responseOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as { output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block.type === "output_text" && typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

export function responseUsage(payload: unknown): LanguageUsage | null {
  if (!payload || typeof payload !== "object" || !("usage" in payload)) return null;
  const usage = (payload as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== "object") return null;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    input_tokens: num(usage.input_tokens),
    output_tokens: num(usage.output_tokens),
    total_tokens: num(usage.total_tokens),
    server_side_tools: num(usage.num_server_side_tools_used),
    cost_in_usd_ticks: num(usage.cost_in_usd_ticks),
  };
}

function proseFromModel(text: string): { prose: string; violation: string | null } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return { prose: trimmed, violation: narrationContractViolation(trimmed) };
  try {
    const parsed = JSON.parse(trimmed) as { prose?: unknown; prediction_probability?: unknown; promoted_to_documented_fact?: unknown };
    if (parsed.prediction_probability !== null && parsed.prediction_probability !== undefined) {
      return { prose: "", violation: "INVENTED_PROBABILITY" };
    }
    if (parsed.promoted_to_documented_fact === true) return { prose: "", violation: "PROMOTED_AS_FACT" };
    const prose = typeof parsed.prose === "string" ? parsed.prose.trim() : trimmed;
    return { prose, violation: narrationContractViolation(prose) };
  } catch {
    return { prose: trimmed, violation: narrationContractViolation(trimmed) };
  }
}

export async function narrateScientificReport(
  report: Record<string, unknown>,
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
  model = configuredLanguageModel(),
): Promise<Narration> {
  const fallback = typeof report.human_report === "string" ? report.human_report : "Rapporto deterministico. Nessun testo del modello linguistico.";
  const locked = {
    role: "LANGUAGE_LAYER_NOT_THE_MODEL" as const,
    api: "POST /v1/responses" as const,
    prediction_probability: null as null,
    evidence_class: "LANGUAGE_INTERPRETATION" as const,
    promoted_to_documented_fact: false as const,
  };
  if (!apiKey?.trim()) {
    return { status: "AI_PROVIDER_NOT_CONFIGURED", model: null, http: null, latency_ms: null, usage: null, contract_violation: null, text: fallback, ...locked };
  }
  const context = scientificContext(report);
  const started = Date.now();
  const response = await fetchImpl("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_output_tokens: 700,
      instructions: SCIENTIFIC_PERSONA,
      input: `Return one JSON object and no markdown. Schema: {"prose": string, "prediction_probability": null, "evidence_class": "LANGUAGE_INTERPRETATION", "promoted_to_documented_fact": false}. The prose must restate only the context. Context: ${JSON.stringify(context)}`,
    }),
  });
  const latency_ms = Date.now() - started;
  if (!response.ok) {
    return { status: "PROVIDER_ERROR", model, http: response.status, latency_ms, usage: null, contract_violation: null, text: fallback, ...locked };
  }
  const payload = await response.json();
  const extracted = proseFromModel(responseOutputText(payload));
  if (!extracted.prose || extracted.violation) {
    return {
      status: "PROVIDER_ERROR",
      model,
      http: response.status,
      latency_ms,
      usage: responseUsage(payload),
      contract_violation: extracted.violation ?? "EMPTY_OUTPUT",
      text: fallback,
      ...locked,
    };
  }
  return {
    status: "NARRATED",
    model,
    http: response.status,
    latency_ms,
    usage: responseUsage(payload),
    contract_violation: null,
    text: extracted.prose,
    ...locked,
  };
}
