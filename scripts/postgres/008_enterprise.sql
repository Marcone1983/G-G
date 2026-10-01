-- NOT APPLIED. Do not run until a live disk and write probe pass.
-- Adds import audit, resolution review, model history and growth metrics.
-- Does not copy measurements and does not delete existing rows.

create table if not exists public.import_runs (
  import_run_id text primary key,
  source text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  last_checkpoint text,
  rows_seen bigint not null default 0,
  rows_inserted bigint not null default 0,
  rows_skipped bigint not null default 0,
  rows_updated bigint not null default 0,
  rows_failed bigint not null default 0,
  failure_reason text
);

create table if not exists public.entity_resolution_candidates (
  id text primary key,
  left_entity text not null,
  right_entity text not null,
  method text not null,
  status text not null,
  auto_merged boolean not null default false,
  constraint entity_resolution_not_auto check (auto_merged = false)
);

create table if not exists public.model_registry (
  model_id text not null,
  model_version text not null,
  model_type text not null,
  calibration_status text not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (model_id, model_version)
);

create table if not exists public.model_calibration_records (
  id text primary key,
  model_id text not null,
  model_version text not null,
  prediction_error double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.research_sources (
  source_id text primary key,
  source_type text not null,
  doi text,
  pmid text,
  url text,
  license text,
  content_hash text,
  retrieved_at timestamptz
);

create table if not exists public.knowledge_growth (
  id text primary key,
  metric text not null,
  value bigint,
  measured_at timestamptz not null default now()
);
