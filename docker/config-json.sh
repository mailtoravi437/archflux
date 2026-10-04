#!/bin/sh
# Generates /usr/share/nginx/html/config.json at container start so the API
# base URL is runtime-injectable without rebuilding the image.
# Runs via nginx:alpine's /docker-entrypoint.d mechanism (sourced before nginx
# starts). Defaults to same-origin /api (served by this container's proxy).
set -eu

api_url="${API_URL:-/api}"

# Minimal JSON string escaping (API_URL is a URL; only " and \ need care).
escaped_url=$(printf '%s' "$api_url" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

printf '{"apiUrl":"%s"}\n' "$escaped_url" > /usr/share/nginx/html/config.json
