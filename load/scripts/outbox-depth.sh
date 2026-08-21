#!/usr/bin/env bash
# One-shot snapshot of outbox backlog: pending count, oldest pending age, and
# status breakdown. Useful during/after load/ingest.js to find "the point at
# which the outbox backs up" (see load/README.md "Target numbers").
#
# Usage: ./load/scripts/outbox-depth.sh
set -euo pipefail

DOCKER_COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
fi

$DOCKER_COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-webhook_user}" -d "${POSTGRES_DB:-webhook_platform}" -c \
  "SELECT status, count(*), min(created_at) AS oldest, now() - min(created_at) AS oldest_age FROM outbox_messages GROUP BY status ORDER BY status;"
