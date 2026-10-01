import { DatabaseSync } from "node:sqlite";

import { normalizeName } from "../engine.ts";

export type ParentHit = {
  canonical_id: number;
  display_name: string;
  name_norm: string;
  identity_status: string;
  homonym_status: string;
  match_kind: "EXACT" | "ALIAS";
};

export type RawValue = {
  compound: string;
  klass: string;
  group: string;
  source_id: string;
  value: number;
};

export type PedigreeRow = {
  parent_text: string;
  identity_status: string;
  reported_or_inferred: string;
  relationship_type: string;
};

export type PatternRow = {
  pattern_key: string;
  hypothesis: string;
  lifecycle: string;
  sample_size: number;
  independent_sources: number;
  validation_n: number;
  discovery_mean: number | null;
  validation_mean: number | null;
  promoted: boolean;
};

export type CorpusReader = {
  source: "sqlite_verification";
  snapshotId(): string;
  parents(name: string): ParentHit[];
  values(nameNorm: string, compounds: string[]): RawValue[];
  pedigree(nameNorm: string): PedigreeRow[];
  patterns(nameNorm: string): PatternRow[];
  samePairChildren(left: string, right: string): number;
  labelRows(nameNorm: string): number;
  vectorCandidates(tokens: string[]): { name: string; vector: number[] }[];
};

const COMPOUND_OK = /^[a-z0-9_]{1,40}$/;

export function openSqliteCorpus(file: string): CorpusReader {
  const db = new DatabaseSync(file, { readOnly: true });
  return {
    source: "sqlite_verification",
    snapshotId() {
      const row = db.prepare("select snapshot_id from knowledge_snapshots order by rowid desc limit 1").get() as
        | { snapshot_id: string }
        | undefined;
      return row?.snapshot_id ?? "SNAPSHOT_NOT_RECORDED";
    },
    parents(name: string) {
      const norm = normalizeName(name);
      const exact = db.prepare(
        `select id as canonical_id, display_name, name_norm, identity_status, homonym_status
         from canonical_entities where name_norm = ? limit 24`,
      ).all(norm) as Omit<ParentHit, "match_kind">[];
      const alias = db.prepare(
        `select c.id as canonical_id, c.display_name, c.name_norm, c.identity_status, c.homonym_status
         from aliases a join canonical_entities c on c.id = a.canonical_id
         where a.alias_norm = ? limit 24`,
      ).all(norm) as Omit<ParentHit, "match_kind">[];
      const seen = new Set<number>();
      const hits: ParentHit[] = [];
      for (const row of exact) {
        if (seen.has(row.canonical_id)) continue;
        seen.add(row.canonical_id);
        hits.push({ ...row, match_kind: "EXACT" });
      }
      for (const row of alias) {
        if (seen.has(row.canonical_id)) continue;
        seen.add(row.canonical_id);
        hits.push({ ...row, match_kind: "ALIAS" });
      }
      return hits;
    },
    values(nameNorm: string, compounds: string[]) {
      const allowed = compounds.filter((compound) => COMPOUND_OK.test(compound));
      if (allowed.length === 0) return [];
      const marks = allowed.map(() => "?").join(",");
      return db.prepare(
        `select m.compound as compound, m.klass as klass,
                coalesce(s.independence_group, s.source_id, 'unknown') as grp,
                coalesce(s.source_id, 'unknown') as source_id,
                m.numeric_value as value
         from measurements m
         join source_records s on s.id = m.source_record_id
         where s.name_norm = ?
           and m.value_status = 'NUMERIC'
           and m.numeric_value is not null
           and m.compound in (${marks})
         limit 20000`,
      ).all(nameNorm, ...allowed).map((row) => {
        const item = row as { compound: string; klass: string; grp: string; source_id: string; value: number };
        return { compound: item.compound, klass: item.klass, group: item.grp, source_id: item.source_id, value: item.value };
      });
    },
    pedigree(nameNorm: string) {
      return db.prepare(
        `select parent_text, identity_status, reported_or_inferred, relationship_type
         from pedigree_edges
         where parent_norm = ? or child_canonical_id in (select id from canonical_entities where name_norm = ?)
         limit 40`,
      ).all(nameNorm, nameNorm) as PedigreeRow[];
    },
    patterns(nameNorm: string) {
      const token = nameNorm.split(" ").filter((part) => part.length > 2)[0] ?? nameNorm;
      return db.prepare(
        `select pattern_key, hypothesis, lifecycle, sample_size, independent_sources, validation_n,
                discovery_mean, validation_mean, promoted_to_validated
         from pattern_candidates
         where pattern_key like ?
         limit 12`,
      ).all(`%${token}%`).map((row) => {
        const item = row as PatternRow & { promoted_to_validated: number };
        return {
          pattern_key: item.pattern_key,
          hypothesis: item.hypothesis,
          lifecycle: item.lifecycle,
          sample_size: item.sample_size,
          independent_sources: item.independent_sources,
          validation_n: item.validation_n,
          discovery_mean: item.discovery_mean,
          validation_mean: item.validation_mean,
          promoted: item.promoted_to_validated === 1,
        };
      });
    },
    samePairChildren(left: string, right: string) {
      const row = db.prepare(
        `select count(*) as n
         from pedigree_edges a
         join pedigree_edges b on a.child_canonical_id = b.child_canonical_id and a.id < b.id
         where a.parent_norm = ? and b.parent_norm = ?`,
      ).get(left, right) as { n: number };
      return row.n;
    },
    labelRows(nameNorm: string) {
      const row = db.prepare("select count(*) as n from source_records where name_norm = ?").get(nameNorm) as { n: number };
      return row.n;
    },
    vectorCandidates(tokens: string[]) {
      const useful = tokens.filter((token) => token.length > 2).slice(0, 3);
      if (useful.length === 0) return [];
      const where = useful.map(() => "e.name_norm like ?").join(" or ");
      const rows = db.prepare(
        `select e.display_name as name, v.vector as vector
         from entity_vectors v
         join canonical_entities e on e.id = v.canonical_id
         where ${where}
         limit 24`,
      ).all(...useful.map((token) => `%${token}%`)) as { name: string; vector: Uint8Array }[];
      return rows.map((row) => ({ name: row.name, vector: decodeVector(row.vector) }));
    },
  };
}

function decodeVector(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = [];
  for (let i = 0; i + 4 <= bytes.byteLength && out.length < 64; i += 4) out.push(view.getFloat32(i, true));
  return out;
}
