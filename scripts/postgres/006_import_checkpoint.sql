-- NOT APPLIED. M4 is prepared and must not run until disk capacity is verified.
-- This file does not connect, import, or modify existing rows.

create table if not exists import_checkpoints (
  import_id text primary key,
  dataset_hash text,
  source_name text,
  table_name text not null,
  status text not null,
  rows_processed bigint not null default 0,
  rows_inserted bigint not null default 0,
  rows_skipped bigint not null default 0,
  rows_failed bigint not null default 0,
  last_source_id text,
  last_sample_id text,
  last_measurement_id text,
  started_at timestamptz,
  updated_at timestamptz,
  error text,
  constraint import_checkpoint_status check (
    status in ('PENDING', 'RUNNING', 'PAUSED', 'FAILED', 'COMPLETED', 'IMPORT_PAUSED_DISK_CAPACITY')
  )
);
