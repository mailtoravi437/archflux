# ArchFlux Backend Track — Implementation Plan

ArchFlux is frontend-only today (React + localStorage). This plan adds a real backend, database,
and deployment. Stack: **Spring Boot 3 + Java 21 + JPA/Hibernate (validate-only) + PostgreSQL 17**
for the backend (matches enterprise standards; same REST contract below), node/vite for the
frontend build. DDL lives exclusively in `db/` (manual `psql` migrate, DBA-owned); the server never
auto-creates schema (`ddl-auto: validate`).

## Phase 1 — Parallel implementation (this round, 3 agents, no overlapping files)

### Agent A — Backend API (`backend/`, owner of everything under `backend/`)
Spring Boot 3.5 + Java 21 + Spring Web / Validation / Data JPA + PostgreSQL driver. Maven wrapper
or system `mvn`; `mvn test` green required. Endpoints (same paths as before):
- `GET /api/health`, `GET /api/ready` (ready checks DB)
- Diagrams: `GET /api/v1/diagrams` (paginated, default 20 max 50), `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id`
- Nested: `GET|POST /api/v1/diagrams/:id/checkpoints`, `GET|POST /api/v1/diagrams/:id/threads`, `POST /api/v1/diagrams/:id/threads/:tid/replies`
- Deterministic engines (pure functions, unit-tested, NO mock data):
  - `POST /api/v1/lint` `{nodes[], edges[]}` → `{orphans[], dangling[], ambiguous[], ok}` — same rules as the canvas linter (degree 0, unterminated, unlabeled inter-service)
  - `POST /api/v1/sync` `{diagram, upstream}` → `{status, driftEvaluated, nodesSynced, edgesSynced, commitSha, timestamp}` — idempotent diff staging
  - `GET /api/v1/export?diagramId=` → `.arch` JSON payload
- Auth: `Authorization: Bearer <token>`, `API_TOKEN` env (dev default logged at boot, prod fails fast if unset); 401 unauthenticated, 403 forbidden; request user scoping on all diagram queries. Dev single-token identity is fixed UUID `11111111-1111-1111-1111-111111111111` (see `backend/src/config.ts` DEV_USER_UUID), seeded by `backend/db/seed.dev.sql` as `dev@archflux.local`.
- Validation: DTO boundary checks, 1 MB JSONB body cap → 413, typed 4xx JSON errors, generic 5xx in prod; never log secrets; no stack traces to clients.
- Rate limit: in-memory per-IP bucket on `/sync` and `/lint` (fail-open in dev); `Retry-After` on 429.
- Tests: JUnit 5 + MockMvc slice tests + pure unit tests for lint/sync services; one Testcontainers postgres repository round-trip. `mvn test` green required.
- No secret logging; `backend/.dockerignore` excludes `target/`.

### Agent B — Database (`db/`, owner of `db/` + compose db service definition advice)
- `backend/src/main/resources/db/migration/V1__init.sql`: `users(id uuid pk, email citext unique, name, role, created_at)`, `diagrams(id uuid pk, owner_id fk, title, tags text[], graph jsonb NOT NULL DEFAULT '{}', created_at, updated_at)`, `checkpoints(id uuid pk, diagram_id fk, title, meta, snapshot jsonb, created_at)`, `threads(id uuid pk, diagram_id fk, author, pinned_to, text, resolved bool, created_at)`, `replies(id uuid pk, thread_id fk, author, text, created_at)`, `sync_log(id bigserial pk, diagram_id fk, actor, commit_sha, delta, created_at)`.
- Indexes from query patterns: `diagrams(owner_id, updated_at DESC)`, `checkpoints(diagram_id, created_at DESC)`, `threads(diagram_id)`, `replies(thread_id)`, `sync_log(diagram_id, created_at DESC)`; GIN on `diagrams.tags`.
- Least-privilege: `archflux_app` role = DML only (no DDL); migrator uses owner creds; separate passwords; `pgcrypto` for `gen_random_uuid()`.
- Re-runnable guards (`to_regclass` checks), never edit V1 after applied.
- Verify: `psql ON_ERROR_STOP=1` applies V1 on an empty scratch DB from scratch; re-run idempotent; `EXPLAIN` the 5 hot queries shows index usage. Use the local Docker postgres for this.

### Agent C — Deployment (`frontend/Dockerfile`, `backend/Dockerfile` owned by A — C owns compose/CI/env)
- `compose.yml`: `db` (postgres:17-alpine, named volume, `HEALTHCHECK pg_isready`, `start-period` ≥ 20s), `server` (build `backend/`, `DATABASE_URL`, `API_TOKEN` from env, `depends_on db condition: service_healthy`, exec-form entrypoint, `init: true`, `stop_grace_period: 30s`), `web` (nginx:alpine serving `dist/`, `/api` reverse-proxy to `server:3001`, SPA fallback, `HEALTHCHECK` on `/`, no baked-in hosts).
- `.dockerignore` files per context; `.env.example` (DATABASE_URL, API_TOKEN, POSTGRES_PASSWORD — no real secrets); everything parametrized, no `localhost` baked into images (dev override via `compose.override.yml` optional).
- `.github/workflows/ci.yml`: frontend `npm run build` + `lint`, server `mvn -f backend/pom.xml test`, `docker compose config --quiet`.
- Verify: `docker compose config --quiet` passes; `docker compose up -d --build` → all healthy, `GET /api/health`, frontend served, `/api` proxied.

## Coordination rules (avoid merge conflicts)
- Agent A owns `backend/**` only. Agent B owns `db/**` only (may READ server code, never edit). Agent C owns `compose.yml`, `frontend/Dockerfile`, `.dockerignore`s, `.env.example`, `.github/**` (may read both, never edit their files; server Dockerfile content is specified by A — C wires it, if A hasn't created it yet C creates a minimal one to A's spec and A keeps ownership after).
- Shared contract both A and B implement against: table/column names in §Agent B; request/response shapes in §Agent A. On conflict, backend-expert/database-expert standards win.

## Phase 2 — Frontend wiring (next round, NOT now)
`ApiClient` with local-first fallback (offline → localStorage, online → sync), token storage, base URL via `VITE_API_URL`. Explicitly out of scope for Phase 1 so agents stay conflict-free.

## Verification (Phase 1 done when)
- `npm run build` + `npm run lint` clean; `mvn -f backend/pom.xml test` green; migration applies clean on scratch DB; `docker compose up` healthy end-to-end with a real `POST /api/v1/lint` + diagram CRUD round-trip.
