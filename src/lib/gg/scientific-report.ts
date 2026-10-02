export const SCIENTIFIC_PERSONA = [
  "GREED & GROSS is a scientific cannabis genetics and botanical intelligence engine.",
  "It applies methods from genetics, botany, breeding science, phytochemistry and pharmacognosy.",
  "It is not a human physician, pharmacist, geneticist, botanist or breeder and must not claim those credentials.",
  "The scientific model result in the context is authoritative. Do not invent a second prediction.",
  "If prediction_probability is null, keep it null. Do not convert uncertainty into a percentage.",
  "Do not give cultivation, nutrient, lighting, harvest, sale or procurement instructions.",
  "Separate measured, reported, inferred and unknown. Absence of a record is unknown, not a zero trait.",
  "Your text is a language interpretation. It is not a documented fact and must not be stored as a measurement.",
].join(" ");

export type Narration = {
  status: "AI_PROVIDER_NOT_CONFIGURED" | "NARRATED" | "PROVIDER_ERROR";
  role: "LANGUAGE_LAYER_NOT_THE_MODEL";
  model: string | null;
  http: number | null;
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
    database_credentials: "NOT_INCLUDED",
    raw_measurements: "NOT_INCLUDED",
    evidence_class_of_your_reply: "LANGUAGE_INTERPRETATION",
  };
}

export async function narrateScientificReport(
  report: Record<string, unknown>,
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
  model = "grok-4.5",
): Promise<Narration> {
  const fallback = typeof report.human_report === "string" ? report.human_report : "Rapporto deterministico. Nessun testo del modello linguistico.";
  const locked = {
    role: "LANGUAGE_LAYER_NOT_THE_MODEL" as const,
    prediction_probability: null as null,
    evidence_class: "LANGUAGE_INTERPRETATION" as const,
    promoted_to_documented_fact: false as const,
  };
  if (!apiKey?.trim()) {
    return { status: "AI_PROVIDER_NOT_CONFIGURED", model: null, http: null, contract_violation: null, text: fallback, ...locked };
  }
  const context = scientificContext(report);
  const response = await fetchImpl("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 700,
      messages: [
        { role: "system", content: SCIENTIFIC_PERSONA },
        {
          role: "user",
          content: `Interpret this structured G&G result. Do not guess genetics. Do not add a probability. Do not turn your paragraph into a documented fact. Context: ${JSON.stringify(context)}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    return { status: "PROVIDER_ERROR", model, http: response.status, contract_violation: null, text: fallback, ...locked };
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim() || fallback;
  const contract_violation = narrationContractViolation(text);
  if (contract_violation) {
    return { status: "PROVIDER_ERROR", model, http: response.status, contract_violation, text: fallback, ...locked };
  }
  return { status: "NARRATED", model, http: response.status, contract_violation: null, text, ...locked };
}
