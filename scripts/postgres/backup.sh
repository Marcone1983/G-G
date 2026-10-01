#!/usr/bin/env bash
# Backup is NOT_RUN until a real Postgres URL and pg_dump exist.
set -eu
if [ -z "${DATABASE_URL:-}" ]; then
  echo "STATUS NOT_RUN"
  echo "BLOCKED_EXTERNAL DATABASE_URL"
  echo "BACKUP_VERIFIED false"
  exit 2
fi
case "$DATABASE_URL" in
  http://*|sqlite:*) echo "REFUSED"; exit 2 ;;
esac
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "STATUS NOT_RUN"
  echo "BLOCKED_EXTERNAL PG_DUMP"
  exit 2
fi
out="${1:-data/backups/postgres-backup.sql}"
mkdir -p "$(dirname "$out")"
pg_dump --dbname="$DATABASE_URL" --format=plain --file="$out"
echo "STATUS DUMP_WRITTEN"
echo "RESTORE_VERIFIED false"
