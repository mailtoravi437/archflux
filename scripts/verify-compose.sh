#!/bin/sh
# ArchFlux Phase 1 compose verification.
#
# 1. Always: `docker compose -f compose.yml config --quiet` (no daemon needed).
# 2. Only if the docker daemon responds: bring the stack up with an isolated
#    project name (-p archflux-phase1), wait for health, curl /api/health and
#    /api/ready, print versions.
#
# LEAVE-UP CHOICE: on success the stack is LEFT RUNNING and this script prints
# the exact `down -v` command for the caller. Volumes are NEVER destroyed
# silently — `down -v` deletes the fresh pgdata/redisdata volumes, so that
# decision belongs to the human/CI caller, not to this script.
set -eu

COMPOSE_FILE="compose.yml"
PROJECT="archflux-phase1"
WEB_PORT="${WEB_PORT:-8080}"

cd "$(dirname "$0")/.."

echo "==> 1/3 validating compose config"
docker compose -f "$COMPOSE_FILE" config --quiet
echo "    config OK"

if ! docker info >/dev/null 2>&1; then
  echo "SKIP: docker daemon not responding — live bring-up blocked (config check above still counts)."
  exit 0
fi

echo "==> 2/3 bringing stack up (-p $PROJECT)"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" up -d --build

echo "==> 3/3 waiting for health, then probing API"
deadline=$(( $(date +%s) + 240 ))
until curl -sf "http://localhost:${WEB_PORT}/api/health" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "FAIL: /api/health never became ready (240s)." >&2
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT" ps >&2 || true
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT" logs --tail=50 server >&2 || true
    exit 1
  fi
  sleep 5
done

echo "--- GET /api/health"
HEALTH="$(curl -s "http://localhost:${WEB_PORT}/api/health")"
echo "$HEALTH"
case "$HEALTH" in
  *'"status":"UP"'*|*'"status": "UP"'*) echo "    health OK" ;;
  *) echo "FAIL: unexpected /api/health body" >&2; exit 1 ;;
esac

echo "--- GET /api/ready"
READY="$(curl -s "http://localhost:${WEB_PORT}/api/ready")"
echo "$READY"
case "$READY" in
  *'"ready":true'*|*'"ready": true'*) echo "    ready OK" ;;
  *) echo "FAIL: API not ready (schema missing? see Database bootstrap in DEPLOY.md)" >&2; exit 1 ;;
esac

echo "--- versions"
docker compose version || true
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" ps
docker compose -f "$COMPOSE_FILE" -p "$PROJECT" exec -T redis redis-server --version || true

echo ""
echo "VERIFY PASSED. Stack left UP by design; to tear down (DESTROYS volumes):"
echo "  docker compose -f $COMPOSE_FILE -p $PROJECT down -v"
