# ArchFlux — Phase 0 Inventory (P0-2, P0-3)

**Generated:** 2026-10-15 | **Method:** read against live code, migrations, configs.
Grounded in `SPEC_REPORT.md` §§3–6 (verified as-built) plus independent spot-checks
noted inline as `file:line`. Where this inventory and another spec doc disagree,
the code observation wins; the discrepancy is called out explicitly.
**Working tree:** `main` @ `6423499` + uncommitted changes (no baseline tag — `git tag` is empty).

Phase 0 exit criteria (`PRODUCTIZATION_SPEC.md` §16): *"clean checkout reproduces the
reported build and tests; product claims match observed behavior."*
Status after this inventory: build/test reproduction is **not yet run** (out of scope for
P0-2/P0-3); claim-vs-behavior gaps are listed in §1 and §7.

---

## 1. Feature-status matrix

Ratings: **Shipped** (real end-to-end path) · **Partial** (works, with real limits) ·
**Simulated** (mocked/timed behavior presented in-product) · **Broken** (wired but non-functional) ·
**Planned** (UI affordance with no backing implementation).

| # | Feature | Rating | One-line evidence |
|---|---------|--------|-------------------|
| 1 | Email OTP auth path | **Simulated** | `src/screens/LoginScreen.tsx:70` — "Simulated magic-link dispatch (local build, no network)"; 6-digit OTP auto-verifies client-side with a 600 ms timer |
| 2 | Magic-link auth path | **Partial** | Client makes a real `POST /api/v1/auth/magic-link` (`src/api.ts`), but server mock-logs the link by default and `AuthFilter` blocks `/api/v1/auth/**` without the static dev token (SPEC_REPORT G1) |
| 3 | OAuth GitHub/Google + SAML/OIDC/SSO | **Partial** | Server 302 redirects are real (`AuthController.java:65-108` `GET /api/v1/auth/login/{github,google,saml,oidc}`); callback/JWT/session path exists, but refresh tokens are never minted and session lifecycle is Redis-backed while compose ships no Redis |
| 4 | Guest mode | **Shipped** | `src/screens/LoginScreen.tsx:643` "Continue as Local Guest", `src/session.ts:1` (`archflux:session` + `archflux:auth_mode` mirror); `RequireSession` admits guests with zero network (`src/App.tsx` route guard) |
| 5 | Dashboard (library) | **Shipped** | `src/screens/DashboardScreen.tsx` — search, sort, grid/table, duplicate-with-UUID-remap, tags, pins (`archflux:pinned`), bulk delete with undo toast, validated `.arch` drag-drop import, hard 25-doc cap |
| 6 | Canvas tools (shapes, connect, pan/zoom, minimap, library, palette) | **Shipped** | `src/screens/CanvasScreen.tsx` (3023 lines) — 38 shapes, orthogonal/bezier/straight router, magnetic ports, DPR-aware 2D canvas, `data-nodes`/`data-edges`/`data-icons-ready` test hooks; `⌘K` palette real |
| 7 | Freehand ink + free text | **Shipped** | One `FreeStroke` per stroke = one undo step, 6 colors × 3 widths; text tool with inline editor, 4 fonts, draft rescue via `archflux:pending-draft` (`CanvasScreen.tsx:538-550`) |
| 8 | Right dock tabs (Inspector / Linter / Live) | **Shipped** | `CanvasScreen.tsx:2306-2327` tablist; Inspector bound to real node/edge/text fields; Linter cards drive Inspect/Auto-bind/Prune/Tag-REST/Heal-All single-undo mutations |
| 9 | Living connectors + re-sync | **Simulated** | `src/screens/LivingScreen.tsx` — connectors seeded from `mockConnectors`, "2-step simulated verify", no credentials collected; re-sync is a 700 ms timer injecting `fraudWorkerNode`, then `fresh` + `driftCount 0` (`LivingScreen.tsx:148-161`) |
| 10 | Checkpoints | **Partial** | Local CRUD real (cap 20, A/B node-set diff, tag/restore/delete); server mirror attempted only for UUID docs via `api.listCheckpoints(id, branch)` (`GitScreen.tsx:80`); restore overwrites graph server-side |
| 11 | Review threads | **Partial** | Local threads real (pin, @mentions, resolve/reopen, 100-cap); server replies gated by diagram ownership; **approvals simulated** ("Request Changes / Approve Architecture" buttons, no persisted decision record) |
| 12 | Reviewer list | **Simulated** | `src/screens/ReviewsScreen.tsx:196` — static trio with a `Sample` badge (`title="Sample reviewers — configure your team in Settings → Team"`) whenever `archflux:team:v1` is empty/invalid |
| 13 | Merge gating | **Partial** | Gates evaluate **real local state** (schema/lint/drift, `GitScreen.tsx:118-119`) with working quick-fixes and blocked-merge tooltip; merge itself tags a local `merge-pr` checkpoint (`GitScreen.tsx:263` — log text says "(simulated)") |
| 14 | PR list | **Simulated** | `src/screens/GitScreen.tsx:52-53` — checkpoint-derived PRs first, then curated `mockPRs`; curated entries not mergeable; merged ids in sessionStorage `archflux:merged-prs:v1` |
| 15 | REST sandbox | **Simulated** | `src/screens/GitScreen.tsx:98,359` — "Send Simulated Request", 350 ms latency, `#apiOutputTerminal`, cURL copy with `redactSecrets()`; hint text states "Send runs a local mock, no network call" |
| 16 | Blueprints | **Shipped** | 9 curated + custom (cap 25); deterministic `BlueprintThumb` SVGs; Insert (collision-safe UUID remap) vs Load/Replace (dirty-guard), each one undo step (`src/screens/BlueprintsScreen.tsx`, `src/mocks.ts:blueprintGraph()`) |
| 17 | Settings screens | **Partial** | All four screens functional against local keys; team roles/SSO/approval-count stored in `archflux:team:v1` with **no server enforcement**; `sketchy` style stored but never consumed by the draw pass (`SettingsGeneralScreen.tsx`, SPEC_REPORT G12) |
| 18 | Collaboration (multi-user) | **Broken** | Client speaks raw y-websocket room `diagram-<id>` (`src/hooks/useCollaboration.ts`); nothing in compose serves the y-websocket protocol, and the backend STOMP leg (`CollaborationController.java:54-209`) has no handshake JWT check and is unreachable from the real client (SPEC_REPORT G2) |
| 19 | Collaboration panel (single-user view) | **Partial** | `src/components/CollaborationPanel.tsx:57,137` — presence header shows `Live`/`Offline` and `🟢 Connected`/`🔴 Disconnected` from the y-websocket status flag only |
| 20 | Import/export `.arch` | **Partial** | Client round-trip real with schema validation and poison-pill guard (`LivingScreen.tsx` try/finally); server `GET /api/v1/export` preferred for UUID docs; failed imports leave prior graph unchanged (dashboard drag-drop path) |
| 21 | Source-mode indicator (Local / Cloud / Demo) | **Partial** | Parallel badge work (`src/honesty.ts`, `HonestyBadge.tsx`) landed during this run: Living shows "Demo data"/"Not connected", dashboard cards show per-doc "Local"; but the AppShell header badge sits inside `.doc-breadcrumb`, which is `display:none` below 1500 px (`src/styles.css:1656`) — invisible on canvas at the 1280 px Playwright/desktop width (screenshot-verified) |

