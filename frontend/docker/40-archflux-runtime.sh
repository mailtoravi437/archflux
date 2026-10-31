#!/bin/sh
# archflux-web runtime configuration (SERVICES_SPEC §3.1/§3.2). Runs from
# nginx:alpine's /docker-entrypoint.d before nginx starts and writes:
#   /usr/share/nginx/html/config.json   {"apiUrl","wsUrl","firebase"?} for src/config.ts
#   /etc/nginx/archflux/runtime.conf    CSP with the API origin in connect-src
#   /etc/nginx/archflux/api-proxy.conf  reverse proxy iff API_UPSTREAM is set
# Env: API_URL (default /api), WS_URL (optional), API_UPSTREAM (optional),
#      FIREBASE_API_KEY / FIREBASE_AUTH_DOMAIN / FIREBASE_PROJECT_ID / FIREBASE_APP_ID /
#      FIREBASE_MESSAGING_SENDER_ID (optional, public web config for phone sign-in, R1-SEC-02;
#      the firebase block and its CSP additions are written only when FIREBASE_API_KEY is set).
set -eu

api_url="${API_URL:-/api}"
ws_url="${WS_URL:-}"
api_upstream="${API_UPSTREAM:-}"
conf_dir=/etc/nginx/archflux
mkdir -p "$conf_dir"

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
# scheme://host[:port] of an absolute URL; empty for relative URLs.
origin_of() { printf '%s' "$1" | sed -n -E 's#^(https?|wss?)://([^/]+).*#\1://\2#p'; }
# Reject characters that could break out of the nginx string / JSON.
fb_key="${FIREBASE_API_KEY:-}"
fb_domain="${FIREBASE_AUTH_DOMAIN:-}"
fb_project="${FIREBASE_PROJECT_ID:-}"
fb_app="${FIREBASE_APP_ID:-}"
fb_sender="${FIREBASE_MESSAGING_SENDER_ID:-}"
case "$api_url$ws_url$api_upstream$fb_key$fb_domain$fb_project$fb_app$fb_sender" in
  *[\"\;\{\}\ \$\'\`]*) echo "archflux-runtime: invalid character in API_URL/WS_URL/API_UPSTREAM/FIREBASE_*" >&2; exit 1 ;;
esac

firebase_json=""
if [ -n "$fb_key" ]; then
  if [ -z "$fb_domain" ] || [ -z "$fb_project" ] || [ -z "$fb_app" ]; then
    echo "archflux-runtime: FIREBASE_API_KEY needs FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID and FIREBASE_APP_ID" >&2
    exit 1
  fi
  firebase_json=",\"firebase\":{\"apiKey\":\"$(json_escape "$fb_key")\",\"authDomain\":\"$(json_escape "$fb_domain")\",\"projectId\":\"$(json_escape "$fb_project")\",\"appId\":\"$(json_escape "$fb_app")\",\"messagingSenderId\":\"$(json_escape "$fb_sender")\"}"
fi

printf '{"apiUrl":"%s","wsUrl":"%s"%s}\n' "$(json_escape "$api_url")" "$(json_escape "$ws_url")" "$firebase_json" \
  > /usr/share/nginx/html/config.json

connect="'self'"
api_origin="$(origin_of "$api_url")"
if [ -n "$api_origin" ]; then
  ws_origin="$(printf '%s' "$api_origin" | sed -e 's#^https://#wss://#' -e 's#^http://#ws://#')"
  connect="$connect $api_origin $ws_origin"
else
  # Same-origin API: allow the page's own WebSocket (ws/wss on this host).
  connect="$connect ws: wss:"
fi
ws_origin_override="$(origin_of "$ws_url")"
[ -n "$ws_origin_override" ] && connect="$connect $ws_origin_override"

# Phone sign-in (Firebase Auth + reCAPTCHA) needs Google endpoints; allowed only when configured.
script_src="'self'"
frame_src="'none'"
# Google Fonts (BUG-LIVE-005) are part of the base policy (SERVICES_SPEC P9a).
style_src="'self' 'unsafe-inline' https://fonts.googleapis.com"
if [ -n "$fb_key" ]; then
  connect="$connect https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.google.com/recaptcha/ https://www.recaptcha.net"
  script_src="'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net/recaptcha/"
  style_src="$style_src https://www.gstatic.com/recaptcha/"
  frame_src="https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/"
fi

cat > "$conf_dir/runtime.conf" <<CONF
set \$archflux_csp "default-src 'self'; script-src $script_src; frame-src $frame_src; style-src $style_src; img-src 'self' data: blob:; connect-src $connect; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
CONF

if [ -z "$api_upstream" ]; then
  echo "# API_UPSTREAM unset: separate topology, no API proxy." > "$conf_dir/api-proxy.conf"
  exit 0
fi

# Integrated topology. Runtime DNS (variable + Docker's embedded resolver) so
# nginx boots and self-heals across API restarts instead of failing on
# "host not found in upstream".
cat > "$conf_dir/api-proxy.conf" <<CONF
resolver 127.0.0.11 valid=10s ipv6=off;
set \$api_backend $api_upstream;

# Forward the browser-visible host:port (\$http_host), not the container's, so
# the API builds correct OAuth redirect URIs (Tomcat RemoteIpValve).
# Behind a TLS-terminating proxy (AWS: Caddy) the browser scheme arrives as
# X-Forwarded-Proto; pass https through so redirects stay https (SVC-G24).
set \$archflux_fwd_proto \$scheme;
if (\$http_x_forwarded_proto = https) { set \$archflux_fwd_proto https; }
set \$archflux_fwd_port 80;
if (\$archflux_fwd_proto = https) { set \$archflux_fwd_port 443; }
if (\$http_host ~ ":([0-9]+)\$") { set \$archflux_fwd_port \$1; }

location /api/ {
  proxy_pass \$api_backend;
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$archflux_fwd_proto;
  proxy_set_header X-Forwarded-Host \$http_host;
  proxy_set_header X-Forwarded-Port \$archflux_fwd_port;
  proxy_connect_timeout 5s;
  proxy_read_timeout 30s;
  # API enforces its own ~1 MB cap (typed 413); leave headroom here.
  client_max_body_size 2m;
}

location /ws {
  proxy_pass \$api_backend;
  proxy_http_version 1.1;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$archflux_fwd_proto;
  proxy_read_timeout 3600s;
}

# OAuth2 / SAML browser redirects are served by Spring Security outside /api.
location ~ ^/(oauth2|login/oauth2|saml2|login/saml2)/ {
  proxy_pass \$api_backend;
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$archflux_fwd_proto;
  proxy_set_header X-Forwarded-Host \$http_host;
  proxy_set_header X-Forwarded-Port \$archflux_fwd_port;
}
CONF
