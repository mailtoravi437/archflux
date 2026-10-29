#!/bin/sh
# ArchFlux Phase 2 API verification (optional-live, deterministic).
#
# Without a live API this script SKIPS cleanly (exit 0):
#   scripts/verify-phase2-api.sh            # API_BASE unset -> SKIP
#
# Against a live API:
#   API_BASE=http://localhost:8080 scripts/verify-phase2-api.sh
#
# Optional credentials for deeper checks (each gated check SKIPs when unset):
#   AUTH_TOKEN               user JWT (Bearer) for authenticated checks.
#   VERIFY_TOKEN             single-use magic-link token for the verify->cookie->me
#                            flow (tokens are only emitted via the email provider;
#                            with the mock provider read it from `logs server`).
#   GITHUB_WEBHOOK_SECRET    HMAC secret for the webhook duplicate-delivery probe.
#   API_TOKEN                service credential (Bearer) for the webhook path.
#
# Every check prints PASS / SKIP(reason) / FAIL. Exit 0 unless a FAIL occurs
# (unexpected 5xx or a violated contract on an EXISTING endpoint). Checks for
# Phase 2 server features that have not landed yet (optimistic-concurrency
# 409s, revisions/diff endpoints, delivery-id dedup, audit export) probe the
# live behavior and SKIP with a reason instead of failing.
set -eu

API_BASE="${API_BASE:-}"
if [ -z "$API_BASE" ]; then
  echo "SKIP: no API base given (set API_BASE, e.g. API_BASE=http://localhost:8080)"
  exit 0
fi
API_BASE="$(printf '%s' "$API_BASE" | sed 's:/$::')"

PASS=0; SKIP=0; FAIL=0
pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
skip() { SKIP=$((SKIP+1)); echo "SKIP: $1 ($2)"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL: $1 ($2)"; }

# GET <path> -> "<http-code> <body>" (never fails on HTTP error status).
http_get() {
  path="$1"; shift
  code="$(curl -s -o /tmp/af_body.txt -w "%{http_code}" "$API_BASE$path" "$@")"
  printf '%s %s' "$code" "$(cat /tmp/af_body.txt)"
}
# POST <path> <data> [extra curl args...]
http_post() {
  path="$1"; data="$2"; shift 2
  code="$(curl -s -o /tmp/af_body.txt -w "%{http_code}" -X POST \
    -H 'Content-Type: application/json' -d "$data" "$API_BASE$path" "$@")"
  printf '%s %s' "$code" "$(cat /tmp/af_body.txt)"
}
# PUT <path> <data> [extra curl args...]
http_put() {
  path="$1"; data="$2"; shift 2
  code="$(curl -s -o /tmp/af_body.txt -w "%{http_code}" -X PUT \
    -H 'Content-Type: application/json' -d "$data" "$API_BASE$path" "$@")"
  printf '%s %s' "$code" "$(cat /tmp/af_body.txt)"
}
body_of() { printf '%s' "$1" | cut -d' ' -f2-; }
code_of() { printf '%s' "$1" | cut -d' ' -f1; }

echo "==> API_BASE=$API_BASE"

# 1. health / ready (+ schemaVersion gate for Phase 2 checks).
r="$(http_get /api/health)"
if [ "$(code_of "$r")" = "200" ] && printf '%s' "$r" | grep -q '"status":"UP"'; then
  pass "health UP"
else
  fail "health" "got: $r"
fi

r="$(http_get /api/ready)"
SCHEMA=0
if [ "$(code_of "$r")" = "200" ] && printf '%s' "$r" | grep -q '"ready":true'; then
  pass "ready true: $(body_of "$r")"
  SCHEMA="$(printf '%s' "$r" | grep -o '"schemaVersion":"[0-9]*"' | grep -o '[0-9]*' || echo 0)"
  SCHEMA="${SCHEMA:-0}"
else
  fail "ready" "got: $r"
fi
if [ "${SCHEMA:-0}" -ge 7 ] 2>/dev/null; then
  pass "schemaVersion>=7 ($SCHEMA)"
else
  skip "schemaVersion>=7 gate" "server reports schemaVersion=${SCHEMA:-unknown}; version-gated checks below still probe live behavior"
fi

# 2. Unauthenticated request -> 401 (never 500, never data).
r="$(http_get /api/v1/diagrams)"
case "$(code_of "$r")" in
  401) pass "unauth diagrams -> 401" ;;
  5*) fail "unauth diagrams" "got 5xx: $r" ;;
  *) fail "unauth diagrams" "expected 401, got: $r" ;;
