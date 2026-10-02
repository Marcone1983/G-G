create table if not exists content_reports (
  id bigserial primary key,
  user_id text not null,
  kind text not null,
  detail text not null,
  target_id text not null default '',
  created_at timestamptz not null default now()
);
