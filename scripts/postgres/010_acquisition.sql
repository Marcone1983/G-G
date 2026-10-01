-- Additive acquisition catalog. Does not alter measurements, samples, source_records, or canonical_entities.

create table if not exists acquisition_sources (
  source_id text primary key,
  research_id text not null references research_sessions (research_id),
  source_name text not null,
  source_type text not null,
  source_url text,
  doi text,
  license text not null,
  decision text not null,
  file_sha256 text,
  record_count bigint,
  notes text,
  retrieved_at timestamptz not null default now()
);

create table if not exists acquisition_records (
  id bigserial primary key,
  source_id text not null references acquisition_sources (source_id),
  external_id text not null,
  record_kind text not null,
  claim_type text not null,
  knowledge_status text not null,
  title text,
  entity_name text,
  numeric_value numeric,
  unit text,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists acquisition_records_source_external
  on acquisition_records (source_id, external_id);
