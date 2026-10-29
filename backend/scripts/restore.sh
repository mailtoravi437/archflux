#!/bin/sh
# ArchFlux database restore drill (Phase 2, PROD-010).
#
# Restores a pg_dump custom-format backup (see scripts/backup.sh) into a
# target database via pg_restore, then verifies: per-table row counts plus a
# liveness probe of /api/ready through a passed API base URL.
#
# Usage:
#   scripts/restore.sh --yes --db archflux_restored ./backups/archflux-20260101-120000.dump
#   scripts/restore.sh --yes --db archflux ./backups/x.dump.gz --force --api-base http://localhost:8080
#   COMPOSE_PROJECT=archflux-phase1 scripts/restore.sh --yes --db archflux_restore x.dump
#
# Required flags:
#   --yes            explicit acknowledgement (refuses to run without it)
#   --db NAME        target database (created when missing)
# Optional flags:
#   --force          allow restore over a NON-EMPTY database (drops + recreates
#                    the public schema first). Without --force, a target that
#                    already holds tables aborts.
#   --api-base URL   base URL for the post-restore /api/ready probe
#                    (also read from API_BASE env). When omitted, the API probe
#                    is skipped with a warning.
#   --skip-api-check skip the /api/ready probe even when a base is known.
#
# Environment: POSTGRES_USER (default archflux), COMPOSE_FILE, COMPOSE_PROJECT
# (same semantics as backup.sh).
#
# SAFETY: this script never touches the default database unless you name it
# in --db. Restoring over a production database requires --force AND --yes.
set -eu

cd "$(dirname "$0")/.."

DB_USER="${POSTGRES_USER:-archflux}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
API_BASE="${API_BASE:-}"
TARGET=""
BACKUP=""
ACK=""
FORCE=0
SKIP_API=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) ACK=1; shift ;;
    --db) TARGET="${2:-}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --api-base) API_BASE="${2:-}"; shift 2 ;;
    --skip-api-check) SKIP_API=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    --*) echo "FAIL: unknown flag $1" >&2; exit 2 ;;
    *) if [ -z "$BACKUP" ]; then BACKUP="$1"; else echo "FAIL: unexpected arg $1" >&2; exit 2; fi; shift ;;
  esac
done

[ -n "$ACK" ] || { echo "FAIL: refusing without explicit --yes" >&2; exit 2; }
[ -n "$TARGET" ] || { echo "FAIL: --db TARGET is required" >&2; exit 2; }
[ -n "$BACKUP" ] || { echo "FAIL: backup file argument is required" >&2; exit 2; }
[ -f "$BACKUP" ] || { echo "FAIL: backup file not found: $BACKUP" >&2; exit 2; }

COMPOSE="docker compose -f $COMPOSE_FILE"
if [ -n "${COMPOSE_PROJECT:-}" ]; then
  COMPOSE="$COMPOSE -p $COMPOSE_PROJECT"
fi

# shellcheck disable=SC2086
psql_exec() { db="$1"; shift; $COMPOSE exec -T db psql -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -tA "$@"; }

case "$BACKUP" in
  *.gz) RESTORE_SRC="gunzip -c \"$BACKUP\" |" ;;
  *) RESTORE_SRC="" ;;
esac

echo "==> target database: $TARGET (backup: $BACKUP)"

# Create the target database when missing.
if ! $COMPOSE exec -T db psql -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1; then
  echo "==> creating database $TARGET"
  $COMPOSE exec -T db createdb -U "$DB_USER" "$TARGET"
fi

TABLES="$(psql_exec "$TARGET" -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")"
TABLES="$(printf '%s' "$TABLES" | tr -d ' ')"
echo "==> target holds $TABLES table(s) in schema public"

if [ "${TABLES:-0}" -gt 0 ] && [ "$FORCE" -ne 1 ]; then
  echo "FAIL: target database '$TARGET' is non-empty; re-run with --force to drop schema public first" >&2
  exit 2
fi
if [ "${TABLES:-0}" -gt 0 ]; then
  echo "==> --force: dropping + recreating schema public on $TARGET"
  psql_exec "$TARGET" -c "DROP SCHEMA public CASCADE;" -c "CREATE SCHEMA public;" >/dev/null
fi

echo "==> pg_restore into $TARGET"
# NOTE: no --clean/--if-exists — the target is either freshly created or its
# public schema was just dropped+recreated, so objects must not pre-exist.
if [ -n "$RESTORE_SRC" ]; then
  # shellcheck disable=SC2086
  eval "$RESTORE_SRC $COMPOSE exec -T db pg_restore -U \"$DB_USER\" -d \"$TARGET\""
else
  # shellcheck disable=SC2086
  $COMPOSE exec -T db pg_restore -U "$DB_USER" -d "$TARGET" < "$BACKUP"
fi

echo "==> post-restore table counts ($TARGET)"
for t in users workspaces workspace_memberships diagrams diagram_revisions checkpoints threads replies sync_log audit_log webhook_events; do
  n="$(psql_exec "$TARGET" -c "SELECT COUNT(*) FROM public.\"$t\";" 2>/dev/null | tr -d ' ' || true)"
  if [ -n "$n" ]; then echo "  $t: $n"; else echo "  $t: (absent)"; fi
done

if [ "$SKIP_API" -eq 1 ] || [ -z "$API_BASE" ]; then
  echo "WARN: skipping /api/ready probe (no API base passed; use --api-base or API_BASE)"
else
  echo "==> probing $API_BASE/api/ready"
  READY="$(curl -sf "$API_BASE/api/ready")" || { echo "FAIL: /api/ready unreachable" >&2; exit 1; }
  echo "$READY"
  case "$READY" in
    *'"ready":true'*|*'"ready": true'*) echo "READY OK" ;;
    *) echo "FAIL: API reports not-ready after restore" >&2; exit 1 ;;
  esac
fi

echo "RESTORE OK into database '$TARGET'"
