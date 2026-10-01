create table if not exists gg_meta (
  key text primary key,
  value text not null
);

create table if not exists gg_roles (
  user_id text primary key,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists gg_sources (
  id text primary key,
  document text not null
);

create table if not exists gg_strains (
  id text primary key,
  canonical_name text not null,
  name_norm text not null,
  identity_status text not null,
  record_role text not null,
  document text not null
);
create index if not exists gg_strains_norm_idx on gg_strains (name_norm);

create table if not exists gg_aliases (
  id text primary key,
  strain_id text not null references gg_strains (id),
  alias text not null,
  alias_norm text not null
);
create index if not exists gg_aliases_norm_idx on gg_aliases (alias_norm);

create table if not exists gg_edges (
  id text primary key,
  child_id text not null,
  parent_id text,
  relationship_type text not null,
  confidence double precision not null,
  source_id text,
  note text not null,
  status text not null default 'active'
);

create table if not exists gg_claims (
  id text primary key,
  subject_type text not null,
  subject_id text not null,
  field text not null,
  claim_text text not null,
  claim_class text not null,
  evidence_level integer not null,
  measurement_kind text not null,
  source_id text,
  contradicts_claim_id text,
  governance_status text not null
);

create table if not exists gg_traits (
  id text primary key,
  strain_id text not null,
  dimension text not null,
  trait_key text not null,
  value_json text not null,
  measurement_type text not null,
  confidence double precision not null,
  source_id text,
  environment_json text not null
);

create table if not exists gg_genetics (
  id text primary key,
  document text not null
);

create table if not exists gg_patterns (
  id text primary key,
  validation_status text not null,
  document text not null
);

create table if not exists gg_crosses (
  id text primary key,
  user_id text,
  parent_a_query text not null,
  parent_b_query text not null,
  parent_a_id text,
  parent_b_id text,
  cross_type text not null,
  request_json text not null,
  created_at timestamptz not null default now()
);
create index if not exists gg_crosses_user_idx on gg_crosses (user_id);

create table if not exists gg_predictions (
  id text primary key,
  cross_id text not null references gg_crosses (id),
  user_id text,
  model_version text not null,
  snapshot_id text not null,
  report_json text not null,
  created_at timestamptz not null default now()
);
create index if not exists gg_predictions_user_idx on gg_predictions (user_id);

create table if not exists gg_observations (
  id text primary key,
  user_id text not null,
  prediction_id text,
  visibility text not null default 'private',
  scientific_json text not null,
  private_note text,
  created_at timestamptz not null default now()
);
create index if not exists gg_observations_user_idx on gg_observations (user_id);

create table if not exists gg_outcomes (
  id text primary key,
  prediction_id text not null,
  observation_id text not null,
  metrics_json text not null,
  created_at timestamptz not null default now()
);

create table if not exists gg_global_records (
  id text primary key,
  kind text not null,
  scientific_json text not null,
  governance_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists gg_cache (
  cache_key text primary key,
  model_version text not null,
  snapshot_id text not null,
  schema_version text not null,
  result_json text not null,
  created_at timestamptz not null default now(),
  last_accessed timestamptz not null default now(),
  ttl_seconds integer not null,
  invalidation_status text not null default 'valid'
);

create table if not exists gg_audit (
  id text primary key,
  actor_user_id text,
  action text not null,
  subject_type text not null,
  subject_id text,
  meta_json text not null,
  created_at timestamptz not null default now()
);

create table if not exists gg_api_keys (
  id text primary key,
  user_id text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