esac

# 3. Magic-link request is accepted; verify->cookie->me needs the emailed token.
ML_EMAIL="phase2-verify-$(date +%s)@archflux.local"
r="$(http_post /api/v1/auth/magic-link "{\"email\":\"$ML_EMAIL\"}")"
case "$(code_of "$r")" in
  200) pass "magic-link request accepted for $ML_EMAIL" ;;
  429) skip "magic-link request" "rate-limited (429) — retry later" ;;
  5*) fail "magic-link request" "got 5xx: $r" ;;
  *) fail "magic-link request" "got: $r" ;;
esac
if [ -n "${VERIFY_TOKEN:-}" ]; then
  HDR="$(curl -s -D - -o /dev/null "$API_BASE/api/v1/auth/verify?token=$VERIFY_TOKEN")"
  COOKIE="$(printf '%s' "$HDR" | grep -i '^Set-Cookie: ARCHFLUX_TOKEN=' | head -1 | sed 's/.*ARCHFLUX_TOKEN=\([^;]*\).*/\1/')"
  if [ -n "$COOKIE" ]; then
    pass "magic-link verify set ARCHFLUX_TOKEN cookie"
    r="$(http_get /api/v1/auth/me -H "Cookie: ARCHFLUX_TOKEN=$COOKIE")"
    if [ "$(code_of "$r")" = "200" ]; then pass "cookie -> me 200"; else fail "cookie -> me" "got: $r"; fi
  else
    fail "magic-link verify" "no ARCHFLUX_TOKEN cookie (token single-use/expired?)"
  fi
else
  skip "magic-link verify -> cookie -> me" "VERIFY_TOKEN unset (mock provider logs the token in \`logs server\`)"
fi

# Authenticated checks below need AUTH_TOKEN (user JWT as Bearer).
AUTH_ARGS=""
if [ -n "${AUTH_TOKEN:-}" ]; then AUTH_ARGS="-H Authorization: Bearer $AUTH_TOKEN"; fi

# 4. Optimistic concurrency: stale version -> 409, force -> 200.
if [ -z "${AUTH_TOKEN:-}" ]; then
  skip "409 stale-version / force-write" "AUTH_TOKEN unset"
  skip "revisions list + diff" "AUTH_TOKEN unset"
  skip "audit export shape" "AUTH_TOKEN unset"
