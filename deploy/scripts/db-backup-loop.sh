#!/bin/sh
# Entry point for the `db-backup` Compose sidecar. Runs db-backup.sh on
# a fixed interval — the simplest thing that can't silently stop firing (no cron
# daemon config to typo, no separate log file to forget to check: a failed
# backup just prints to `docker compose logs db-backup` and the container is
# `restart: unless-stopped`, so the loop keeps trying).
#
# DB_BACKUP_INTERVAL_SECONDS defaults to 86400 (daily), matching the Helm
# CronJob's default `schedule` cadence.
set -eu

INTERVAL="${DB_BACKUP_INTERVAL_SECONDS:-86400}"

echo "[db-backup-loop] starting, interval=${INTERVAL}s"
while true; do
  if ! bash /scripts/db-backup.sh; then
    echo "[db-backup-loop] backup FAILED at $(date -Iseconds) — will retry in ${INTERVAL}s" >&2
  fi
  sleep "$INTERVAL"
done
