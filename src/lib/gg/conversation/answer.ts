import { createHash } from "node:crypto";

import { predictCross, type MachineReport } from "../prediction/orchestrator.ts";
import type { CorpusReader } from "../prediction/sqlite-reader.ts";
import { routeMessage, type ConversationContext, type Intent } from "./router.ts";
import {
  conflictFromParents,
  createResearchMemory,
  type LiteratureRecord,
  type ResearchSession,
  type WebProvider,
  type WebResult,
} from "./research.ts";

const memory = createResearchMemory();

export function sharedResearchMemory() {
  return memory;
}

export type ConversationAnswer = {
  analysis_id: string;
  intent: Intent;
  context: ConversationContext;
  database: "READ" | "SCIENTIFIC_DB_UNAVAILABLE" | "NOT_REQUIRED";
  web: WebResult["status"];
  web_query: string | null;
  records_acquired: LiteratureRecord[];
  records_saved_as: "PENDING_NOT_MEASUREMENT" | "NONE";
  prediction_probability: null;
  prediction_status: "NOT_COMPUTABLE" | "ESTIMATE_NOT_PROBABILITY" | "IDENTITY_AMBIGUOUS" | "SCIENTIFIC_DB_UNAVAILABLE";
  calibration_status: "NOT_CALIBRATED";
  steps: { name: string; status: "DONE" | "NOT_REQUIRED" | "FAILED" | "UNAVAILABLE" }[];
  reply: string;
  audit: Record<string, unknown> | null;
  conflicts: ReturnType<typeof conflictFromParents>[];
};

const PRIVATE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s]{8,}/i;

export async function answerQuestion(input: {
  message: string;
  context?: ConversationContext;
  reader?: CorpusReader | null;
  web?: WebProvider | null;
  parentIds?: { a: number | null; b: number | null };
  now?: string;
  memory?: ReturnType<typeof createResearchMemory>;
}): Promise<ConversationAnswer> {
  const now = input.now ?? new Date().toISOString();
  const store = input.memory ?? memory;
  const routed = routeMessage(input.message, input.context ?? {
    conversation_id: "local",
    user_id: null,
    scope: "PRIVATE",
    current_cross: null,
    current_traits: [],
    last_analysis_id: null,
    knowledge_snapshot: null,
  });
  if (PRIVATE.test(input.message)) {
    return finish(routed.intent, routed.context, now, {
      database: "NOT_REQUIRED",
      web: "NOT_REQUIRED",
      web_query: null,
      records: [],
      prediction_status: "NOT_COMPUTABLE",
      steps: [{ name: "privacy", status: "FAILED" }],
      reply: "Nel messaggio c'è un contatto. La conversazione privata non diventa conoscenza globale.",
      audit: null,
      conflicts: [],
    });
  }
  if (routed.intent === "AUDIT") {
    return finish(routed.intent, routed.context, now, {
      database: "NOT_REQUIRED",
      web: "NOT_REQUIRED",
      web_query: null,
      records: [],
      prediction_status: "NOT_COMPUTABLE",
      steps: [{ name: "audit", status: routed.context.last_analysis_id ? "DONE" : "FAILED" }],
      reply: routed.context.last_analysis_id
        ? `Audit dell'analisi ${routed.context.last_analysis_id}. La probabilità resta nulla. I record web, se presenti, sono PENDING e non sono misure.`
        : "Non c'è ancora un'analisi da auditare.",
      audit: {
        analysis_id: routed.context.last_analysis_id,
        observed: "database rows and literature titles",
        inferred: "nothing merged",
        simulated: "monte carlo only when a resolved estimate exists",
        hypothetical: "web pedigree claims stay unresolved",
      },
      conflicts: [],
    });
  }
  const reader = input.reader ?? null;
  if (!reader) {
    return finish(routed.intent, routed.context, now, {
      database: "SCIENTIFIC_DB_UNAVAILABLE",
      web: "NOT_REQUIRED",
      web_query: null,
      records: [],
      prediction_status: "SCIENTIFIC_DB_UNAVAILABLE",
      steps: [
        { name: "database", status: "UNAVAILABLE" },
        { name: "web", status: "NOT_REQUIRED" },
        { name: "prediction", status: "UNAVAILABLE" },
      ],
      reply: "Il database scientifico non è collegato a questo processo. Non apro la copia locale e non invento il risultato.",
      audit: null,
      conflicts: [],
    });
  }
  if (routed.intent !== "CROSS_ANALYSIS" && routed.intent !== "STRAIN_LOOKUP" && routed.intent !== "HISTORICAL_CROSS_SEARCH" && routed.intent !== "PATTERN_SEARCH" && routed.intent !== "KNOWLEDGE_GAP") {
    return finish(routed.intent, routed.context, now, {
      database: "NOT_REQUIRED",
      web: "NOT_REQUIRED",
      web_query: null,
      records: [],
      prediction_status: "NOT_COMPUTABLE",
      steps: [{ name: "intent", status: "DONE" }],
      reply: "Dimmi una varietà o un incrocio.",
      audit: null,
      conflicts: [],
    });
  }
  const cross = routed.context.current_cross;
  const aId = input.parentIds?.a ?? cross?.a_id ?? null;
  const bId = input.parentIds?.b ?? cross?.b_id ?? null;
  let report: MachineReport | null = null;
  const steps: ConversationAnswer["steps"] = [{ name: "database", status: "DONE" }];
  if (cross) {
    report = predictCross(reader, {
      parentA: cross.a,
      parentB: cross.b,
      parentAId: aId,
      parentBId: bId,
      compounds: ["delta_9_thc", "cbd"],
    }, now);
    steps.push({ name: "prediction", status: "DONE" });
    routed.context.knowledge_snapshot = report.knowledge_snapshot;
  } else {
    steps.push({ name: "prediction", status: "NOT_REQUIRED" });
  }
  const sufficient = report?.data_status === "DATA_PARTIAL" || report?.data_status === "DATA_AVAILABLE";
  let web: WebResult = { status: "NOT_REQUIRED", records: [], query: null };
  const conflicts = [];
  if (!sufficient && input.web) {
    const query = cross ? `${cross.a} ${cross.b} cannabis` : routed.text;
    const cached = store.find(query, Date.parse(now));
    if (cached) {
      web = { status: "REUSED", records: cached.records, query };
      steps.push({ name: "web", status: "NOT_REQUIRED" });
    } else {
      web = await input.web.search(query);
      steps.push({ name: "web", status: web.status === "ACQUIRED" ? "DONE" : "FAILED" });
      if (web.records.length) {
        const session: ResearchSession = {
          research_id: createHash("sha256").update(`${query}|${now}`).digest("hex").slice(0, 16),
          query,
          records: web.records,
          retrieved_at: now,
          conflicts: [],
        };
        store.save(session);
      }
    }
  } else {
    steps.push({ name: "web", status: "NOT_REQUIRED" });
  }
  const predictionStatus = !report
    ? "NOT_COMPUTABLE"
    : report.data_status === "IDENTITY_AMBIGUOUS"
      ? "IDENTITY_AMBIGUOUS"
      : report.traits.some((trait) => trait.status === "ESTIMATE")
        ? "ESTIMATE_NOT_PROBABILITY"
        : "NOT_COMPUTABLE";
  const reply = conversationalReply(routed.intent, report, web, predictionStatus);
  const answer = finish(routed.intent, routed.context, now, {
    database: "READ",
    web: web.status,
    web_query: web.query,
    records: web.records,
    prediction_status: predictionStatus,
    steps,
    reply,
    audit: report
      ? {
          model_id: report.model_id,
          model_version: report.model_version,
          knowledge_snapshot: report.knowledge_snapshot,
          patterns: report.patterns_used.length,
          patterns_applied_to_estimate: report.patterns_used.filter((pattern) => pattern.applied_to_estimate).length,
          historical_same_pair: report.historical_crosses.same_parent_pair_children,
          probability: null,
        }
      : null,
    conflicts,
  });
  routed.context.last_analysis_id = answer.analysis_id;
  answer.context = routed.context;
  return answer;
}