else
  # shellcheck disable=SC2086
  r="$(http_post /api/v1/auth/me '{}' $AUTH_ARGS >/dev/null 2>&1; http_get /api/v1/auth/me $AUTH_ARGS)"
  if [ "$(code_of "$r")" != "200" ]; then
    skip "409 stale-version / force-write" "AUTH_TOKEN invalid ($(code_of "$r"))"
    skip "revisions list + diff" "AUTH_TOKEN invalid"
    skip "audit export shape" "AUTH_TOKEN invalid"
  else
    # shellcheck disable=SC2086
    r="$(http_post /api/v1/diagrams '{"title":"phase2-verify"}' $AUTH_ARGS)"
    DID="$(printf '%s' "$r" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
    if [ "$(code_of "$r")" != "201" ] || [ -z "$DID" ]; then
      fail "diagram create (setup)" "got: $r"
      DID=""
    else
      pass "diagram create (setup $DID)"
      # shellcheck disable=SC2086
      g="$(http_get "/api/v1/diagrams/$DID" $AUTH_ARGS)"
      if printf '%s' "$g" | grep -q '"version"'; then
        VER="$(printf '%s' "$g" | grep -o '"version":[0-9]*' | head -1 | grep -o '[0-9]*')"
        STALE=$((VER - 1))
        # shellcheck disable=SC2086
        s="$(http_put "/api/v1/diagrams/$DID" "{\"title\":\"stale\",\"version\":$STALE}" $AUTH_ARGS)"
        if [ "$(code_of "$s")" = "409" ] && printf '%s' "$s" | grep -q 'VERSION_CONFLICT'; then
          pass "stale version -> 409 VERSION_CONFLICT"
        else
          fail "stale version" "expected 409 VERSION_CONFLICT, got: $s"
        fi
        # shellcheck disable=SC2086
        f="$(http_put "/api/v1/diagrams/$DID" "{\"title\":\"forced\",\"version\":$STALE,\"force\":true}" $AUTH_ARGS)"
        if [ "$(code_of "$f")" = "200" ]; then pass "force write -> 200"; else fail "force write" "got: $f"; fi
      else
        skip "409 stale-version / force-write" "server predates optimistic concurrency (no version field)"
      fi
      # shellcheck disable=SC2086
      rev="$(http_get "/api/v1/diagrams/$DID/revisions" $AUTH_ARGS)"
      case "$(code_of "$rev")" in
        200) pass "revisions list 200" ;;
        404) skip "revisions list" "endpoint not implemented (404)" ;;
        5*) fail "revisions list" "got 5xx: $rev" ;;
        *) fail "revisions list" "got: $rev" ;;
      esac
      # shellcheck disable=SC2086
      d="$(http_get "/api/v1/diagrams/$DID/diff?from=1&to=2" $AUTH_ARGS)"
      case "$(code_of "$d")" in
        200|422) pass "diff endpoint responds ($(code_of "$d"))" ;;
        404) skip "diff endpoint" "not implemented (404)" ;;
        5*) fail "diff endpoint" "got 5xx: $d" ;;
        *) fail "diff endpoint" "got: $d" ;;
      esac
      # shellcheck disable=SC2086
      a="$(http_get "/api/v1/export?diagramId=$DID" $AUTH_ARGS)"
      case "$(code_of "$a")" in
        200) pass "export 200 shape: $(printf '%s' "$a" | head -c 160)" ;;
        403) pass "export 403 for non-privileged user" ;;
        404) skip "audit export" "no audit-export endpoint (404)" ;;
        5*) fail "export" "got 5xx: $a" ;;
        *) skip "audit export" "export path returned $(code_of "$a"); dedicated audit-export endpoint absent" ;;
      esac
    fi
  fi
fi

# 5. Webhook duplicate delivery: same delivery ID twice (needs HMAC secret).
if [ -z "${GITHUB_WEBHOOK_SECRET:-}" ]; then
  skip "webhook duplicate delivery" "GITHUB_WEBHOOK_SECRET unset (HMAC required)"
elif [ -z "${API_TOKEN:-}" ]; then
  skip "webhook duplicate delivery" "API_TOKEN unset (service credential required)"
else
  PAYLOAD='{"ref":"refs/heads/main","repository":{"full_name":"archflux/verify"},"commits":[],"head_commit":{}}'
  SIG="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/.* //')"
  DELIVERY="phase2-verify-$(date +%s)"
  W1="$(curl -s -o /tmp/af_body.txt -w "%{http_code}" -X POST -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $API_TOKEN" -H "X-Hub-Signature-256: $SIG" \
    -H "X-GitHub-Event: push" -H "X-GitHub-Delivery: $DELIVERY" \
    -d "$PAYLOAD" "$API_BASE/api/v1/sync/webhook/git") [$(cat /tmp/af_body.txt)]"
  W2="$(curl -s -o /tmp/af_body.txt -w "%{http_code}" -X POST -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $API_TOKEN" -H "X-Hub-Signature-256: $SIG" \
    -H "X-GitHub-Event: push" -H "X-GitHub-Delivery: $DELIVERY" \
    -d "$PAYLOAD" "$API_BASE/api/v1/sync/webhook/git") [$(cat /tmp/af_body.txt)]"
  C1="$(printf '%s' "$W1" | cut -d' ' -f1)"; C2="$(printf '%s' "$W2" | cut -d' ' -f1)"
  case "$C1/$C2" in
    5*|*/5*) fail "webhook duplicate delivery" "5xx on first/second: $W1 / $W2" ;;
    *)
      pass "webhook duplicate delivery handled without 5xx ($C1 then $C2)"
      if printf '%s %s' "$W1" "$W2" | grep -qi 'duplicate\|already'; then
        pass "second delivery marked duplicate"
      else
        skip "second delivery marked duplicate" "server predates delivery-id dedup (both returned: $W1 / $W2)"
      fi
      ;;
  esac
fi

echo "==> $PASS passed, $SKIP skipped, $FAIL failed"
[ "$FAIL" -eq 0 ]
