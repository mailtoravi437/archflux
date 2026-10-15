# ArchFlux — Deploy & Operate (Agent C)

## Topologies

| Mode      | UI              | API             | Postgres              |
| --------- | --------------- | --------------- | --------------------- |
| Local dev | `npm run dev` (host Vite, :5173) | host (Spring Boot via IDE/`mvn spring-boot:run`, :3001) or not running | `docker compose up -d db` (:5432 via override) |
| Prod compose | `web` (nginx, host :8080 → container :80) | `server` (:3001) | `db` (internal only, no published port) |

Local dev keeps hot-reload on the host; only postgres runs in Docker (the
`compose.override.yml` publishes it). Prod compose runs all three services;
`compose.override.yml` must be skipped so the DB stays off the host network.

## Local dev

```bash
cp .env.example .env          # then set API_TOKEN / POSTGRES_PASSWORD
docker compose up -d db       # override publishes :5432 for host access
docker compose ps             # db must be healthy
npm run dev                   # Vite UI on http://localhost:5173
```

Direct postgres: `psql "host=localhost port=5432 dbname=archflux user=archflux"`.
Apply Agent B's schema per `db/` docs (`V1__init.sql`, then `roles.sql`).

## Database bootstrap (first deploy / fresh volume)

The `db` service ships empty postgres. Before the API can serve traffic,
someone with owner creds applies Agent B's schema (see `db/` docs):

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

`GET /api/ready` reports `{"ready":true}` only after the tables exist — if it
says `database tables missing`, the bootstrap above was skipped.

## Prod compose bring-up

```bash
cp .env.example .env          # fill REAL secrets (secret manager in real prod)
docker compose -f compose.yml config --quiet   # validate (no override)
docker compose -f compose.yml up -d --build
docker compose -f compose.yml ps               # all healthy
curl -s http://localhost:8080/api/health       # {"status":"UP",...}
curl -s http://localhost:8080/api/ready         # DB-backed readiness
curl -s http://localhost:8080/                  # frontend 200 (SPA)
```

Frontend API base: same-origin `/api` (nginx → `http://server:3001/`).
Build-time override: `VITE_API_URL=https://api.example.com/api docker compose
-f compose.yml build web`. Runtime override (Phase-2 frontend): `API_URL=...
docker compose -f compose.yml up -d web` regenerates `/config.json`.

## Environment

| Var | Required | Default (compose) | Purpose |
| --- | -------- | ----------------- | ------- |
| `POSTGRES_DB` | no | `archflux` | DB name |
| `POSTGRES_USER` | no | `archflux` | owner role (migrations) |
| `POSTGRES_PASSWORD` | yes (prod) | `dev-postgres-pw` (DEV ONLY) | owner password |
| `DATABASE_URL` | yes (prod) | assembled from `POSTGRES_*` vs host `db` | API connection string; prod should use `archflux_app` creds |
| `API_TOKEN` | yes (prod) | `dev-token` (DEV ONLY) | `Authorization: Bearer` token |
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
- `GET /api/ready` → `200` only when the DB is reachable (readiness)
- `GET /` on web → `200` SPA shell (`try_files` fallback serves deep links)
- `GET /config.json` → `200 {"apiUrl":"/api"}` (`Cache-Control: no-store`)

Unauthenticated API example: `curl -i http://localhost:8080/api/v1/diagrams`
→ `401`. Authenticated: `curl -H "Authorization: Bearer $API_TOKEN" ...` → `200`.

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
docker compose -f compose.yml logs -f db
docker compose -f compose.yml logs -f web
docker compose -f compose.yml ps                # health status per service
```

## Common failure modes

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `server` stuck `starting`, then `unhealthy` | wrong `DATABASE_URL` / db not healthy | `logs server`; check `API_TOKEN`, `DATABASE_URL`; `ps db` |
| `web` never starts | `depends_on server service_healthy` gate | fix server first; web waits by design |
| `/api/*` → transient `502` during server restarts | proxy resolves `server` at request time and re-resolves every 10s | no action; self-heals once server is healthy (`ps` to confirm) |
| Frontend shows blank page on deep link refresh | SPA fallback misconfigured | `try_files ... /index.html` is in `nginx/default.conf`; rebuild web |
| `401` on every API call | missing/wrong `Authorization: Bearer $API_TOKEN` | export the same token the server was started with |
| `429` on `/sync` or `/lint` | per-IP rate bucket | back off; honor `Retry-After` |
| `413` on large saves | >1 MB JSONB body cap | shrink payload; nginx allows 2 MB so the API returns the typed 413 |
| `docker compose up` publishes :5432 unexpectedly | override file auto-merged | prod: always pass `-f compose.yml` explicitly |
| `mvn -f server/pom.xml test` fails in CI | missing Java 21 / Maven Central access | CI uses `setup-java` Temurin 21 (see `ci.yml`); Tests use Testcontainers (needs Docker) |
