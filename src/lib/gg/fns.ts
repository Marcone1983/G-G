import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { ReportShape } from "@/components/gg/report-view";

type CrossRequest = {
  parent_a: string;
  parent_b: string;
  cross_type: string;
  author_generation_label?: string | null;
  population_size?: number;
  environment?: { temperature_c: number | null; controlled: boolean };
  target_traits?: string[];
};

function toReport(value: unknown): ReportShape {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ped = obj(r.pedigree_confidence);
  const chem = obj(r.chemotype);
  const pig = obj(r.pigmentation);
  const stab = obj(r.stability);
  const rep = obj(r.reproducibility);
  const evidence = Array.isArray(r.evidence) ? r.evidence : [];
  return {
    status: String(r.status ?? ""),
    model_version: String(r.model_version ?? ""),
    knowledge_snapshot: String(r.knowledge_snapshot ?? ""),
    cache_status: String(r.cache_status ?? ""),
    human_report: String(r.human_report ?? ""),
    pedigree_confidence: {
      value: typeof ped.value === "number" ? ped.value : null,
      formula: String(ped.formula ?? ""),
    },
    chemotype: {
      percentage_status: String(chem.percentage_status ?? ""),
      reason: String(chem.reason ?? ""),
    },
    pigmentation: {
      single_locus_black: pig.single_locus_black === true,
      statement: String(pig.statement ?? ""),
    },
    stability: {
      generation_implies_stability: stab.generation_implies_stability === true,
      observed_stability_evidence: String(stab.observed_stability_evidence ?? ""),
    },
    limitations: Array.isArray(r.limitations) ? r.limitations.map(String) : [],
    evidence: evidence.map((item) => {
      const e = obj(item);
      return { title: String(e.title ?? ""), role: String(e.role ?? ""), why: String(e.why ?? "") };
    }),
    sections: sectionsOf(r.sections),
    reproducibility: {
      seed: typeof rep.seed === "number" ? rep.seed : 0,
      replicates: typeof rep.replicates === "number" ? rep.replicates : 0,
      prng: String(rep.prng ?? ""),
    },
  };
}

function sectionsOf(value: unknown): { heading: string; lines: string[] }[] {
  const source = obj(value);
  const headings: [string, string][] = [
    ["OBSERVED", "Osservato"],
    ["SUPPORTED_INFERENCE", "Inferenza supportata"],
    ["MODEL_PREDICTION", "Predizione di modello"],
    ["UNCERTAINTY", "Incertezza"],
    ["UNKNOWN", "Ignoto"],
  ];
  return headings.map(([key, heading]) => ({
    heading,
    lines: (Array.isArray(source[key]) ? source[key] : []).map((item) => {
      const entry = obj(item);
      const discipline = String(entry.discipline ?? "");
      const epistemic = String(entry.epistemic ?? "");
      const statement = String(entry.statement ?? "");
      return `${discipline} [${epistemic}]: ${statement}`;
    }),
  }));
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const askBreeding = createServerFn({ method: "POST" })
  .validator((data: { message: string; parent_a_id?: string | null; parent_b_id?: string | null }) => ({
    message: data.message.trim(),
    parent_a_id: data.parent_a_id ?? null,
    parent_b_id: data.parent_b_id ?? null,
  }))
  .handler(async ({ data }) => {
    const { breedingChat } = await import("./services.server.ts");
    const result = await breedingChat(data.message, data);
    return {
      intent: result.intent,
      reply: result.reply,
      cards: result.cards,
      report: result.report ? toReport(result.report) : null,
    };
  });

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const { dashboard } = await import("./services.server.ts");
  const user = await getSessionUser();
  return dashboard(user?.id ?? null);
});

export const getKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const { knowledgeStatus } = await import("./services.server.ts");
  return knowledgeStatus();
});

export const getEvidence = createServerFn({ method: "GET" }).handler(async () => {
  const { listEvidence } = await import("./services.server.ts");
  return listEvidence();
});

export const getPatterns = createServerFn({ method: "GET" }).handler(async () => {
  const { listPatterns } = await import("./services.server.ts");
  return listPatterns();
});

export const searchCultivars = createServerFn({ method: "POST" })
  .validator((q: string) => q.trim())
  .handler(async ({ data }) => {
    const { strainSearch } = await import("./services.server.ts");
    return strainSearch(data);
  });

export const getCultivar = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const { strainDetail } = await import("./services.server.ts");
    const detail = await strainDetail(data);
    if (!detail) return null;
    return {
      strain: {
        identity_status: detail.strain.identity_status,
        canonical_name: detail.strain.canonical_name,
        summary: detail.strain.summary,
        breeder: detail.strain.breeder,
      },
      quality: { formula_id: detail.quality.formula_id, value: detail.quality.value },
      claims: detail.claims.map((claim) => ({
        id: claim.id,
        claim_class: claim.claim_class,
        evidence_level: claim.evidence_level,
        measurement_kind: claim.measurement_kind,
        claim_text: claim.claim_text,
      })),
    };
  });

export const getCultivarPedigree = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const { strainPedigree } = await import("./services.server.ts");
    const pedigree = await strainPedigree(data);
    if (!pedigree) return null;
    return {
      strain_id: pedigree.strain_id,
      canonical_name: pedigree.canonical_name,
      edges: pedigree.edges.map((edge) => ({
        id: edge.id,
        child_name: edge.child_name,
        parent_name: edge.parent_name,
        relationship_type: edge.relationship_type,
        note: edge.note,
        note_on_genomic_percentage: edge.note_on_genomic_percentage,
      })),
    };
  });

export const analyzePublic = createServerFn({ method: "POST" })
  .validator((data: CrossRequest) => data)
  .handler(async ({ data }) => {
    const { parseAnalyze, runCross } = await import("./services.server.ts");
    const result = await runCross(parseAnalyze(data), null, false);
    return {
      saved: result.saved,
      cross_id: result.cross_id,
      prediction_id: result.prediction_id,
      report: toReport(result.report),
    };
  });

export const saveCross = createServerFn({ method: "POST" })
  .validator((data: CrossRequest) => data)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { parseAnalyze, runCross } = await import("./services.server.ts");
    const result = await runCross(parseAnalyze(data), context.userId, true);
    return {
      saved: result.saved,
      cross_id: result.cross_id,
      prediction_id: result.prediction_id,
      report: toReport(result.report),
    };
  });

export const myPredictions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listPredictions } = await import("./services.server.ts");
    return listPredictions(context.userId);
  });

export const myPrediction = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { getPrediction } = await import("./services.server.ts");
    const found = await getPrediction(data, context.userId);
    return found ? toReport(found) : null;
  });

export const submitObservation = createServerFn({ method: "POST" })
  .validator((data: { prediction_id?: string; trait: string; ordinal?: number | null; note?: string }) => data)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { addObservation } = await import("./services.server.ts");
    const result = await addObservation(context.userId, data);
    if ("error" in result) return { error: result.error, id: null };
    return { error: null, id: result.id };
  });

export const wipePrivate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { deletePrivate } = await import("./services.server.ts");
    return deletePrivate(context.userId);
  });

export const downloadPrivate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { exportAccount } = await import("./services.server.ts");
    return { body: JSON.stringify(await exportAccount(context.userId)) };
  });

export const becomeAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { claimAdmin } = await import("./services.server.ts");
    return claimAdmin(context.userId);
  });
