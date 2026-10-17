# ArchFlux — Operations Runbooks (Phase 2)

Copy-pasteable procedures for the on-call operator. All commands assume a
checkout of the repo with `docker compose` available; `COMPOSE_PROJECT`
pins the project when you run a non-default stack
(e.g. `COMPOSE_PROJECT=archflux-phase1`).

Conventions used below:

```bash
export COMPOSE_PROJECT=archflux-phase1   # omit for the default `archflux` project
DC="docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux}"
```

Every procedure records: who ran it, when, correlation IDs observed, and the
outcome (see Incident response at the end).

---

## 1. Database restore

Scripts: `scripts/backup.sh` (pg_dump custom-format `-Fc`) and
`scripts/restore.sh` (pg_restore + verification). RPO ≤ 15 min
(point-in-time backups + WAL on managed hosts), RTO ≤ 4 h (demonstrated in
the quarterly drill). Drill cadence: **restore drill at least quarterly**;
evidence is the automated `BackupRestoreIT` (CI) plus a manual drill log.

### 1a. Take a backup

```bash
scripts/backup.sh
# ./backups/archflux-20261016-034500.dump  (location + byte size printed)

# Non-default project, or archival copy:
COMPOSE_PROJECT=archflux-phase1 scripts/backup.sh
BACKUP_GZIP=1 scripts/backup.sh            # additionally gzip -9 the artifact
BACKUP_DIR=/var/backups/archflux scripts/backup.sh
```

Verify the artifact lists cleanly before trusting it:

```bash
docker compose -f compose.yml -p archflux-phase1 exec -T db \
  pg_restore --list ./backups/archflux-<stamp>.dump | head
```

Store backups **outside the primary database failure domain** (object
storage / separate volume). Never keep the only copy on the db host.

### 1b. Restore (drill or recovery)

```bash
# 1. Restore into a SCRATCH database first — never drill on live data:
COMPOSE_PROJECT=archflux-phase1 scripts/restore.sh --yes \
  --db archflux_drill ./backups/archflux-<stamp>.dump \
  --api-base http://localhost:18080

# 2. Spot-check row counts against the source:
docker compose -f compose.yml -p archflux-phase1 exec -T db \
  psql -U archflux -d archflux_drill -c \
  "SELECT 'diagrams:' || COUNT(*) FROM public.diagrams UNION ALL \
   SELECT 'users:' || COUNT(*) FROM public.users;"

# 3. Fail over only when the drill database checks out (maintenance window):
COMPOSE_PROJECT=archflux-phase1 scripts/restore.sh --yes \
  --db archflux ./backups/archflux-<stamp>.dump.gz --force \
  --api-base http://localhost:18080
docker compose -f compose.yml -p archflux-phase1 restart server
curl -s http://localhost:18080/api/ready   # {"ready":true}
```

Safety rules enforced by the script:

- `--yes` is mandatory; without it the script refuses to run.
- Restoring over a **non-empty** database requires `--force` (otherwise it
  aborts). The target is dropped/recreated (`DROP SCHEMA public CASCADE`)
  only in that path.
- Post-restore verification prints per-table counts and probes
  `/api/ready` through the passed API base; a not-ready API fails the run.

### 1c. Point-in-time recovery (managed Postgres)

Backups above are snapshots, not WAL archives. On a managed host with
continuous archiving, prefer the provider's point-in-time restore to the
closest timestamp **before** the incident, then replay the application-level
check from 1b (row counts + `/api/ready`).

---

## 2. Migration rollback strategy

**Policy: forward-fix only. Never write backward (down) migrations.**

- Applied migrations are immutable (Flyway checksums). A bad migration is
  fixed with a new `Vn+1__...sql` that repairs the schema/data, never by
  editing the applied file.
- Use **expand/contract** for zero-downtime changes: first deploy adds the
  new column/table alongside the old (expand, nullable or backfilled), the
  next release moves readers/writers over, a later release drops the old
  artifact (contract).
- If Flyway reports a checksum failure, someone edited an applied
  migration: restore the file from git, then forward-fix.

```bash
# Inspect what Flyway did at boot:
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} logs server | grep -i flyway

# Failed migration left the DB half-migrated? Repair the history table, then fix forward:
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} exec -T db \
  psql -U archflux -d archflux -c "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank;"
# Mark the failed row resolved ONLY after the forward-fix Vn+1 is in the image,
# then restart the server so Flyway retries from a clean history.
```

Readiness fails (`/api/ready` → 503) while the schema is behind the
server's migrations — treat that as not-ready, not as a traffic-serving state.

