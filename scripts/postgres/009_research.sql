-- Additive research memory. Does not alter measurements, samples, or source_records.

create table if not exists research_sessions (
  research_id text primary key,
  query text not null,
  retrieved_at timestamptz not null default now(),
  knowledge_status text not null,
  embedding_status text not null,
  embedding_model text,
  embedding_version text
);

create table if not exists research_claims (
  id bigserial primary key,
  research_id text not null references research_sessions (research_id),
  claim_type text not null,
  claim_text text not null,
  source_type text not null,
  source_name text,
  doi text,
  url text,
  publication_date text,
  entity_id bigint,
  evidence_level text not null,
  knowledge_status text not null,
  numeric_value numeric,
  retrieved_at timestamptz not null default now()
);

create unique index if not exists research_claims_doi_unique
  on research_claims (doi)
  where doi is not null;
