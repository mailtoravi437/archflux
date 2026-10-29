# ArchFlux — Comprehensive Specification Report

> **Path note (2026-10-24):** this report predates the service split. Read `src/…` as `frontend/src/…`,
> `server/…` as `backend/…`, and `db/migrations/` as `backend/src/main/resources/db/migration/`.
> Current boundaries and gap register: [SERVICES_SPEC.md](SERVICES_SPEC.md).

> **Generated:** 2026-10-15 | **Scope:** Features · Flows · Frontend · Backend · Database · DevOps · Testing
> **Method:** Read against live code, migrations, configs, and the in-repo specs (`README.md`, `SPEC.md`,
> `FRONTEND_SPEC.md`, `BACKEND_SPEC.md`, `UI_UX_SPEC.md`, `BACKEND_PLAN.md`, `DEPLOY.md`), plus spot-verification
> of claims via the source. Where code and spec disagree, this report says so explicitly (§12).
> **Working tree:** `main` @ `6423499` + uncommitted changes (V3–V5 migrations, auth/STOMP config, several screens).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Feature Catalogue](#3-feature-catalogue)
4. [Frontend Specification](#4-frontend-specification)
5. [Backend Specification](#5-backend-specification)
6. [Database Specification](#6-database-specification)
7. [End-to-End Flows](#7-end-to-end-flows)
8. [Design System & UX](#8-design-system--ux)
9. [Real-time Collaboration](#9-real-time-collaboration)
10. [DevOps, Deployment & Configuration](#10-devops-deployment--configuration)
11. [Testing & Quality Gates](#11-testing--quality-gates)
12. [Spec-vs-Code Conformance: Verified Gaps & Risks](#12-spec-vs-code-conformance-verified-gaps--risks)
13. [Appendix: File Map & Key Identifiers](#13-appendix-file-map--key-identifiers)

---

## 1. Product Overview

**ArchFlux** is a developer-first cloud topology authoring platform — a bidirectional **Living Architecture Editor**.
Visual `.arch` JSON artifacts stay synchronized with production telemetry (Kubernetes manifests, OpenAPI 3.1 contracts,
Terraform state files). It sits between static diagramming tools (Lucidchart, Miro) and code-only visualizers
(Terraform graph).

**Positioning:** Release v2.4.0-PROD (README) / UI_UX_SPEC v2.3.0. Web + Electron (Chromium 120+). Responsive 1280px → 4K ultrawide.

**Core architectural principles:**

| # | Principle | What it means in the product |
|---|-----------|------------------------------|
| 1 | Local-First Determinism | Land on `#/login`, diagram immediately as guest; data in browser (`archflux:*`); cloud pairing attaches lazily |
| 2 | Dual Visual Style Engine | `Hand-Drawn Sketchy` (RFCs, threat modeling) vs `Clean Architectural` (exec decks, audits) |
| 3 | Self-Healing Schemas | In-memory graph linter detects dangling wires, orphan nodes, protocol ambiguity; 1-click idempotent auto-bind |
| 4 | CI/CD Native / GitOps Merge Gating | Diagrams follow a verification lifecycle: schema validation → lint gating → drift verification before merge |

**The v2.4 headline fix** — eliminating "Canvas Panel Warfare": the node/edge inspector used to collide with the live
Architecture Linter drawer. Replaced by a **unified right utility dock** (tabbed Inspector / Linter / Live) plus a
two-tier application chrome and an automated topology healing engine.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArchFlux System                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TS + Vite)          Backend (Spring 3.5) │
│  ┌─────────────────────────┐            ┌────────────────────┐  │
│  │ Hash Router (SPA)       │◄──REST──►  │ Controllers        │  │
│  │ 5 Split Contexts        │            │ Services           │  │
│  │ Yjs Collaboration       │◄──WS──────►│ STOMP Broker       │  │
│  │ Canvas 2D Rendering     │            │ JPA + PostgreSQL   │  │
│  │ Local Contract Derivation           │ Flyway Migrations  │  │
│  └─────────────────────────┘            └────────────────────┘  │
│         ▲                                         ▲               │
│         │              Docker Compose              │               │
│         └──────────────────┬──────────────────────┘               │
│                            ▼                                       │
│                    PostgreSQL 17 + Redis                           │
└─────────────────────────────────────────────────────────────────┘
(SPEC.md architecture diagram — see §9/§12 for how much of the WS leg is actually live.)
```

### 2.1 Topology & ports

| Service | Image / runtime | Port | Role |
|---------|-----------------|------|------|
| `web` | nginx:alpine serving `dist/` | host `${WEB_PORT:-8080}` → 80 | SPA shell + `/api` reverse-proxy + `/config.json` runtime config |
| `server` | `eclipse-temurin:21-jre-alpine`, non-root `appuser` (uid 10001), `target/app.jar` | host `${SERVER_PORT:-3001}` → 3001 | Spring Boot REST API + STOMP broker |
| `db` | `postgres:15-alpine` | internal only in prod compose (published `:5432` in dev via override) | PostgreSQL, named volume `pgdata`, `pg_isready` healthcheck, 30s grace |
| Redis | **not provisioned in compose** | — | configured in `application.yml` (`localhost:6379`) but absent from the stack; tests disable it (see §12) |

### 2.2 Source layout

| Area | Frontend | Backend |
|------|----------|---------|
| Entry | `src/main.tsx` | `server/src/main/java/com/archflux/ArchfluxApplication.java` |
| Routes | `src/App.tsx` | `server/src/main/java/com/archflux/web/*Controller.java` |
| State | `src/store.tsx` (5 contexts) | `server/src/main/java/com/archflux/service/*Service.java` |
| Types | `src/types.ts` | `server/src/main/java/com/archflux/domain/*.java` |
| API | `src/api.ts` | `server/src/main/resources/application.yml` |
| Schema | — | `db/migrations/V*__*.sql` (canonical) ↔ `server/src/main/resources/db/migration/` (classpath copy) |
| Config | `vite.config.ts`, `tsconfig.json` | `server/pom.xml` |

**Code volume (approx.):** ~16,600 LOC frontend (`src/`), ~6,650 LOC backend (`server/src/main`), 5 migrations (~845 SQL lines).
Largest files: `CanvasScreen.tsx` (3023), `store.tsx` (2157), `styles.css` (1901).

---

## 3. Feature Catalogue

### 3.1 Screen directory & routing matrix

Hash routing (`createHashRouter`) — deep links work on plain static hosts. Authenticated and guest sessions share one
`AppShell`; `/login` and `/onboarding` render chrome-less. A `⌘K` command palette with focus-trap is reachable from
every authenticated screen.

| Category | Route | Screen | Core capabilities | Shortcuts |
|---|---|---|---|---|
| Auth | `#/login` | Authentication & Entry | Magic link, GitHub/Google OAuth, SAML SSO, 1-click Local Guest | — |
| Auth | `#/onboarding` | Setup & Persona Wizard | Persona, cloud provider pills, seed topology | Enter / 1–4 |
| Auth | `#/auth/callback` | OAuth callback | JWT capture → session → redirect | — |
| Workspace | `#/dashboard` | Document Library | Search, multi-doc mgmt, duplicate, tags, pins, bulk ops | `/` or `⌘O` |
| Authoring | `#/canvas` | Precision Canvas Editor | 38 cloud shapes, orthogonal auto-router, linter & inspector | V H P S G D Q N C T L |
| Living Sync | `#/living` | Infrastructure Reconciler | Drift detection (K8s/OpenAPI/TF), 1-click re-sync | `⌘S` / R |
| Review | `#/reviews` | Reviews, Merge & Automation | Checkpoints, visual A/B diff, pinned RFCs, PR merge gating, REST sandbox | D / Space / `⌘G` |
| Templates | `#/blueprints` | Topology Catalog | 9 curated architectures, collision-safe Insert vs. Replace | B / `⌘B` |
| Settings | `#/settings/general` | Preferences | Style, grid, snap, curve, export, shortcut rebinding | `⌘,` |
| Settings | `#/settings/connectors` | Integrations | GitHub PAT, K8s endpoints, polling rate | — |
| Settings | `#/settings/team` | Access Control & Roles | RBAC (Admin/Editor/Reviewer/Viewer), SAML SSO, approval policy | — |
| Settings | `#/settings/storage` | Storage & Cache Health | Quota inspection, integrity scan, backup, reset | — |
| Legacy | `#/git` → `#/reviews` (merge tab) | redirect | — | — |
| Fallback | `*` → `#/dashboard` | guarded by session | — | — |

Lazy-loaded via `withFallback()` (Suspense "Loading ArchFlux…" shell): dashboard, canvas, living, reviews, blueprints,
settings subtree. Login/onboarding/callback are eager. `RequireSession` gates `/` (guest sessions count — zero network).

### 3.2 Authentication & onboarding (F1)

**`#/login` — zero-barrier entry.**
- Layout: Brand Column (45%: animated drift-healing SVG + testimonials) / Auth Stage (55%: elevated card).
- Tabs: Work Email (6-digit OTP, auto-verify on complete, digits-only paste), Magic-Link (real `POST /api/v1/auth/magic-link`),
  GitHub / Google / SAML / OIDC / SSO (real redirects to `${API}/auth/login/<provider>?redirect_uri=<origin>/#/auth/callback`),
  org-slug SSO (`setSession({mode:'sso'})`).
- Escape hatch: **"Continue as Local Guest"** → `archflux:auth_mode='guest'`, straight to `#/canvas`, no network.
- States: button spinner (`aria-busy`), inline error banners, email autofocus, Enter submits.

**`#/onboarding` — 3-step wizard** (Role Profile → Cloud Stack → Seed Topology).
- 4 personas incl. "Other / Not sure", each with recommended blueprints; keys `1–4` + Enter.
- Provider pills (AWS, Google Cloud→GCP alias map, Azure, Kubernetes, Kafka, Snowflake) with live shape-count preview
  ("Your shape library will show N shapes", up to 6 icons; 0 shapes → warning, Continue stays enabled).
- Seed: Blank or persona-recommended blueprint (loaded via `loadGraph(blueprintGraph(seed))`).
- Finish writes `archflux:onboarded='true'`, `archflux:providers`, `archflux:persona` → `#/canvas`. Skip link at every step.

### 3.3 Document library (F2 — `#/dashboard`)

- Top bar: instant global search (`/` focuses), sort (Modified/Created/Nodes/Alpha), Grid/Table toggle.
- Cards: SVG thumbnails (first 30 nodes), title, `[git:main]` branch chip, node/edge badges, sync pill (●/⚠️), relative
  timestamps, tag chips; ⋯ menu (Duplicate with UUID remap + `(Copy)` suffix, Rename inline, Export `.arch`/PNG,
  Edit tags, two-click Delete with 4s draining countdown).
- Pinned section (`archflux:pinned`, ☆/📌, sorted first) + Recently-opened top five.
- **StorageCard:** doc count / 25 cap progress bar; ≥80% "nearly full" + Free-up (opens bulk select), ≥95% "full"; `usedKB`
  summed across all `archflux:` keys.
- Multi-select + bulk delete (10s undo toast or explicit irreversible copy); drag-drop `.arch`/`.json` import with schema
  validation; table view with sortable `aria-sort` headers; distinct empty states for "no diagrams" vs "no results".
- Library cap: **25 diagrams** — `newDoc`/`duplicateDoc` refuse with "Library full (25 diagrams) — delete one first".

### 3.4 Precision canvas editor (F3 — `#/canvas`, the flagship)

- **Rendering:** single imperative 2D `<canvas>` (`#architectureCanvas`), DPR-aware; no DOM per node; viewport culling
  (+80-unit margin); viewport emits `data-nodes`, `data-edges`, `data-icons-ready` for tests. Grid: dots (default) / lines / none.
- **Node shapes:** `rectangle` (32px header), `rounded` (r=10), `cylinder` (db, ellipses), `logo` (icon-only). Icon, emoji fallback,
  label (19-char truncate), tag, up to 3 `details` lines. Selection: blue `#2563EB` / amber `#D97706` + shadow; thread pins
  (amber open / green resolved) at top-right.
- **Real AWS icons:** 12 official AWS Architecture SVGs vendored in `public/icons/aws/`, rendered via `iconSrc` + async
  image cache (`iconImgCache`); non-AWS shapes keep emoji glyphs. ~60 icons preloaded; `data-icons-ready` gates visual tests.
- **Interaction state machine** (`dragRef` modes `node|pan|stroke|text|resize`):
  - Space/middle-button/pan-tool → pan; hit node → select (Shift = multi, no-drag) + armed connect; hit edge/stroke/text →
    select+grab; empty → pan + clear selection.
  - Move: ink capture (≥2px), group/resize/node drag (one `checkpoint(false)` at grab, then silent per-frame updates),
    guides from `snapNode` (Alt suspends snapping), Shift locks resize aspect; Up: commit ink as one `FreeStroke` (one undo step).
  - Wheel: plain scroll pans; Ctrl/Cmd+scroll zooms **to cursor** (exp, clamped 0.1–4.0). Double-click: rename node / edit text.
  - Keyboard: Space hold = temp pan; `Ctrl/⌘+A/Z/D`, arrows nudge (1px, Shift=10px, checkpoint key `nudge:<id>`), `F` fit/selection,
    `M` minimap, `L` library, `Q` lock toggle, `Esc` finish-draft-then-clear. All tool keys rebindable with clash detection.
- **Connectors:** magnetic ports (4/node, 16px radius, port ×150% + `#6366F1` halo); orthogonal router (mid-X elbow, 3–4 pts)
  / bezier (16-step) / straight; dashed `[4,4]` / dotted `[2,4]`; arrowheads `end|both|none`; dangling wires carry `targetCoords`.
- **Freehand ink:** continuous pencil, one `FreeStroke` per stroke (one undo step), 6 colors × 3 widths, select/drag/restyle/delete,
  persisted + exported + fit-to-bounds.
- **Free text:** `T` tool, click-type inline editor (Enter/Esc commits — Esc never discards), Shift+Enter newline, 4 fonts
  (Caveat, Patrick Hand, Plus Jakarta Sans, Fira Code), B/I, 6 colors, 4 sizes, fills + border toggle; toolbar floats
  adjacent to selection AND mirrors in Inspector → Text Style; drafts rescued on route-switch/unload (`archflux:pending-draft`).
- **Right dock** (`#linterDrawer`, tabs inspector · linter · live, `dockOpen`, per-tab scroll preserved, phone FAB `dock-reopen`):
  - Inspector — node fields (Label `#inspector-label`, Tag, Status, Details), fill/border swatches, provider icons, stroke
    widths `[1,1.5,2.5,4]`, shape switcher, metadata (port/repo/source), Focus/Duplicate/Delete; route inspector
    (label, colors, `PROTOCOLS`, line style, arrowheads); text-style panel; diagram outline (y-sorted + conn counts).
  - Linter — `orphans` (degree 0) / `danglings` (`!to||isDangling`) / `ambiguous` (connected + untagged); badge `#linterCountBadge`
    pulses on new issues; per-card Inspect / Auto-bind / Prune / Tag-REST + global Heal-All (one undo step).
  - Live — embedded `CollaborationPanel`.
- **Library drawer:** search, MRU recents (cap 8), category tabs with live counts, draggable `LibraryShape`s; click = place at
  view center, drop = precise place (`placeShapeRecorded`).
- **Overlays:** zoom HUD bottom-left; ink/text/comment composers float centered above the HUD line (`bottom: 76px`) — never collide;
  `⌘K` palette (fuzzy, every action), shortcuts dialog (`?`), focus mode, toasts, docs popover, error boundaries.
- **A11y:** `role="img"` + descriptive `aria-label`, sr-only node/route nav with per-entity `data-testid`, debounced live announcements.

### 3.5 Living Sync (F4 — `#/living`)

| Connector source | Descriptors | Cadence | Drift trigger |
|---|---|---|---|
| Kubernetes | Deployments, Services, Ingress, CRDs | webhook / 30s poll | replicas, ports, new namespace services |
| OpenAPI 3.1 | `openapi.json`, `swagger.yaml` | commit webhook / 5m poll | endpoint add/remove, schema changes |
| Terraform | `terraform.tfstate`, `plan.json` | CI/CD trigger | provisioning, subnet shifts, SG edits |

- Connectors persisted (`archflux:connectors:v1`), seeded from `mockConnectors`; add (modal: K8s/OpenAPI/TF/Custom, no credentials
  collected — stated), 2-step simulated verify, retry, two-click remove. Polling `realtime|5m|1h|manual`.
- Drift reconciler: **live lint-derived rows** (`lint-orphan-<id>` mod, `lint-dangle-<id>` del) merged with upstream
  (`mockDriftLines`); severity→type→name order; source-labeled (derived rows = "Derived from canvas"); Accept (resync + jump
  to node) / Reject (upstream dismiss reversible from history; lint dismiss session-scoped `archflux:ack-drift:v1`).
- Re-sync: progress bar + Cancel, 700ms simulated run injecting `fraudWorkerNode` + `e-fraud-k`, `fresh` + `driftCount 0`;
  preserve-layout checkbox (`archflux:preserve-layout`); last-ping display; offline banner when `!isOnline`.
- File transfer: `.arch` download (`exportArch`), validated import; Sync Activity Log (newest first, cap 30).
- Poison-pill guard (§7.9) covers rejected imports.

### 3.6 Reviews, Merge & Automation (F5 — `#/reviews` + `#/git` redirect)

- **Checkpoints (left rail):** immutable named snapshots, timeline newest-first, tag/restore (auto-stash, undoable)/two-click delete,
  A/B compare (node-set diff + side-by-side `BlueprintThumb`s + shape+text legend; A=B guarded), branch create +
  `branchError`/`retryBranch`, **server branch filter** (`archflux:git-branch:v1`, `api.listCheckpoints(id, branch)`).
- **Reviewers:** from `archflux:team:v1`, Admins auto-approved (visually distinct), static trio fallback labeled "Sample reviewers";
  Request Changes / Approve Architecture (simulated); PR title from active doc.
- **Threads (right rail):** node- or `__canvas`-pinned, markdown-lite, @mentions (team datalist), replies (Enter), resolve/reopen
  (collapsed when resolved), two-click delete, detached-node badge, Jump-to-Node; display name (40-char cap).
- **Merge & Automation tab** (`GitScreen`, `⌘G`): PR list = checkpoint-derived (`cp-<id>`, mergeable) + curated samples (labeled,
  not mergeable); merged ids in sessionStorage `archflux:merged-prs:v1`; live gating (schema / linter / drift with quick-fix
  `healOrphan()`/`pruneWire()`); Merge disabled + tooltip naming blockers; merge → `tagCheckpoint('merge-pr-<id>')`.
- **REST sandbox:** endpoint select (`POST /api/v1/sync`, `GET /api/v1/export`, `POST /api/v1/lint`), JSON body with syntax
  validation, 350ms simulated latency, `#apiOutputTerminal`, call history, cURL copy with `redactSecrets()`.

### 3.7 Blueprints (F6 — `#/blueprints`)

9 curated architectures (Kafka/CQRS, multi-region AWS VPC, RAG pipeline, Istio mesh, Zero-Trust OIDC, financial ledger,
IoT telemetry, GraphQL federation, serverless edge). Category pills + live-count search.
- Deterministic `BlueprintThumb` SVG mini-maps (dangling skipped, Empty state, blank-slot sub-grid for single-node).
- Preview modal: node + route lists (dangling flagged). **Insert** (append right, collision-safe UUID remap) vs
  **Load/Replace** (dirty-guard confirm); both one undo step. Save-canvas-as-blueprint (≤60 chars, cap 25, empty guarded,
  quota-safe), custom section with confirmed non-undoable delete. Esc closes; focus-trapped.

### 3.8 Settings (F7 — `#/settings/*`)

- **General:** live SVG style preview; style `sketchy|architect` (sketchy stored but not consumed by the draw pass — §12);
  grid `dots|lines|none`; snap `5|10|20|off`; curve `orthogonal|straight|bezier`; export `1x|2x|4x`; `embedMetadata`;
  per-tool shortcut rebinding with clash detection (Esc/Tab/Enter unrebindable); replay tour; independent resets.
- **Connectors:** PAT (show/hide, ≥8 chars, local-only note), repo/path, webhook URL + copy, `whsec_` rotation with confirm,
  simulated verify, polling cadence.
- **Team:** `archflux:team:v1` (seed Ravi/ Elena/Marcus); email invite (Viewer, duplicate-checked); role select with
  descriptions; last-Admin removal blocked; SSO provider (Okta/Azure AD/Google); approval count 1–5; audit-trail export.
- **Storage:** per-key byte inspector (sorted) + total; POSIX-ustar + gzip workspace backup; integrity scanner; cache clear
  (9 keys + 2 prefixes preserved); `RESET`-gated factory reset (600ms delayed reload).

### 3.9 Global shell (F8 — `AppShell`)

Screen tabs with drift/dirty (`•`), linter (`lintCount`, pulse), unresolved-thread, and auth-missing (`!`) badges;
logo → canvas; `⌘K`, `?`, canvas-only Undo/Redo with depth tooltips, theme select, focus mode, export; account menu
(initial avatar, green/gray presence, guest↔sign-in, Profile & Team); freshness pill → living; `⌘K` palette (fuzzy,
all 38 shapes, all docs, all actions, disabled-aware undo/redo); diagrams popover (open/rename/duplicate/two-click-delete);
present mode (fullscreen + Esc banner); `ToastTray` (`aria-live`); global chords (`⌘O/B/G/S`); route titles in
`document.title`; whole tree under `ErrorBoundary`.

---

## 4. Frontend Specification

### 4.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | React | 19.2.8 |
| Language | TypeScript | ~6.0.2 (`erasableSyntaxOnly`, `noUnusedLocals/Parameters`) |
| Build | Vite | 8.3.0 (esbuild minify, `es2023`, relative `base: './'`) |
| Router | react-router-dom | 7.18.4, hash mode |
| State | React Context (5 split) | — |
| Real-time | yjs 13.6.33 + y-websocket 3.1.0 + y-protocols | — |
| Icons | aws-icons 3.3.0, react-icons 5.7.0, vendored SVGs | — |
| Tests | Vitest 5.0.3 + Testing Library + Playwright 1.64 | — |
| Lint | oxlint 1.81.0 | — |

No UI framework — hand-rolled inline styles + one 1901-line `styles.css` token system.
Theme is bootstrapped pre-paint from `archflux:v2-light` (no light→dark flash).

### 4.2 State (5 split contexts, `store.tsx`, 2157 lines)

| Context | Owns | Update cadence |
|---|---|---|
| `DiagramCoreContext` | nodes, edges, strokes, texts, 4 selection ids, multiSel | high (drag/keystroke) |
| `DiagramActionsContext` | all mutations (stable refs) | stable |
| `DiagramUIContext` | theme, zoom/pan, tool, grid/ortho/snap, freshness, toasts, online, lintCount | medium |
| `DiagramDocsContext` | docs[], activeDocId, CRUD | low |
| `DiagramCollabContext` | threads, checkpoints, syncLog, heals, exports, branches | low |

Undo/redo is ref-based (max depth 30, deep-cloned `GraphSnap`s); `checkpoint(markDrift)` once per gesture, silent
updates after. Toasts (max 3, 5s, hover-pause, 1.2s dedupe) and syncLog (cap 30) share a cap/trim discipline; threads 100,
checkpoints 20 (newest `active: true`), docs 25.

### 4.3 Persistence (19 keys + 2 session-scoped; full registry in `UI_UX_SPEC.md` §0.7)

Primary: **`archflux:v2-light` v5** — `{docs[], activeDocId, theme, docTitle, displayName, threadsByDoc, cpsByDoc,
syncLog, freshness, freshnessLabel, driftCount, pan, zoom, v:5}`. Debounced 300ms (deps include collection sizes);
`beforeunload` merges `{docs, activeDocId, pan, zoom}` synchronously. Loader sanitizes every entity
(`isValidNode/Edge/Stroke/Text/Thread`, `sanitizeCheckpoint/ThreadMap/CpMap`), `reconcileOrphans()`, migrates v1–v3
single-graph and legacy flat threads/checkpoints; blank docs are valid. Zoom clamped 0.1–4.0; pan default `{50,40}`.

### 4.4 `src/api.ts` — fetch wrapper + offline queue

`API_BASE = window.__ARCHFLUX_API_URL__ || '/api'` (build `VITE_API_URL`, runtime `/config.json`).
`request()` attaches `archflux:auth_token` Bearer, propagates `X-Correlation-ID`, throws `err.error?.message` on non-OK,
returns `undefined` on 204, `credentials: 'include'`. Covers all 26 backend endpoints + token helpers.
Offline queue (`archflux:mutation-queue:v1`): stores `{path, options-minus-callbacks, retries: 3, timestamp}`, processes on
load and `online` events, rejects after 3 attempts.

### 4.5 Canvas geometry (`canvasGeometry.ts`, unit-tested)

`resizeHandles` (E/S/SE, 12px screen), `hitResizeHandle` (≥24px), `clampNodeSize` (100×50–400×200),
`snapNode` (left/center/right × top/center/bottom, 0 disables, returns cyan `GuideLine[]`),
`minimapTransform` + `worldToMini`/`miniToWorld` (160×100, pad 8).

### 4.6 Contract derivation (`contracts.ts`, local-first)

`deriveEndpoints` skips dangling/unknown edges; `inferProtocol` (explicit → gRPC/Async/WS keywords → REST default);
`inferMethod` (label verb → RPC/PUB/SUB/GET/WS/EVENT; data-plane ops excluded → `null`); `inferPath` (first `/path` token
else `/<slug>`); `inferStatus` (dangling/target-orphan → drift; explicit protocol → verified; else unknown).
`contractSummary` → `{total, drift, verified}`. No backend registry (flagged future).

### 4.7 Components & hooks

- `AppShell.tsx` (575) — shell, palette, toasts, popover, focus mode (§3.9).
- `ToolPalette.tsx` (131) — rail groups Navigate/Shapes/Create/Annotate, `LOCKABLE` 6 tools, lock indicator.
- `CollaborationPanel.tsx` (150) — presence header, user list, status footer, `embedded` mode; stub `PresenceIndicators`.
- `ErrorBoundary.tsx` ×2 — app-level (corrupt-backup → safe default → reload) and generic (Try Again).
- `iconRegistry.tsx` (146) — `/icons/**` map, memoized `<img>` factory, fallback component (screens use inline `<img>`).
- `useCollaboration.ts` (347) — shared refcounted Yjs sessions, y-websocket transport, REST hydrate, awareness, guarded remote apply.
- `useDiagram.ts` (64) — guarded context selectors. `useFocusTrap.ts` (33) — Tab cycling. `useAuth.ts` — **not present** (spec drift, §12).
- `settings.ts` — `archflux:settings:v1` + `DEFAULT_SETTINGS`. `session.ts` — guest-aware session + `auth_mode` mirror.
- `mocks.ts` — 9-node mesh (+`legacy-billing` orphan, `dangle-wire`), 3 ink strokes, heal/fraud fixtures, connectors, drift rows,
  checkpoints, comment, 9 blueprints, 3 PRs, **38 library shapes**, `blueprintGraph()`.

### 4.8 Frontend test inventory

Vitest (jsdom, fake storage/observers, silenced console): 9 files, ~66 cases — store (orphans/protocols), canvas paint/drag/
snap/connect/details, persistence (debounce/reload/pan-zoom/unload), a11y (partly `it.skip`ped), integration (selectors,
lintCount, queue), collaboration (`syncMap` LLW), appshell icons, geometry, ux-release (thumbnails/blueprints/PRs/recents/
storage/reviewers). E2E: critical journeys 17, smoke 5 (mobile touch), debug 1 (diagnostic). Visual: 38 baselines × 3
desktop browsers = 114 PNGs (`maxDiffPixels: 12000`, `threshold: 0.2`, icon-ready + frame-quiescence waits).

---

## 5. Backend Specification

### 5.1 Stack

Spring Boot **3.5.16**, Java **21**, artifact `com.archflux:archflux-server:1.0.0` → `target/app.jar`, port 3001.
JPA/Hibernate 6.6 (`ddl-auto: validate` — never creates schema), Flyway 11.x, Spring Security 6.4 (OAuth2 client +
resource server + SAML2 SP via Shibboleth-hosted OpenSAML), JJWT 0.12.5 HS256, STOMP+SockJS, Redis sessions,
springdoc 2.6.0, SendGrid 4.10.3 + JavaMail + WebFlux (Resend), Testcontainers 1.20.
Single-token dev identity `DEV_USER_ID = 11111111-…-111111111111` (`dev@archflux.local`, admin).

### 5.2 REST API (base `/api/v1`; full table in `BACKEND_SPEC.md`)

- **Health:** `GET /api/health` → `{"status":"UP"}`; `GET /api/ready` → `{ready}` / 503 `{ready:false, missing[], reason}`.
- **Auth:** `GET /auth/login/{github,google,saml,oidc}` (302s), `GET /auth/{success,failure}` (frontend redirects),
  `GET /auth/me` (`{id,email,name,role,provider,avatarUrl,createdAt}`), `POST /auth/magic-link`, `GET /auth/verify?token`,
  `POST /auth/{logout,refresh}`.
- **Diagrams:** `GET /diagrams` (page 1/limit 20→50, `q` LIKE-escaped, `updatedAt DESC`), `POST`, `GET/PUT/DELETE /{id}`
  (404 foreign-reads, 403 foreign-writes; PUT merges flat arrays into graph; title blank→400); checkpoints CRUD + restore
  (snapshot = raw graph; `?branch=` filter; cross-diagram guard); branches (copies graph, sets parent); threads + replies
  (`author/text` required, `pinned_to`/`pinnedTo` dual spelling).
- **Engines:** `POST /lint` → `{orphans, dangling, ambiguous, ok}` (optional body); `GET /export?diagramId=` (required)
  → `{app,spec,version,nodes,edges,strokes,texts,metadata}`; `POST /sync` → `{status,driftEvaluated,nodesSynced,edgesSynced,
  commitSha,timestamp}` (optional body); `POST /sync/webhook/git` (HMAC) + `GET .../health`.
- Shapes: `diagramJson` emits both `graph` and flat arrays; `checkpointJson`/`threadJson`/`replyJson` as §5.4.

### 5.3 Filter chain (runs before Spring Security)

`PayloadLimit` (1 MiB → 413 `PAYLOAD_TOO_LARGE`) → `RequestLogging` (correlation ID + MDC) → `AuthFilter`
(static Bearer on **all** `/api/v1/**`, 401 `UNAUTHENTICATED`, sets `RequestUser` = DEV; passes `/api/health|ready`,
`/error`, everything non-`/api/v1/`) → `Idempotency` (UUID `Idempotency-Key`, 24h in-memory replay) →
`RateLimit` (60-bucket/1-per-s per IP on `POST /sync|/lint` only; 429 + `Retry-After`; fail-open) →
Spring Security (`/`,`/health`,`/ready`,`/api/health|ready`,`/login**`,`/oauth2/**`,`/auth/**`,`/api/v1/auth/**`,
`/api/v1/sync/webhook/**`,`/saml2/**`,`/error`,docs → public; else authenticated; OAuth2+SAML2+JWT authorities;
sessions max 1; CORS `*` + credentials; **CSRF off**) → `CorsFilter` (strict localhost allow-list, shadowed).

### 5.4 Services & domain

- **DiagramService** (limit 20/50) — list/search/create (`title` required, auto-provision owner, canonical graph)/get/
  update (merge semantics, `entityManager.refresh` for trigger timestamp)/delete/branch/`toJson` (graph + flat arrays).
- **SyncService** — canonical-SHA idempotency (`commit_sha` lookup → `noop` with original row), diagram-less stateless mode,
  node/edge counting (top-level or nested `graph.*`), strict ref resolution (bad UUID 400, unknown 404, foreign 403),
  `SyncLog` with `{driftEvaluated,nodesSynced,edgesSynced}` delta.
- **LintService** — pure: orphan = degree-0 (known-node edges only); dangling = empty/unknown `to` (never double-flagged);
  ambiguous = connected + blank protocol/label; order-preserving, deduped, `ok` AND.
- **CheckpointService** — list (`?branch`), create (title required, snapshot = graph), delete (cross-diagram guard), restore
  (graph overwrite + flush).
- **ThreadService** — threads/replies with diagram-ownership gating; author/text required; `resolved` defaults false.
- **ExportService** — scoped `.arch` payload builder. **SchemaReadinessService** — `to_regclass` probes for the 6 V1 tables,
  `requireReady()` → 500 `DB_UNAVAILABLE` + psql pointer, called by every DB-touching service.
- **Entities** (UUID PKs, app-side timestamps, `trg_diagrams_updated_at` maintains `updated_at`): `Diagram` (owner FK cascade,
  `tags text[]`, `graph jsonb` via `OtherString*` OTHER-mapping, self parent `SET NULL`, `branch_name`),
  `Checkpoint` (`branch`, `active` added V5), `User` (citext email, OAuth fields), `Reply`, `ReviewThread`, `SyncLog`
  (bigserial, needs `USAGE,SELECT` on `sync_log_id_seq`). V3/V5 columns (`deleted_at`, `active`) partly unmapped (§12).
- **Repositories** — derived scoped finders + LIKE-escaped title search + branch-ordered checkpoints + thread scoping +
  commit-SHA lookup; lazy bootstrap (`JpaLazyBootstrapConfigurer`); deferred EMF build heals without restart.
- **DTOs** — `@NotBlank` only: title/author/text (+`pinned_to`/`pinnedTo` alias, `tagsPresent`/`graphProvided` dirty flags).
- **Auth classes** — `JwtService` (HS256 access 60m + refresh 30d claims; no iss/aud/kid/revocation; refresh never minted);
  `MagicLinkService` (Redis single-use 15m links, branded HTML, `mock` short-circuit); `UserSessionService` (30d Redis
  sessions); email providers mock (default) / SendGrid (`JavaMailSender`, needs `spring.mail.*`) / Resend (key-path
  mismatch — §12) / SES (**missing**).
- **Config** — `application.yml`: port `${PORT:3001}`, lazy init, `open-in-view:false`, Hikari (fail-timeout 0, 3s, pool 10),
  Flyway on + `baseline-on-migrate` (off in compose, off in tests), OAuth2/SAML2 registrations, Redis, 30d sessions,
  `app.*` (token, frontend URL, JWT secret, magic-link TTL, email). `DATABASE_URL` post-processor with local fallback.
  `OpenApiConfig` (springdoc, prod-gated server URL). `ApiException`/`ApiExceptionHandler` typed `{error:{code,message}}`
  envelope (NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/DB_UNAVAILABLE + filter codes + INTERNAL_ERROR); no stacks/secrets to clients.
- **Tests** — 8 classes: `PostgresIT` (shared PG17 container, applies real migrations), `TestInfraMocks`, `DiagramControllerTest`
  (auth, CRUD, 403/404 asymmetry, pagination cap, LIKE escaping, threads, restore, branch filter, lint, sync idempotency,
  export, 413, rate limits), `LintServiceTest`, `SyncServiceTest`, `SyncControllerTest` (HMAC vector), `DiagramRepositoryTest`
  (tags/unicode, trigger, scoping, cascades), `AuthControllerTest` (me/magic-link/verify/logout/refresh).

---

## 6. Database Specification

### 6.1 Extensions & migrations

Extensions: `pgcrypto` (UUID defaults), `citext` (emails) — hard-required, fail-fast (managed-host fallback removed).
Migrations V1→V5, strictly version-ordered, mirrored in `db/migrations/` (canonical, hand-applied) and
`server/src/main/resources/db/migration/` (classpath; V1 differs by one trailing newline — §12).

| Migration | Contents |
|---|---|
| V1 `init` | 6 tables, `set_diagrams_updated_at()` + trigger, 6 secondary indexes (incl. GIN on tags) |
| V2 `additional_indexes` | 3 ordered-query indexes (threads/replies/sync-SHA) |
| V3 `production_hardening` | RLS on 6 tables + `current_user_*` helpers, `audit_log` + 6 triggers, 8 CHECKs, soft-delete columns, 3 indexes, `archive_old_sync_logs()`, `try_advisory_lock()` (**not fully re-runnable** — §12) |
| V4 `oauth_fields` | 5 OAuth columns + 2 indexes + `chk_users_provider` (NOT VALID — §12) |
| V5 `versioning_branching` | `parent_diagram_id` self-FK + `branch_name`, checkpoint `branch` + `active`, 3 indexes |

### 6.2 Tables (post-V5)

- **`users`** — `id` uuid PK, `email` citext UNIQUE, `name`, `role` (text, default `member`), `created_at`;
  V4: `provider`, `provider_id`, `avatar_url`, `access_token`, `last_login_at`.
- **`diagrams`** — `id` PK, `owner_id` → users CASCADE, `title`, `tags text[]` (GIN), `graph jsonb`, `created_at`,
  `updated_at` (trigger), `deleted_at` (V3), `parent_diagram_id` self-FK SET NULL (V5), `branch_name` (default `main`).
- **`checkpoints`** — `id` PK, `diagram_id` → diagrams CASCADE, `title`, `meta`, `snapshot jsonb`, `created_at`,
  `deleted_at` (V3), `branch` (default `main`), `active` bool (default false).
- **`threads`** — `id` PK, `diagram_id` → diagrams CASCADE, `author`, `pinned_to`, `text`, `resolved`, `created_at`, `deleted_at`.
- **`replies`** — `id` PK, `thread_id` → threads CASCADE, `author`, `text`, `created_at`, `deleted_at`.
- **`sync_log`** — `id` bigserial PK, `diagram_id` → diagrams CASCADE NOT NULL, `actor`, `commit_sha`, `delta`, `created_at`.
- **`audit_log`** (V3) — `id` bigserial PK, `table_name`, `operation` (no CHECK), `old_row`/`new_row` jsonb,
  `changed_by` (no FK), `changed_at`, `client_ip`, `user_agent`.

### 6.3 Indexes (28), constraints, functions, triggers, RLS, roles, seed

- **Indexes:** 7 PK + 1 unique (`users_email_key`) + GIN tags + partial (`deleted_at IS NOT NULL`, `active`,
  `resolved=false`) + expression (`audit_log.table_name,new_row->>'id'`) + `text_pattern_ops` title prefix + 12 btree
  (owner-feed, diagram-created pairs DESC/ASC, branch, parent, provider ×2, commit-SHA **non-unique** — §12).
- **CHECKs:** title ≤200 (diag/cp), tags ≤20, non-empty thread/reply author+text and sync actor, provider allow-list
  (V4, NOT VALID — §12). `checkpoints_badge_len` references a `badge` column that **no migration creates** (dead — §12).
- **Functions:** `set_diagrams_updated_at()` (trigger); `current_user_id()` / `current_user_has_role()` (GUC readers);
  `audit_trigger_fn()` (writes `audit_log`, not SECURITY DEFINER — §12); `archive_old_sync_logs(interval)` (deletes sync
  rows of soft-deleted diagrams); `try_advisory_lock(bigint, ms)` (10ms poll loop on xact lock).
- **Triggers (7):** `trg_diagrams_updated_at` (BEFORE UPDATE) + 6 `trg_audit_*` (AFTER I/U/D, loop-created, guarded).
- **RLS (enabled, not forced):** `users_select_all` + `users_modify_admin`; per-table owner/all policies on diagrams (incl.
  `tags && '{public}'` shared-read), checkpoints, threads, replies (2-level), sync_log; `audit_log` exempt. Only effective
  for non-owner roles **with** `app.current_user_id/role` set — which no app code does (§12).
- **Roles:** `archflux_migrator` (DDL, `USAGE+CREATE`) vs `archflux_app` (DML-only on 6 tables + `USAGE,SELECT` on
  `sync_log_id_seq`; `CREATE` revoked; default-privileges only for migrator-created tables). **No grants on `audit_log` —
  app writes fail once V3 is applied under `archflux_app` (§12).**
- **Seed (`seed.dev.sql`, dev-only):** admin demo + DEV user, checkout-mesh diagram (3 nodes/2 edges), 1 checkpoint, 1 thread,
  1 reply — all `ON CONFLICT DO NOTHING`, V3-CHECK-compatible.

### 6.4 Migration drift & config notes

- Classpath V1 copy lacks the trailing newline (Flyway-checksum-relevant, not semantic); V2–V5 byte-identical; `target/`
  copies match resources; V3–V5 untracked in git in both trees.
- Flyway: on + `baseline-on-migrate` + `validate-on-migrate` (local runs); **off in compose** (manual psql per DEPLOY),
  off in tests (PostgresIT applies migrations over JDBC). Ordering strictly V1→V5; no repeatables/callbacks/undos.
- `db/README.md` documents the pre-V3 world (6 tables/13 indexes, no RLS/audit/soft-delete/OAuth/branching).
- Compose runs **postgres:15** while docs/tests target **17** (EXPLAIN evidence + `postgres:17-alpine` container).

---

## 7. End-to-End Flows

### 7.1 Auth (5 paths)
Guest: `#/login` → Continue as Local Guest → session `{guest}` + onboarded → `#/onboarding` or `#/canvas`.
Email OTP: simulated 600ms dispatch → 6-digit auto-verify → session `{email}`.
Magic link: real `POST /auth/magic-link` → mock-logged (default) or sent → `GET /auth/verify?token` (Redis single-use)
→ callback stores JWT + session. OAuth/SAML/OIDC: provider 302s → `/auth/success` → callback decodes JWT payload →
session (provider, email) → canvas/onboarding. Refresh/logout/verify covered by `AuthControllerTest`.

### 7.2 Authoring → persistence → server mirror
Tool/rail/palette/library-drop → `addNode/placeShape` (checkpoint) → drag (snap/guides, Alt-bypass) → silent updates →
debounced 300ms persist + unload flush; exporter prefers server `GET /export` for UUID docs else local deterministic
`.arch`; server mirror on checkpoint/restore/delete/branch (UUID = server-backed; failures retained for `retryBranch`).

### 7.3 Collaboration
Mount → shared Yjs session (per diagramId) → y-websocket `diagram-<id>` (+token) → awareness set → `synced` hydrates
empty maps from REST → remote ops applied (version-monotonic, echo-guarded) via `loadGraph`; local edits debounce-pushed
(400ms) with `origin:'local'` filtering; `<CollaborationPanel>` shows users/sync state (canvas dock + reviews).

### 7.4 Lint & heal
Any graph change → memoized lint (orphan/dangling/ambiguous) → `lintCount` drives chip pulse + dock badge → per-card
Inspect (pan+select) / Auto-bind (nearest bind, one undo) / Prune (dangling) / Tag-REST (ambiguous) / Heal-All single
transaction; zero state = green card. Same rules run server-side via `POST /lint` (`LintService`).

### 7.5 Living Sync & webhook
Connectors (local list) → drift table (lint-derived + upstream, severity-ordered, source-labeled) → Accept (resync +
jump) / Reject (upstream reversible, lint session-scoped) → guarded resync (progress + cancel) → `fresh`, log appended.
GitHub path: push → HMAC verify → `.arch` detect → fetch/decode → canonicalize → upsert-by-tag + `webhook:{branch}:{path}`
checkpoint (currently creates duplicates — §12); `/sync` provides canonical-SHA idempotent staging (`synced`/`noop`).

### 7.6 Reviews → merge gating → sandbox
Checkpoint tag → timeline → A/B compare + threads (@mentions, resolve) → PR list (checkpoint-derived mergeable, samples
labeled) → live gates (schema/lint/drift + quick-fixes) → merge (blocked + tooltip until green) → `merge-pr` checkpoint +
session-merged; sandbox simulates calls with redacted cURL. `/git` redirects to the merge tab (`⌘G`).

### 7.7 Blueprints & settings
Search/filter → deterministic thumbnails → preview (nodes+routes) → Insert (merge right, remap) / Replace (dirty-guard,
undoable) / Save-as (validated, capped, quota-safe). Settings screens mutate `archflux:settings:v1` / team / connectors
with immediate effect; storage screen inspects, backs up (ustar+gzip), verifies, clears, or `RESET`-wipes.

### 7.8 Cross-cutting flows
`⌘K` palette (fuzzy, every action/shape/doc); toasts (≤3, 5s, pause, dedupe); focus mode (Esc exits); `beforeunload`
(store merge + draft stash); deep links (hash, session-guarded); theme switch (pre-paint, no reload); error recovery
(boundary → backup → safe default → reload).

### 7.9 Poison-pill guard
`LivingScreen` wraps the poison-checklist save/resync in try/finally: `localStorage.setItem` quota failures during a save
never leave `poison-key` set or a hanging sync — the `finally` resets the checklist ((a) cancel, (b) data loss) to
undenied even when persistence partially fails.

---

## 8. Design System & UX

- **Tokens:** `styles.css` custom properties, 3 themes (`light` default, `dark`, `blueprint`); surface/grid/card/drawer/
  border/focus/text/status/brand scales; icons invert in dark; canvas + minimap + thumbnails re-render per theme.
- **Spec proposals (§0.2–0.4):** semantic surface/text/accent/status/elevation/radius tokens; 14px/4px-grid type-spacing;
  100/180/240ms motion with `prefers-reduced-motion` support; tabular numerals; ellipsis+tooltip truncation.
- **Interaction language:** magnetic ports (16px, 150%, indigo halo, spring curve), linter pulse (1.1×/350ms), heal morph
  (220ms), destructive countdown (4s draining bar), toasts (5s/8s-action, hover-pause, live region), focus-trapped
  dialogs with Esc + focus restore.
- **Requirements regime:** RFC-2119 MUST/SHOULD/MAY with stable IDs (`LIB/CAN/ONB/DSH/LIV/REV/MRG/BLU/SET/NAV-Rn`), Given/
  When/Then acceptance, states matrix (empty/loading/error/offline/partial/success), copy rules (sentence case,
  "Simulated"/"Derived from canvas" labels, pluralization), 24px targets, color-never-alone, implementation ledger
  (20 items: 18 ✅, 2 📋), QA matrix, open questions OQ-1–OQ-7 (1/2/5 resolved; 3/4/6/7 product decisions).
- **Nav shell:** two-tier chrome, screen tabs with shape+`aria-current`, phone icon rail + bottom-sheet dock + FAB,
  breakpoints (<600 / 600–899 / ≥900), no horizontal scroll ≥320px.
- **A11y target:** WCAG 2.2 AA — contrast, keyboard operability, focus visibility, live regions, reduced motion.

---

## 9. Real-time Collaboration

### 9.1 Intended design (specs)
Yjs CRDT (`Y.Map` nodes/edges/strokes/texts) over y-websocket/STOMP to Spring's `/ws` STOMP broker (simple in-memory
`/topic`+`/queue`, `/app` inbound, `/user` outbound, SockJS + raw, `*` origins); REST snapshot on join → CRDT merge;
awareness (cursors/selections/colors); message types join/update/leave/save/state/awareness with versioned broadcasts.

### 9.2 As-built (verified)
The frontend's `useCollaboration` uses **raw y-websocket** (`ws://…/ws`, room `diagram-<id>`, token query param) with
built-in reconnect, REST hydrate, and awareness — **no STOMP**. The backend `CollaborationController` speaks STOMP with
in-JVM `ConcurrentHashMap` state (lost on restart, unshared across replicas, `save` is a stub, no handshake JWT check).
So the shipped product path is y-websocket + REST; the STOMP leg is specified but effectively disconnected from the
real client (see §12).

---

## 10. DevOps, Deployment & Configuration

### 10.1 Compose & images
`db` (PG15, `pgdata`, healthy-gated) → `server` (`./server` build, `DATABASE_URL`, `archflux_app` creds, `API_TOKEN`,
`spring.flyway.enabled=false`, curl healthcheck, `init: true`) → `web` (`Dockerfile.web` 2-stage node→nginx, `API_URL`
runtime config, baked healthcheck, waits on server-healthy). Dev: `up -d db` + override `:5432` + host Vite `:5173`.
Prod: `-f compose.yml` only (DB off host network). Secrets env-only (`.dockerignore`d).

### 10.2 Nginx & runtime config
Docker-DNS `server:3001` proxy (self-healing, 2m bodies so the API's typed 413 wins), SPA fallback (no-cache),
`X-Content-Type-Options`/`X-Frame-Options: DENY`/`Referrer-Policy`, gzip, no-store `/config.json` generated at boot
from `$API_URL` (default `/api`); build-time `VITE_API_URL` override available.

### 10.3 Environment & bootstrap
`POSTGRES_DB/USER/PASSWORD`, `DATABASE_URL` (or `SPRING_DATASOURCE_*`), `API_TOKEN` (prod fail-fast, dev `f506189f13b9ff61e04350a8bd983008`),
`VITE_API_URL`, `WEB_PORT`/`SERVER_PORT`/`POSTGRES_PORT`, `NODE_ENV`, plus OAuth2/SAML/JWT/Redis/mail/webhook vars in
`application.yml`/`.env.example`. First-deploy: hand-apply V1 (then V2–V5), `roles.sql` with psql-var passwords, dev-only
seed; `/api/ready` confirms. Backup via `pg_dump`+gzip; logs per service; failure-mode table in DEPLOY (401/429/413/
502-transients/override-port/CI-Java-21).

### 10.4 CI
`.github/` (Agent C scope): frontend build+lint, `mvn test`, `docker compose config --quiet`. OpenAPI generation script
(`scripts/generate-openapi.sh`, springdoc backend).

---

## 11. Testing & Quality Gates

| Layer | Suite | Command | Expectation (per SPEC) |
|---|---|---|---|
| FE types | `tsc -b` | `npm run build` (pre-step) | 0 errors |
| FE unit | Vitest, 9 files ~66 cases | `npm test` | pass (47+ asserted) |
| FE E2E | Playwright, 17 journeys | `npm run test:e2e` | 13/13 critical |
| FE visual | Playwright, 38 baselines ×3 browsers | `npm run test:visual` | 29/29 |
| FE lint | oxlint | `npm run lint` | clean |
| BE | Maven, 8 classes (JUnit5/MockMvc/Testcontainers) | `cd server && mvn test` | 46/46 |

Migration applies clean on scratch PG; compose healthy end-to-end with real `POST /lint` + CRUD round-trip.
Per-PR: specs updated (maintenance protocol), cross-refs + version bumped, breaking changes bolded, no orphan TODOs.
Definition of done per ledger item: requirements + states + unit/E2E + a11y + persistence registered + specs + green gates.

---

## 12. Spec-vs-Code Conformance: Verified Gaps & Risks

Ranked by user/product impact. All verified by reading the code — not inferred.

| # | Gap | Impact | Status |
|---|---|---|---|
| G1 | `AuthFilter` requires the static Bearer on **all** `/api/v1/**`, shadowing `SecurityConfig` public paths → `/api/v1/auth/**` and the GitHub webhook are unreachable without the dev token; `GITHUB_WEBHOOK_USER_ID` fallback dead | High (auth/webhook) | Code wins; fix filter or config |
| G2 | STOMP leg disconnected: no handshake JWT, `/ws` not public, `RequestUser` null on frames → all collab handlers error; real client uses raw y-websocket anyway | High (collab) | Spec overclaims; align to y-websocket or wire STOMP auth |
| G3 | Webhook upsert searches titles for `"github:<repo>:<path>"` but writes `"<repo> - <path>"` → every push creates a duplicate diagram | High (sync) | Bug; search tags instead |
| G4 | `archflux_app` has no `audit_log` grants and the trigger fn isn't `SECURITY DEFINER` → all writes fail under least-privilege once V3 applied | High (deploy) | Grant + `SECURITY DEFINER` (or exempt) |
| G5 | No code sets RLS GUCs → under `archflux_app`, ownership predicates are false (empty reads, blocked writes); tests pass only as table-owner superuser | High (deploy) | Set GUCs per request or revisit RLS |
| G6 | No Redis in compose but sessions/magic-links are Redis-backed (tests disable them) → prod compose auth sessions degraded | High (deploy) | Add Redis service or document |
| G7 | V3 not re-runnable (unguarded `CREATE POLICY` on 5 tables) despite "re-runnable" convention | Med (ops) | Add `DROP IF EXISTS` guards |
| G8 | `idx_sync_log_commit_sha` non-unique → commit-SHA idempotency is app-code-only, no DB guarantee | Med (correctness) | Add unique index (nullable-safe) |
| G9 | Resend reads `app.resend-api-key` vs yml's `app.email.resend-api-key` → unauthenticated API calls; SES documented but unimplemented; `spring.mail.*` absent (SendGrid fails); refresh tokens never minted; magic links mock-logged by default | Med (auth/email) | Fix keys, implement SES or drop from docs |
| G10 | `github.api-token/url`, `GITHUB_WEBHOOK_SECRET`, JWT timing vars absent from yml (env-only); no `application-prod.yml` | Med (config) | Document or declare |
| G11 | Soft-delete (`deleted_at`) + checkpoint `active` unmapped in JPA → inert; `chk_users_provider` allows NULL and its allow-list omits `saml`/`oidc` provider values; `checkpoints_badge_len` dead (no `badge` column); `audit_log.operation` unchecked; `users_modify_admin` blocks self-service profile edits under RLS | Med (schema) | Map columns, widen allow-list, fix policies |
| G12 | `sketchy` style stored but never consumed by the draw pass; `useAuth.ts` in FRONTEND_SPEC doesn't exist; `DiagramContextValue` imported by tests isn't exported; DEPLOY `{"status":"ok"}` vs code `{"status":"UP"}`; PG15 (compose) vs PG17 (docs/tests); V1 trailing-newline checksum drift; `db/README` pre-V3; CORS `*`+credentials + CSRF-off (intended but broad); unbounded rate-limit map; in-memory idempotency (single-node) | Low (docs/hygiene) | Clean up per item |

---

## 13. Appendix: File Map & Key Identifiers

**Specs:** `README.md` (product/v2.4.0) · `SPEC.md` (index + protocol + work plan + gates) · `FRONTEND_SPEC.md` (v1.2.0) ·
`BACKEND_SPEC.md` (v1.2.0) · `UI_UX_SPEC.md` (v2.3.0, 20-item ledger, REQ IDs, QA matrix, OQ-1–OQ-7) ·
`BACKEND_PLAN.md` (3-agent Phase-1 plan) · `DEPLOY.md` (topologies, bootstrap, env, failure modes) · `docs/github-app-setup.md`.

**Key IDs:** DEV user `11111111-1111-1111-1111-111111111111` · seed doc `doc-seed` · seed graph `mockNodes/Edges/Strokes` ·
seed diagram `b222…` · store key `archflux:v2-light` v5 · server port 3001 · web 8080 · PG 5432 · caps
(docs 25, threads 100, checkpoints 20, log 30, undo 30, recents 8, snapshots 40, title 80, blueprint 60/25, display 40).

**Counts:** ~16.6k FE LOC / ~6.7k BE LOC · 38 shapes · 12 AWS icons · 9 blueprints · 14 routes · 26 endpoints · 6 WS pairs ·
7 tables · 28 indexes · 6 functions · 7 triggers · 8 RLS policies · 2 roles · 21 storage keys · 9 UT files · 23 E2E tests ·
114 visual PNGs · 8 Java test classes.

> Rule (SPEC.md): the spec is the contract — where code and spec disagree, the spec wins and the code must be updated.
> §12 lists exactly where that rule currently bites.

*(End of report.)*