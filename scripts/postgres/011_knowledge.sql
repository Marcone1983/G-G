-- Promotes acquisition records into scientific tables. Does not update measurements or canonical_entities.

alter table pattern_candidates add column if not exists sample_size integer;
alter table pattern_candidates add column if not exists independent_sources integer;
alter table pattern_candidates add column if not exists independent_lineages integer;
alter table pattern_candidates add column if not exists uncertainty double precision;
alter table pattern_candidates add column if not exists effect_estimate double precision;
alter table pattern_candidates add column if not exists contradictions integer not null default 0;
alter table pattern_candidates add column if not exists source_quality text;
alter table pattern_candidates add column if not exists model_version text;
alter table pattern_candidates add column if not exists knowledge_snapshot text;
alter table pattern_candidates add column if not exists created_at timestamptz not null default now();

create unique index if not exists pattern_candidates_key_unique on pattern_candidates (pattern_key);

create table if not exists scientific_records (
  id bigserial primary key,
  source_id text not null,
  external_id text not null,
  record_kind text not null,
  claim_type text not null,
  knowledge_status text not null,
  entity_name text,
  title text,
  numeric_value numeric,
  unit text,
  license text,
  doi text,
  review_status text not null default 'UNREVIEWED',
  payload jsonb not null default '{}'::jsonb,
  unique (source_id, external_id)
);

create table if not exists structural_variants (
  id bigserial primary key,
  source_id text not null,
  external_id text not null,
  sample_code text,
  chromosome text,
  start_pos bigint,
  end_pos bigint,
  sv_type text,
  resolved_to_catalog text not null default 'UNRESOLVED',
  license text not null,
  unique (source_id, external_id)
);

create table if not exists genome_assemblies (
  assembly_accession text primary key,
  source_id text not null,
  title text,
  license text not null,
  resolved_to_catalog text not null default 'UNRESOLVED',
  payload jsonb not null default '{}'::jsonb
);

create table if not exists protein_records (
  accession text primary key,
  source_id text not null,
  gene_name text,
  title text,
  length_aa numeric,
  license text not null,
  resolved_to_catalog text not null default 'UNRESOLVED'
);

create table if not exists research_papers (
  external_id text primary key,
  source_id text not null,
  title text,
  doi text,
  pmid text,
  publication_year text,
  is_open_access boolean,
  knowledge_status text not null,
  license text
);

create table if not exists expression_studies (
  accession text primary key,
  source_id text not null,
  title text,
  sample_count numeric,
  license text not null,
  matrices_downloaded boolean not null default false
);

create table if not exists chemical_observations (
  id bigserial primary key,
  source_id text not null,
  external_id text not null,
  sample_code text not null,
  compound_name text not null,
  numeric_value numeric,
  unit text,
  knowledge_status text not null,
  matrix text,
  resolved_to_catalog text not null,
  feature_status text not null,
  license text not null,
  unique (source_id, external_id)
);

create table if not exists scientific_features (
  feature_id text primary key,
  entity_name text,
  feature_type text not null,
  compound text,
  value double precision,
  unit text,
  q1 double precision,
  q3 double precision,
  independent_groups bigint not null,
  independent_sources bigint not null,
  derivation text not null,
  quality text not null,
  model_eligibility text not null,
  model_version text not null,
  knowledge_snapshot text not null
);

create table if not exists prediction_records (
  prediction_id text primary key,
  snapshot_id text not null,
  model_version text not null,
  identity_status text not null,
  central_estimate double precision,
  probability numeric,
  calibration_status text not null,
  cache_status text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
