import { auth } from "@/lib/auth/server";
import {
  addObservation,
  breedingChat,
  claimAdmin,
  createApiKey,
  createUnresolvedStrain,
  dashboard,
  deletePrivate,
  entityAuditBatch,
  entityAuditStatus,
  exportAccount,
  getModel,
  getOwnedCross,
  getPrediction,
  invalidateScientificCache,
  knowledgeQuery,
  knowledgeStatus,
  invokeScientificTool,
  listEvidence,
  listModels,
  listPatterns,
  listPredictions,
  lookupScientificCache,
  parseAnalyze,
  platformMetrics,
  promoteObservation,
  publicCross,
  publicPrediction,
  publishStructured,
  runCross,
  searchOwnedCrosses,
  searchPatternLibrary,
  searchReports,
  semanticSearch,
  storeScientificCache,
  strainDetail,
  strainPedigree,
  strainSearch,
  submitEvidence,
  syntheticOutcome,
  updatePatternStatus,
  userIdForApiKey,
  versionInfo,
} from "./services.server.ts";
import { openApiDocsHtml, openApiDocument } from "./openapi.ts";
import { probeInfrastructure } from "./runtime.server.ts";
import { readinessReport } from "./readiness.ts";
import { previewKnowledgeRepository } from "./knowledge-factory.ts";
import { storeContentReport } from "./content-report.server.ts";
import { findKnowledgeGaps } from "./knowledge-gaps.ts";
import { gapsFromCounts, genomicsSummary } from "./inventory.ts";
import { readScientificInventory } from "./inventory.server.ts";
import { probeEmbeddingModels, probeLanguageModels } from "./embedding.ts";
import { buildVisualization, generateStructuredImage } from "./visualization.ts";
import { boundaryDenial, needsBoundedQuery, publicArchitecture } from "./boundary.ts";
import { productionCorpus } from "./production-source.server.ts";
import { closedMechanism, entitlementDocument, refuseClientPurchase } from "./monetization.ts";

const buckets = new Map<string, { n: number; t: number }>();

function limited(key: string): boolean {
  const now = Date.now();
  const slot = buckets.get(key);
  if (!slot || now - slot.t > 60_000) {
    buckets.set(key, { n: 1, t: now });
    return false;
  }
  slot.n += 1;
  return slot.n > 120;
}

async function actor(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (token.startsWith("gg_")) return userIdForApiKey(token);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const production = process.env.NODE_ENV === "production";
  const dev = ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:3000", "http://10.0.2.2:8080"];
  const allow = configured.length ? configured : production ? [] : dev;
  return allow.includes(origin) ? origin : null;
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = allowedOrigin(request);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  if (!headers.has("x-request-id")) headers.set("x-request-id", crypto.randomUUID());
  return new Response(response.body, { status: response.status, headers });
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Errore";
  if (/postgres(?:ql)?:\/\//i.test(message) || /rediss?:\/\//i.test(message) || /password/i.test(message) || /ENOENT/i.test(message) || message.includes("/var/task")) {
    return "Errore interno. I dettagli di infrastruttura non escono dall'API.";
  }
  return message.slice(0, 400);
}

export async function handleV1(request: Request): Promise<Response> {
  return withCors(await dispatch(request), request);
}

