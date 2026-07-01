#!/usr/bin/env bash
# Deploy the second DocAI instance (uz.docai.az) on the prod server.
#   Usage:  ./deploy-uz.sh              # pull + rebuild all app services
#           ./deploy-uz.sh api worker   # pull + rebuild only the named services
# Run from /home/docai-uz on the server.

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE=(docker compose -p docai-uz -f docker-compose.yml -f docker-compose.uz.yml)

echo ">>> git pull"
git pull --ff-only

if [[ $# -gt 0 ]]; then
  SERVICES=("$@")
else
  SERVICES=(migrate api worker frontend)
fi

echo ">>> rebuilding: ${SERVICES[*]}"
"${COMPOSE[@]}" up -d --build "${SERVICES[@]}"

echo ">>> status"
"${COMPOSE[@]}" ps

echo ">>> tailing api/worker logs (Ctrl-C to exit)"
"${COMPOSE[@]}" logs -f --tail 30 api worker
