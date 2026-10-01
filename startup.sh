#!/bin/sh
set -e
cd /workspace
node scripts/server-env-status.mjs
if [ -f /tmp/gg-supervisor.pid ]; then
  pid=$(cat /tmp/gg-supervisor.pid)
  if kill -0 "$pid" 2>/dev/null; then
    node scripts/preview-attach.mjs || true
    exit 0
  fi
fi
setsid node /workspace/scripts/preview-supervisor.mjs >> /tmp/gg-supervisor.log 2>&1 < /dev/null &
echo $! > /tmp/gg-supervisor.pid
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
    node scripts/preview-attach.mjs || true
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done
echo "preview origin did not become ready" >&2
exit 1
