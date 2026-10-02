export const SCIENTIFIC_PERSONA = [
  "GREED & GROSS is a scientific cannabis genetics and botanical intelligence engine.",
  "It applies methods from genetics, botany, breeding science, phytochemistry and pharmacognosy.",
  "It is not a human physician, pharmacist, geneticist, botanist or breeder and must not claim those credentials.",
  "The scientific model result in the context is authoritative. Do not invent a second prediction.",
  "If prediction_probability is null, keep it null. Do not convert uncertainty into a percentage.",
  "Do not give cultivation, nutrient, lighting, harvest, sale or procurement instructions.",
  "Separate measured, reported, inferred and unknown. Absence of a record is unknown, not a zero trait.",
].join(" ");

export type Narration = {
  status: "AI_PROVIDER_NOT_CONFIGURED" | "NARRATED" | "PROVIDER_ERROR";
  role: "LANGUAGE_LAYER_NOT_THE_MODEL";
  model: string | null;
  http: number | null;
  prediction_probability: null;
  text: string;
};

export function scientificContext(report: Record<string, unknown>) {
  return {
    intent: "cross_report",
    identity_status: report.identity_status ?? null,
    data_status: report.data_status ?? null,
    prediction_probability: null,
    calibration_status: report.calibration_status ?? "NOT_CALIBRATED",
    model_id: report.model_id ?? null,
    model_version: report.model_version ?? null,
    knowledge_snapshot: report.knowledge_snapshot ?? null,
    cache_status: report.cache_status ?? null,
    traits: report.traits ?? [],
    parents: report.parents ?? [],
    patterns_used: report.patterns_used ?? [],
    historical_crosses: report.historical_crosses ?? null,
    assumptions: report.assumptions ?? [],
    limitations: report.limitations ?? [],
    known: "Only fields present in this object.",
    unknown: report.data_status === "NOT_COMPUTABLE" || report.identity_status !== "RESOLVED" ? "Identity or evidence is insufficient." : null,
    contradictions: [],
    database_credentials: "NOT_INCLUDED",
    raw_measurements: "NOT_INCLUDED",
  };
}

export async function narrateScientificReport(report: Record<string, unknown>, fetchImpl: typeof fetch, apiKey: string | undefined): Promise<Narration> {
  const fallback = typeof report.human_report === "string" ? report.human_report : "Rapporto deterministico. Nessun testo del modello linguistico.";
  if (!apiKey?.trim()) {
    return {
      status: "AI_PROVIDER_NOT_CONFIGURED",
      role: "LANGUAGE_LAYER_NOT_THE_MODEL",
      model: null,
      http: null,
      prediction_probability: null,
      text: fallback,
    };
  }
  const context = scientificContext(report);
  const response = await fetchImpl("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_tokens: 700,
      messages: [
        { role: "system", content: SCIENTIFIC_PERSONA },
        {
          role: "user",
          content: `Interpret this structured G&G result. Do not guess genetics. Do not add a probability. Context: ${JSON.stringify(context)}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    return { status: "PROVIDER_ERROR", role: "LANGUAGE_LAYER_NOT_THE_MODEL", model: "grok-4.5", http: response.status, prediction_probability: null, text: fallback };
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim() || fallback;
  return { status: "NARRATED", role: "LANGUAGE_LAYER_NOT_THE_MODEL", model: "grok-4.5", http: response.status, prediction_probability: null, text };
}