Honesty-label coverage as observed: `Simulated` present (sandbox), `Sample` present
(reviewers), `Demo`/`Not connected` present on Living (landed mid-run via `src/honesty.ts`
+ `HonestyBadge`); `Local` source-mode present in markup (AppShell header, dashboard cards)
but **not visible on canvas at ≤1500 px viewports** — open gap for the badge work (see §7).

---

## 2. Endpoint inventory

Auth model: `AuthFilter` (`backend/src/main/java/com/archflux/security/AuthFilter.java:20-52`)
requires `Authorization: Bearer <static token>` on **all** `/api/v1/**` (401 `UNAUTHENTICATED`
otherwise); only `/api/health`, `/api/ready` are public. This shadows the Spring Security
public paths for `/api/v1/auth/**` and the webhook (SPEC_REPORT G1 — observed in filter code).

### REST — `GET /api/health`, `GET /api/ready` (public, no auth)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` → `{"status":"UP"}` | none |
| GET | `/api/ready` → `{ready}` / 503 `{ready:false,…}` | none |

### REST — Auth (`AuthController.java:33`, base `/api/v1/auth`; static Bearer required per filter)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/auth/login/github` (302) | static Bearer (G1 defect) |
| GET | `/api/v1/auth/login/google` (302) | static Bearer (G1 defect) |
| GET | `/api/v1/auth/login/saml` (302) | static Bearer (G1 defect) |
| GET | `/api/v1/auth/login/oidc` (302) | static Bearer (G1 defect) |
| GET | `/api/v1/auth/success` | static Bearer |
| GET | `/api/v1/auth/failure` | static Bearer |
| GET | `/api/v1/auth/me` | static Bearer |
| POST | `/api/v1/auth/magic-link` | static Bearer |
| GET | `/api/v1/auth/verify?token=` | static Bearer |
| POST | `/api/v1/auth/logout` | static Bearer |
| POST | `/api/v1/auth/refresh` | static Bearer |

