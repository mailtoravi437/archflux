#!/usr/bin/env bash
# Deploy one ArchFlux service on the EC2 host (SERVICES_SPEC §10.3).
#   deploy/aws/remote-deploy.sh <server|web> <image-tag>
# Runs from /opt/archflux (the bundle CI copies there). Pulls the tagged image
# from ECR with the instance role, restarts the service, waits for its
# container health check, and rolls back to the previous tag on failure.
set -euo pipefail

usage() { echo "usage: $0 <server|web> <image-tag>" >&2; exit 2; }
[ $# -eq 2 ] || usage
service=$1
tag=$2
case "$service" in
  server) tag_var=API_IMAGE_TAG; extra=() ;;
  web) tag_var=WEB_IMAGE_TAG; extra=(caddy) ;;
  *) usage ;;
esac
[[ "$tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "invalid image tag: $tag" >&2; exit 2; }

cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "missing $(pwd)/.env — create it from deploy/aws/env.aws.example" >&2; exit 1; }
touch images.env
chmod 600 .env images.env

env_value() { sed -n "s/^$1=//p" "$2" | tail -n 1; }
set_tag() {
  grep -v "^$1=" images.env > images.env.tmp || true
  echo "$1=$2" >> images.env.tmp
  mv images.env.tmp images.env
}
dc() { docker compose --env-file .env --env-file images.env -f compose.yml -f deploy/aws/compose.aws.yml "$@"; }

registry=$(env_value ECR_REGISTRY .env)
region=$(env_value AWS_REGION .env)
[ -n "$registry" ] && [ -n "$region" ] || { echo "ECR_REGISTRY and AWS_REGION must be set in .env" >&2; exit 1; }
aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry" >/dev/null

previous=$(env_value "$tag_var" images.env)

wait_healthy() {
  local id status
  for _ in $(seq 1 60); do
    id=$(dc ps -q "$service")
    status=$( [ -n "$id" ] && docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

echo "Deploying $service:$tag (previous: ${previous:-none})"
set_tag "$tag_var" "$tag"
dc pull "$service" "${extra[@]}"
dc up -d --no-build "$service" "${extra[@]}"

if wait_healthy; then
  echo "$service healthy on $tag"
  docker image prune -af --filter "until=168h" >/dev/null || true
  exit 0
fi

echo "$service failed its health check on $tag" >&2
dc logs --tail 80 "$service" >&2 || true
if [ -n "$previous" ]; then
  echo "Rolling back $service to $previous" >&2
  set_tag "$tag_var" "$previous"
  dc up -d --no-build "$service" "${extra[@]}" || true
fi
exit 1
