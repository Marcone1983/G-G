/**
 * Database first. Grok only when the name is absent.
 * What comes back is GROK_REPORTED, never a laboratory measurement.
 */
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { storeReady, UNIFIED_SNAPSHOT } from "./brain.ts";
import { normalizeName } from "./engine.ts";

const dbPath = path.join(process.cwd(), "data/gg-foundation.sqlite");

export type GrokCard = {
  known: boolean;
  display_name: string;
  aliases: string[];
  breeder: string | null;
  reported_parents: string[];
  declared_type: string | null;
  declared_flowering: string | null;
  summary: string;
  uncertainty: string;
  cross_documented: boolean;
};

export type AcquireResult = {
  origin: "DATABASE" | "ACQUIRED" | "GROK_UNAVAILABLE" | "GROK_FAILED" | "GROK_BLOCKED" | "IGNORED" | "INSUFFICIENT" | "RESEARCH_IN_PROGRESS" | "RESEARCH_MEMORY";
  grok_called: boolean;
  name_norm: string;
};

export type Ask = (query: string) => Promise<GrokCard | null>;

export function scrubReportedText(value: string): string {
  return value
    .replace(/\d+(?:[.,]\d+)?\s*%/g, "")
    .replace(/\b(?:thc|cbd|cbg|cbn)\s*[:=]?\s*\d+(?:[.,]\d+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function cardFromModel(raw: unknown, fallbackName: string): GrokCard {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? scrubReportedText(value) : "");
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === "string")
      .map((item) => scrubReportedText(item))
      .filter((item) => item.length > 1)
      .slice(0, 8);
  const known = row.known === true;
  return {
    known,
    display_name: text(row.display_name) || fallbackName,
    aliases: list(row.aliases),
    breeder: text(row.breeder) || null,
    reported_parents: known ? list(row.reported_parents) : [],
    declared_type: text(row.declared_type) || null,
    declared_flowering: text(row.declared_flowering) || null,
    summary: text(row.summary) || (known ? "" : "Il modello non ha confermato questo nome."),
    uncertainty: text(row.uncertainty) || (known ? "Scheda riportata dal modello, non verificata in laboratorio." : "Nome non confermato."),
    cross_documented: known && row.cross_documented === true,
  };
}

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    create table if not exists acquired_entities (
      id integer primary key,
      entity_key text not null unique,
      display_name text not null,
      name_norm text not null,
      breeder text,
      identity_status text not null,
      homonym_status text,
      entity_class text not null,
      summary text not null,
      uncertainty text not null,
      source_id text not null,
      model text not null,
      snapshot_id text not null,
      created_at text not null,
      content_hash text not null
    );
    create table if not exists acquired_aliases (
      id integer primary key,
      entity_id integer not null,
      alias text not null,
      alias_norm text not null
    );
    create table if not exists acquired_claims (
      id integer primary key,
      entity_id integer not null,
      field text not null,
      claim_text text not null,
      claim_status text not null
    );
    create table if not exists acquired_pedigree (
      id integer primary key,
      entity_id integer not null,
      parent_text text not null,
      relationship_type text not null,
      identity_status text not null
    );
    create index if not exists idx_acquired_norm on acquired_entities(name_norm);
  `);
  return db;
}

export function persistCard(query: string, card: GrokCard, model: string): number {
  const norm = normalizeName(query);
  const db = open();
  try {
    const existing = db.prepare("select id from acquired_entities where entity_key = ?").get(`grok|${norm}`) as { id: number } | undefined;
    if (existing) return existing.id;
    const now = new Date().toISOString();
    const hash = createHash("sha256").update(JSON.stringify(card)).digest("hex");
    const inserted = db
      .prepare(
        `insert into acquired_entities
         (entity_key, display_name, name_norm, breeder, identity_status, homonym_status, entity_class, summary, uncertainty, source_id, model, snapshot_id, created_at, content_hash)
         values (?, ?, ?, ?, 'UNRESOLVED', null, 'GROK_CANDIDATE', ?, ?, 'src-grok-lookup', ?, ?, ?, ?)`,
      )
      .run(
        `grok|${norm}`,
        card.display_name,
        norm,
        card.breeder,
        card.summary || card.uncertainty,
        card.uncertainty,
        model,
        UNIFIED_SNAPSHOT,
        now,
        hash,
      );
    const id = Number(inserted.lastInsertRowid);
    for (const alias of card.aliases) {
      db.prepare("insert into acquired_aliases (entity_id, alias, alias_norm) values (?, ?, ?)").run(id, alias, normalizeName(alias));
    }
    const claim = db.prepare("insert into acquired_claims (entity_id, field, claim_text, claim_status) values (?, ?, ?, 'GROK_REPORTED')");
    claim.run(id, "model_summary", card.summary || card.uncertainty);
    if (card.declared_type) claim.run(id, "declared_type", card.declared_type);
    if (card.declared_flowering) claim.run(id, "declared_flowering", card.declared_flowering);
    claim.run(id, "epistemic", "GROK_REPORTED. Non è una misura di laboratorio e non è un'identità esatta.");
    for (const parent of card.reported_parents) {
      db.prepare(
        "insert into acquired_pedigree (entity_id, parent_text, relationship_type, identity_status) values (?, ?, 'reported_parent', 'REPORTED')",
      ).run(id, parent);
    }
    return id;
  } finally {
    db.close();
  }
}

export function loadAcquired(id: string) {
  const numeric = Number(id.startsWith("acquired:") ? id.slice("acquired:".length) : "");
  if (!storeReady() || !Number.isInteger(numeric)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const entity = db
      .prepare("select id, display_name, breeder, identity_status, summary, uncertainty from acquired_entities where id = ?")
      .get(numeric) as { id: number; display_name: string; breeder: string | null; identity_status: string; summary: string; uncertainty: string } | undefined;
    if (!entity) return null;
    const aliases = db.prepare("select alias from acquired_aliases where entity_id = ?").all(numeric) as { alias: string }[];
    const claims = db.prepare("select id, field, claim_text, claim_status from acquired_claims where entity_id = ?").all(numeric) as {
      id: number;
      field: string;
      claim_text: string;
      claim_status: string;
    }[];
    const edges = db.prepare("select id, parent_text, relationship_type, identity_status from acquired_pedigree where entity_id = ?").all(numeric) as {
      id: number;
      parent_text: string;
      relationship_type: string;
      identity_status: string;
    }[];
    return {
      strain: {
        id: `acquired:${entity.id}`,
        canonical_name: entity.display_name,
        identity_status: entity.identity_status,
        breeder: entity.breeder,
        summary: `${entity.summary} ${entity.uncertainty}`.trim(),
      },
      quality: { formula_id: "gg-quality-v1" as const, value: null as number | null },
      aliases: aliases.map((row) => row.alias),
      claims: claims.map((claim) => ({
        id: `acquired-claim:${claim.id}`,
        claim_class: claim.claim_status,
        evidence_level: "REPORTED",
        measurement_kind: "reported",
        claim_text: claim.claim_text,
      })),
      traits: [] as unknown[],
      edges: edges.map((edge) => ({
        id: `acquired-edge:${edge.id}`,
        child_name: entity.display_name,
        parent_name: edge.parent_text,
        relationship_type: edge.relationship_type,
        note: edge.identity_status,
        note_on_genomic_percentage: "Parent riportato da Grok. Non è una percentuale genomica e non è un laboratorio.",
      })),
      snapshot_id: UNIFIED_SNAPSHOT,
      source_id: "src-grok-lookup",
    };
  } finally {
    db.close();
  }
}

async function askGrok(query: string): Promise<GrokCard | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Rispondi solo JSON. Sei un ricercatore, non un database e non un laboratorio. Due nomi separati da x non provano un incrocio. known=true solo se il nome o l'incrocio ti risulta documentato, non perché la query contiene due token. cross_documented=true solo se quell'incrocio specifico ti risulta riportato. Non inventare percentuali, cannabinoidi, terpeni, SNP o genotipi. Non copiare schede di catalogo. source_class resta UNVERIFIED: questa chiamata non apre una fonte primaria. Se non sei sicuro: known=false, reported_parents vuoto, cross_documented=false.",
        },
        {
          role: "user",
          content: `Query assente come record unico nello store: ${query}. JSON: {"known":boolean,"display_name":string,"aliases":string[],"breeder":string|null,"reported_parents":string[],"cross_documented":boolean,"declared_type":string|null,"declared_flowering":string|null,"summary":string,"uncertainty":string,"source_class":"UNVERIFIED"}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 240);
    throw new Error(`Grok ${response.status} ${detail}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  return cardFromModel(JSON.parse(content) as unknown, query);
}

export function researchWithGrok(query: string): Promise<GrokCard | null> {
  return askGrok(query);
}

export async function ensureStrain(query: string, ask?: Ask): Promise<AcquireResult> {
  const { resolveQuery } = await import("./resolve.ts");
  const resolved = await resolveQuery(query, ask);
  const origin = resolved.origin;
  return {
    origin:
      origin === "DATABASE" ||
      origin === "ACQUIRED" ||
      origin === "GROK_UNAVAILABLE" ||
      origin === "GROK_FAILED" ||
      origin === "GROK_BLOCKED" ||
      origin === "IGNORED" ||
      origin === "INSUFFICIENT" ||
      origin === "RESEARCH_IN_PROGRESS" ||
      origin === "RESEARCH_MEMORY"
        ? origin
        : "GROK_FAILED",
    grok_called: resolved.grok_called,
    name_norm: resolved.normalized_query,
  };
}