async function dispatch(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return json({ ok: true });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  if (limited(`${ip}:${path}`)) return json({ error: "Troppe richieste." }, 429);
  const announced = Number(request.headers.get("content-length") ?? 0);
  if (announced > 262_144) return json({ error: "Corpo troppo grande." }, 413);
  try {
    if (request.method === "GET" && path === "health") {
      const infra = await probeInfrastructure();
      const ok = infra.checks.api === "healthy" && infra.checks.app_database === "healthy";
      return json({ ok, service: "greed-and-gross", ...infra });
    }
    const denied = boundaryDenial(path);
    if (denied) return json(denied, 403);
    if (request.method === "GET" && path === "architecture") return json(publicArchitecture());
    if (request.method === "GET" && (path === "entitlements" || path === "monetization")) return json(entitlementDocument());
    if (request.method === "POST" && path === "billing/play/verify") {
      const raw = await request.json().catch(() => ({}));
      const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      return json(refuseClientPurchase(body), 409);
    }
    if (request.method === "POST" && path === "monetization/use") {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      const closed = closedMechanism(String(body.id ?? ""));
      return closed ? json(closed, 402) : json({ error: "Meccanismo assente" }, 404);
    }
    if (needsBoundedQuery(path, url.searchParams.get("q"))) {
      return json({ error: "QUERY_REQUIRED", boundary: "APPLICATION_QUERY", reason: "Serve un nome. Il corpus non si scarica." }, 400);
    }
    if (request.method === "POST" && path === "content-reports") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Sessione scaduta. Accedi nuovamente." }, 401);
      const body = await request.json().catch(() => ({}));
      const result = await storeContentReport({
        userId,
        kind: String(body.kind ?? ""),
        detail: String(body.detail ?? ""),
        targetId: String(body.target_id ?? ""),
      });
      return json(result, result.stored ? 201 : result.status === "REJECTED" ? 422 : 503);
    }
    if (request.method === "GET" && path === "readiness") return json(readinessReport());
    if (request.method === "GET" && path === "version") return json(await versionInfo());
    if (request.method === "GET" && (path === "openapi" || path === "openapi.json")) return json(openApiDocument());
    if (request.method === "GET" && path === "docs") {
      return new Response(openApiDocsHtml(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (request.method === "GET" && path === "models") return json(await listModels());
    if (request.method === "GET" && path === "models/registry") {
      return json({ models: [], production_ready: 0, source: "supabase_postgresql", fallback: "NONE", role: "PRODUCTION_GATE" });
    }
    if (request.method === "GET" && path.startsWith("models/")) {
      const model = await getModel(decodeURIComponent(path.slice("models/".length)));
      return model ? json(model) : json({ error: "Modello assente" }, 404);
    }
    if (request.method === "GET" && path === "metrics") return json(await platformMetrics());
    if (request.method === "GET" && path === "foundation") {
      const corpus = await productionCorpus();
      const snapshot = await previewKnowledgeRepository().createSnapshot();
      return json({
        status: corpus.status === "CONNECTED" ? "READY" : corpus.status,
        source: "supabase_postgresql",
        project_ref: corpus.project_ref,
        snapshot: snapshot.snapshot_id,
        counts: corpus.counts,
        database_state: { configured: corpus.connected, read_only: corpus.connected ? true : null },
        import_state: { status: "NOT_RESUMED", measurements: corpus.counts?.measurements ?? null },
        fallback: "NONE",
        reason: corpus.reason,
      });
    }
    if (request.method === "GET" && path === "foundation/search") {
      return json(await previewKnowledgeRepository().resolveEntity(url.searchParams.get("q") ?? ""));
    }
    if (request.method === "GET" && path === "diagnostics/xai") {
      const { xaiHealth } = await import("./xai-health.ts");
      return json(await xaiHealth(fetch));
    }
    if (request.method === "GET" && path === "diagnostics/env") {
      const corpus = await previewKnowledgeRepository().availability();
      return json({
        DATABASE_URL_PRESENT: Boolean(process.env.DATABASE_URL?.trim()),
        PROJECT_URL_PRESENT: Boolean(process.env.PROJECT_URL?.trim() || process.env.SUPABASE_URL?.trim()),
        SERVICE_ROLE_PRESENT: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
        LANGUAGE_CREDENTIAL: (await import("./server-credential.ts")).serverLanguageCredential().source === "ABSENT" ? "ABSENT" : "SERVER",
        scientific_database_status: corpus.status,
        project_ref: corpus.project_ref,
        database_public: false,
        supabase_data_api: "NOT_THE_APPLICATION_API",
        client_may_open_postgres: false,
      });
    }
    if (request.method === "GET" && path === "knowledge/quality") {
      const corpus = await previewKnowledgeRepository().availability();
      return json({ source: "supabase_postgresql", fallback: "NONE", corpus, sqlite: "NOT_USED" });
    }
    if (request.method === "GET" && path === "knowledge/walk") {
      return json(await previewKnowledgeRepository().resolveEntity(url.searchParams.get("q") ?? ""));
    }
    if (request.method === "GET" && path === "search") return json(await strainSearch(url.searchParams.get("q") ?? ""));
    if (request.method === "POST" && path === "research") {
      const corpus = await previewKnowledgeRepository().availability();
      if (corpus.status !== "CONNECTED" || !corpus.counts) {
        return json({ status: corpus.status, fallback: "NONE", source: "supabase_postgresql", reason: corpus.reason, memory: null }, 503);
      }
      const rows = corpus.counts.global_research_memory;
      if (rows === null) {
        return json({
          status: "NOT_AVAILABLE",
          fallback: "NONE",
          source: "supabase_postgresql",
          project_ref: corpus.project_ref,
          reason: "global_research_memory non esiste sul database production. Lo schema non viene creato da questa richiesta.",
          memory: null,
        }, 503);
      }
      return json({
        status: "CONNECTED",
        fallback: "NONE",
        source: "supabase_postgresql",
        project_ref: corpus.project_ref,
        global_research_memory: rows,
        write: "NOT_RUN",
        reason: "Lettura della memoria production. Nessuna riga è stata inserita e SQLite non è stato aperto.",
      });
    }
    if (request.method === "GET" && path === "knowledge/events") {
      return json({ events: [], source: "supabase_postgresql", fallback: "NONE", note: "Gli eventi del motore locale non sono la memoria production." });
    }
    if (request.method === "GET" && path === "research/status") {
      const corpus = await previewKnowledgeRepository().availability();
      return json({ scientific_database: corpus.status, source: "supabase_postgresql", fallback: "NONE", provider: "NOT_THIS_ROUTE" });
    }
    if (request.method === "GET" && path === "research/events") {
      if (!(await actor(request))) return json({ error: "Non autorizzato" }, 401);
      return json({ events: [], source: "supabase_postgresql", fallback: "NONE" });
    }
    if (request.method === "GET" && path.startsWith("research/")) {
      return json({ error: "Research assente nel backend production", source: "supabase_postgresql", fallback: "NONE" }, 404);
    }
    if (request.method === "GET" && path.startsWith("knowledge/crosses/")) {
      return json({ error: "Cross assente nel backend production", source: "supabase_postgresql", fallback: "NONE" }, 404);
    }
    if (request.method === "GET" && path === "retrieve") return json(await previewKnowledgeRepository().getEvidence(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "entities") return json({ results: await strainSearch(url.searchParams.get("q") ?? "") });
    if (request.method === "GET" && path === "identity") return json(await previewKnowledgeRepository().resolveEntity(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "samples") return json(await previewKnowledgeRepository().getEvidence(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "measurements") return json(await previewKnowledgeRepository().getMeasurements(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "chemistry") return json(await previewKnowledgeRepository().getMeasurements(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "pedigree") return json(await previewKnowledgeRepository().getPedigree(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "genomics") return json(genomicsSummary((await readScientificInventory()).categories));
    if (request.method === "GET" && path === "graph") return json(await previewKnowledgeRepository().getPedigree(url.searchParams.get("id") ?? url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "knowledge/snapshot") return json(await previewKnowledgeRepository().createSnapshot());
    if (request.method === "GET" && path === "knowledge/evidence") return json(await listEvidence(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "inventory") return json(await readScientificInventory());
    if (request.method === "GET" && path === "embeddings") {
      const { serverLanguageCredential } = await import("./server-credential.ts");
      const credential = serverLanguageCredential();
      const token = credential.token ?? undefined;
      const [embeddings, language] = await Promise.all([
        probeEmbeddingModels(fetch, token),
        probeLanguageModels(fetch, token),
      ]);
      return json({ ...embeddings, language, language_credential: credential.source === "ABSENT" ? "ABSENT" : "SERVER" });
    }
    if (request.method === "GET" && path === "patterns/lifecycle") {
      const inventory = await readScientificInventory();
      return json({
        source: "supabase_postgresql",
        fallback: "NONE",
        rows: inventory.categories.filter((item) => item.category.startsWith("pattern_")),
        promoted: false,
      });
    }
    if (request.method === "GET" && path === "snapshots") return json(await previewKnowledgeRepository().createSnapshot());
    if (request.method === "GET" && path === "targets") {
      return json({ targets: null, status: "NOT_MEASURED", source: "supabase_postgresql", fallback: "NONE", sqlite: "NOT_USED", reason: "Nessuna tabella di target è nell'allowlist interrogata." });
    }
    if (request.method === "GET" && path === "sources") {
      const inventory = await readScientificInventory();
      const row = inventory.categories.find((item) => item.category === "acquisition_sources") ?? null;
      return json({ sources: null, count: row, source: "supabase_postgresql", fallback: "NONE", sqlite: "NOT_USED" });
    }
    if (request.method === "GET" && path === "evaluations") {
      const inventory = await readScientificInventory();
      const row = inventory.categories.find((item) => item.category === "calibration_runs") ?? null;
      return json({ evaluations: null, calibration_runs: row, source: "supabase_postgresql", fallback: "NONE", sqlite: "NOT_USED" });
    }
    if (request.method === "GET" && path === "jobs") {
      const inventory = await readScientificInventory();
      return json({
        jobs: null,
        counts: inventory.categories.filter((item) => item.category === "jobs" || item.category === "worker_jobs"),
        worker: "NOT_THIS_PROCESS",
        source: "supabase_postgresql",
        fallback: "NONE",
      });
    }
    if (request.method === "GET" && path === "cache") {
      const snapshot = await previewKnowledgeRepository().createSnapshot();
      return json({ policy: "NOT_A_SOURCE", redis: "NOT_CONFIGURED", snapshot, fallback: "NONE" });
    }
    if (request.method === "GET" && path.startsWith("entities/")) {
      const detail = await strainDetail(decodeURIComponent(path.slice("entities/".length)));
      return detail ? json(detail) : json({ error: "Entità assente" }, 404);
    }
    if (request.method === "GET" && path.startsWith("disciplines/")) {
      return json({
        discipline: decodeURIComponent(path.slice("disciplines/".length)),
        data_status: "NOT_AVAILABLE",
        source: "supabase_postgresql",
        fallback: "NONE",
        sqlite: "NOT_USED",
      });
    }
    if (request.method === "POST" && path === "reports/search") {
      const body = (await request.json()) as { parent?: string; generation?: string; snapshot?: string; limit?: number };
      return json({ results: await searchReports(body), semantic: "NOT_USED", rule: "Filtri strutturati. La similarità non è evidenza." });
    }
    if (request.method === "GET" && path.startsWith("reports/")) {
      const prediction = await publicPrediction(decodeURIComponent(path.slice("reports/".length)));
      return prediction ? json(prediction) : json({ error: "Rapporto assente" }, 404);
    }
    if (request.method === "POST" && path === "audit/entities") {
      const body = (await request.json().catch(() => ({}))) as { limit?: number; confirm?: string };
      if (body.confirm !== "RUN_ENTITY_AUDIT") return json({ error: "Conferma assente" }, 400);
      const limit = Math.min(Math.max(Number(body.limit ?? 250), 1), 400);
      return json(await entityAuditBatch(limit));
    }
    if (request.method === "GET" && path === "audit/entities") {
      return json(await entityAuditStatus());
    }
    if (request.method === "POST" && (path === "predictions" || path === "predictions/evaluate" || path === "predictions/run")) {
      const databaseUrl = process.env.DATABASE_URL?.trim();
      if (!databaseUrl) {
        return json({
          prediction_probability: null,
          prediction_status: "SCIENTIFIC_DB_UNAVAILABLE",
          calibration_status: "NOT_CALIBRATED",
          model_id: "gg-additive-midparent",
          model_version: "1",
          source: "supabase_postgresql",
          fallback: "NONE",
          stored_as_evidence: false,
          reason: "DATABASE_URL is not in this process. SQLite is not used.",
        }, 503);
      }
      const body = (await request.json()) as { parent_a?: string; parent_b?: string; parent_a_id?: number; parent_b_id?: number; compound?: string; generation?: string };
      const { predictOnPostgres } = await import("./prediction/postgres-predict.ts");
      const report = await predictOnPostgres(databaseUrl, {
        parentA: String(body.parent_a ?? ""),
        parentB: String(body.parent_b ?? ""),
        parentAId: body.parent_a_id ?? null,
        parentBId: body.parent_b_id ?? null,
        compounds: body.compound ? [String(body.compound)] : ["delta_9_thc"],
        generation: body.generation ?? null,
      });
      const { buildArchitectureReport, narrativeFromReport } = await import("./report/architecture.ts");
      const structured_report = buildArchitectureReport(report, `${body.parent_a ?? ""} × ${body.parent_b ?? ""}`, (body.generation ?? "").split(/\s+/).filter(Boolean));
      const published = await publishStructured(structured_report);
      const { narrateScientificReport } = await import("./scientific-report.ts");
      const { serverLanguageCredential } = await import("./server-credential.ts");
      const credential = serverLanguageCredential();
      const narration = await narrateScientificReport(report, fetch, credential.token ?? undefined);
      return json({
        ...report,
        human_report: narrativeFromReport(published.structured_report),
        structured_report: published.structured_report,
        cross_id: published.cross_id,
        prediction_id: published.prediction_id,
        persisted: published.stored,
        cache_backend: published.cache_backend,
        redis: published.redis,
        narration,
        language_credential: credential.source === "ABSENT" ? "ABSENT" : "SERVER",
        stored_as_evidence: false,
        fallback: "NONE",
      });
    }
    if (request.method === "GET" && path === "predictions/summary") {
      return json({ probability: null, prediction_status: "NOT_COMPUTABLE", source: "supabase_postgresql", fallback: "NONE" });
    }
    if (request.method === "POST" && path === "conversation/message") {
      const body = (await request.json()) as { message?: string };
      try {
        const chat = await breedingChat(String(body.message ?? ""));
        return json({
          ...chat,
          pipeline: "RETRIEVAL_THEN_LANGUAGE",
          raw_measurements: "NOT_INCLUDED",
          prediction_probability: null,
          database_credentials: "NOT_INCLUDED",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Richiesta non valida";
        return json({ error: message, prediction_probability: null }, 400);
      }
    }
    if (request.method === "POST" && path === "chat") {
      const body = (await request.json()) as { message?: string; parent_a_id?: string | null; parent_b_id?: string | null };
      return json(await breedingChat(String(body.message ?? ""), { parent_a_id: body.parent_a_id, parent_b_id: body.parent_b_id }));
    }
    if (request.method === "POST" && (path === "tools" || path.startsWith("tools/"))) {
      const body = (await request.json()) as { tool?: string; arguments?: Record<string, unknown> } & Record<string, unknown>;
      const name = path === "tools" ? String(body.tool ?? "") : decodeURIComponent(path.slice("tools/".length));
      const args =
        body.arguments && typeof body.arguments === "object"
          ? body.arguments
          : Object.fromEntries(Object.entries(body).filter(([key]) => key !== "tool"));
      const result = await invokeScientificTool(name, args, await actor(request));
      if (result && typeof result === "object" && "error" in result && result.error === "Non autorizzato") {
        return json(result, 401);
      }
      if (result && typeof result === "object" && "error" in result && result.error === "Strumento assente nel core. Il plugin ChatGPT non è un endpoint.") {
        return json(result, 404);
      }
      return json({ tool: name, result });
    }
    if (request.method === "GET" && path === "dashboard") return json(await dashboard(await actor(request)));
    if (request.method === "GET" && path === "knowledge/status") return json(await knowledgeStatus());
    if (request.method === "POST" && path === "knowledge/query") {
      const body = (await request.json()) as { q?: string; kind?: string; subject_id?: string; limit?: number };
      return json(await knowledgeQuery(String(body.q ?? ""), body));
    }
    if ((request.method === "POST" && path === "knowledge/ingest") || (request.method === "POST" && path === "evidence")) {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const result = await submitEvidence(userId, (await request.json()) as { title?: string; claim?: string; url?: string });
      return "error" in result ? json(result, result.error === "Non autorizzato" ? 403 : 400) : json(result);
    }
    if (request.method === "GET" && path === "patterns") return json(await listPatterns());
    if (request.method === "POST" && path === "patterns/search") {
      const body = (await request.json()) as { q?: string };
      return json(await searchPatternLibrary(String(body.q ?? "")));
    }
    if (request.method === "POST" && path === "patterns/update") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const result = await updatePatternStatus(userId, (await request.json()) as { pattern_id?: string; validation_status?: string });
      return "error" in result ? json(result, result.error === "Non autorizzato" ? 403 : 400) : json(result);
    }
    if (request.method === "GET" && path === "evidence") return json(await listEvidence(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "health/evidence") {
      return json(await previewKnowledgeRepository().getHealthEvidence(url.searchParams.get("q") ?? ""));
    }
    if (request.method === "GET" && path === "knowledge/gaps") {
      const inventory = await readScientificInventory();
      return json({
        source: "supabase_postgresql",
        fallback: "NONE",
        inventory_status: inventory.status,
        gaps: inventory.categories.length ? gapsFromCounts(inventory.categories) : findKnowledgeGaps({}),
      });
    }
    if (request.method === "POST" && path === "visualizations") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: "VISUALIZATION_SPEC_INCOMPLETE" }, 400);
      const built = buildVisualization(body);
      if (!built.ok) return json({ error: built.error, prediction_probability: null }, 422);
      const { serverLanguageCredential } = await import("./server-credential.ts");
      const credential = serverLanguageCredential();
      const generated = await generateStructuredImage(body, fetch, credential.token ?? undefined);
      const { createHash } = await import("node:crypto");
      const spec_hash = generated.spec ? createHash("sha256").update(JSON.stringify(generated.spec)).digest("hex") : null;
      return json({
        visualization_id: spec_hash ? `vis:${spec_hash.slice(0, 16)}` : null,
        status: generated.status === "UNAVAILABLE" ? "IMAGE_GENERATION_NOT_CONFIGURED" : generated.status,
        spec: generated.spec,
        spec_hash,
        model: generated.model,
        visual_model_version: generated.model,
        bytes: generated.bytes,
        mime_type: generated.mime_type,
        provider_http: generated.provider_http,
        error: generated.error,
        image_persisted: false,
        evidence: false,
        not_a_phenotype: true,
        not_offspring: true,
        cultivation: "NOT_GENERATED",
      }, generated.status === "GENERATED" ? 200 : generated.status === "REJECTED" ? 422 : 503);
    }
    if (request.method === "POST" && path === "semantic/search") {
      const body = (await request.json()) as { q?: string; kind?: string; subject_id?: string; limit?: number };
      return json(await semanticSearch(String(body.q ?? ""), body));
    }
    if (request.method === "POST" && path === "cache/lookup") {
      return json(await lookupScientificCache(parseAnalyze(await request.json())));
    }
    if (request.method === "POST" && path === "cache/store") {
      return json(await storeScientificCache(parseAnalyze(await request.json())));
    }
    if (request.method === "POST" && path === "cache/invalidate") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const body = (await request.json()) as { reason?: string };
      const result = await invalidateScientificCache(userId, String(body.reason ?? ""));
      return "error" in result ? json(result, 403) : json(result);
    }
    if (request.method === "POST" && path === "strains") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const result = await createUnresolvedStrain(userId, (await request.json()) as { canonical_name?: string; aliases?: string[] });
      if ("error" in result && result.error) {
        const message = result.error;
        const status = message.startsWith("Nome già") ? 409 : message === "Non autorizzato" ? 403 : 400;
        return json(result, status);
      }
      return json(result);
    }
    if (request.method === "POST" && path === "strains/search") {
      const body = (await request.json()) as { q?: string };
      return json(await strainSearch(String(body.q ?? "")));
    }
    if (request.method === "GET" && path.startsWith("strains/") && path.endsWith("/pedigree")) {
      const id = decodeURIComponent(path.slice("strains/".length, -"/pedigree".length));
      const pedigree = await strainPedigree(id);
      return pedigree ? json(pedigree) : json({ error: "Cultivar assente" }, 404);
    }
    if (request.method === "GET" && path.startsWith("strains/")) {
      const id = decodeURIComponent(path.slice("strains/".length));
      const detail = await strainDetail(id);
      return detail ? json(detail) : json({ error: "Cultivar assente" }, 404);
    }
    if (request.method === "POST" && (path === "crosses" || path === "crosses/analyze")) {
      const userId = await actor(request);
      const persist = path === "crosses";
      if (persist && !userId) return json({ error: "Serve l'accesso per salvare l'incrocio." }, 401);
      const result = await runCross(parseAnalyze(await request.json()), userId, persist);
      return json(result);
    }
    if (request.method === "POST" && path === "crosses/search") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const body = (await request.json()) as { q?: string };
      return json(await searchOwnedCrosses(userId, String(body.q ?? "")));
    }
    if (request.method === "GET" && path.startsWith("crosses/")) {
      const id = decodeURIComponent(path.slice("crosses/".length));
      const userId = await actor(request);
      if (!userId) {
        const cross = await publicCross(id);
        return cross ? json(cross) : json({ error: "Incrocio assente" }, 404);
      }
      const cross = await getOwnedCross(id, userId);
      return cross ? json(cross) : json({ error: "Incrocio assente" }, 404);
    }
    if (request.method === "GET" && path === "predictions") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      return json({ predictions: await listPredictions(userId) });
    }
    if (request.method === "POST" && path.startsWith("predictions/") && path.endsWith("/outcome")) {
      const id = decodeURIComponent(path.slice("predictions/".length, -"/outcome".length));
      const body = (await request.json()) as { trait?: string; ordinal?: number | null; note?: string; fixture?: string };
      if (!body.trait) return json({ error: "Manca il tratto." }, 400);
      if (body.fixture === "SYNTHETIC_TEST_FIXTURE") {
        const result = await syntheticOutcome(id, body.trait);
        return "error" in result ? json(result, 404) : json(result);
      }
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const result = await addObservation(userId, { ...body, prediction_id: id, trait: body.trait });
      return "error" in result ? json(result, 404) : json(result);
    }
    if (request.method === "GET" && path.startsWith("predictions/") && path !== "predictions/summary") {
      const id = decodeURIComponent(path.slice("predictions/".length));
      const userId = await actor(request);
      if (!userId) {
        const prediction = await publicPrediction(id);
        return prediction ? json(prediction) : json({ error: "Predizione assente" }, 404);
      }
      const prediction = await getPrediction(id, userId);
      return prediction ? json(prediction) : json({ error: "Predizione assente" }, 404);
    }
    if (request.method === "POST" && path === "observations") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const body = (await request.json()) as {
        prediction_id?: string;
        trait?: string;
        ordinal?: number | null;
        note?: string;
      };
      if (!body.trait) return json({ error: "Manca il tratto." }, 400);
      return json(await addObservation(userId, { ...body, trait: body.trait }));
    }
    if (request.method === "POST" && path === "observations/promote") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const body = (await request.json()) as { observation_id?: string };
      if (!body.observation_id) return json({ error: "Manca l'osservazione." }, 400);
      const result = await promoteObservation(userId, body.observation_id);
      return "error" in result ? json(result, 403) : json(result);
    }
    if (request.method === "POST" && path === "account/claim-admin") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const result = await claimAdmin(userId);
      return "error" in result ? json(result, 409) : json(result);
    }
    if (request.method === "POST" && path === "account/api-keys") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      return json(await createApiKey(userId));
    }
    if (request.method === "GET" && path === "account/export") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      return json(await exportAccount(userId));
    }
    if (request.method === "POST" && path === "account/delete") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      return json(await deletePrivate(userId));
    }
    return json({ error: "Percorso assente", path }, 404);
  } catch (error) {
    return json({ error: publicError(error) }, 400);
  }
}