### REST — Diagrams (`DiagramController.java:39`, base `/api/v1/diagrams`; static Bearer)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/diagrams` (page/limit≤50, `q` LIKE-escaped) | static Bearer |
| POST | `/api/v1/diagrams` | static Bearer |
| GET | `/api/v1/diagrams/{id}` (404 foreign-reads) | static Bearer |
| PUT | `/api/v1/diagrams/{id}` (403 foreign-writes) | static Bearer |
| DELETE | `/api/v1/diagrams/{id}` | static Bearer |
| GET | `/api/v1/diagrams/{id}/checkpoints` (`?branch=`) | static Bearer |
| POST | `/api/v1/diagrams/{id}/checkpoints` | static Bearer |
| DELETE | `/api/v1/diagrams/{id}/checkpoints/{cid}` | static Bearer |
| POST | `/api/v1/diagrams/{id}/checkpoints/{cid}/restore` | static Bearer |
| POST | `/api/v1/diagrams/{id}/branches` | static Bearer |
| GET | `/api/v1/diagrams/{id}/threads` | static Bearer |
| POST | `/api/v1/diagrams/{id}/threads` | static Bearer |
| GET | `/api/v1/diagrams/{id}/threads/{tid}/replies` | static Bearer |
| POST | `/api/v1/diagrams/{id}/threads/{tid}/replies` | static Bearer |

### REST — Engines (static Bearer; rate-limited to 60-bucket/1-per-s per IP on sync+lint only)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/lint` (optional body → `{orphans,dangling,ambiguous,ok}`) | static Bearer |
| GET | `/api/v1/export?diagramId=` (required) | static Bearer |
| POST | `/api/v1/sync` (canonical-SHA idempotency → `synced`/`noop`) | static Bearer |
| POST | `/api/v1/sync/webhook/git` (HMAC; unreachable w/o dev token — G1) | static Bearer (defect) |
| GET | `/api/v1/sync/webhook/git/health` | static Bearer (defect) |

### STOMP (`CollaborationController.java`; app prefix `/app`, broker `/topic`; no handshake auth — G2)

| Direction | Destination | Auth |
|-----------|-------------|------|
| inbound | `/app/diagram/{diagramId}/join` → `/topic/diagram/{diagramId}/updates` | none (defect) |
| inbound | `/app/diagram/{diagramId}/update` → `/topic/diagram/{diagramId}/updates` | none (defect) |
| inbound | `/app/diagram/{diagramId}/leave` → `/topic/diagram/{diagramId}/updates` | none (defect) |
| inbound | `/app/diagram/{diagramId}/save` (stub, no `@SendTo`) | none (defect) |
| inbound | `/app/diagram/{diagramId}/state` → `/topic/diagram/{diagramId}/state` | none (defect) |
| inbound | `/app/diagram/{diagramId}/awareness` → `/topic/diagram/{diagramId}/awareness` | none (defect) |

