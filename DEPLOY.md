# ArchFlux — Deploy & Operate (Agent C)

## Topologies

| Mode      | UI              | API             | Postgres              | Redis |
| --------- | --------------- | --------------- | --------------------- | ----- |
| Local dev | `npm run dev` (host Vite, :5173) | host (Spring Boot via IDE/`mvn spring-boot:run`, :3001) or not running | `docker compose up -d db` (:5432 via override) | not required (prod compose only) |
| Prod compose | `web` (nginx, host :8080 → container :80) | `server` (:3001) | `db` (internal only, no published port) | `redis` (internal only, no published ports; service DNS `redis`) |

Local dev keeps hot-reload on the host; only postgres runs in Docker (the
`compose.override.yml` publishes it). Prod compose runs all four services;
`compose.override.yml` must be skipped so the DB stays off the host network.

## Local dev

```bash
cp .env.example .env          # then set API_TOKEN / POSTGRES_PASSWORD
docker compose up -d db       # override publishes :5432 for host access
docker compose ps             # db must be healthy
npm run dev                   # Vite UI on http://localhost:5173
```

Direct postgres: `psql "host=localhost port=5432 dbname=archflux user=archflux"`.
For a host-run API, schema/migrations follow `db/` docs (`V1__init.sql`, then
`roles.sql`); the automated Flyway path below applies to prod compose, where
the server boots in Docker.

## Database bootstrap (automated path — default for fresh volumes)

Fresh `docker compose -f compose.yml up` needs NO manual psql. In order:

1. **Role self-provisioning.** On first init only (empty data dir), the `db`
   entrypoint runs `docker/db-init/01-roles.sh` (mounted read-only at
   `/docker-entrypoint-initdb.d`). It creates the app role
   (`DB_APP_USER`, default `archflux_app`) idempotently, applies
   schema-level posture (`GRANT USAGE` / `REVOKE CREATE ON SCHEMA public`),
   grants DML on any tables already present (none yet on a fresh volume —
   the `NOTICE … skipping` lines in `logs db` are expected), and — critically —
   sets `ALTER DEFAULT PRIVILEGES` for the owner role so tables/sequences
   Flyway creates later automatically grant least-privilege access to the app role.
2. **Automated migration.** The server boots and Flyway migrates **as the
   owner** (`SPRING_FLYWAY_USER/PASSWORD` = `POSTGRES_*` in compose.yml), so
   `pgcrypto`/`citext` extensions install and `V1…Vn` apply. No operator step.
3. **Least-privilege runtime.** The API serves traffic as `archflux_app`
   (`SPRING_DATASOURCE_USERNAME/PASSWORD` = `DB_APP_*`); the app role holds
   DML only — no DDL, no schema `CREATE`.

```bash
cp .env.example .env          # fill REAL secrets (secret manager in real prod)
docker compose -f compose.yml up -d --build
docker compose -f compose.yml logs db      # 01-roles.sh provisioning + expected pre-migration NOTICEs
docker compose -f compose.yml logs server  # Flyway migration bs version applied
curl -s http://localhost:8080/api/ready     # {"ready":true} once V1 tables exist
```

`GET /api/ready` reports `{"ready":true}` only after the tables exist — if it
returns `503 {"ready":false,"missing":[…]}`, migrations haven't completed
(see failure modes below).

### Migration posture (read before prod)

Phase 1 runs migrations as the database **owner** because `CREATE EXTENSION`
(pgcrypto, citext) requires owner/superuser and `V1__init.sql` fails fast
without them. The app itself never runs as owner. **Future tightening:**
introduce a dedicated migrator role (DDL without superuser, extensions
pre-installed by the host admin) and point `SPRING_FLYWAY_*` at it — tracked
as deployment follow-up, not Phase 1 scope.

### Manual psql path (fallback / operator section)

Keep this for pre-existing volumes (the init script runs ONLY on an empty
data dir — it never re-runs on `restart`/`up` against old `pgdata`) and for
re-applying grants after out-of-band DDL. This is the fallback, not the
default:

```bash
# Schema (re-runnable) + least-privilege roles:
docker compose -f compose.yml exec -T db psql -U archflux -d archflux \
  -v ON_ERROR_STOP=1 < db/migrations/V1__init.sql
psql "host=localhost port=${POSTGRES_PORT:-5432} dbname=archflux user=archflux" \
  -v ON_ERROR_STOP=1 \
  -v APP_PASSWORD='<archflux_app password>' \
  -v MIGRATOR_PASSWORD='<migrator password>' \
  -f db/roles.sql
# Dev seed (local/dev ONLY, never staging/prod):
docker compose exec -T db psql -U archflux -d archflux \
  -v ON_ERROR_STOP=1 < db/seed.dev.sql
```

