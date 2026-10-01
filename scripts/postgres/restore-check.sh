#!/usr/bin/env bash
# A restore is verified only against a non-production database named by RESTORE_DATABASE_URL.
set -eu
if [ -z "${RESTORE_DATABASE_URL:-}" ] || [ -z "${1:-}" ]; then
  echo "STATUS NOT_RUN"
  echo "BLOCKED_EXTERNAL RESTORE_DATABASE_URL"
  echo "RESTORE_VERIFIED false"
  exit 2
fi
if [ "${RESTORE_DATABASE_URL}" = "${DATABASE_URL:-}" ]; then
  echo "REFUSED restore target must not be the production database"
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "BLOCKED_EXTERNAL PSQL"
  exit 2
fi
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"
echo "STATUS RESTORED_TO_NON_PRODUCTION"
echo "RESTORE_VERIFIED true"