Real client does **not** use STOMP — `useCollaboration.ts` opens raw y-websocket
`ws://…/ws` room `diagram-<id>` + `?token` param. No server component speaks that protocol.

---

## 3. Migration inventory

Canonical: `backend/src/main/resources/db/migration/`; classpath copies under
`backend/src/main/resources/db/migration/` (V1 differs by one trailing newline —
checksum-relevant, not semantic). V3–V5 untracked in git in both trees. Flyway on +
`baseline-on-migrate` locally, **off in compose** (manual psql per DEPLOY), off in tests
(PostgresIT applies over JDBC). Strict V1→V5 ordering; no repeatables/undos.

| Ver | File | One-line contents |
|-----|------|-------------------|
| V1 | `V1__init.sql` | 6 tables (users/diagrams/checkpoints/threads/replies/sync_log) + `set_diagrams_updated_at()` trigger + 6 secondary indexes (incl. GIN on tags); guarded/re-runnable by header convention |
| V2 | `V2__additional_indexes.sql` | 3 ordered-query indexes: `idx_threads_diagram_created`, `idx_replies_thread_created`, `idx_sync_log_commit_sha` |
| V3 | `V3__production_hardening.sql` | RLS on 6 tables + `current_user_id()/current_user_has_role()` helpers, `audit_log` + 6 loop-created audit triggers, 8 CHECKs, soft-delete columns, 3 indexes, `archive_old_sync_logs()`, `try_advisory_lock()` |
| V4 | `V4__oauth_fields.sql` | 5 OAuth columns on users (`provider`, `provider_id`, `avatar_url`, `access_token`, `last_login_at`) + 2 provider indexes + `chk_users_provider` allow-list CHECK |
| V5 | `V5__versioning_branching.sql` | Diagram branching (`parent_diagram_id` self-FK SET NULL + `branch_name` default `main`) + checkpoint `branch`/`active` + 3 indexes; every statement guarded |

Known defects (all re-verified in the SQL on 2026-10-15):

- **V3 re-runnability:** `CREATE POLICY diagrams_owner` / `diagrams_shared_read`
  (`V3__production_hardening.sql:35-39`) are **unguarded** — a second apply fails; only
  the users/checkpoints/threads/replies/sync_log policies carry `DROP IF EXISTS` guards.
- **`chk_users_provider`:** added in V4 as a plain validating CHECK (no `NOT VALID`
  keyword observed in `V4__oauth_fields.sql`); column nullable so the allow-list
  (`github,google,email,sso,mock` — no `saml`/`oidc` though the login UI offers both) is
  only enforced on non-null values.
- **Dead badge check:** `checkpoints_badge_len` (`V3:187-189`) is guarded on
  `information_schema.columns … badge` — no migration ever creates a `badge` column, so
  the constraint can never materialize (harmless no-op as written).
- **Non-unique commit-SHA index:** `idx_sync_log_commit_sha` (V2:31-32) is a plain
  `CREATE INDEX` — sync idempotency is app-code-only (`SyncService` commit-SHA lookup),
  no DB uniqueness guarantee.
- **Untracked in git:** V3–V5 exist on disk but `git status` shows them untracked in both
  trees — a clean fresh clone at `6423499` does **not** contain them (Phase 0 exit-criteria risk).

---

## 4. Test inventory

### 4a. Vitest (jsdom) — 9 files, 66 active cases, 12 skipped

Counts via `rg -c "^\s*(it|test)\("` (active only); skips via `it.skip` grep.