---

## 3. JWT / API-token rotation

`JWT_SECRET` signs user JWTs; `API_TOKEN` is the service credential accepted
only on `POST /api/v1/sync/webhook/git`. Rotation procedure (zero downtime):

1. Set `JWT_PREV_SECRET` to the **old** `JWT_SECRET` value (the server
   accepts the previous HS256 secret during rotation) and set `JWT_SECRET`
   to the new value.
2. Restart/redeploy the server; confirm `/api/health` → UP.
3. Existing sessions stay valid (previous secret accepted); new tokens mint
   with the new secret. After the longest token TTL has elapsed, unset
   `JWT_PREV_SECRET` and redeploy.
4. For `API_TOKEN`: add the new token to webhook senders, switch the server
   env, restart, then revoke the old token at the sender.

```bash
# Emergency revocation (suspected leak) — invalidates ALL sessions now:
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} exec -T redis redis-cli FLUSHDB
# then rotate JWT_SECRET as above and restart the server.
```

---

## 4. Redis loss (sessions / magic links)

Impact: Redis holds server-side sessions and magic-link tokens only
(durable state — diagrams, revisions, webhook dedup — lives in Postgres).
After Redis data loss or an extended outage:

- Users are logged out (session lookup misses) and must log in again
  (magic-link or OAuth). No diagram data is lost.
- In-flight magic-link emails fail closed (single-use, short-lived tokens
  are gone) — users request a fresh link.

Recovery:

```bash
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} ps redis
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} exec -T redis redis-cli ping  # PONG
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} up -d redis
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} logs server | grep -i -m5 redis
curl -s http://localhost:18080/api/health   # {"status":"UP"}
```

If `PONG` fails after restart, inspect memory/eviction (`INFO memory`,
`CONFIG GET maxmemory*`) — OOM kills are the usual cause.

---

## 5. Provider disconnect (OAuth env removal + placeholder behavior)

Removing provider credentials (or never setting them) returns the server to
placeholder mode: it boots normally, provider buttons fail at the provider
with a configuration error, and magic-link/guest login keep working.
Nothing crashes; no migration or restart beyond the server is needed.

```bash
# Disconnect GitHub (example): unset GITHUB_CLIENT_ID/SECRET, restart server.
# Verify placeholder behavior — server UP, provider path fails closed:
curl -s http://localhost:18080/api/health   # {"status":"UP"}
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:18080/oauth2/authorization/github  # 302 to provider (fails there, not here)
```

Stored provider access tokens (if any) must be revoked at the provider and
deleted server-side on disconnect; rotate `JWT_SECRET` per §3 if token
material may have leaked. Never commit provider secrets to the repo —
secret manager only.

---

## 6. Webhook replay

Failed webhook deliveries park in a terminal-failure/dead-letter state with
a replay endpoint. Replay by delivery ID (idempotent — already-processed
deliveries return success without duplicating work):

```bash
# Inspect the dead-letter depth (see docs/alerts.md for the alert):
#   archflux_webhook_events{status="failed"}  (Prometheus)

# Replay one delivery (service credential; never a user JWT):
curl -s -X POST http://localhost:18080/api/v1/sync/webhook/git/replay \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deliveryId":"<provider-delivery-id>"}'
```

Replay rules: bounded retries with backoff; a delivery that fails
validation (bad HMAC, malformed JSON) is rejected, not retried; duplicate
delivery IDs return success immediately (deduplicated by unique constraint).

---

## 7. Incident response

Severity guide:

| Sev | Meaning | Response |
|-----|---------|----------|
| S1 | Data at risk / writes failing / tenant isolation suspected | Page immediately; freeze deploys; preserve logs + DB snapshot before any fix |
| S2 | Degraded (sync/webhook backlog, elevated 5xx, one dependency down) | Respond within the hour; run the matching runbook above |
| S3 | Cosmetic / single-user / docs | Next-business-day fix |

Comms: acknowledge in the status channel, post 30-min updates for S1/S2,
close with a blameless post-mortem (root cause, detection gap, action items).

Correlation-ID tracing: every API error envelope carries `correlationId`;
server logs carry the same ID on the request line. Trace a user report:

```bash
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} logs server \
  | grep -F "<correlation-id>"
```

What to capture for every incident (attach to the post-mortem):

```bash
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} ps
curl -s http://localhost:18080/api/health; echo
curl -s http://localhost:18080/api/ready; echo
docker compose -f compose.yml -p ${COMPOSE_PROJECT:-archflux} logs --tail=200 server
```