To force a from-scratch re-init (DESTROYS all data): 
`docker compose -f compose.yml down -v && docker compose -f compose.yml up -d --build`.

## Prod compose bring-up

```bash
cp .env.example .env          # fill REAL secrets (secret manager in real prod)
docker compose -f compose.yml config --quiet   # validate (no override)
docker compose -f compose.yml up -d --build
docker compose -f compose.yml ps               # db healthy; redis running; server healthy; web running
curl -s http://localhost:8080/api/health       # {"status":"UP",...}
curl -s http://localhost:8080/api/ready         # {"ready":true} — DB-backed readiness
curl -s http://localhost:8080/                  # frontend 200 (SPA)
```

Or run it all via `scripts/verify-compose.sh` (isolated `-p archflux-phase1`
project; leaves the stack UP and prints the `down -v` hint — it never
destroys volumes silently).

Frontend API base: same-origin `/api` (nginx → `http://server:3001/`).
Build-time override: `VITE_API_URL=https://api.example.com/api docker compose
-f compose.yml build web`. Runtime override (Phase-2 frontend): `API_URL=...
docker compose -f compose.yml up -d web` regenerates `/config.json`.

## Two-user smoke (Phase 1 exit signal)

A fresh deployment supports two distinct users safely and reliably:

```bash
curl -s http://localhost:8080/api/health  # both users' browsers need {"status":"UP"}
curl -s http://localhost:8080/api/ready   # {"ready":true} — schema migrated
```

1. Open two separate browser contexts (e.g. two profiles / normal + private).
2. In each: complete login (or guest entry) → canvas loads → create/edit a
   diagram → save → reload → content persists.
3. Confirm the contexts hold **distinct** sessions (different
   `archflux:auth_token` / `archflux:session` values in localStorage — no
   shared development identity).
4. Sign out in one context → it lands back on `/login` with its session
   cleared, while the other context keeps working.

Frontend gate coverage for this loop lives in `e2e/auth-session.spec.ts`
(`npx playwright test e2e/auth-session.spec.ts`).

## Environment

| Var | Required | Default (compose) | Purpose |
| --- | -------- | ----------------- | ------- |
| `POSTGRES_DB` | no | `archflux` | DB name |
| `POSTGRES_USER` | no | `archflux` | owner role (Flyway migrations run as this user) |
| `POSTGRES_PASSWORD` | yes (prod) | `dev-postgres-pw` (DEV ONLY) | owner password (also `SPRING_FLYWAY_PASSWORD`) |
| `DB_APP_USER` | no | `archflux_app` | least-privilege runtime role (self-provisioned on fresh volumes) |
| `DB_APP_PASSWORD` | yes (prod) | `dev-app-only` (DEV ONLY) | app role password (runtime datasource + init script) |
| `DATABASE_URL` | yes (prod) | assembled from `POSTGRES_*` vs host `db` | API connection string; prod should use `archflux_app` creds |
| `API_TOKEN` | yes (prod) | `dev-token` (DEV ONLY) | `Authorization: Bearer` token |
| `JWT_SECRET` | yes (prod) | `dev-secret-change-in-production` (DEV ONLY, server default) | JWT signing secret — no usable default; set a strong value in prod |
| `APP_COOKIE_SECURE` | no | `false` (dev) / **`true`** (prod) | secure flag for session cookies — must be `true` wherever https terminates |
| `REDIS_*` | no | none needed | no Redis vars required — server uses service DNS (`REDIS_HOST=redis`, port/db defaults); no published ports |
| `VITE_API_URL` | no | `/api` | frontend API base (build arg + `/config.json`) |
| `WEB_PORT` | no | `8080` | host port for the frontend |
| `SERVER_PORT` | no | `3001` | host port for direct API access |
| `POSTGRES_PORT` | no | `5432` (override only) | host port for direct postgres in dev |
| `NODE_ENV` | no | `production` (`development` in override) | runtime mode |

Secrets only via env. Never baked into images: `.dockerignore` keeps
`.env*` out of the web context; `server/.dockerignore` keeps
`node_modules/dist/tests` out of the API image.

## Health endpoints

- `GET /api/health` → `200 {"status":"UP"}` (liveness; direct `:3001` or via proxy `:8080/api/health`)
- `GET /api/ready` → `200 {"ready":true,"schemaVersion":"<latest applied>"}` once the required tables exist
  (readiness); otherwise `503 {"ready":false,"missing":[…],"reason":…,"schemaVersion":…}` naming the missing
  tables. `schemaVersion` comes from `flyway_schema_history` when Flyway manages the schema, else `"unmanaged"`.
  A version older than the server's migrations means the deployment step did not run — treat as not-ready.