| File | Active | Covers |
|------|--------|--------|
| `src/tests/store.test.tsx` | 6 | orphans/protocol inference, store mutations |
| `src/tests/canvas.test.tsx` | 9 | paint, drag, snap, connect, details editing |
| `src/tests/canvas-geometry.test.ts` | 8 | resize handles, clamp, snap guides, minimap transforms |
| `src/tests/persist.test.tsx` | 4 | debounce write, reload, pan/zoom restore, unload flush |
| `src/tests/canvas.accessibility.test.tsx` | 11 | canvas aria-label, tool-rail labels, library ARIA roles, drag/connect/multiselect/text/ink/layout/fit |
| `src/tests/store.integration.test.tsx` | 11 | selectors, lintCount, offline mutation queue |
| `src/tests/collaboration.test.ts` | 3 | Yjs `syncMap` last-writer-wins behavior |
| `src/tests/appshell.test.tsx` | 3 | shell icons/badge rendering |
| `src/tests/ux-release.test.ts` | 11 | thumbnails, blueprints, PR derivation, recents, storage accounting, `isSampleTeamReviewers` |
| **Total** | **66** | |

### 4b. Skipped tests — reported separately per PROD-012 (12 total)

| File:line | Skipped case |
|-----------|--------------|
| `canvas.accessibility.test.tsx:77` | screen-reader-only node list for traversal |
| `:92` | command palette ARIA attributes |
| `:114` | focus trap on modals |
| `:135` | opens command palette with Cmd+K |
| `:146` | closes modals with Escape |
| `:164` | single-key tool shortcuts |
| `:184` | Cmd+shortcut screen navigation |
| `:202` | touchstart node selection |
| `:217` | touchmove panning |
| `:239` | touchend node release |
| `:260` | pinch zoom gesture |
| `store.integration.test.tsx:237` | repaints live during drag |

The 11 accessibility skips leave WCAG keyboard/touch coverage as release blockers
(PRODUCTIZATION_SPEC §6.4: re-enable or track explicitly).

### 4c. Playwright E2E

| Spec | Tests | Covers |
|------|-------|--------|
| `e2e/critical-journeys.spec.ts` | 17 (16 journeys + 1 error-recovery) | onboarding, blank-canvas create, export/import, auto-layout, blueprints load/preview/save-as, review thread, settings persistence, theme, living resync, global shortcuts, focus mode, guest account menu, connector modal, minimap, multi-doc mgmt, canvas error-UI absence |
| `e2e/smoke.spec.ts` | 5 | header overflow, dock-collapsed canvas, phone tool-rail, dashboard + living overflow (mobile projects) |
| `e2e/debug.spec.ts` | 1 | canvas load + console-error logging (diagnostic) |
| `e2e/visual-regression.spec.ts` | 21 blocks over 38 baselines × 3 desktop browsers (`maxDiffPixels: 12000`, `threshold: 0.2`) | screen snapshots incl. focus-mode banner |
| `e2e/productization-honesty.spec.ts` | 5 (new, this phase) | HON contract labels — see §7 |

Guest-session pattern everywhere: `addInitScript` sets `archflux:session {mode:'guest'}` +
`archflux:onboarded 'true'`, then `goto('/#/canvas')` with `canvas-status` web-first assertions.

### 4d. Maven Surefire — 7 classes, 47 `@Test` (counts via `@Test` grep)

| Class | Tests | Covers |
|-------|-------|--------|
| `DiagramControllerTest` | 18 | auth, diagram CRUD, 403/404 asymmetry, pagination cap, LIKE escaping, threads, restore, branch filter, lint, sync idempotency, export, 413, rate limits |
| `AuthControllerTest` (`web/`) | 10 | me, magic-link, verify, logout, refresh |
| `LintServiceTest` | 8 | orphan/dangling/ambiguous rules, ordering, `ok` conjunction |
| `SyncServiceTest` | 5 | SHA idempotency, stateless model, ref resolution, delta counts |
| `DiagramRepositoryTest` | 4 | tags/unicode, updated-at trigger, scoping, cascades |
| `SyncControllerTest` | 2 | HMAC webhook vector |
| `PostgresIT` | infra (0) | shared PG container applying real migrations over JDBC |
| `TestInfraMocks` | helpers (0) | mock wiring |

---

## 5. Dependency inventory

### Frontend (`package.json`)

