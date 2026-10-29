#!/bin/sh
# ArchFlux database backup (Phase 2, PROD-010).
#
# Takes a pg_dump custom-format (-Fc) snapshot of the compose `db` service
# and writes it to a timestamped file. Custom format keeps schema + data in
# one portable artifact restorable with scripts/restore.sh (pg_restore).
#
# Usage:
#   scripts/backup.sh                       # ./backups/archflux-YYYYMMDD-HHMMSS.dump
#   BACKUP_DIR=/var/backups/archflux scripts/backup.sh
#   COMPOSE_PROJECT=archflux-phase1 scripts/backup.sh   # non-default project
#   GZIP=1 scripts/backup.sh                # additionally gzip -9 the dump
#
# NOTE: the toggle is BACKUP_GZIP, not GZIP — gzip(1) itself reads $GZIP as
# default options, so exporting GZIP=1 would corrupt the invocation.
#
# Environment:
#   POSTGRES_DB       database name (default: archflux)
#   POSTGRES_USER     owner role for pg_dump (default: archflux)
#   BACKUP_DIR        output directory (default: <repo>/backups, created)
#   COMPOSE_FILE      compose file (default: compose.yml)
#   COMPOSE_PROJECT   optional `docker compose -p` project name
#   BACKUP_GZIP     1 to gzip the dump after creation (default: 0; -Fc is
#                     already compressed, gzip only helps archival tooling).
#                     (Named BACKUP_GZIP because gzip(1) reads $GZIP itself.)
#
# Output: prints the backup location + byte size. Exit non-zero on failure.
# RPO note: backups are point-in-time; schedule via cron/systemd to meet the
# <= 15 min RPO target (see docs/deploy/DEPLOY.md + docs/ops/runbooks.md).
set -eu

cd "$(dirname "$0")/.."

DB="${POSTGRES_DB:-archflux}"
DB_USER="${POSTGRES_USER:-archflux}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
BACKUP_GZIP="${BACKUP_GZIP:-0}"

COMPOSE="docker compose -f $COMPOSE_FILE"
if [ -n "${COMPOSE_PROJECT:-}" ]; then
  COMPOSE="$COMPOSE -p $COMPOSE_PROJECT"
fi

# Fail fast when the daemon or the db service is unavailable.
if ! docker info >/dev/null 2>&1; then
  echo "FAIL: docker daemon not responding" >&2
  exit 1
fi
if ! $COMPOSE ps db --status running --no-trunc 2>/dev/null | grep -q .; then
  # `ps --status running` is not supported by older compose; fall back to plain ps.
  if ! $COMPOSE ps db 2>/dev/null | grep -qi "running\|healthy\|up"; then
    echo "FAIL: db service is not running (start with: docker compose -f $COMPOSE_FILE up -d db)" >&2
    exit 1
  fi
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/archflux-$STAMP.dump"

echo "==> pg_dump -Fc $DB -> $OUT"
# shellcheck disable=SC2086
$COMPOSE exec -T db pg_dump -Fc -U "$DB_USER" -d "$DB" > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "FAIL: backup file is empty ($OUT)" >&2
  rm -f "$OUT"
  exit 1
fi

if [ "$BACKUP_GZIP" = "1" ]; then
  # Clear $GZIP for the child: gzip(1) prepends it to argv (Apple gzip 479
  # treats GZIP=1 as an extra filename and exits 1).
  GZIP= gzip -9 "$OUT"
  OUT="$OUT.gz"
fi

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
echo "BACKUP OK: $OUT (${SIZE} bytes)"
