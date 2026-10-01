import { auth } from "@/lib/auth/server";
import {
  addObservation,
  breedingChat,
  claimAdmin,
  createApiKey,
  createUnresolvedStrain,
  dashboard,
  deletePrivate,
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
  runCross,
  searchOwnedCrosses,
  searchPatternLibrary,
  semanticSearch,
  storeScientificCache,
  strainDetail,
  strainPedigree,
  strainSearch,
  submitEvidence,
  updatePatternStatus,
  userIdForApiKey,
  versionInfo,
} from "./services.server.ts";
import { openApiDocsHtml, openApiDocument } from "./openapi.ts";
import { probeInfrastructure } from "./runtime.server.ts";
import { knowledgeRepository } from "./repository.ts";
import { readinessReport } from "./readiness.ts";

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
  return new Response(response.body, { status: response.status, headers });
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Errore";
  if (/postgres(?:ql)?:\/\//i.test(message) || /rediss?:\/\//i.test(message) || /password/i.test(message)) {
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
      const ok = infra.checks.api === "healthy" && infra.checks.database === "healthy";
      return json({ ok, service: "greed-and-gross", ...infra });
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
    if (request.method === "GET" && path === "models/registry") return json({ models: knowledgeRepository.registryModels(), production_ready: 0 });
    if (request.method === "GET" && path.startsWith("models/")) {
      const model = await getModel(decodeURIComponent(path.slice("models/".length)));
      return model ? json(model) : json({ error: "Modello assente" }, 404);
    }
    if (request.method === "GET" && path === "metrics") return json(await platformMetrics());
    if (request.method === "GET" && path === "foundation") return json(knowledgeRepository.foundationStatus());
    if (request.method === "GET" && path === "foundation/search") {
      return json(knowledgeRepository.foundationSearch(url.searchParams.get("q") ?? ""));
    }
    if (request.method === "GET" && path === "knowledge/quality") return json(knowledgeRepository.qualityReport());
    if (request.method === "GET" && path === "knowledge/walk") return json(knowledgeRepository.walkName(url.searchParams.get("q") ?? "") ?? { ready: false });
    if (request.method === "GET" && path === "search") return json(await strainSearch(url.searchParams.get("q") ?? ""));
    if (request.method === "POST" && path === "research") {
      const body = (await request.json()) as { q?: string; query?: string };
      const resolved = await knowledgeRepository.resolveQuery(String(body.q ?? body.query ?? ""));
      return json(resolved, knowledgeRepository.httpStatusForResolution(resolved.resolution_status, resolved.origin));
    }
    if (request.method === "GET" && path === "knowledge/events") {
      return json({ events: knowledgeRepository.listKnowledgeEvents(Number(url.searchParams.get("limit") ?? 20)) });
    }
    if (request.method === "GET" && path === "research/status") return json(knowledgeRepository.providerHealth());
    if (request.method === "GET" && path === "research/events") {
      if (!(await actor(request))) return json({ error: "Non autorizzato" }, 401);
      return json({ events: knowledgeRepository.listKnowledgeEvents(Number(url.searchParams.get("limit") ?? 20)) });
    }
    if (request.method === "GET" && path.startsWith("research/")) {
      const event = knowledgeRepository.readResearch(decodeURIComponent(path.slice("research/".length)));
      return event ? json(event) : json({ error: "Research assente" }, 404);
    }
    if (request.method === "GET" && path.startsWith("knowledge/crosses/")) {
      const detail = knowledgeRepository.loadCrossDetail(decodeURIComponent(path.slice("knowledge/crosses/".length)));
      return detail ? json(detail) : json({ error: "Cross assente" }, 404);
    }
    if (request.method === "GET" && path === "retrieve") return json(knowledgeRepository.getEvidence(url.searchParams.get("q") ?? ""));
    if (request.method === "GET" && path === "entities") return json({ results: await strainSearch(url.searchParams.get("q") ?? "") });
    if (request.method === "GET" && path === "identity") return json(knowledgeRepository.getEvidence(url.searchParams.get("q") ?? "").identity_decisions);
    if (request.method === "GET" && path === "samples") {
      const found = knowledgeRepository.getEvidence(url.searchParams.get("q") ?? "");
      return json({ snapshot_id: found.snapshot_id, samples: found.samples, genomics: found.genomics });
    }
    if (request.method === "GET" && path === "measurements") {
      const found = knowledgeRepository.getEvidence(url.searchParams.get("q") ?? "");
      return json({ snapshot_id: found.snapshot_id, chemistry: found.chemistry });
    }
    if (request.method === "GET" && path === "chemistry") {
      const found = knowledgeRepository.getEvidence(url.searchParams.get("q") ?? "");
      return json({ snapshot_id: found.snapshot_id, chemistry: found.chemistry });
    }
    if (request.method === "GET" && path === "pedigree") return json(knowledgeRepository.walkName(url.searchParams.get("q") ?? "") ?? { ready: false });
    if (request.method === "GET" && path === "genomics") return json(knowledgeRepository.getGenomics());
    if (request.method === "GET" && path === "graph") return json(knowledgeRepository.getGraph(url.searchParams.get("id") ?? ""));
    if (request.method === "GET" && path === "knowledge/snapshot") return json(knowledgeRepository.getSnapshot());
    if (request.method === "GET" && path === "knowledge/evidence") return json(await listEvidence());
    if (request.method === "GET" && path === "snapshots") return json(knowledgeRepository.getSnapshot());
    if (request.method === "GET" && path === "targets") return json({ ...knowledgeRepository.targetStatusCounts(), targets: knowledgeRepository.listTargets() });
    if (request.method === "GET" && path === "sources") return json(knowledgeRepository.listSources());
    if (request.method === "GET" && path === "evaluations") return json(knowledgeRepository.listEvaluations());
    if (request.method === "GET" && path === "jobs") return json({ jobs: knowledgeRepository.readJobs(), worker: "CLI_NOT_DAEMON" });
    if (request.method === "GET" && path === "cache") return json({ policy: "DERIVED_WRITE", redis: "NOT_CONFIGURED", snapshot: knowledgeRepository.getSnapshot() });
    if (request.method === "GET" && path.startsWith("entities/")) {
      const detail = await strainDetail(decodeURIComponent(path.slice("entities/".length)));
      return detail ? json(detail) : json({ error: "Entità assente" }, 404);
    }
    if (request.method === "GET" && path.startsWith("disciplines/")) {
      const name = decodeURIComponent(path.slice("disciplines/".length));
      if (!knowledgeRepository.disciplines.includes(name as (typeof knowledgeRepository.disciplines)[number])) return json({ error: "Disciplina assente" }, 404);
      return json(knowledgeRepository.disciplineReport(name as (typeof knowledgeRepository.disciplines)[number], url.searchParams.get("q") ?? ""));
    }
    if (request.method === "POST" && (path === "predictions/evaluate" || path === "predictions/run")) {
      const body = (await request.json()) as { target_id?: string; query?: string; entity_id?: string | null; features?: string[] };
      const result = knowledgeRepository.evaluate(body);
      knowledgeRepository.recordPredictionRequest(result);
      return json({ ...result, write_policy: "DERIVED_WRITE", stored_as_evidence: false });
    }
    if (request.method === "GET" && path === "predictions/summary") return json(knowledgeRepository.predictionRequestSummary());
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
    if (request.method === "GET" && path === "evidence") return json(await listEvidence());
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
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const cross = await getOwnedCross(decodeURIComponent(path.slice("crosses/".length)), userId);
      return cross ? json(cross) : json({ error: "Incrocio assente" }, 404);
    }
    if (request.method === "GET" && path === "predictions") {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      return json({ predictions: await listPredictions(userId) });
    }
    if (request.method === "POST" && path.startsWith("predictions/") && path.endsWith("/outcome")) {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const id = decodeURIComponent(path.slice("predictions/".length, -"/outcome".length));
      const body = (await request.json()) as { trait?: string; ordinal?: number | null; note?: string };
      if (!body.trait) return json({ error: "Manca il tratto." }, 400);
      const result = await addObservation(userId, { ...body, prediction_id: id, trait: body.trait });
      return "error" in result ? json(result, 404) : json(result);
    }
    if (request.method === "GET" && path.startsWith("predictions/")) {
      const userId = await actor(request);
      if (!userId) return json({ error: "Non autorizzato" }, 401);
      const prediction = await getPrediction(decodeURIComponent(path.slice("predictions/".length)), userId);
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