function conversationalReply(
  intent: Intent,
  report: MachineReport | null,
  web: WebResult,
  predictionStatus: ConversationAnswer["prediction_status"],
): string {
  if (!report) return "Ho cercato nel database. Non è un incrocio, quindi non calcolo una progenie.";
  const parents = report.parents.map((parent) => `${parent.query}: ${parent.status}`).join(". ");
  const estimate = report.traits.find((trait) => trait.status === "ESTIMATE");
  const centre = estimate
    ? `Per ${estimate.compound} il centro additivo non calibrato è ${estimate.central_estimate}. Non è una probabilità.`
    : "Non calcolo un numero di progenie.";
  const webLine = web.status === "NOT_REQUIRED"
    ? "Il database bastava: non ho cercato sul web."
    : web.status === "REUSED"
      ? "Ho riusato la ricerca già salvata, senza una nuova chiamata."
      : web.status === "ACQUIRED"
        ? `Ho letto ${web.records.length} titoli. Restano PENDING e non diventano misure.`
        : "La ricerca esterna non ha prodotto titoli. Non ho inventato una fonte.";
  return `${intent}. ${parents}. ${centre} ${webLine}`;
}

function finish(
  intent: Intent,
  context: ConversationContext,
  now: string,
  input: {
    database: ConversationAnswer["database"];
    web: WebResult["status"];
    web_query: string | null;
    records: LiteratureRecord[];
    prediction_status: ConversationAnswer["prediction_status"];
    steps: ConversationAnswer["steps"];
    reply: string;
    audit: Record<string, unknown> | null;
    conflicts: ConversationAnswer["conflicts"];
  },
): ConversationAnswer {
  return {
    analysis_id: createHash("sha256").update(`${context.conversation_id}|${now}|${input.reply}`).digest("hex").slice(0, 16),
    intent,
    context,
    database: input.database,
    web: input.web,
    web_query: input.web_query,
    records_acquired: input.records,
    records_saved_as: input.records.length ? "PENDING_NOT_MEASUREMENT" : "NONE",
    prediction_probability: null,
    prediction_status: input.prediction_status,
    calibration_status: "NOT_CALIBRATED",
    steps: input.steps,
    reply: input.reply,
    audit: input.audit,
    conflicts: input.conflicts,
  };
}

export { conflictFromParents };