| Dep | Version | Role |
|-----|---------|------|
| react / react-dom | ^19.2.8 | UI runtime |
| react-router-dom | ^7.18.4 | hash routing |
| yjs | ^13.6.33 | CRDT collaboration |
| y-websocket | ^3.1.0 | collab transport (no matching server) |
| y-protocols | ^1.0.7 | awareness protocol |
| aws-icons | ^3.3.0 | shape icons (+ 12 vendored SVGs in `public/icons/aws/`) |
| react-icons | ^5.7.0 | UI icons |
| vite | ^8.3.0 | build (esbuild minify, `es2023`) |
| typescript | ~6.0.2 | types (`erasableSyntaxOnly`) |
| vitest | ^5.0.3 | unit tests |
| @playwright/test | ^1.64.0 | E2E |
| oxlint | ^1.81.0 | lint |

### Backend (`backend/pom.xml` — Spring Boot 3.5.16, Java 21)

| Dep | Version | Role |
|-----|---------|------|
| spring-boot-starter-parent | 3.5.16 | BOM (Boot, Security 6.4, JPA/Hibernate 6.6) |
| java.version | 21 | toolchain (`eclipse-temurin:21-jre-alpine` image) |
| postgresql (runtime) | **BOM-managed, unpinned** | PG JDBC driver |
| flyway-core | BOM-managed | migrations (validate-only JPA: `ddl-auto: validate`) |
| springdoc-openapi-starter-webmvc-ui | 2.6.0 | OpenAPI generation |
| jjwt-api/impl/jackson | 0.12.5 (HS256) | JWT (no iss/aud/kid/revocation; refresh never minted) |
| spring-security-saml2-service-provider | BOM-managed (+ shibboleth repo) | SAML SP |
| sendgrid-java | 4.10.3 | email (default provider is mock) |
| spring-boot-starter-mail / jakarta.mail-api | BOM / 2.1.2 | SMTP path |
| spring-boot-starter-webflux | BOM-managed | Resend HTTP path (key-path mismatch — SPEC_REPORT G9) |
| spring-boot-starter-websocket | BOM-managed | STOMP broker (disconnected from client) |
| spring-session-data-redis / starter-data-redis | BOM-managed | sessions + magic links (no Redis in compose) |
| testcontainers / junit-jupiter / postgresql | **BOM-managed, unpinned** | PG integration tests |

### Platform

| Component | Version | Note |
|-----------|---------|------|
| PostgreSQL (compose `compose.yml:9`) | `postgres:15-alpine` | skew vs docs/tests PG17 (SPEC_REPORT §6.4; `PostgresIT` uses a PG17 container) |
| Redis | **absent** | configured (`application.yml` localhost:6379) but not provisioned in compose (SPEC_REPORT G6) |

---

## 6. Persistence inventory (`archflux:*` keys)

Owner = module that reads/writes the key. All browser-local; **no provider secrets key
exists, but `archflux:auth_token` holds the user bearer/JWT in localStorage**
(PROD-011 concern) and GitHub PAT is kept client-side via the connectors screen.

### localStorage

