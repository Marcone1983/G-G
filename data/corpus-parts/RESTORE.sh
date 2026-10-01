#!/bin/sh
set -eu
cd "$(dirname "$0")"
cat gg-foundation.sqlite.* > gg-foundation.sqlite
expected=$(awk 'NR==1 { print $1 }' MANIFEST.sha256)
actual=$(sha256sum gg-foundation.sqlite | awk '{ print $1 }')
if [ "$expected" != "$actual" ]; then
  echo RESTORE_MISMATCH
  exit 1
fi
echo RESTORE_OK
