import { createHash } from "node:crypto";
import { assessCross } from "./disciplines.ts";
import { assessAcquisition } from "./acquisition.ts";
import { applySpecification, SPEC_ID } from "./spec.ts";
import {
  ENGINE_VERSION,
  MODEL_ID,
  MODEL_VERSION,
  SCHEMA_VERSION,
  type Claim,
  type Edge,
  type IdentityStatus,
  type KnowledgeSnapshot,
  type ParentRelation,
  type Pattern,
  type Strain,
} from "./knowledge.ts";

export type CrossType =
  | "F1"
  | "F2"
  | "F3_PLUS"
  | "S1"
  | "S2"
  | "S3_PLUS"
  | "BC1"
  | "BC2"
  | "BC3_PLUS"
  | "SSD"
  | "OTHER"
  | "AUTHOR_G_LABEL";

export type AnalyzeInput = {
  parent_a: string;
  parent_b: string;
  cross_type: CrossType;
  author_generation_label?: string | null;
  direction?: "AxB" | "BxA";
  population_size?: number;
  environment?: { temperature_c?: number | null; controlled?: boolean };
  target_traits?: string[];
  seed?: number | null;
  replicates?: number;
  rare_event?: { p: number; n: number; independent: boolean } | null;
  parent_a_id?: string | null;
  parent_b_id?: string | null;
};

const IDENTITY_WEIGHT: Record<IdentityStatus, number> = {
  CONFIRMED_IDENTITY: 0.9,
  HIGH_CONFIDENCE_IDENTITY: 0.75,
  PROBABLE_IDENTITY: 0.55,
  AMBIGUOUS_IDENTITY: 0.35,
  CONFLICTING_IDENTITY: 0.25,
  UNRESOLVED_IDENTITY: 0.15,
  IDENTITY_UNVERIFIED: 0.2,
};

const EDGE_WEIGHT: Record<ParentRelation, number> = {
  known_parent: 0.9,
  probable_parent: 0.7,
  reported_parent: 0.45,
  disputed_parent: 0.2,
  unknown_parent: 0.05,
};

