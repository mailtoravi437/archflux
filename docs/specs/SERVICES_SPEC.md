# ArchFlux Service Architecture Specification

> **Version:** 2.4.0 | **Last Updated:** 2026-10-31 | **Status:** ✅ Current
> **Part of:** [Master Spec](../../SPEC.md) | **Maintenance:** [Protocol](../../SPEC.md#spec-maintenance-protocol)
> **Supersedes:** `docs/SEPARATE_DEPLOY_SPEC.md` v1.0 (which proposed two repos and embedded real secrets).

**Breaking change:** the repository is restructured into two independently built, tested, versioned and
deployed services — `frontend/` (**archflux-web**) and `backend/` (**archflux-api**). All root-level frontend
files moved into `frontend/`; `server/` became `backend/`; `db/` moved into `backend/db/`. See §9 for the
migration notes.

**v2.3.0 (2026-10-26):** §4.4 realtime relay; SVC-O1 decided and fixed (R1-BUG-17).

**v2.1.0 (2026-10-24):** repository root reduced to entry points; all specs and docs live under `docs/`
(§2). The deploy target is **AWS** — one EC2 instance running the integrated compose stack with images
from ECR, provisioned by CloudFormation (§6, §10). GCP / DigitalOcean / hand-built VM (systemd + host
nginx) deploy paths are removed. Gaps SVC-G19…G23.

---

## 1. Goals and non-goals

**Goals**
1. Each service builds, tests, packages and deploys **without** the other's toolchain or source
   (frontend needs no JDK/Maven; backend needs no Node).
2. Each service has its own Dockerfile, build context, compose file, env template, CI workflow and deploy
   workflow, triggered only by changes to its own directory.
3. The two services talk **only** over the published HTTP/WebSocket contract (`/api/v1/**`, `/ws`).
   No shared source, no shared build artifacts.
4. Two supported topologies with the same images: **integrated** (same-origin, nginx proxies the API) and
   **separate** (frontend and API on different origins, browser calls the API directly).
5. No secrets in git, in images, in the SPA bundle, or in specs.

**Non-goals (this release)**
- Splitting into two git repositories. The layout is split-ready: `git subtree split -P frontend` /
  `-P backend` yields self-contained repos.
- Fixing the collaboration transport mismatch (client speaks y-websocket, server speaks STOMP —
  SPEC_REPORT §12 G2 (deleted 2026-10-25, historical)). Tracked as SVC-O1.
- Supporting frontend and API on **different registrable domains** (see §5.3).

---

## 2. Repository layout

```
archflux/
├── README.md                         # entry point: what it is, quick start, links
├── SPEC.md                           # master spec index + work plan (the contract starts here)
├── compose.yml, compose.override.yml # integrated topology (db + redis + server + web); override = dev only
├── .env.example                      # integrated-topology template (placeholders only)
├── .github/workflows/                # frontend-ci/-deploy, backend-ci/-deploy (path-scoped)
│
├── docs/
│   ├── specs/    PRODUCT_SPEC, UI_REVAMP_SPEC, REVIEW_VERSIONING_SPEC, SERVICES_SPEC,
│   │             FRONTEND_SPEC, BACKEND_SPEC, impl/ (agent task specs)
│   ├── deploy/   DEPLOY.md (operate), AWS.md (provision + CI/CD), GITHUB_SECRETS.md
│   ├── ops/      runbooks, alerts, github-app-setup
│   ├── design/   artboards/ (finalized design, source of truth), design-system ownership
│   ├── qa/       accessibility audit/fixes, test plans, phase-0 inventory
│   └── archive/  superseded documents (read-only history)
│
├── deploy/aws/                       # AWS target (§10): CloudFormation, compose overlay, Caddyfile, remote deploy
├── scripts/verify-compose.sh         # cross-service smoke check
│
├── frontend/                         # SERVICE: archflux-web (React SPA served by nginx)
│   ├── package.json, package-lock.json, index.html, vite.config.ts, tsconfig*.json,
│   │   vitest.config.ts, playwright.config.cjs, .oxlintrc.json
│   ├── src/  public/  e2e/  scripts/  (src/ layout: FRONTEND_SPEC "Project Structure")
│   ├── Dockerfile  .dockerignore  compose.yml  .env.example
│   ├── nginx/default.conf            # static + optional API proxy include
│   ├── docker/40-archflux-runtime.sh # writes /config.json + proxy include at container start
│   └── deploy/nginx-cross-origin.conf
│
└── backend/                          # SERVICE: archflux-api (Spring Boot)
    ├── pom.xml  src/                 # migrations: src/main/resources/db/migration (single source)
    ├── Dockerfile  .dockerignore  compose.yml  .env.example
    ├── db/        roles.sql, seed.dev.sql (local dev only), README.md
    ├── docker/db-init/01-roles.sh
    └── scripts/   backup.sh, restore.sh, generate-openapi.sh, verify-phase2-api.sh
```

Rules:
- Nothing in `frontend/` may import, read, or copy from `backend/` and vice-versa. The only shared artifact
  is the OpenAPI document (`backend` publishes it; `frontend` may consume it).
- The root holds only entry points (README, SPEC.md, compose, env template, CI). New docs go under `docs/`
  by kind; one-off scripts and personal notes are never committed (SVC-G19).
- Vendored tools and binaries (`google-cloud-sdk/`, `*.tar.gz`) are never committed.
- Cloud-provider specifics live only under `deploy/<provider>/` and `docs/deploy/` (today: `aws`).

---

## 3. Service: archflux-web (frontend)

| Aspect | Contract |
|---|---|
| Build | `cd frontend && npm ci && npm run build` → `frontend/dist/` |
| Gates | `npx tsc -b`, `npm test`, `npm run lint`, `npm run test:e2e` |
| Image | `frontend/Dockerfile`, context `frontend/` → `archflux-web` (nginx:alpine, port 80) |
| Health | `GET /` → 200 (baked `HEALTHCHECK`) |
| Runtime deps | none — it is static. It does **not** wait on the API to be healthy to start. |

### 3.1 Runtime configuration (single mechanism) — SVC-G4

The SPA resolves its endpoints in one module, `src/config.ts`, before first render:

| Value | Precedence (first non-empty wins) | Default |
|---|---|---|
| `apiUrl` | `/config.json` `apiUrl` → build-time `VITE_API_URL` → default | `/api` |
| `wsUrl` | `/config.json` `wsUrl` → build-time `VITE_WS_URL` → derived from `apiUrl` origin (`http→ws`, `https→wss`; relative → current page origin) | derived |

- `/config.json` is generated at container start from env, never cached (`Cache-Control: no-store`), and
  carries **no secrets**. A missing/invalid file (Vite dev, static hosting) falls back silently.
- All HTTP calls (`api.ts`, `useCollaboration.ts`, `LoginScreen.tsx`) read `apiUrl` from `config.ts`.
  `window.__ARCHFLUX_API_URL__` and direct `import.meta.env.VITE_*` reads elsewhere are removed.
- Path convention: `apiUrl` is the `/api` root; callers append `/v1/...`.

### 3.2 Container environment

| Env | Purpose | Default |
|---|---|---|
| `API_URL` | Written to `config.json.apiUrl`; also the CSP `connect-src` origin when absolute | `/api` |
| `WS_URL` | Written to `config.json.wsUrl` (optional) | empty (derived) |
| `API_UPSTREAM` | If set (e.g. `http://server:3001`), nginx reverse-proxies `/api/`, `/ws`, `/oauth2/`, `/login/oauth2/`, `/saml2/`, `/login/saml2/` to it (integrated topology). Empty → no proxy (separate topology). | empty |

### 3.2a Routing and URLs (decision 2026-10-31)

The SPA uses **clean path URLs** (`createBrowserRouter`): `archflux.in/dashboard`, not
`archflux.in/#/dashboard`. Consequences:

- The web server (nginx in archflux-web; Caddy forwards every path to it) returns `index.html` for any
  path that is not a static file (`try_files $uri $uri/ /index.html`). `/api`, `/ws`, `/oauth2`,
  `/login/oauth2`, `/saml2`, `/login/saml2` stay on the API; a bare `/login` is an SPA route.
- Legacy `#/path` URLs (old bookmarks, emails, shared links) still work: `main.tsx` rewrites
  `/#/path?q` to `/path?q` before the router starts (`lib/legacyHash.ts`).
- Backend-built links (`spaUrl()`, magic link, invites, share links, access-request emails) are
  `{frontend-url}/path` with no `#`.
- Vite dev serves the SPA fallback by default.

### 3.3 Dev server

`npm run dev` serves on `:5173` and proxies `/api`, `/ws`, `/oauth2`, `/login/oauth2` to
`VITE_DEV_API_PROXY` (default `http://localhost:3001`) so local dev is same-origin without CORS.

---

## 4. Service: archflux-api (backend)

| Aspect | Contract |
|---|---|
| Build | `cd backend && mvn -q -DskipTests package` → `backend/target/app.jar` |
| Gates | `cd backend && mvn test` (Testcontainers; Docker required) |
| Image | `backend/Dockerfile`, context `backend/` → `archflux-api` (temurin 21 JRE, non-root, port 3001) |
| Health | `GET /api/health` (liveness), `GET /api/ready` (readiness: DB + Flyway schema version) |
| Runtime deps | PostgreSQL 17, Redis 7 |

### 4.1 Public URL configuration — SVC-G5/G6/G7

| Property | Env | Default | Used for |
|---|---|---|---|
| `app.frontend-url` | `FRONTEND_URL` | `http://localhost:5173` | SPA origin for post-login redirects |
| `app.public-api-url` | `PUBLIC_API_URL` | `${app.frontend-url}/api` | Absolute API root embedded in emails (magic links) |
| `app.cors.allowed-origins` | `CORS_ALLOWED_ORIGINS` (comma-separated) | `${app.frontend-url}` + local dev origins (`localhost`/`127.0.0.1` on `5173`, `8080`) in the default profile; **prod: `${FRONTEND_URL}` only** | CORS, Origin check, WebSocket handshake |

Redirect targets (the SPA uses **clean path URLs**; since 2026-10-31 no redirect carries a `#`):

| Event | Redirect |
|---|---|
| OAuth/SAML/magic-link success | `{frontend-url}/auth/callback?provider=<p>` |
| Any auth failure | `{frontend-url}/login?error=<code>` |
| Magic link in email | `{public-api-url}/v1/auth/verify?token=<t>` (a backend endpoint, not an SPA route) |

Login initiation (from the SPA): `{apiUrl}/v1/auth/login/{github|google|saml|oidc}`.

### 4.2 Origin policy (one allow-list, three enforcers) — SVC-G8/G9

The single list `app.cors.allowed-origins` drives:
1. **CORS** (`CorsConfig`) on `/api/**`: exact origins, `allowCredentials=true`, never `*`.
2. **CSRF Origin check** (`OriginCheckFilter`): state-changing `/api/v1/**` requests whose `Origin`
   (or `Referer` origin) is not in the list → `403 FORBIDDEN`. Compared as normalized
   `scheme://host[:port]`. No header → passes to authentication (non-browser clients).
3. **WebSocket handshake** (`WebSocketConfig`): `setAllowedOrigins(list)` — no `*` (prevents
   cross-site WebSocket hijacking with cookie auth).

### 4.3 Migrations (single source) — SVC-G11/G12

- The only migration directory is `backend/src/main/resources/db/migration/` (Flyway classpath).
  `db/migrations/` is deleted.
- **History is immutable.** V1–V8 stay byte-identical to the classpath files deployed databases already
  recorded (verified 2026-10-24 against a live `flyway_schema_history`: all eight checksums match). The
  retired copy's edits to V3/V4 were either superseded by V6 or are carried forward in
  `V9__reconcile_migration_copies.sql` (re-runnable). Existing databases upgrade with no `flyway repair`.
- Tests load migrations from the classpath (`MigrationFiles.dir()`), never absolute host paths.

---

### 4.4 Realtime relay (R1-BUG-17, decided 2026-10-26)

The SPA speaks the y-websocket protocol (Yjs sync + awareness). The STOMP endpoint cannot carry it (its
handlers take `HttpServletRequest`, which does not exist on STOMP messages, and the client has no STOMP
library), so the API adds a **stateless relay**:

- Endpoint: `ws(s)://<api-host>/ws/diagram-{diagramId}` (`diagramId` is the diagram UUID; the SPA's
  y-websocket room name is `diagram-<uuid>`). Query params are ignored.
- Auth at the handshake: the `ARCHFLUX_TOKEN` cookie (or Bearer header) JWT, validated like `AuthFilter`;
  missing or invalid gives 401. `Origin` must be in the allow-list (403 otherwise). The caller needs at
  least VIEW on the diagram through `AccessService`; no access (including another workspace) gives 404.
- Relay: every binary frame from a peer is forwarded unchanged to the other peers in the same room.
  Nothing is stored on the server; late joiners get state from online peers (Yjs sync step 1/2) and from the
  existing REST snapshot hydrate. Awareness frames (cursors, presence) are relayed for every role.
- Write protection: peers with less than EDIT may send sync step 1 and awareness only. Sync step 2 and
  update frames from them are dropped, so a viewer or commenter cannot change the shared document.
- Rooms live in the memory of one API instance. With several API instances a diagram's peers must reach the same instance (sticky routing); a Redis fan-out is a later change.
- Text frames and frames over 1 MiB close the socket (1003 / 1009).

## 5. Topologies

### 5.1 Integrated (same-origin) — `compose.yml` at the root

```
browser ──► web (nginx :8080) ── static SPA
                 └── /api/ /ws /oauth2/ /login/oauth2/ /saml2/ ──► server :3001 ──► db, redis
```
`web`: `API_URL=/api`, `API_UPSTREAM=http://server:3001`. `server`: `FRONTEND_URL=http://localhost:8080`.

### 5.2 Separate (cross-origin) — per-service compose files

```
browser ──► web  (app.example.com)      static SPA only, no proxy
   └──────► api  (api.example.com/api)  ──► db, redis
```
```bash
docker compose -f backend/compose.yml  --env-file backend/.env  up -d --build   # db + redis + server
docker compose -f frontend/compose.yml --env-file frontend/.env up -d --build   # web
```
`web`: `API_URL=https://api.example.com/api`, `API_UPSTREAM` empty.
`server`: `FRONTEND_URL=https://app.example.com`, `PUBLIC_API_URL=https://api.example.com/api`,
`CORS_ALLOWED_ORIGINS=https://app.example.com`. Local defaults: web `:8080`, API `:3001`.

Either service can be rebuilt, redeployed or restarted without touching the other.

### 5.3 Cookie constraint

The session cookie `ARCHFLUX_TOKEN` is `SameSite=Lax`, host-only on the API host. Browsers send it on
credentialed `fetch`/WebSocket only when web and API are **same-site** (same registrable domain, e.g.
`app.example.com` + `api.example.com`, or `localhost` with different ports). Different registrable domains
would need `SameSite=None` plus token-based CSRF — out of scope.

---

## 6. CI/CD — SVC-G13, SVC-G20

| Workflow | Trigger | Steps |
|---|---|---|
| `frontend-ci.yml` | push/PR touching `frontend/**` | Node 24, `npm ci`, `tsc -b`, lint, `npm test`, build, `docker build frontend` |
| `backend-ci.yml` | push/PR touching `backend/**` | Temurin 21, `mvn test`, `docker build backend` |
| `compose-ci` job (in both) | same | `docker compose config --quiet` for root + the service's compose file |
| `frontend-deploy.yml` | push to `main` touching `frontend/**`, or manual | gates → `docker build frontend` → push `archflux-web:{sha}` to ECR → deploy `web` on EC2 (§10.3) |
| `backend-deploy.yml` | push to `main` touching `backend/**`, or manual | `mvn test` → `docker build backend` → push `archflux-api:{sha}` to ECR → deploy `server` on EC2 (§10.3) |

- Images are built **once in CI** and promoted by tag; the instance never compiles code (no JDK/Node/Maven on it).
- CI authenticates to AWS with **GitHub OIDC** (`AWS_DEPLOY_ROLE_ARN`); no long-lived AWS keys in GitHub.
- Deploy workflows share one serialized concurrency group (`deploy-aws`) so two deploys never race on the host.
- Rollback = re-run the deploy workflow (`workflow_dispatch`) with `image_tag` set to a previous sha.

---

## 7. Configuration & secrets — SVC-G1

- Committed: only `*.env.example` templates with placeholders (`change-me`), never real values.
- Ignored: `.env`, `.env.*` (except `.env.example`), `frontend/.env*`, `backend/.env*` (except examples).
- Prod secrets live **only on the instance** in `/opt/archflux/.env` (`ec2-user`, mode 600), created once from
  `deploy/aws/env.aws.example`. CI never sees application secrets; it only pushes images and triggers deploys.
- Dev-only defaults in compose are labelled **DEV ONLY**; the AWS overlay (`deploy/aws/compose.aws.yml`)
  re-declares every secret as `${VAR:?}` so a missing value aborts the deploy instead of falling back to a
  dev default (SVC-G21). The prod Spring profile additionally fails fast on placeholders.
- `*.env.example` templates contain `change-me` placeholders, never values that look real.
- **Any secret that has ever been committed is considered compromised and must be rotated.**
  (2026-10-24: `.env`, `.env.backend` and `docs/SEPARATE_DEPLOY_SPEC.md` contained JWT/DB/API/webhook
  secrets and were pushed to `origin/main` — rotation is an owner action; history rewrite optional.)

---

## 8. Gap register (review of 2026-10-24)

| ID | Gap (verified in code) | Impact | Resolution | Status |
|---|---|---|---|---|
| SVC-G1 | Real secrets committed (`.env`, `.env.backend`, spec v1.0 §2.5/§5/§6/§9) and pushed | Critical | Untrack, scrub docs, `.example` templates, rotate | ✅ code / ⚠️ rotation = owner |
| SVC-G2 | `google-cloud-sdk/` (~31k files) + 54 MB tarball committed in unpushed `03d934fb` | High (repo) | Untrack + ignore | ✅ |
| SVC-G3 | No service boundary: frontend at repo root, root `package.json` carries backend/db scripts, overlapping build contexts | High | §2 layout | ✅ |
| SVC-G4 | Three API-base mechanisms (`__ARCHFLUX_API_URL__` never set, `VITE_API_URL` in 2 files); `/config.json` generated but never read | High | §3.1 `config.ts` | ✅ |
| SVC-G5 | Login buttons call `{api}/auth/login/*` (missing `/v1`) → 404 | High (auth) | §4.1 | ✅ |
| SVC-G6 | (superseded 2026-10-31 by clean URLs) Backend redirects to `/auth/callback`, `/login` without `#` reached no route under the old hash router | High (auth) | §4.1 | ✅ |
| SVC-G7 | Magic link points to `{frontend}/auth/verify` — not an SPA route, not proxied → broken | High (auth) | `app.public-api-url` | ✅ |
| SVC-G8 | CORS hard-coded to localhost (BACKEND_SPEC claimed `*`) → separate topology impossible | High | §4.2 | ✅ |
| SVC-G9 | Origin check accepts one host; WebSocket allows any origin with cookie auth | Med (security) | §4.2 | ✅ |
| SVC-G10 | Integrated nginx proxies only `/api/` → OAuth (`/oauth2`, `/login/oauth2`), SAML, `/ws` unreachable | High (auth) | §3.2 `API_UPSTREAM` | ✅ |
| SVC-G11 | Migrations duplicated; classpath (prod Flyway) V1/V3/V4 diverge from tested `db/migrations` | High (data) | §4.3 single source, checksums preserved, delta in V9 | ✅ |
| SVC-G12 | Backend tests hard-code `/Users/ravikumar/archflux/db/migrations` | Med (CI) | classpath loading | ✅ |
| SVC-G13 | CI not path-scoped; both deploys run on every push; Node 20 vs 24 | Med | §6 | ✅ |
| SVC-G14 | Postgres 15 (separate compose) vs 17 (everywhere else) | Low | 17 everywhere | ✅ |
| SVC-G15 | Spec drift (CORS claim, Testcontainers "V1..V5", FE structure, `VITE_WS_URL` default, stray files `tsc`, `archflux@0.0.0`) | Low | spec + cleanup | ✅ |
| SVC-G16 | `AuthController` redirected to `/oauth2/authorization/*` but `SecurityConfig` serves `/oauth2/authorize/*`; SAML to non-existent `/saml2/authorize/*`; OAuth `failureUrl` pointed at an API-host `/login` | High (auth) | Redirect to `/oauth2/authorize/{id}`, `/saml2/authenticate/archflux`; failure → `/api/v1/auth/failure` | ✅ |
| SVC-G17 | A second CORS source inside `SecurityConfig` (`*` + credentials) ran ahead of `CorsConfig`; `AuthFilter` answered CORS preflight with 401 | High (security / cross-origin) | One `CorsConfigurationSource` (CorsConfig) via `cors(withDefaults())`; preflight passes `AuthFilter` | ✅ |
| SVC-G18 | Frontend not self-contained: lint relied on the root `.gitignore` to skip `node_modules` | Low | `frontend/.gitignore` + oxlint `ignorePatterns` | ✅ |
| SVC-G19 | Root cluttered with one-off scripts/notes (`run-deploy.sh`, `run-tunnel.txt`, `check-archflux.sh`, `check-frontend.txt`, `SKIP_TEST.md`) and 3 contradictory provider guides (GCP, DigitalOcean, "easy-cost"); 9 specs at the root | Med (maintainability) | §2: root = entry points; docs under `docs/{specs,deploy,ops,design,qa,archive}`; stray files deleted | ✅ |
| SVC-G20 | Deploy = hand-managed VM: rsync source, `apt install maven` + build **on the 1 GB box**, systemd + host nginx, no rollback | High (ops) | §6/§10: CI builds images → ECR → EC2 pulls by sha; CloudFormation for infra; rollback by tag | ✅ |
| SVC-G21 | Prod would inherit compose DEV defaults (real-looking secrets in `backend/compose.yml`, `.env.example`); `server` publishes `:3001` and `web` `:8080` on all interfaces | High (security) | §10.2 overlay: `${VAR:?}` for every secret, host ports reset, only the TLS proxy is public; `.env.example` placeholders | ✅ |
| SVC-G22 | No TLS story except Cloudflare "Flexible" (plain HTTP to origin) while cookies are `Secure` | High (security) | §10.2 Caddy terminates TLS with automatic Let's Encrypt; HTTP→HTTPS redirect | ✅ |
| SVC-G24 | Behind a TLS proxy the web nginx forwards `X-Forwarded-Proto: $scheme` (= `http`) → API builds `http://` OAuth redirect URIs | High (auth) | §10.2: web forwards `https` when the incoming `X-Forwarded-Proto` is `https` (and port 443) | ✅ |
| SVC-G23 | `app.email.provider` documents `ses`, but no SES implementation exists (mock, sendgrid, resend only) | Low | AWS guide uses `resend`/`sendgrid`; SES adapter tracked as SVC-O3 | ✅ doc |
| SVC-G25 | QA: `AuthFilter` demands a Bearer/JWT on `/api/v1/sync/webhook/git` **before** the HMAC check — GitHub cannot send `Authorization`, so every real delivery is 401 | High (feature) | A request carrying `X-Hub-Signature-256` passes `AuthFilter`; `SyncController` HMAC-verifies it (constant-time) and rejects bad/missing signatures. Bearer path kept for internal callers | ✅ |
| SVC-G26 | QA: logout deletes the Redis session but JWTs are never checked against it; `/refresh` mints a fresh JWT from a logged-out one → stolen cookie never expires | High (security) | Logout writes a revocation entry for the token's `sessionId` (TTL = refresh lifetime); `AuthFilter` and `/refresh` reject revoked sessions. Logout revokes only the caller's own session (no `X-Session-ID` override) | ✅ |
| SVC-G27 | QA: rate limiter keys on the client-supplied first `X-Forwarded-For` entry (rotate header → no limit); magic-link has no per-address cap (30 mails to one inbox in seconds) | High (abuse) | Key on `request.getRemoteAddr()` (Tomcat RemoteIpValve resolves the real client behind trusted proxies); magic-link capped at 5 per address per 15 min → 429 | ✅ |
| SVC-G28 | QA: `RequestLoggingFilter` logs full query strings → magic-link tokens in access logs; invalid tokens logged verbatim | High (security) | Sensitive query params (`token`, `code`, `state`, …) redacted as `***`; magic-link warnings never print the token | ✅ |
| SVC-G29 | QA: unknown routes → 500 (`NoResourceFoundException` unhandled) | Med | Mapped to 404 `NOT_FOUND` JSON | ✅ |
| SVC-G30 | QA: `/v3/api-docs` crashes (`NoSuchMethodError`, springdoc 2.6.0 vs Spring 6.2); swagger-ui public in prod | Med | springdoc 2.8.x; api-docs + swagger-ui disabled under the `prod` profile | ✅ |
| SVC-G31 | QA: `/actuator/health` DOWN because the SMTP health check runs although mail goes through HTTP providers | Med (ops) | `management.health.mail.enabled=false` | ✅ |
| SVC-G32 | QA: unauthenticated non-API paths (`/actuator/*`, `/api/v3/*`) 302 to a non-existent `/login` | Low | Security entry point returns 401 JSON | ✅ |
| SVC-G33 | QA regression (v2.1.0): `.env.example` `JWT_SECRET` placeholder is 29 chars → API refuses to boot (needs ≥ 32) | Med (DX) | Dev placeholder ≥ 32 chars, marked DEV ONLY | ✅ |
| SVC-G34 | QA: UI never creates/lists/deletes server diagrams → cloud save, versions, conflicts, cross-device unreachable for signed-in users (frontend FE-Q1) | Critical (feature) | See FRONTEND_SPEC FE-Q1; contract unchanged (`POST/GET/DELETE /api/v1/diagrams`) | ✅ |
| SVC-O1 | Collab transport mismatch (y-websocket client vs STOMP server) | High (collab) | Decided 2026-10-26 (R1-BUG-17): keep the y-websocket client, add a stateless y-websocket relay on the API at `GET /ws/diagram-{uuid}` (see §4.4). STOMP `/ws` stays registered but unused by the SPA | Fixed 2026-10-26 |
| SVC-O2 | Git remote URL embeds a GitHub PAT in local `.git/config` | High (security) | Owner: revoke token, use credential helper | Open (owner) |
| SVC-O3 | Native AWS SES email provider (instance-role auth, no API key) | Low | Implement `SesEmailService` when moving off Resend/SendGrid | Open |
| SVC-O4 | Single-instance stack: Postgres on the EC2 volume (backups via `backup.sh`, no PITR) | Med (durability) | Move to RDS when uptime/durability needs grow; overlay already isolates the DB service | Open |

### Acceptance criteria (this release)

1. `cd frontend && npx tsc -b && npm test && npm run lint && npm run build` green with no `backend/` present.
2. `cd backend && mvn test` green with no `frontend/` present; tests load migrations from classpath.
3. `docker compose config --quiet` passes for `compose.yml`, `frontend/compose.yml`, `backend/compose.yml`.
4. `docker build frontend` and `docker build backend` succeed with their own context only.
5. Unit tests cover: `config.ts` precedence + WS derivation; login URL includes `/v1`; backend
   redirects and emailed/share links contain no `#`; magic link uses `public-api-url`; Origin check honours the allow-list;
   login initiation targets the configured OAuth/SAML endpoints.
6. `git ls-files` contains no `.env`/`.env.backend`/`.env.frontend`, no `google-cloud-sdk/`, and no
   previously committed secret value.
7. (v2.1.0) Root contains only README.md, SPEC.md, compose files, `.env.example`, `.gitignore`, `.github/`,
   `docs/`, `deploy/`, `scripts/`, `frontend/`, `backend/`. No tracked file mentions a GCP/DO deploy path.
8. (v2.1.0) `docker compose -f compose.yml -f deploy/aws/compose.aws.yml config --quiet` passes with all
   required variables set **and fails** when any secret is unset; it publishes only ports 80/443.
9. (v2.1.0) `deploy/aws/cloudformation.yml` passes `cfn-lint` (when available) / YAML parse; deploy workflows
   parse as valid YAML and reference only the secrets/variables listed in `docs/deploy/GITHUB_SECRETS.md`.
11. (v2.2.0) QA regressions SVC-G25…G33 each covered by an automated test (backend unit/integration or
    the QA harness), plus `mvn test` green.
10. (v2.1.0) Every relative Markdown link in `README.md`, `SPEC.md` and `docs/**` resolves to an existing file.

---

## 9. Migration notes (monorepo → two services)

| Before | After |
|---|---|
| `src/ public/ e2e/ index.html package*.json vite.config.ts tsconfig*.json vitest.config.ts playwright.config.cjs .oxlintrc.json` | `frontend/…` |
| `Dockerfile.web`, `nginx/default.conf`, `docker/config-json.sh` | `frontend/Dockerfile`, `frontend/nginx/default.conf`, `frontend/docker/40-archflux-runtime.sh` |
| `server/` | `backend/` |
| `db/migrations/` + `server/src/main/resources/db/migration/` | `backend/src/main/resources/db/migration/` (+ `V9__reconcile_migration_copies.sql`) |
| `db/roles.sql`, `db/seed.dev.sql`, `db/README.md`, `docker/db-init/` | `backend/db/…`, `backend/docker/db-init/` |
| `compose.separate.yml` | `frontend/compose.yml` + `backend/compose.yml` |
| `.env.frontend` / `.env.backend` (real values) | `frontend/.env.example` / `backend/.env.example` (placeholders) |
| `ci.yml`, `deploy-frontend.yml`, `deploy-backend.yml` | `frontend-ci.yml`, `backend-ci.yml`, `frontend-deploy.yml`, `backend-deploy.yml` |
| VM path `/var/www/archflux-server` | retired in v2.1.0 — AWS EC2 runs images from ECR (§10) |

Commands: `npm run dev` → `cd frontend && npm run dev`; `cd server && mvn …` → `cd backend && mvn …`.

### v2.1.0 moves

| Before | After |
|---|---|
| `SERVICES_SPEC.md`, `FRONTEND_SPEC.md`, `BACKEND_SPEC.md`, `PRODUCTIZATION_SPEC.md`, `SPEC_REPORT.md`, `UI_UX_SPEC.md`, `UI_COMPONENTS_SPEC.md`, `BACKEND_PLAN.md` | `docs/specs/…` (`SPEC.md` stays at the root) |
| `DEPLOY.md`, `deploy/GITHUB_SECRETS_CHECKLIST.md`, `.github/DEPLOY_SECRETS.md` | `docs/deploy/DEPLOY.md`, `docs/deploy/GITHUB_SECRETS.md` (merged) |
| `docs/runbooks.md`, `docs/alerts.md`, `docs/github-app-setup.md` | `docs/ops/…` |
| `docs/*-restyle*.md`, `docs/canvas-restyle-proposal.md`, `docs/design-system-ownership.md` | `docs/design/…` |
| `docs/accessibility-*.md`, `docs/phase2-test-plan.md`, `docs/PHASE0_INVENTORY.md` | `docs/qa/…` |
| `docs/PRODUCTION_SPEC.md` (systemd/VM procedures) | deleted 2026-10-25 (superseded by `docs/deploy/AWS.md`) |
| `DEPLOY-GCP.md`, `DEPLOY-DO.md`, `DEPLOY-EASY-COST.md`, `run-deploy.sh`, `run-tunnel.txt`, `check-archflux.sh`, `check-frontend.txt`, `SKIP_TEST.md` | deleted (git history keeps them) |
| `backend/deploy/` (systemd unit, pm2 ecosystem, `backend.env.example`), `deploy/nginx-default.conf` | deleted — replaced by `deploy/aws/` (§10) |

---

## 10. AWS deployment target — SVC-G20…G22

### 10.1 Infrastructure (`deploy/aws/cloudformation.yml`)

One stack, parameterised, no hand-clicking:

| Resource | Contract |
|---|---|
| EC2 instance | Amazon Linux 2023 (latest SSM AMI), default `t3.small` (x86_64, matches CI image arch), 30 GB gp3 encrypted, IMDSv2 required |
| Security group | 80 + 443 from `0.0.0.0/0`; 22 only from `SshCidr` (parameter; no default open SSH) |
| Elastic IP | stable address for DNS `A` record |
| Instance role | `AmazonSSMManagedInstanceCore` + ECR pull-only (no write, no other services) |
| ECR repos | `archflux-api`, `archflux-web`; scan on push; lifecycle keeps last 20 images |
| GitHub OIDC role | trust limited to `repo:{GitHubRepo}:ref:refs/heads/main` (+ `environment:production`); may push to the two repos only |
| User data | installs Docker + compose plugin, 2 GB swap, creates `/opt/archflux` (deploy user `ec2-user`, mode 700) |

### 10.2 Runtime (`deploy/aws/compose.aws.yml` over root `compose.yml`)

```
internet ──► caddy :80/:443 (TLS, Let's Encrypt for APP_DOMAIN) ──► web :80 ──► /api /ws /oauth2 … ──► server :3001 ──► db, redis
```
- Images: `${ECR_REGISTRY}/archflux-api:${API_IMAGE_TAG}`, `${ECR_REGISTRY}/archflux-web:${WEB_IMAGE_TAG}`;
  tags live in `/opt/archflux/images.env` (unset → `latest`); `build:` is reset — the instance never builds.
- Host ports: `db`, `server`, `web` publish **nothing**; only `caddy` publishes 80/443.
- `server`: `SPRING_PROFILES_ACTIVE=prod`, cookies `Secure`, `FRONTEND_URL=https://${APP_DOMAIN}`,
  `PUBLIC_API_URL=https://${APP_DOMAIN}/api`. Required (`:?`): `APP_DOMAIN`, `POSTGRES_PASSWORD`,
  `DB_APP_PASSWORD`, `API_TOKEN`, `JWT_SECRET`, `ECR_REGISTRY`, `ACME_EMAIL`.
- Same-origin (integrated, §5.1), so the cookie constraint (§5.3) is satisfied with no CORS configuration.
- Caddy sets `X-Forwarded-Proto: https`; the web nginx passes `https` (port 443) through to the API so
  Spring (`forward-headers-strategy: native`) builds `https://` redirect URIs (SVC-G24). `web` is not
  reachable except via Caddy, so the header cannot be spoofed from outside.

### 10.3 Deploy procedure (`deploy/aws/remote-deploy.sh <server|web> <tag>`)

1. CI copies the runtime bundle (root `compose.yml`, `backend/compose.yml`, `frontend/compose.yml`,
   `backend/docker/db-init/`, `deploy/aws/`) to `/opt/archflux` over SSH.
2. On the host: ECR login with the instance role → record the tag in `/opt/archflux/images.env` →
   `pull` → `up -d` the service (+ caddy) → poll the container health (`/api/health` or `/`) for ≤ 120 s.
3. On failure the previous tag is restored in `images.env`, the service is re-upped, and the job fails.

*End of specification.*
