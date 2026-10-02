export type VisualizationCompound = { name: string; central_estimate: number | null; status: string };

export type VisualizationInput = {
  prediction_id?: unknown;
  model_id?: unknown;
  model_version?: unknown;
  knowledge_snapshot?: unknown;
  calibration_status?: unknown;
  prediction_probability?: unknown;
  compounds?: unknown;
  prompt?: unknown;
  text?: unknown;
};

export type VisualizationSpec = {
  prediction_id: string;
  model_id: string;
  model_version: string;
  knowledge_snapshot: string;
  calibration_status: string;
  prediction_probability: null;
  compounds: VisualizationCompound[];
  provenance: "STRUCTURED_PREDICTION_ONLY";
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildVisualization(input: VisualizationInput): { ok: true; spec: VisualizationSpec; prompt: string } | { ok: false; error: string } {
  if ("prompt" in input || "text" in input) return { ok: false, error: "RAW_TEXT_REJECTED" };
  const predictionId = text(input.prediction_id);
  const modelId = text(input.model_id);
  const modelVersion = text(input.model_version);
  const snapshot = text(input.knowledge_snapshot);
  const calibration = text(input.calibration_status);
  if (!predictionId || !modelId || !modelVersion || !snapshot || !calibration) return { ok: false, error: "VISUALIZATION_SPEC_INCOMPLETE" };
  if (input.prediction_probability !== null) return { ok: false, error: "PROBABILITY_NOT_ACCEPTED" };
  if (!Array.isArray(input.compounds) || input.compounds.length === 0) return { ok: false, error: "COMPOUNDS_REQUIRED" };
  const compounds: VisualizationCompound[] = [];
  for (const item of input.compounds) {
    if (!item || typeof item !== "object") return { ok: false, error: "COMPOUND_INVALID" };
    const row = item as { name?: unknown; central_estimate?: unknown; status?: unknown };
    const name = text(row.name);
    if (!name) return { ok: false, error: "COMPOUND_INVALID" };
    const estimate = row.central_estimate;
    if (estimate !== null && (typeof estimate !== "number" || !Number.isFinite(estimate))) return { ok: false, error: "COMPOUND_INVALID" };
    compounds.push({ name, central_estimate: estimate === null ? null : estimate, status: text(row.status) || "NOT_COMPUTABLE" });
  }
  const spec: VisualizationSpec = {
    prediction_id: predictionId,
    model_id: modelId,
    model_version: modelVersion,
    knowledge_snapshot: snapshot,
    calibration_status: calibration,
    prediction_probability: null,
    compounds,
    provenance: "STRUCTURED_PREDICTION_ONLY",
  };
  const bars = compounds
    .map((compound) => `${compound.name} ${compound.central_estimate === null ? "not computable" : compound.central_estimate} (${compound.status})`)
    .join("; ");
  const prompt = [
    "Abstract scientific bar chart on a plain white background.",
    "Do not draw a plant, a flower, a grow room, soil, nutrients, or any cultivation or production equipment.",
    `Title: uncalibrated chemical estimate. Calibration: ${calibration}. Probability: null.`,
    `Prediction ${predictionId}. Model ${modelId} ${modelVersion}. Snapshot ${snapshot}.`,
    `Bars: ${bars}.`,
    "Label the chart NOT A PHENOTYPE and NOT MEDICAL ADVICE.",
  ].join(" ");
  return { ok: true, spec, prompt };
}

export type ImageGenerationResult = {
  status: "GENERATED" | "UNAVAILABLE" | "REJECTED" | "PROVIDER_ERROR";
  spec: VisualizationSpec | null;
  model: "grok-imagine-image-2.0" | null;
  bytes: number | null;
  image: Buffer | null;
  mime_type: string | null;
  provider_http: number | null;
  error: string | null;
};

export async function generateStructuredImage(
  input: VisualizationInput,
  fetchImpl: typeof fetch,
  apiKey: string | undefined,
): Promise<ImageGenerationResult> {
  const built = buildVisualization(input);
  if (!built.ok) return { status: "REJECTED", spec: null, model: null, bytes: null, image: null, mime_type: null, provider_http: null, error: built.error };
  if (!apiKey?.trim()) {
    return { status: "UNAVAILABLE", spec: built.spec, model: null, bytes: null, image: null, mime_type: null, provider_http: null, error: "XAI_API_KEY_ABSENT" };
  }
  const response = await fetchImpl("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey.trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "grok-imagine-image-2.0", prompt: built.prompt, n: 1 }),
  });
  if (!response.ok) {
    return { status: "PROVIDER_ERROR", spec: built.spec, model: "grok-imagine-image-2.0", bytes: null, image: null, mime_type: null, provider_http: response.status, error: "IMAGE_PROVIDER_HTTP" };
  }
  const payload = (await response.json()) as { data?: { url?: string; mime_type?: string }[] };
  const url = payload.data?.[0]?.url;
  if (!url) {
    return { status: "PROVIDER_ERROR", spec: built.spec, model: "grok-imagine-image-2.0", bytes: null, image: null, mime_type: null, provider_http: response.status, error: "IMAGE_URL_ABSENT" };
  }
  const file = await fetchImpl(url);
  if (!file.ok) {
    return { status: "PROVIDER_ERROR", spec: built.spec, model: "grok-imagine-image-2.0", bytes: null, image: null, mime_type: null, provider_http: file.status, error: "IMAGE_DOWNLOAD_FAILED" };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    status: "GENERATED",
    spec: built.spec,
    model: "grok-imagine-image-2.0",
    bytes: bytes.length,
    image: bytes,
    mime_type: payload.data?.[0]?.mime_type ?? file.headers.get("content-type"),
    provider_http: response.status,
    error: null,
  };
}