export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/®/g, "")
    .replace(/['’]/g, "")
    .replace(/[#_./]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(the|strain)\s+/, "");
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) row[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cur = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = cur;
    }
  }
  return row[n]!;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export function randBelow(next: () => number, bound: number): number {
  if (bound <= 0) throw new Error("bound must be positive");
  const limit = Math.floor(4294967296 / bound) * bound;
  let x = next();
  while (x >= limit) x = next();
  return x % bound;
}

export function atLeastOne(p: number, n: number, independent: boolean) {
  if (!(p >= 0 && p <= 1) || !Number.isInteger(n) || n < 0) {
    return { status: "INVALID_INPUT" as const };
  }
  if (independent) {
    const point = 1 - (1 - p) ** n;
    return {
      status: "OK" as const,
      assumption: "independence_assumed_by_caller",
      point,
      lower: point,
      upper: point,
    };
  }
  return {
    status: "OK" as const,
    assumption: "dependence_unknown_frechet_bounds",
    point: null,
    lower: Math.max(0, n * p - (n - 1)),
    upper: Math.min(1, n * p),
  };
}

export function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function embed(text: string): number[] {
  const dims = 64;
  const v = new Array<number>(dims).fill(0);
  const tokens = normalizeName(text).split(" ").filter(Boolean);
  const grams = new Set<string>();
  for (const t of tokens) {
    grams.add(`w:${t}`);
    const s = ` ${t} `;
    for (let i = 0; i < s.length - 2; i += 1) grams.add(`c:${s.slice(i, i + 3)}`);
  }
  for (const g of grams) {
    const h = fnv(g);
    v[h % dims] = (v[h % dims] ?? 0) + ((h & 1) === 0 ? 1 : -1);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export type Resolution = {
  match_kind: "EXACT" | "NORMALIZED" | "ALIAS" | "PROBABLE" | "AMBIGUOUS" | "UNRESOLVED";
  auto_merged: false;
  strain: Strain | null;
  candidates: { id: string; name: string; distance: number }[];
  candidate_count: number;
};

export function resolveStrain(query: string, knowledge: KnowledgeSnapshot, preferredId?: string | null): Resolution {
  if (preferredId) {
    const pinned = knowledge.strains.find((strain) => strain.id === preferredId);
    if (pinned) {
      return { match_kind: "EXACT", auto_merged: false, strain: pinned, candidates: [], candidate_count: 1 };
    }
  }
  const raw = query.trim().toLowerCase();
  const norm = normalizeName(query);
  const exact = knowledge.strains
    .filter(
      (strain) =>
        strain.canonical_name.toLowerCase() === raw || strain.aliases.some((alias) => alias.toLowerCase() === raw),
    )
    .sort(preferStrain);
  if (exact.length === 1) {
    return { match_kind: "EXACT", auto_merged: false, strain: exact[0]!, candidates: [], candidate_count: 1 };
  }
  if (exact.length > 1) {
    return ambiguous(exact);
  }
  const normalized = knowledge.strains
    .filter(
      (strain) =>
        normalizeName(strain.canonical_name) === norm || strain.aliases.some((alias) => normalizeName(alias) === norm),
    )
    .sort(preferStrain);
  if (normalized.length === 1) {
    return { match_kind: "NORMALIZED", auto_merged: false, strain: normalized[0]!, candidates: [], candidate_count: 1 };
  }
  if (normalized.length > 1) {
    return ambiguous(normalized);
  }
  const fuzzy: { id: string; name: string; distance: number }[] = [];
  if (norm.length >= 8) {
    const slack = norm.length >= 12 ? 2 : 1;
    for (const strain of knowledge.strains) {
      const name = normalizeName(strain.canonical_name);
      if (Math.abs(name.length - norm.length) > slack) continue;
      const distance = levenshtein(norm, name);
      if (distance > 0 && distance <= slack) fuzzy.push({ id: strain.id, name: labelStrain(strain), distance });
    }
    fuzzy.sort((a, b) => a.distance - b.distance);
  }
  if (fuzzy.length === 1) {
    const strain = knowledge.strains.find((item) => item.id === fuzzy[0]!.id) ?? null;
    return { match_kind: "PROBABLE", auto_merged: false, strain, candidates: fuzzy, candidate_count: 1 };
  }
  if (fuzzy.length > 1) {
    return { match_kind: "AMBIGUOUS", auto_merged: false, strain: null, candidates: fuzzy.slice(0, 8), candidate_count: fuzzy.length };
  }
  return { match_kind: "UNRESOLVED", auto_merged: false, strain: null, candidates: [], candidate_count: 0 };
}

function preferStrain(a: Strain, b: Strain): number {
  const rank = (strain: Strain) => (strain.id.startsWith("ggs-") ? 0 : 2) + (strain.catalog?.parents.length ? 0 : 1);
  return rank(a) - rank(b) || a.canonical_name.localeCompare(b.canonical_name);
}

function labelStrain(strain: Strain): string {
  return strain.breeder ? `${strain.canonical_name} · ${strain.breeder}` : strain.canonical_name;
}

function ambiguous(strains: Strain[]): Resolution {
  return {
    match_kind: "AMBIGUOUS",
    auto_merged: false,
    strain: null,
    candidate_count: strains.length,
    candidates: strains.slice(0, 8).map((strain) => ({ id: strain.id, name: labelStrain(strain), distance: 0 })),
  };
}

export function pedigreeConfidence(strain: Strain | null, edges: Edge[]) {
  if (!strain) {
    return {
      value: null as number | null,
      formula:
        "identity(A) × identity(B) × ancestry_factor. Non è una percentuale genomica. Un parent non risolto rende il valore nullo.",
    };
  }
  const own = edges.filter((e) => e.child_id === strain.id);
  const ancestry = own.length
    ? Math.min(...own.map((e) => EDGE_WEIGHT[e.relationship_type] * e.confidence))
    : 0.35;
  return {
    identity: IDENTITY_WEIGHT[strain.identity_status],
    ancestry,
    formula:
      "identity(parent) × ancestry_factor. ancestry_factor = min(peso_relazione × confidenza_arco) oppure 0.35 se non ci sono archi. Non è una stima di contribuzione genomica.",
  };
}

export function crossPedigreeConfidence(
  a: Strain | null,
  b: Strain | null,
  edges: Edge[],
): { value: number | null; formula: string; notes: string[] } {
  const formula =
    "identity(A) × identity(B) × ancestry_factor. ancestry_factor è il minimo fra i fattori di ancestry dei due parent, o 0.35 se un parent non ha archi. NON è una percentuale genomica.";
  if (!a || !b) {
    return {
      value: null,
      formula,
      notes: ["Almeno un parent non è risolto. Nessuna confidenza numerica viene inventata."],
    };
  }
  const pa = pedigreeConfidence(a, edges);
  const pb = pedigreeConfidence(b, edges);
  const ancestry = Math.min(pa.ancestry ?? 0.35, pb.ancestry ?? 0.35);
  const value = round4((pa.identity ?? 0) * (pb.identity ?? 0) * ancestry);
  const notes = [
    "Gli archi reported_parent restano dichiarazioni, non prove genomiche.",
    "Un individuo visivamente estremo non è automaticamente un buon donatore: qui non c'è una misura di trasmissione.",
  ];
  return { value, formula, notes };
}

export function qualityIndex(strain: Strain, knowledge: KnowledgeSnapshot): {
  formula_id: "gg-quality-v1";
  value: number;
  terms: Record<string, number>;
} {
  const claims = knowledge.claims.filter((c) => c.subject_id === strain.id);
  const traits = knowledge.traits.filter((t) => t.strain_id === strain.id);
  const edges = knowledge.edges.filter((e) => e.child_id === strain.id);
  const measured = traits.filter((t) => t.measurement_type === "measured").length;
  const marketing = claims.filter((c) => c.claim_class === "MARKETING_CLAIM").length;
  const literature = claims.filter((c) => c.evidence_level >= 3).length;
  const completeness =
    (strain.breeder ? 0.2 : 0) +
    (strain.summary ? 0.2 : 0) +
    (claims.length ? 0.3 : 0) +
    (traits.length ? 0.15 : 0) +
    (edges.length ? 0.15 : 0);
  const provenance = claims.some((c) => c.source_id) ? 1 : 0.2;
  const sourceQuality = literature ? 1 : claims.length ? 0.45 : 0.15;
  const replication = 0;
  const measurement = measured ? 1 : 0;
  const contradiction = claims.some((c) => c.contradicts_claim_id) ? 1 : 0;
  const value = round4(
    clamp01(
      completeness * 0.25 +
        provenance * 0.2 +
        sourceQuality * 0.2 +
        replication * 0.15 +
        measurement * 0.1 +
        0.05 -
        contradiction * 0.15 -
        Math.min(0.1, marketing * 0.03),
    ),
  );
  return {
    formula_id: "gg-quality-v1",
    value,
    terms: { completeness, provenance, sourceQuality, replication, measurement, contradiction, marketing },
  };
}

export function patternStatus(input: {
  independent_support_count: number;
  source_count: number;
  lineage_count: number;
  contradiction_count: number;
  manually_validated?: boolean;
}): string {
  if (input.manually_validated) return "VALIDATED";
  if (input.contradiction_count > input.independent_support_count) return "CONTRADICTED";
  if (input.independent_support_count >= 8 && input.lineage_count >= 3 && input.contradiction_count === 0) {
    return "STRONGLY_SUPPORTED";
  }
  if (input.independent_support_count >= 5 && input.lineage_count >= 2 && input.contradiction_count === 0) {
    return "REPLICATED";
  }
  if (input.independent_support_count >= 3 && input.source_count >= 2) return "SUPPORTED";
  return "HYPOTHESIS";
}

export function redactPii(text: string): { text: string; findings: string[] } {
  const findings: string[] = [];
  let out = text;
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  if (email.test(out)) findings.push("email");
  out = out.replace(email, "[redacted-email]");
  const phone = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{3,4}/g;
  const next = out.replace(phone, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8) return m;
    findings.push("phone");
    return "[redacted-phone]";
  });
  return { text: next, findings: [...new Set(findings)] };
}

export function piiBlocksGlobal(text: string): boolean {
  return redactPii(text).findings.length > 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function canonicalCacheMaterial(input: AnalyzeInput, resolvedA: string, resolvedB: string) {
  return {
    parent_a: resolvedA,
    parent_b: resolvedB,
    direction: input.direction ?? "AxB",
    cross_type: input.cross_type,
    author_generation_label: input.author_generation_label ?? null,
    population_size: input.population_size ?? null,
    environment: {
      temperature_c: input.environment?.temperature_c ?? null,
      controlled: Boolean(input.environment?.controlled),
    },
    target_traits: [...(input.target_traits ?? ["pigmentation", "chemotype", "flowering"])].sort(),
    seed: input.seed ?? null,
    replicates: input.replicates ?? 4000,
    rare_event: input.rare_event ?? null,
    model: MODEL_VERSION,
    spec: SPEC_ID,
    snapshot: "filled-by-caller",
    schema: SCHEMA_VERSION,
  };
}

export function cacheKey(material: unknown): string {
  return createHash("sha256").update(stable(material)).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

export function searchStrains(query: string, knowledge: KnowledgeSnapshot) {
  const norm = normalizeName(query);
  const raw = query.trim().toLowerCase();
  if (norm.length < 2) return [];
  const hits: { strain: Strain; match_kind: string; rank: number }[] = [];
  for (const strain of knowledge.strains) {
    const fields = [strain.canonical_name, ...strain.aliases];
    const norms = fields.map((field) => normalizeName(field));
    const exact = fields.some((field) => field.toLowerCase() === raw);
    const normalized = norms.some((field) => field === norm);
    if (exact || normalized) {
      hits.push({ strain, match_kind: exact ? "EXACT" : "NORMALIZED", rank: exact ? 0 : 1 });
      continue;
    }
    if (norm.length >= 3 && norms.some((field) => field.includes(norm))) {
      hits.push({ strain, match_kind: "NORMALIZED", rank: 2 });
    }
  }
  hits.sort(
    (a, b) => a.rank - b.rank || preferStrain(a.strain, b.strain),
  );
  const seen = new Set<string>();
  const out: {
    id: string;
    canonical_name: string;
    identity_status: Strain["identity_status"];
    record_role: string;
    match_kind: string;
    semantic: number;
    auto_merged: false;
  }[] = [];
  for (const hit of hits) {
    if (seen.has(hit.strain.id)) continue;
    seen.add(hit.strain.id);
    out.push({
      id: hit.strain.id,
      canonical_name: hit.strain.canonical_name,
      identity_status: hit.strain.identity_status,
      record_role: hit.strain.record_role,
      match_kind: hit.match_kind,
      semantic: 0,
      auto_merged: false,
    });
    if (out.length >= 20) break;
  }
  return out;
}

function prefilterStrains(strains: Strain[], query: string): Strain[] {
  if (strains.length <= 800) return strains;
  const norm = normalizeName(query);
  const tokens = norm.split(" ").filter((token) => token.length >= 3);
  const curated = strains.filter((strain) => strain.id.startsWith("ggs-"));
  const hit = strains
    .filter((strain) => {
      const name = normalizeName(`${strain.canonical_name} ${strain.aliases.join(" ")}`);
      return (norm.length >= 3 && name.includes(norm)) || tokens.some((token) => name.includes(token));
    })
    .slice(0, 400);
  const seen = new Set<string>();
  const out: Strain[] = [];
  for (const strain of [...hit, ...curated]) {
    if (seen.has(strain.id)) continue;
    seen.add(strain.id);
    out.push(strain);
  }
  return out;
}

export function semanticRetrieve(
  query: string,
  knowledge: KnowledgeSnapshot,
  options?: { limit?: number; kind?: string; subject_id?: string },
) {
  const qv = embed(query);
  const kind = options?.kind?.toUpperCase();
  const subject = options?.subject_id;
  const docs: {
    kind: "STRAIN" | "PATTERN" | "CLAIM" | "SOURCE";
    id: string;
    title: string;
    text: string;
    subject_id: string | null;
  }[] = [
    ...prefilterStrains(knowledge.strains, query).map((strain) => ({
      kind: "STRAIN" as const,
      id: strain.id,
      title: strain.canonical_name,
      text: `${strain.canonical_name} ${strain.aliases.join(" ")} ${strain.summary}`,
      subject_id: strain.id,
    })),
    ...knowledge.patterns.map((pattern) => ({
      kind: "PATTERN" as const,
      id: pattern.id,
      title: pattern.validation_status,
      text: `${pattern.hypothesis} ${pattern.native_context} ${pattern.transferability}`,
      subject_id: null,
    })),
    ...knowledge.claims.map((claim) => ({
      kind: "CLAIM" as const,
      id: claim.id,
      title: claim.claim_class,
      text: claim.claim_text,
      subject_id: claim.subject_id,
    })),
    ...knowledge.sources.map((source) => ({
      kind: "SOURCE" as const,
      id: source.id,
      title: source.name,
      text: `${source.name} ${source.publisher} ${source.source_type}`,
      subject_id: null,
    })),
  ];
  const limit = Math.max(1, Math.min(30, options?.limit ?? 12));
  return docs
    .filter((doc) => (!kind || doc.kind === kind) && (!subject || doc.subject_id === subject))
    .map((doc) => ({
      ...doc,
      score: Math.round(cosine(qv, embed(doc.text)) * 10000) / 10000,
    }))
    .filter((doc) => doc.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function analyze(
  input: AnalyzeInput,
  knowledge: KnowledgeSnapshot,
  options?: {
    knowledgeSnapshot?: string;
    foundation?: {
      a: {
        source_rows: number;
        independent_samples: number;
        numeric_measurements: number;
        qualified_measurements: number;
        source_reported_zeros: number;
        reported_parents: number;
        genomic_records: number;
        declared_types?: number;
        autoflower_records?: number;
        exact_identity?: number;
        chemistry?: { klass: string; numeric_measurements: number; qualified_measurements: number; source_reported_zeros: number; independent_samples: number }[];
        declared_flowering_records?: number;
        declared_flowering_distinct_texts?: number;
      } | null;
      b: {
        source_rows: number;
        independent_samples: number;
        numeric_measurements: number;
        qualified_measurements: number;
        source_reported_zeros: number;
        reported_parents: number;
        genomic_records: number;
        declared_types?: number;
        autoflower_records?: number;
        exact_identity?: number;
        chemistry?: { klass: string; numeric_measurements: number; qualified_measurements: number; source_reported_zeros: number; independent_samples: number }[];
        declared_flowering_records?: number;
        declared_flowering_distinct_texts?: number;
      } | null;
    };
  },
) {
  const targets = input.target_traits?.length
    ? input.target_traits
    : ["pigmentation", "chemotype", "flowering"];
  const replicates = clampInt(input.replicates ?? 4000, 200, 20000);
  const aRes = resolveStrain(input.parent_a, knowledge, input.parent_a_id);
  const bRes = resolveStrain(input.parent_b, knowledge, input.parent_b_id);
  const a = aRes.strain;
  const b = bRes.strain;
  const pedigree = crossPedigreeConfidence(a, b, knowledge.edges);
  const derivedSeed =
    input.seed ??
    (fnv(`${normalizeName(input.parent_a)}|${normalizeName(input.parent_b)}|${input.cross_type}`) % 1_000_000_000);
  const material = canonicalCacheMaterial(
    { ...input, seed: derivedSeed, replicates },
    a?.id ?? `unresolved:${normalizeName(input.parent_a)}`,
    b?.id ?? `unresolved:${normalizeName(input.parent_b)}`,
  );
  material.snapshot = options?.knowledgeSnapshot ?? knowledge.snapshot_id;
  const key = cacheKey(material);
  const outOfDistribution = !a || !b || aRes.match_kind === "AMBIGUOUS" || bRes.match_kind === "AMBIGUOUS";
  const parentClaims = knowledge.claims.filter(
    (c) => c.subject_id === a?.id || c.subject_id === b?.id,
  );
  const parentTraits = knowledge.traits.filter((t) => t.strain_id === a?.id || t.strain_id === b?.id);
  const predictions = targets.map((trait) => predictTrait(trait, a, b, parentTraits, knowledge, pedigree.value));
  const anyDistribution = predictions.some((p) => p.status === "MODEL_DISTRIBUTION");
  const status = outOfDistribution
    ? "OUT_OF_DISTRIBUTION"
    : anyDistribution
      ? "OK"
      : "INSUFFICIENT_EVIDENCE";
  const evidence = evidenceUsed(knowledge, parentClaims, targets);
  const patterns = knowledge.patterns.map(presentPattern);
  const rare = input.rare_event
    ? atLeastOne(input.rare_event.p, input.rare_event.n, input.rare_event.independent)
    : null;
  const assessment = assessCross(a, b, knowledge, input.cross_type, {
    distribution_emitted: anyDistribution,
    foundation: options?.foundation,
  });
  const specification = applySpecification({
    status,
    crossType: input.cross_type,
    authorLabel: input.author_generation_label ?? null,
    a,
    b,
    knowledge,
    distributionEmitted: anyDistribution,
    pedigreeValue: pedigree.value,
  });
  const acquisition = assessAcquisition(a, b, knowledge, anyDistribution);
  const report = {
    report_id: `gg-report-${key.slice(0, 24)}`,
    status,
    cross_id: null as string | null,
    model_id: MODEL_ID,
    model_version: MODEL_VERSION,
    engine_version: ENGINE_VERSION,
    knowledge_snapshot: options?.knowledgeSnapshot ?? knowledge.snapshot_id,
    snapshot_lineage: {
      unified: options?.knowledgeSnapshot ?? knowledge.snapshot_id,
      curated: knowledge.snapshot_id,
    },
    schema_version: SCHEMA_VERSION,
    runtime: "javascript" as const,
    parents: [
      { role: "A", query: input.parent_a, resolution: publicResolution(aRes) },
      { role: "B", query: input.parent_b, resolution: publicResolution(bRes) },
    ],
    pedigree_confidence: pedigree,
    target_traits: targets,
    assumptions: assumptions(input),
    population_parameters: {
      size: input.population_size ?? null,
      cross_type: input.cross_type,
      author_generation_label: input.author_generation_label ?? null,
      direction: input.direction ?? "AxB",
    },
    methodology: [
      "Risoluzione di identità per match esatto, normalizzato o fuzzy. Le identità ambigue non vengono fuse.",
      "Il parentage incerto aumenta l'incertezza e non diventa una percentuale genomica.",
      "Nessuna percentuale di cannabinoidi, terpeni o flavonoidi viene stimata in assenza di una misura.",
      "La pigmentazione è trattata come fenotipo multidimensionale, non come gene singolo 'black'.",
      "Ogni disciplina legge solo i record archiviati. Se il record manca, la classe è UNKNOWN.",
      anyDistribution
        ? `Simulazione intera riproducibile mulberry32, ${replicates} repliche, seed ${derivedSeed}.`
        : "La simulazione Monte Carlo non è stata eseguita: manca un tratto ordinale misurato su entrambi i parent.",
    ],
    predictions,
    chemotype: chemotypeBlock(),
    pigmentation: pigmentationBlock(input.environment?.temperature_c ?? null),
    stability: {
      generation_implies_stability: false,
      author_label: input.author_generation_label ?? null,
      convention:
        "F, S, BC e SSD sono classi genealogiche distinte. Un'etichetta G dell'autore non è uno standard filiale e non significa stabilità.",
      observed_stability_evidence: "Nessun progeny test, nessuna ripetibilità e nessuna replicazione ambientale sono archiviati per questo incrocio.",
    },
    uncertainty: {
      dominant_sources: dominantSources(aRes, bRes, parentTraits, pedigree.value),
      interval_level: "predictive_under_stated_assumptions",
    },
    sensitivity: [
      {
        factor: "identità dei parent",
        effect: "Se un nome è ambiguo o non risolto, l'intervallo non viene stretto.",
      },
      {
        factor: "pedigree riportato e non noto",
        effect: "Un arco reported_parent abbassa ancestry_factor rispetto a known_parent.",
      },
      {
        factor: "assenza di misure",
        effect: "Senza laboratorio il motore restituisce INSUFFICIENT_EVIDENCE invece di una percentuale.",
      },
      {
        factor: "ambiente",
        effect:
          "La temperatura può contare per gli antociani in un contesto studiato (Kim 2025) ma quel risultato non è trasferito in automatico.",
      },
      {
        factor: "numerosità",
        effect:
          input.population_size
            ? "La dimensione di popolazione non diventa una probabilità di recupero se la frequenza allelica è sconosciuta."
            : "Popolazione non indicata.",
      },
    ],
    evidence,
    patterns,
    lenses: assessment.lenses,
    lineage: assessment.lineage,
    epistemic: assessment.epistemic,
    sections: assessment.sections,
    knowledge_graph: assessment.knowledge_graph,
    pattern_scan: assessment.pattern_scan,
    specification,
    acquisition,
    validation_status: "UNVALIDATED_PREDICTION",
    cache_status: "MISS" as "MISS" | "EXACT_HIT",
    limitations: limitations(status, a, b),
    rare_event: rare,
    reproducibility: { seed: derivedSeed, replicates, prng: "mulberry32", cache_key: key },
    visualization: {
      allowed: false,
      reason: "Nessuna immagine è generata come prova di genotipo.",
    },
    generated_at: new Date().toISOString(),
  };
  const human_report = humanReport(report);
  return { report: { ...report, human_report }, cache_key: key };
}

function publicResolution(r: Resolution) {
  return {
    match_kind: r.match_kind,
    auto_merged: false,
    strain_id: r.strain?.id ?? null,
    canonical_name: r.strain?.canonical_name ?? null,
    identity_status: r.strain?.identity_status ?? "UNRESOLVED_IDENTITY",
    record_role: r.strain?.record_role ?? null,
    candidates: r.candidates,
    candidate_count: r.candidate_count,
  };
}

function assumptions(input: AnalyzeInput) {
  return [
    {
      id: "no-percentage-invention",
      class: "MODEL_ASSUMPTION" as const,
      text: "Le percentuali chimiche restano nulle finché non esiste una misura etichettata measured.",
    },
    {
      id: "g-label",
      class: "MODEL_ASSUMPTION" as const,
      text: "Le etichette G non sono convertite in F né in stabilità.",
    },
    {
      id: "environment",
      class: "MODEL_ASSUMPTION" as const,
      text: input.environment?.controlled
        ? "L'utente dichiara un ambiente controllato. Questo non sostituisce un disegno sperimentale archiviato."
        : "Ambiente non controllato o non descritto. Il fenotipo non è trattato come puramente genetico.",
    },
  ];
}

function predictTrait(
  trait: string,
  a: Strain | null,
  b: Strain | null,
  traits: KnowledgeSnapshot["traits"],
  knowledge: KnowledgeSnapshot,
  pedigree: number | null,
) {
  if (trait === "chemotype") {
    return {
      trait,
      status: "INSUFFICIENT_EVIDENCE",
      distribution: null,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      reason:
        "Non ci sono concentrazioni misurate per questi parent. Il modello B di de Meijer 2003 non è applicato: manca la zigosi documentata e il contesto è quello di inbred dello studio, non di questi nomi.",
      classical_model_applied: false,
    };
  }
  if (trait === "pigmentation") {
    return {
      trait,
      status: "INSUFFICIENT_EVIDENCE",
      distribution: null,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      reason:
        "Nessun punteggio ordinale di pigmentazione è archiviato per entrambi i parent. Un aspetto 'quasi nero' resta un claim visivo e non entra in una distribuzione.",
      single_locus_black: false,
      pedigree_confidence: pedigree,
    };
  }
  const related = traits.filter((t) => t.trait_key.includes(trait) || trait.includes(t.trait_key));
  if (related.length < 2 || !a || !b) {
    return {
      trait,
      status: "INSUFFICIENT_EVIDENCE",
      distribution: null,
      prediction_probability: null,
      prediction_status: "NOT_COMPUTABLE" as const,
      reason: "Manca un valore confrontabile sui due parent. Il range di un solo genitore non diventa la distribuzione della progenie.",
      parent_records: related.map((t) => ({
        strain_id: t.strain_id,
        trait_key: t.trait_key,
        value: t.value,
        measurement_type: t.measurement_type,
        source_id: t.source_id,
      })),
    };
  }
  return {
    trait,
    status: "INSUFFICIENT_EVIDENCE",
    distribution: null,
    prediction_probability: null,
    prediction_status: "NOT_COMPUTABLE" as const,
    reason: "I valori presenti non sono una coppia di ordinali misurati. Nessuna media viene calcolata.",
    parent_records: related,
    unused_knowledge_claims: knowledge.claims.length,
  };
}

function chemotypeBlock() {
  return {
    percentages: null,
    percentage_status: "INSUFFICIENT_EVIDENCE",
    reason:
      "Nessuna misurazione di laboratorio è archiviata per questi parent. Percentuali di cannabinoidi, terpeni e flavonoidi non vengono stimate.",
    classical_b_locus: {
      applied: false,
      source_id: "src-demeijer-2003",
      reason:
        "de Meijer et al. 2003 descrivono un locus B codominante in inbred CBD puri × THC puri. Senza zigosi documentata il rapporto 1:2:1 non è trasferito.",
    },
    structural_context: {
      source_id: "src-laverty-2019",
      text: "THCAS e CBDAS possono stare in una regione a bassissima ricombinazione. Libera ricombinazione non è assunta.",
    },
  };
}

function pigmentationBlock(temperature: number | null) {
  return {
    single_locus_black: false,
    statement:
      "La pigmentazione non è un gene 'black'. Dimensioni separate: intensità, classe di pigmento, tessuto, distribuzione, dipendenza dalla maturità, temperatura, luce.",
    temperature_input_c: temperature,
    kim_2025: {
      transferred: false,
      source_id: "src-kim-2025",
      note: "In una popolazione inbred day-neutral, gli antociani hanno avuto un picco a 8°C e 15°C costanti. Non è una legge per ogni fiore scuro.",
    },
  };
}

function evidenceUsed(
  knowledge: KnowledgeSnapshot,
  parentClaims: Claim[],
  targets: string[],
): { role: string; source_id: string; title: string; why: string }[] {
  const ids = new Set<string>(parentClaims.map((c) => c.source_id));
  if (targets.includes("chemotype")) {
    ids.add("src-demeijer-2003");
    ids.add("src-laverty-2019");
  }
  if (targets.includes("pigmentation")) ids.add("src-kim-2025");
  return [...ids].map((id) => {
    const source = knowledge.sources.find((s) => s.id === id);
    const background = !parentClaims.some((c) => c.source_id === id);
    return {
      role: background ? "background_literature" : "parent_claim",
      source_id: id,
      title: source?.name ?? id,
      why: background
        ? "Contesto scientifico. Non è una misura di questo incrocio."
        : "Claim collegato a un parent risolto, con la classe originale conservata.",
    };
  });
}

function presentPattern(p: Pattern) {
  return {
    pattern_id: p.id,
    pattern_type: p.pattern_type,
    hypothesis: p.hypothesis,
    validation_status: p.validation_status,
    transferability: p.transferability,
    native_context: p.native_context,
    applied_to_this_cross: false,
    reason: "Un pattern resta nel suo contesto nativo finché la trasferibilità non è sostenuta.",
  };
}

function dominantSources(
  a: Resolution,
  b: Resolution,
  traits: KnowledgeSnapshot["traits"],
  pedigree: number | null,
): string[] {
  const out: string[] = [];
  if (!a.strain || !b.strain) out.push("identità non risolta");
  if (a.match_kind === "AMBIGUOUS" || b.match_kind === "AMBIGUOUS") out.push("identità ambigua");
  if (pedigree !== null && pedigree < 0.3) out.push("pedigree poco documentato");
  if (!traits.some((t) => t.measurement_type === "measured")) out.push("assenza di misure di laboratorio");
  if (!out.length) out.push("copertura parziale del snapshot");
  return out;
}

function limitations(status: string, a: Strain | null, b: Strain | null): string[] {
  return [
    status === "INSUFFICIENT_EVIDENCE" || status === "OUT_OF_DISTRIBUTION"
      ? "Esito scientifico valido: l'evidenza non basta per una distribuzione di fenotipo."
      : "La distribuzione, se presente, è una predizione di modello, non una frequenza osservata.",
    !a || !b ? "Un nome non risolto non riceve un pedigree inventato." : "I nomi risolti mantengono il loro identity_status.",
    "I casi di regressione G&G non sono una classifica e non sono verità di mercato.",
    "Più righe copiate dalla stessa fonte non contano come repliche indipendenti.",
  ];
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function humanReport(report: ReturnType<typeof analyze>["report"] | Record<string, unknown>): string {
  const r = report as ReturnType<typeof analyze>["report"];
  const parents = r.parents
    .map((p) => {
      const name = p.resolution.canonical_name ?? "non risolto";
      return `${p.role}: «${p.query}» → ${name} (${p.resolution.match_kind}, ${p.resolution.identity_status})`;
    })
    .join("\n");
  const pred = r.predictions
    .map((p) => `- ${p.trait}: ${p.status}. ${p.reason}`)
    .join("\n");
  const ev = r.evidence.map((e) => `- ${e.title} [${e.role}] ${e.why}`).join("\n");
  return [
    `Stato: ${r.status}. L'incertezza viene prima del numero.`,
    `Modello ${r.model_version}, snapshot ${r.knowledge_snapshot}, schema ${r.schema_version}.`,
    "Parent",
    parents,
    `Confidenza di pedigree: ${r.pedigree_confidence.value === null ? "non calcolata" : r.pedigree_confidence.value}. ${r.pedigree_confidence.formula}`,
    "Predizioni",
    pred,
    `Chemica: ${r.chemotype.percentage_status}. ${r.chemotype.reason}`,
    `Pigmentazione: gene singolo black = ${r.pigmentation.single_locus_black}. ${r.pigmentation.statement}`,
    `Stabilità: il tipo ${r.population_parameters.cross_type} non implica stabilità. ${r.stability.observed_stability_evidence}`,
    r.sections
      ? `Sezioni: osservato ${r.sections.OBSERVED.length}, inferenza supportata ${r.sections.SUPPORTED_INFERENCE.length}, predizione di modello ${r.sections.MODEL_PREDICTION.length}, incertezza ${r.sections.UNCERTAINTY.length}, ignoto ${r.sections.UNKNOWN.map((item) => item.discipline).join(", ")}.`
      : "",
    r.specification
      ? `Specifica ${r.specification.spec}: la probabilità di predizione non c'è (${r.specification.model.prediction_status}). La confidenza di evidenza (${r.specification.model.evidence_confidence}) non è una probabilità biologica. L'assenza di un metabolita non è né zero né presenza.`
      : "",
    r.acquisition?.gaps?.length
      ? `Buco di conoscenza: ${r.acquisition.gaps
          .filter((gap) => gap.claim_status === "UNKNOWN")
          .map((gap) => `${gap.subject} ignoto, manca ${gap.missing[0] ?? "evidenza"}`)
          .join("; ")}.`
      : "",
    "Evidenze usate",
    ev,
    "Cosa cambierebbe il risultato: identità dei parent, una misura di laboratorio, un progeny test, o un ambiente descritto.",
    `Cache ${r.cache_status}. Seed ${r.reproducibility.seed}, repliche ${r.reproducibility.replicates}, PRNG ${r.reproducibility.prng}.`,
  ].join("\n\n");
}

export function compareOutcome(
  report: { predictions: { trait: string; status: string }[] },
  observation: { trait: string; ordinal: number | null; note: string },
) {
  const block = report.predictions.find((p) => p.trait === observation.trait);
  const redacted = redactPii(observation.note);
  return {
    prediction_mutated: false,
    trait: observation.trait,
    prediction_status: block?.status ?? "ABSENT",
    observation_ordinal: observation.ordinal,
    interval_covered: null,
    absolute_error: null,
    interpretation:
      block?.status === "INSUFFICIENT_EVIDENCE" || !block
        ? "Non c'è una distribuzione da calibrare. L'osservazione resta un dato, non trasforma la predizione storica in un fatto."
        : "Confronto registrato senza riscrivere la predizione.",
    note_findings: redacted.findings,
    note_redacted: redacted.text,
  };
}

export function coverage(knowledge: KnowledgeSnapshot) {
  const measured = knowledge.traits.filter((t) => t.measurement_type === "measured").length;
  return {
    strains: knowledge.strains.length,
    literature_anchored: knowledge.strains.filter((s) => s.record_role === "literature_anchored").length,
    name_only: knowledge.strains.filter((s) => s.record_role === "public_name_only").length,
    pedigree_edges: knowledge.edges.length,
    claims: knowledge.claims.length,
    laboratory_measurements: measured,
    genetic_associations: knowledge.genetics.length,
    patterns: knowledge.patterns.length,
    sources: knowledge.sources.length,
    chemotype_coverage: measured ? "partial" : "none",
    pedigree_coverage: knowledge.edges.length ? "partial" : "none",
    genomic_coverage: "locus_literature_not_cultivar_genotypes",
  };
}
