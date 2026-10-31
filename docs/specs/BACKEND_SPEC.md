# ArchFlux Backend Specification

> **Version:** 1.4.0 | **Last Updated:** 2026-10-24 | **Status:** ✅ Current
> **Part of:** [Master Spec](../../SPEC.md) | **Maintenance:** [Protocol](../../SPEC.md#spec-maintenance-protocol)
> **Governing contract:** [PRODUCT_SPEC Appendix A](PRODUCT_SPEC.md#appendix-a-platform-contracts-moved-from-productization_spec-v300-2026-10-25) — see
> [Productization (v3.0.0) Deltas](#productization-v300--backend-deltas) below.

## Repository Overview
**Artifact:** `com.archflux:archflux-server:1.0.0`
**Type:** Spring Boot 3.5 REST API + WebSocket (STOMP)
**Language:** Java 21
**Build:** Maven
**Database:** PostgreSQL 17 + Flyway migrations
**Architecture:** Layered (Controller → Service → Repository → JPA)
**Service directory:** `backend/` (archflux-api) — independently built/deployed, see [SERVICES_SPEC](SERVICES_SPEC.md)

> **Cross-ref:** See [Frontend Spec](FRONTEND_SPEC.md) for the React client consuming these APIs.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Spring Boot | 3.5.16 |
| Language | Java | 21 |
| ORM | Spring Data JPA / Hibernate | 6.6.x |
| Database | PostgreSQL | 17 |
| Migrations | Flyway | 11.x |
| Security | Spring Security 6 | 6.4.x |
| OAuth2 | Spring OAuth2 Client/Resource Server | 6.4.x |
| SAML2 | Spring Security SAML2 SP | 6.4.x |
| JWT | JJWT | 0.12.5 |
| WebSocket | Spring WebSocket + STOMP | 6.4.x |
| Sessions | Spring Session + Redis | 3.2.x |
| OpenAPI | springdoc | 2.6.0 |
| Email | Spring Mail + SendGrid | 4.10.3 |
| Test | Testcontainers (PostgreSQL) | 1.20.x |

---

## Project Structure

```
backend/src/main/java/com/archflux/
├── config/              # Spring configuration
│   ├── SecurityConfig.java      # OAuth2/SAML2/JWT + CORS
│   ├── WebSocketConfig.java     # STOMP broker + SockJS
│   └── CorsConfig.java
├── auth/                # Authentication services
│   ├── JwtService.java          # HS256 token gen/validation
│   ├── MagicLinkService.java    # Email magic links (Redis-backed)
│   ├── UserSessionService.java  # Redis session management
│   └── EmailService.java        # SendGrid/Mock provider
├── domain/              # JPA Entities
│   ├── User.java
│   ├── Diagram.java
│   ├── Checkpoint.java
│   ├── ReviewThread.java
│   ├── Reply.java
│   ├── SyncLog.java
│   └── [types] (OtherStringUserType, etc.)
├── repo/                # Spring Data Repositories
│   ├── UserRepository.java
│   ├── DiagramRepository.java
│   ├── CheckpointRepository.java
│   ├── ThreadRepository.java
│   ├── ReplyRepository.java
│   └── SyncLogRepository.java
├── service/             # Business logic
│   ├── DiagramService.java      # CRUD + canonical graph merge
│   ├── CheckpointService.java   # Version snapshots + restore
│   ├── ThreadService.java       # Review threads + replies
│   ├── SyncService.java         # Canonical SHA + idempotent sync
│   ├── LintService.java         # Architecture rules engine
│   └── SchemaReadinessService.java # Flyway readiness gate
├── web/                 # REST Controllers
│   ├── AuthController.java      # OAuth2/SAML/Magic Link flows
│   ├── DiagramController.java   # Diagram CRUD + checkpoints + branches
│   ├── SyncController.java      # Git webhook + idempotent sync
│   ├── LintController.java      # Architecture linting
│   ├── ExportController.java    # .arch export
│   └── HealthController.java    # /health, /ready
├── security/            # Security helpers
│   ├── RequestUser.java         # Current user extraction
│   ├── AuthFilter.java          # Dev-token Bearer auth
│   └── RateLimitFilter.java
├── util/                # Utilities
│   ├── JsonCanonicals.java      # Deterministic JSON ordering
│   └── LikeEscape.java          # Safe SQL LIKE patterns
└── web/dto/             # Request/Response DTOs
```

---

## Database Schema (Flyway Migrations)

Single source: `backend/src/main/resources/db/migration/` (the old root `db/migrations/` copy is removed —
SVC-G11). Tests apply the same classpath files.

| Migration | Description |
|-----------|-------------|
| `V1__init.sql` | Core tables: users, diagrams, checkpoints, threads, replies, sync_log + `updated_at` trigger + base indexes (incl. GIN on tags) |
| `V2__additional_indexes.sql` | Query optimization indexes |
| `V3__production_hardening.sql` | RLS policies + helpers, audit_log + audit triggers, soft deletes, CHECK constraints, helper functions |
| `V4__oauth_fields.sql` | OAuth columns on users (provider, provider_id, avatar_url, access_token, last_login_at) |
| `V5__versioning_branching.sql` | `parent_diagram_id`, `branch_name` on diagrams; `branch`, `active` on checkpoints |
| `V6__workspaces.sql` | `workspaces` + `workspace_memberships` (tenant boundary), `diagrams.workspace_id` + backfill, RLS + `is_workspace_member()`, audit/app grants, `provision_user()` login-provisioning function, provider allow-list widening |
| `V7__phase2_integrity.sql` | Phase 2 integrity: revisions/optimistic concurrency, durable idempotency keys, webhook event inbox |
| `V8__webhook_payload.sql` | Webhook inbox payload storage for replay |
| `V9__reconcile_migration_copies.sql` | Carries forward the retired `db/migrations` copy's remaining edits (`chk_audit_log_operation`, explicit `current_user_has_role` default) without changing V1–V8 checksums |

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication + OAuth profile |
| `workspaces` | Tenant boundary (one personal workspace per user, more later) |
| `workspace_memberships` | Roster: (workspace, user) + role + status |
| `diagrams` | Architecture diagrams (JSONB graph + metadata + `workspace_id`) |
| `checkpoints` | Version snapshots (JSONB snapshot + branch + active flag) |
| `threads` | Review comments pinned to nodes |
| `replies` | Thread replies |
| `sync_log` | Idempotent sync audit trail |
| `audit_log` | Immutable change log (trigger-based) |

### RLS Policies (PostgreSQL Row Level Security)

- **Users:** SELECT all; INSERT/UPDATE/DELETE only by `current_user_has_role('admin')`
- **Diagrams/Checkpoints/Threads/Replies/SyncLog:** Scoped to `current_user_id()` via `owner_id` FK
- **Helper functions:** `current_user_id()` (reads `app.current_user_id` GUC), `current_user_has_role(role)`

---

## REST API (OpenAPI 3.1)

Base: `/api/v1`

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/me` | GET | Current user (Bearer JWT or OAuth2 principal) |
| `/auth/magic-link` | POST | Send magic link email |
| `/auth/verify?token=` | GET | Verify magic link → JWT |
| `/auth/refresh` | POST | Rotate JWT |
| `/auth/logout` | POST | Invalidate session |
| `/auth/success` | GET | OAuth2/SAML callback (redirects to frontend) |
| `/auth/failure` | GET | OAuth2 failure redirect |
| `/login/github\|google\|saml\|oidc` | GET | Initiate OAuth2/SAML login |

**Auth schemes (Phase 1, PROD-001/011):** user JWT in the `ARCHFLUX_TOKEN` cookie
(HttpOnly, Path=/, SameSite=Lax, Secure per `app.cookie-secure`) or `Authorization: Bearer <user-JWT>` fallback.
JWTs carry validated signature/issuer/audience/expiry with previous-secret rotation; `sub` is the real user UUID
(auto-provisioned with a personal workspace via the SECURITY DEFINER `provision_user()` function — the only
login-time user writer, since auth paths run with no RequestUser yet). Redirects never carry tokens and always target the
SPA path router (success → `{frontend-url}/auth/callback?provider=`, failure → `{frontend-url}/login?error=`; clean URLs since 2026-10-31);
magic links point at the API (`{public-api-url}/v1/auth/verify?token=`) — SVC-G6/G7. The static API token is a service credential
accepted **only** on `POST /api/v1/sync/webhook/git` and authenticates nobody. State-changing `/api/v1/**`
requests with a foreign Origin/Referer are rejected 403 (CSRF posture for cookie auth); `POST /auth/magic-link`
is rate-limited. OAuth `defaultSuccessUrl` is `/api/v1/auth/success` (matches the controller).

### Diagrams

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/diagrams` | GET | Paginated list (search `q`, page/limit) |
| `/diagrams` | POST | Create (title, tags, graph) |
| `/diagrams/{id}` | GET | Single diagram |
| `/diagrams/{id}` | PUT | Update (partial via `graphProvided`/`tagsPresent`) |
| `/diagrams/{id}` | DELETE | Soft delete |
| `/diagrams/{id}/checkpoints` | GET | List checkpoints (newest-first; `?branch=` filters) |
| `/diagrams/{id}/checkpoints/{cid}` | DELETE | Delete checkpoint |
| `/diagrams/{id}/checkpoints` | POST | Create checkpoint (title, meta, branch) |
| `/diagrams/{id}/checkpoints/{cid}/restore` | POST | Restore graph from checkpoint |
| `/diagrams/{id}/branches` | POST | Create branch (duplicate + parent link) |

### Review Threads

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/diagrams/{id}/threads` | GET | List threads |
| `/diagrams/{id}/threads` | POST | Create thread (author, pinnedTo, text) |
| `/diagrams/{id}/threads/{tid}/replies` | GET | List replies |
| `/diagrams/{id}/threads/{tid}/replies` | POST | Create reply |

### Sync & Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sync` | POST | Idempotent sync (canonical SHA) |
| `/sync/webhook/git` | POST | GitHub push webhook (HMAC-SHA256) |
| `/sync/webhook/git/health` | GET | GitHub API connectivity |

### Lint

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/lint` | POST | Run architecture rules (nodes/edges → violations) |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness (always 200) |
| `/ready` | GET | Readiness (Flyway + DB connectivity) |

---

## WebSocket (STOMP)

| Endpoint | Description |
|----------|-------------|
| `/ws` | SockJS + STOMP endpoint |

### Client → Server (MessageMapping)

| Destination | Payload | Purpose |
|-------------|---------|---------|
| `/app/diagram/{diagramId}/join` | `{}` | Join collaboration room |
| `/app/diagram/{diagramId}/update` | `{update: base64}` | Yjs binary update |
| `/app/diagram/{diagramId}/leave` | `{}` | Leave room |
| `/app/diagram/{diagramId}/save` | `{}` | Persist Yjs state |
| `/app/diagram/{diagramId}/state` | `{}` | Request full state |
| `/app/diagram/{diagramId}/awareness` | `{states: ...}` | Cursor/selection broadcast |

### Server → Client (Topic)

| Destination | Payload | Purpose |
|-------------|---------|---------|
| `/topic/diagram/{diagramId}/updates` | `{type, update, version, userId}` | Yjs updates + join/leave |
| `/topic/diagram/{diagramId}/state` | `{type, yjsState, version}` | Full state sync |
| `/topic/diagram/{diagramId}/awareness` | `{type, userId, states}` | Presence/cursors |

---

## GitHub Webhook

**Endpoint:** `POST /api/v1/sync/webhook/git`

**Headers:**
- `X-Hub-Signature-256`: `sha256=<hmac>`
- `X-GitHub-Event`: `push`

**Verification:** Constant-time HMAC-SHA256 against `GITHUB_WEBHOOK_SECRET` (env or `application.yml`).

**Behavior:**
1. Verify signature (constant-time)
2. Parse push payload (added/modified/removed/head_commit)
3. Detect `.arch` file changes
4. Fetch file via GitHub Contents API (Base64 decode)
5. Parse `.arch` JSON → canonical graph
6. Upsert diagram by `github:{owner}/{repo}:{path}` tag
7. Create checkpoint `webhook:{branch}:{path}`

**User mapping:** `GITHUB_WEBHOOK_USER_ID` env var (GitHub cannot send app Bearer token).

---

## Canonical Graph & Idempotency

**Canonical JSON:** Deterministic key ordering + type normalization (via `JsonCanonicals`).

**Sync SHA:** `SHA-256(canonical(diagram) + canonical(upstream))` stored in `sync_log`.

**Idempotency:** `sync_log` unique constraint on `(diagram_id, commit_sha)` — duplicate commits return `NOOP`.

---

## Linting Rules (Architecture)

> Verified against `LintService`: exactly three deterministic rules. No cycle detection or naming-convention
> rules exist in the current implementation.

| Rule | Severity | Description |
|------|----------|-------------|
| `ORPHAN_NODE` | Warning | Node with degree 0 (only edges between known nodes count toward degree) |
| `DANGLING_EDGE` | Warning | Edge whose `to` is empty or references an unknown node (never double-flagged as ambiguous) |
| `MISSING_PROTOCOL` | Warning | Connected edge with blank `protocol` **and** blank `label` |

Result shape: `{orphans[], dangling[], ambiguous[], ok}` — order-preserving, deduped. Null/empty inputs → `ok: true`.
(Planned per productization PROD-023: stable rule IDs, severity, explanations, affected entities — IDs above are the seed.)

---

## Configuration (`application.yml`)

### Key Sections

```yaml
spring:
  datasource:
    url: ${SPRING_DATASOURCE_URL}
    username: ${SPRING_DATASOURCE_USERNAME}
    password: ${SPRING_DATASOURCE_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate          # Never auto-create
    properties:
      hibernate:
        timezone.default_storage: NORMALIZE_UTC
  flyway:
    enabled: true
    locations: classpath:db/migration
  security:
    oauth2:
      client:
        registration:
          github: { client-id, secret, scope: read:user,user:email,repo }
          google: { client-id, secret, scope: openid,email,profile }
          oidc:   { client-id, secret, scope: openid,email,profile }
    saml2:
      relyingparty:
        registration:
          archflux:
            entity-id: ${SAML_ENTITY_ID}
            assertion-consumer-service: { location, binding: POST }
            singlelogout: { url, binding: REDIRECT }
            signing: { credentials: [{private-key-location, certificate-location}] }
            assertingparty:
              entity-id: ${SAML_IDP_ENTITY_ID}
              singlesignon: { url, binding: POST }
              singlelogout: { url, binding: REDIRECT }
              verification: { credentials: [{certificate-location}] }
  session:
    store-type: redis
    redis:
      namespace: "archflux:sessions:"
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
```

### App Properties

```yaml
app:
  api-token: ${APP_API_TOKEN}           # Service credential (webhook path only)
  frontend-url: ${FRONTEND_URL}         # SPA origin: post-login redirects (path routes, no `#`)
  public-api-url: ${PUBLIC_API_URL:${app.frontend-url}/api}   # absolute API root for emailed links
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:<frontend-url + localhost dev origins>}  # CORS + Origin check + WS
  jwt-secret: ${JWT_SECRET}             # HS256 key (≥256 bits)
  magic-link-ttl-minutes: 15
  email:
    provider: ${EMAIL_PROVIDER:mock}    # mock|sendgrid|resend|ses
    from: ${EMAIL_FROM}
    sendgrid-api-key: ${SENDGRID_API_KEY}
```

---

## Productization (v3.0.0) — Backend Deltas

> Contract: [PRODUCT_SPEC Appendix A](PRODUCT_SPEC.md#appendix-a-platform-contracts-moved-from-productization_spec-v300-2026-10-25) §§5, 8, 10, 11, 13. Phased: identity + isolation +
> migrations in Phase 1; durable idempotency + webhook inbox in Phase 2.

### Identity (PROD-001, contract §5.3, Phase 1)

Replace the static `AuthFilter` Bearer comparison with Spring Security's standard chain: validate JWT
signature, issuer, audience, expiry, not-before, and key rotation (or server-side sessions). Every authenticated
request resolves a real user ID — no shared development identity in production. Service credentials stay separate
from user identity. Prod fails startup when signing keys / identity config are missing. Short-lived access credentials
with deliberate refresh/revocation; validated OAuth state/nonce; single-use short-lived hashed-at-rest rate-limited
magic links; generic auth errors.

### Workspace isolation (PROD-002, contract §5.4, Phase 1)

Introduce `Workspace` + `WorkspaceMembership`; scope every resource query by workspace + authorized membership
(RLS as defense in depth). Set request identity with transaction-scoped `SET LOCAL` after authentication on the
same connection/transaction. **Test under the real `archflux_app` role, never only as owner/superuser.**
Fix `audit_log` grants (or `SECURITY DEFINER` with locked `search_path`) and `SET LOCAL` plumbing first —
currently writes fail and ownership predicates are false under the app role (see the deleted SPEC_REPORT §12 G4/G5, historical).

### Migration integrity (PROD-005, Phase 1)

Make V3 fully re-runnable (guard the 5 unguarded `CREATE POLICY` statements); fix `chk_users_provider`
(NOT VALID) and the dead `checkpoints_badge_len`; test fresh-install **and** upgrade-from-supported-version in CI;
immutable checksummed history. Align PostgreSQL major versions across local/CI/prod (15 vs 17 skew).

### API envelope & behavior (contract §8)

- Error envelope gains `correlationId` (keep `code` + safe `message` + field errors; never stacks/SQL/tokens).
- Add `409` (version conflicts, duplicate transitions) and `422` (semantically invalid diagram content);
  keep 401/403/404 semantics (404 for foreign resources), 413, 429 + `Retry-After`.
- Optimistic concurrency: version/ETag on diagram updates; stale writes → `409`, never silent overwrite.
- Cursor-based pagination for growing collections; max page size enforced.
- Commit/publish generated OpenAPI as a build artifact with breaking-change diff in CI.

### Webhooks & idempotency (contract §10, Phase 2)

Durable `WebhookEvent` inbox (unique provider delivery/event ID), persist-before-ack, async processing via durable
queue/outbox, idempotent handler + replay/dead-letter, bounded retries, exact-commit PR checks. Move idempotency
from in-memory map to PostgreSQL unique constraints (`sync_log`, event inbox). Fix webhook upsert to match by stored
tags instead of title-LIKE (currently duplicates diagrams).

### Operability & security (PROD-009/010/011, contract §§11/13)

- `/ready` fails on schema **incompatibility** (migration version check), not mere table existence; never use liveness
  for dependency health. Backup/restore tested with restore drills.
- Strict CORS allow-list (no wildcard + credentials); explicit CSRF posture; CSP/HSTS/framing headers in nginx;
  SSRF defenses for connector URLs; per-user/workspace rate limits; dependency/secret/container scans + SBOM.
- Provider credentials + signing keys in a secrets manager; nothing secret in localStorage, URLs, logs, or exports.
- Structured logs with correlation IDs + stable error codes; redaction of auth material and secrets.

---

## Commands

| Task | Command |
|------|---------|
| Build (skip tests) | `mvn -q -DskipTests compile` |
| Build + test | `mvn -q test` |
| Package JAR | `mvn -q package -DskipTests` |
| Run (dev) | `mvn spring-boot:run` |
| Flyway migrate | `mvn flyway:migrate` |
| Docker build | `docker build -t archflux-api .` (context `backend/`) |
| Service stack | `docker compose -f backend/compose.yml up -d --build` |

---

## Testing

| Type | Framework | Command |
|------|-----------|---------|
| Unit | JUnit 5 + Mockito | `mvn test` |
| Integration | Testcontainers (PostgreSQL) | `mvn test` |
| Slice | `@DataJpaTest`, `@WebMvcTest` | `mvn test` |

**Testcontainers:** Shared `PostgreSQLContainer` (`PostgresIT`) applies the real classpath migrations
(`db/migration/V*__*.sql`, V1..V9) before the context loads — never absolute host paths (SVC-G12).

**Test config (`src/test/resources/application.yml`):**
- Flyway disabled
- `ddl-auto: validate` (schema from migrations)
- Redis/session/OAuth2 autoconfig excluded
- `spring-security-test` for `@WithMockUser`

---

## Security Notes

| Aspect | Implementation |
|--------|----------------|
| JWT | HS256, iss/aud/exp enforced, previous-secret rotation, `sub` = real user UUID |
| Sessions | Redis-backed, 30-day TTL, `HttpOnly; Secure; SameSite=Lax` (+ `ARCHFLUX_TOKEN` cookie session) |
| CORS | Exact allow-list `app.cors.allowed-origins`, `allowCredentials: true`, never `*` (SVC-G8) |
| WebSocket origin | Same allow-list on `/ws` handshake (SVC-G9) |
| Rate limiting | `RateLimitFilter` (configurable) |
| Payload limit | `PayloadLimitFilter` (configurable) |
| CSRF | Origin/Referer origin must be in `app.cors.allowed-origins` for state-changing `/api/v1/**` (403 otherwise) |
| Service token | Static token accepted only on the GitHub webhook path; never a user identity |
| Flyway | `flyway-core` + `flyway-database-postgresql` (v10+ split artifacts); owner migrates, app is DML-only |

---

## Deployment

| Target | Method |
|--------|--------|
| Docker (service only) | `docker compose -f backend/compose.yml up -d` (PostgreSQL 17 + Redis 7 + API) |
| Docker (integrated) | `docker compose up -d` at repo root (adds the web service) |
| JAR | `java -jar app.jar` |
| Kubernetes | Helm chart (external) |

**Health checks:** `/health` (liveness), `/ready` (readiness + Flyway).

---

## Known Constraints

1. **SAML2** — Requires Shibboleth Maven repo (OpenSAML not on Central)
2. **Redis required** — Sessions + magic links + collaboration awareness
3. **No contract registry** — Endpoints derived locally from graph
4. **WebSocket** — Single-node STOMP broker (no Redis broker yet); not interoperable with the y-websocket client (SVC-O1)
5. **Flyway validate-only** — DDL managed exclusively by migrations