| Key | Owner | Contents |
|-----|-------|----------|
| `archflux:v2-light` | `store.tsx:183` (primary v5 doc) | `{docs[], activeDocId, theme, docTitle, displayName, threadsByDoc, cpsByDoc, syncLog, freshness, freshnessLabel, driftCount, pan, zoom, v:5}`; 300 ms debounce + `beforeunload` merge |
| `archflux:session` | `session.ts:1` | `{mode: guest\|email\|sso\|…}` guest-aware session |
| `archflux:auth_mode` | `session.ts:15` | mirror of session mode |
| `archflux:auth_token` | `api.ts:51-53`, `AppShell.tsx:66-75` | bearer/JWT for `request()` Authorization header |
| `archflux:onboarded` | `OnboardingScreen.tsx:25` | `'true'` once wizard finished/skipped |
| `archflux:persona` | `OnboardingScreen.tsx:81` | selected persona id |
| `archflux:providers` | `OnboardingScreen.tsx:26` | selected cloud-provider pills |
| `archflux:settings:v1` | `settings.ts:19` | style/grid/snap/curve/export/shortcuts |
| `archflux:team:v1` | `SettingsTeamScreen.tsx:15` | team members, roles, SSO provider, approval count (seed Ravi/Elena/Marcus) |
| `archflux:connectors:v1` | `LivingScreen.tsx:8` | connector list (seeded from `mockConnectors`) |
| `archflux:git-branch:v1` | `GitScreen.tsx:7` | server branch filter |
| `archflux:pinned` | `DashboardScreen.tsx:100-163` | pinned doc ids |
| `archflux:dashboard:view:v1` | `DashboardScreen.tsx:8` | grid/table view |
| `archflux:recent-shapes:v1` | `CanvasScreen.tsx:38` | MRU shape recents (cap 8) |
| `archflux:minimap:v1` | `CanvasScreen.tsx:491-503` | open/closed |
| `archflux:pending-draft` | `CanvasScreen.tsx:538-550` | rescued text/ink draft (route-switch/unload) |
| `archflux:preserve-layout` | `LivingScreen.tsx:35,456` | resync layout checkbox |
| `archflux:last-ping` | `LivingScreen.tsx:43,161` | last resync display time |
| `archflux:mutation-queue:v1` | `api.ts:146` | offline `{path, options, retries:3, timestamp}` queue |
| `archflux:blueprints:custom:v1` | `BlueprintsScreen.tsx:9` | user-saved blueprints (cap 25) |
| `archflux:corrupt-backup` | `ErrorBoundary.tsx:30-32` | stashed broken graph after boundary trip |

### sessionStorage

| Key | Owner | Contents |
|-----|-------|----------|
| `archflux:merged-prs:v1` | `GitScreen.tsx:9,15,25` | merged PR ids (tab-session scoped) |
| `archflux:ack-drift:v1` | `LivingScreen.tsx:64-76` | session-scoped lint-drift dismissals |

---

## 7. HON-contract E2E (new spec)

`e2e/productization-honesty.spec.ts` asserts the Phase-0 honesty contract with TEXT
selectors against a guest session (`archflux:session {mode:'guest'}`,
`archflux:onboarded 'true'`), per the `critical-journeys.spec.ts` pattern. No fixed
sleeps; web-first assertions only. Application code was **not** modified to make tests pass.

| # | Assertion | Result (2026-10-15, chromium, 1280×720) |
|---|-----------|-------------------------------|
| 1 | Living screen shows `/Demo/i` | **PASS** (after mid-run badge landing) — "Demo data" callout (`LivingScreen.tsx:317-319`, via `src/honesty.ts:20-21`) |
| 2 | Living screen shows `/Not connected/i` | **PASS** (after mid-run badge landing) — default connector state (`src/honesty.ts:24-25,120`) |
| 3 | Merge & Automation tab shows `/Simulated/i` | **PASS** — "Merge Diagram PR (simulated)", "Send Simulated Request" (`GitScreen.tsx:269,359`) |
| 4 | Reviews discussion shows `/Sample/i` reviewers badge | **PASS** — `Sample` badge (`ReviewsScreen.tsx:196`) |
| 5 | Canvas + dashboard show source-mode `/Local/i` as guest | **FAIL** — `page.getByText(/Local/i).first()` on `#/canvas` resolves to 0 visible elements. Root cause (screenshot-verified, no app code touched): the only canvas "Local" badge is the AppShell `HonestyBadge` inside `.doc-breadcrumb` (`AppShell.tsx:279-288`), and `src/styles.css:1656-1660` sets `.doc-breadcrumb { display: none }` below 1500 px — so at the 1280 px default viewport the badge is in the DOM but never visible. Dashboard per-card badges (`DashboardScreen.tsx:460-465,554-559`) are unaffected |

Full run: **4 passed, 1 failed** (chromium project; `npx playwright test
e2e/productization-honesty.spec.ts --project=chromium`). The single failure is the
canvas source-mode visibility gap above — owned by the parallel badge work (badge needs a
viewport-safe home on canvas, e.g. outside `.doc-breadcrumb`), not by this spec.
Re-run after that fix; failing selector quoted verbatim above. Run command:
`npx playwright test e2e/productization-honesty.spec.ts`.
