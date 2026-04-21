#!/usr/bin/env bash
set -euo pipefail
URL="${LEDGER_URL:-http://localhost:3068}/_info"
echo "Waiting for ledger at $URL ..."
for i in {1..60}; do
  if curl -fsS "$URL" > /dev/null 2>&1; then
    echo "Ledger ready."
    exit 0
  fi
  sleep 1
done
echo "Ledger failed to become ready after 60s" >&2
exit 1