- `GET /` on web → `200` SPA shell (`try_files` fallback serves deep links)
- `GET /config.json` → `200 {"apiUrl":"/api"}` (`Cache-Control: no-store`)
- `redis` exposes no HTTP surface and no host ports — check it via
  `docker compose ps` / `exec redis redis-cli ping` (expect `PONG`).

Unauthenticated API example: `curl -i http://localhost:8080/api/v1/diagrams`
→ `401 {"error":{"code":"UNAUTHENTICATED",…}}`. User requests authenticate with the `ARCHFLUX_TOKEN`
cookie (set by OAuth/magic-link login) or `Authorization: Bearer <user-JWT>`; the static `API_TOKEN`
is a service credential accepted only on `POST /api/v1/sync/webhook/git` and authenticates nobody.

## SSO (Release D — placeholder by default)

The server boots with DEV-ONLY self-signed SAML material (`server/src/main/resources/sso-dev/`,
CN=archflux-dev-only-NOT-FOR-PRODUCTION) so startup never depends on operator SSO config. The SAML
login path is present but CANNOT authenticate against a real identity provider until you provide:
`SAML_ENTITY_ID`, `SAML_PRIVATE_KEY_LOCATION`, `SAML_CERT_LOCATION`, `SAML_IDP_ENTITY_ID`,
`SAML_IDP_SSO_URL`, `SAML_IDP_SLO_URL`, `SAML_IDP_CERT_LOCATION` (file paths or secret mounts).
OAuth2/OIDC registrations ship the same way: placeholder client ids (`changeme-configure-*`) so the
server boots — GitHub/Google/SSO buttons fail at the provider until real `GITHUB_*` / `GOOGLE_*` /
`OIDC_*` credentials are set. Never mount production key material from the repo —
use the secret manager. Until then, use magic-link or guest login.

## Backup

```bash
docker compose -f compose.yml exec -T db \
  pg_dump -U archflux archflux | gzip > "archflux-$(date +%F).sql.gz"
```

Restore: `gunzip -c <backup> | docker compose -f compose.yml exec -T db \
psql -U archflux -d archflux` (schema must exist; see `db/`).

## Logs

```bash
docker compose -f compose.yml logs -f server   # API logs (no secrets, no stacks to clients)
docker compose -f compose.yml logs -f db        # postgres + 01-roles.sh provisioning lines
docker compose -f compose.yml logs -f redis     # session/presence backing store
docker compose -f compose.yml logs -f web
docker compose -f compose.yml ps                # health status per service
```

## Common failure modes

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `server` stuck `starting`, then `unhealthy` | wrong `DATABASE_URL` / db not healthy | `logs server`; check `API_TOKEN`, `DATABASE_URL`; `ps db` |
| `web` never starts | `depends_on server service_healthy` gate | fix server first; web waits by design |
| `/api/ready` → `503 {"ready":false,"missing":[…]}` | Flyway hasn't migrated (fresh volume, server still booting — or migration failed) | wait for server health, then `logs server` for the Flyway result; on migration error see next row |
| Flyway error in `logs server` (checksum / extension / auth) | edited applied migration; non-owner migrator user; wrong `POSTGRES_*` | never edit applied migrations (new `Vn__` only); keep `SPRING_FLYWAY_*` on the owner until the migrator-role follow-up lands; verify owner creds; managed hosts need extensions pre-installed by the admin |
| `01-roles.sh` grants missing on an old volume | init script runs ONLY on empty data dir | apply `db/roles.sql` manually (fallback section above), or `down -v` + `up` to re-init from scratch (DATA LOSS) |
| `redis` down / restarted (`PONG` fails) | OOM, eviction, or crashed container | `ps redis`; `logs redis`; `up -d redis`; note the server only gates on `service_started`, so a later redis crash surfaces as session/presence errors in `logs server`, not as a deploy gate |
| `/api/*` → transient `502` during server restarts | proxy resolves `server` at request time and re-resolves every 10s | no action; self-heals once server is healthy (`ps` to confirm) |
| Frontend shows blank page on deep link refresh | SPA fallback misconfigured | `try_files ... /index.html` is in `nginx/default.conf`; rebuild web |
| `401` on every API call | missing/wrong `Authorization: Bearer $API_TOKEN` | export the same token the server was started with |
| `429` on `/sync` or `/lint` | per-IP rate bucket | back off; honor `Retry-After` |
| `413` on large saves | >1 MB JSONB body cap | shrink payload; nginx allows 2 MB so the API returns the typed 413 |
| `docker compose up` publishes :5432 unexpectedly | override file auto-merged | prod: always pass `-f compose.yml` explicitly |
| `mvn -f server/pom.xml test` fails in CI | missing Java 21 / Maven Central access | CI uses `setup-java` Temurin 21 (see `ci.yml`); Tests use Testcontainers (needs Docker) |
