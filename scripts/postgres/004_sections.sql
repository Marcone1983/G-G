-- Logical sections over the existing tables. This does not copy the corpus.

create table if not exists knowledge_sections (
  section_key text primary key,
  parent_key text references knowledge_sections(section_key),
  storage_table text not null,
  row_filter text,
  write_policy text not null,
  description text not null,
  constraint knowledge_section_policy check (
    write_policy in (
      'SCIENTIFIC_CORPUS',
      'UNVERIFIED_AI_RESEARCH',
      'PRIVATE_USER',
      'OBSERVATION',
      'PATTERN_CANDIDATE',
      'MODEL_METADATA'
    )
  )
);

insert into knowledge_sections (section_key, parent_key, storage_table, row_filter, write_policy, description) values
  ('corpus', null, 'source_records', null, 'SCIENTIFIC_CORPUS', 'Verified imported corpus. Not a place for AI answers.'),
  ('identity', null, 'canonical_entities', null, 'SCIENTIFIC_CORPUS', 'Canonical entities and aliases.'),
  ('chemistry', null, 'measurements', null, 'SCIENTIFIC_CORPUS', 'Laboratory measurements. AI output is not a measurement.'),
  ('safety', null, 'measurements', null, 'SCIENTIFIC_CORPUS', 'Contaminant measurements.'),
  ('pedigree', null, 'pedigree_edges', null, 'SCIENTIFIC_CORPUS', 'Reported pedigree edges. A query is not a parent.'),
  ('claims', null, 'claims', null, 'SCIENTIFIC_CORPUS', 'Source claims, not laboratory values.'),
  ('research', null, 'global_research_memory', null, 'UNVERIFIED_AI_RESEARCH', 'Shared research memory.'),
  ('patterns', null, 'pattern_candidates', null, 'PATTERN_CANDIDATE', 'Pattern candidates. Frequency is not validation.'),
  ('prediction', null, 'model_versions', null, 'MODEL_METADATA', 'Model and calibration metadata. Not a probability.'),
  ('operations', null, 'observation_units', null, 'OBSERVATION', 'Later observations.')
on conflict (section_key) do nothing;

insert into knowledge_sections (section_key, parent_key, storage_table, row_filter, write_policy, description) values
  ('corpus.records', 'corpus', 'source_records', null, 'SCIENTIFIC_CORPUS', 'One row of the source file.'),
  ('corpus.samples', 'corpus', 'samples', null, 'SCIENTIFIC_CORPUS', 'Sample linked to a source record.'),
  ('identity.entities', 'identity', 'canonical_entities', null, 'SCIENTIFIC_CORPUS', 'Resolved entity. Homonyms stay separate.'),
  ('identity.aliases', 'identity', 'aliases', null, 'SCIENTIFIC_CORPUS', 'Alias of one entity.'),
  ('chemistry.cannabinoid', 'chemistry', 'measurements', 'CANNABINOID', 'SCIENTIFIC_CORPUS', 'Cannabinoid measurements.'),
  ('chemistry.terpene', 'chemistry', 'measurements', 'TERPENE', 'SCIENTIFIC_CORPUS', 'Terpene measurements.'),
  ('chemistry.other', 'chemistry', 'measurements', 'OTHER', 'SCIENTIFIC_CORPUS', 'Other chemical measurements.'),
  ('safety.pesticide', 'safety', 'measurements', 'PESTICIDE', 'SCIENTIFIC_CORPUS', 'Pesticide measurements.'),
  ('safety.microbe', 'safety', 'measurements', 'MICROBE', 'SCIENTIFIC_CORPUS', 'Microbe measurements.'),
  ('safety.residual_solvent', 'safety', 'measurements', 'RESIDUAL_SOLVENT', 'SCIENTIFIC_CORPUS', 'Residual solvent measurements.'),
  ('safety.heavy_metal', 'safety', 'measurements', 'HEAVY_METAL', 'SCIENTIFIC_CORPUS', 'Heavy metal measurements.'),
  ('pedigree.edges', 'pedigree', 'pedigree_edges', null, 'SCIENTIFIC_CORPUS', 'Child to reported parent.'),
  ('claims.labels', 'claims', 'claims', null, 'SCIENTIFIC_CORPUS', 'Label and seller claims.'),
  ('research.global', 'research', 'global_research_memory', null, 'UNVERIFIED_AI_RESEARCH', 'Shared AI research. Not a laboratory fact.'),
  ('research.private', 'research', 'private_user_memory', null, 'PRIVATE_USER', 'Private to one user. Never shared.'),
  ('patterns.candidates', 'patterns', 'pattern_candidates', null, 'PATTERN_CANDIDATE', 'Unvalidated pattern.'),
  ('prediction.models', 'prediction', 'model_versions', null, 'MODEL_METADATA', 'Model registry row.'),
  ('prediction.calibration', 'prediction', 'calibration_runs', null, 'MODEL_METADATA', 'Calibration run. Absence means not computable.'),
  ('operations.observations', 'operations', 'observation_units', null, 'OBSERVATION', 'A later observation, not a rewrite of the corpus.')
on conflict (section_key) do nothing;

create table if not exists knowledge_cache (
  lookup_key text primary key,
  section_key text not null references knowledge_sections(section_key),
  normalized_query text not null,
  target_table text not null,
  target_id text,
  knowledge_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_cache_section_idx
  on knowledge_cache (section_key, normalized_query);
