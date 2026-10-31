# ArchFlux Frontend Specification

> **Version:** 1.7.0 | **Last Updated:** 2026-10-24 | **Status:** ✅ Current
> **Part of:** [Master Spec](../../SPEC.md) | **Maintenance:** [Protocol](../../SPEC.md#spec-maintenance-protocol)
> **Governing contract:** [PRODUCT_SPEC Appendix A](PRODUCT_SPEC.md#appendix-a-platform-contracts-moved-from-productization_spec-v300-2026-10-25) — see
> [Productization (v3.0.0) Deltas](#productization-v300--frontend-deltas) below.

## Repository Overview
**Package:** `archflux-web` (service directory `frontend/` — see [SERVICES_SPEC](SERVICES_SPEC.md))
**Type:** React 19 + TypeScript + Vite SPA, packaged as an nginx image (`frontend/Dockerfile`)
**Architecture:** Single Page Application with clean path routing (BrowserRouter; legacy `#/path` links redirect)
**Styling:** CSS custom properties (theming), no CSS framework

> **Cross-ref:** See [Backend Spec](BACKEND_SPEC.md) for REST/WebSocket contracts this frontend consumes.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | React | 19.2.8 |
| Language | TypeScript | 6.0.2 |
| Build | Vite | 8.3.0 |
| Router | React Router DOM | 7.18.4 (hash mode) |
| State | React Context (5 split contexts) | — |
| Real-time | Yjs + y-websocket | 13.6.33 / 3.1.0 |
| Icons | aws-icons, react-icons | 3.3.0 / 5.7.0 |
| Testing | Vitest + Playwright | 5.0.3 / 1.64.0 |
| Lint | oxlint | 1.81.0 |

> **Cross-ref:** See [Backend Spec](BACKEND_SPEC.md) for REST/WebSocket contracts this frontend consumes.

---

## Project Structure

All paths are relative to `frontend/`. Grouped by responsibility (v1.5.0, FE-M8); only the entry files sit
directly in `src/`.

```
src/
├── main.tsx  App.tsx  styles.css  types.ts   # entry, routes, global styles, shared domain types
├── app/                 # routing shell pieces
│   ├── IndexRoute.tsx  RequireSession.tsx  withFallback.tsx
│   └── RouteErrorBoundary.tsx               # per-route boundary (components/ErrorBoundary = app-level crash UI)
├── state/               # state + persistence
│   ├── store.tsx        # 5 split React Contexts + persistence
│   ├── useDiagram.ts    # split-context facade
│   ├── session.ts  settings.ts               # browser-storage keys (never credentials)
│   └── syncState.ts  conflict.ts  revisions.ts  # pure state derivations
├── lib/                 # framework-free helpers
│   ├── api.ts           # cookie-based fetch wrapper + offline mutation queue
│   ├── config.ts        # runtime config: apiUrl / wsUrl (single source, SERVICES_SPEC §3.1)
│   ├── contracts.ts     # API contract derivation (local-first)
│   ├── archFormat.ts  canvasGeometry.ts  clipboard.ts  honesty.ts  iconRegistry.tsx
├── data/
│   └── blueprints.ts    # blueprint TEMPLATE catalog + graphs (product content, not sample data)
├── canvas/              # CanvasEngine, render, ShapeRegistry (+ libraryShapes catalog), export/
├── hooks/               # useCollaboration (Yjs + WebSocket presence), useFocusTrap
├── components/          # AppShell, ToolPalette, CollaborationPanel, ErrorBoundary, …
├── screens/             # route-level pages (Canvas, Dashboard, Living, Reviews, Blueprints, Git, Settings*, Login, …)
├── design-system/  assets/
└── tests/               # vitest suites; tests/fixtures/ holds test-only graphs (never imported by app code)
```

---

## Routing (Hash-based)

| Path | Screen | Lazy |
|------|--------|------|
| `/login` | LoginScreen | — |
| `/onboarding` | OnboardingScreen | — |
| `/auth/callback` | AuthCallbackScreen | — |
| `/` (root) | IndexRoute → Dashboard | ✓ |
| `/dashboard` | DashboardScreen | ✓ |
| `/canvas` | CanvasScreen | ✓ |
| `/living` | LivingScreen | ✓ |
| `/reviews` | ReviewsScreen | ✓ |
| `/blueprints` | BlueprintsScreen | ✓ |
| `/settings/*` | SettingsLayout + children | ✓ |

> **Hash routing** enables static hosting (no server rewrites).

---

## State Management (5 Split Contexts)

| Context | Responsibility | Update Frequency |
|---------|----------------|------------------|
| `DiagramCoreContext` | nodes, edges, strokes, texts, selection | High (every drag/keystroke) |
| `DiagramActionsContext` | All mutating functions (addNode, updateEdge, etc.) | Stable refs |
| `DiagramUIContext` | zoom, pan, tool, grid, dockTab, dockOpen | Medium |
| `DiagramDocsContext` | docs[], activeDocId, CRUD | Low |
| `DiagramCollabContext` | threads, checkpoints, syncLog, pushLog | Low |

> **Performance:** Split contexts prevent full-app re-renders on high-frequency changes.

---

## Persistence

| Key | Content |
|-----|---------|
| `archflux:v2-light` | Full document set + activeDocId + UI prefs + review state + pan/zoom |
| `archflux:session` | Auth mode (guest/email/github/sso — never a credential) |
| `archflux:onboarded` | Boolean |
| `archflux:pending-draft` | Uncommitted text editor rescue |

**Debounce:** 300ms on graph changes; synchronous flush on `beforeunload`.

> Phase 1: `archflux:auth_token` is retired — no credential is stored in browser storage (legacy leftovers are wiped
> on sign-out). See [API Client & Session](#api-client--session) below.

---

## API Client & Session

**File:** `src/api.ts` + `src/session.ts` (+ `AuthCallbackScreen.tsx`, `AppShell.tsx` sign-out).

| Behavior | Implementation |
|----------|----------------|
| Base URL | `getApiUrl()` from `src/config.ts` (`/config.json` → `VITE_API_URL` → `/api`); paths are `/v1/...` |
| Login initiation | `{apiUrl}/v1/auth/login/{github,google,saml,oidc}` (full-page navigation) |
| Transport auth | `ARCHFLUX_TOKEN` cookie (`credentials: 'include'`); no `Authorization` header, no localStorage token |
| Login | OAuth/magic-link redirects set the cookie; callback screen probes `GET /api/v1/auth/me`, then `setSession({mode, email})` |
| Logout | `POST /api/v1/auth/logout` → guest session + legacy-token wipe → `/login` |
| Expiry | Single-flight 401: non-probe requests clear a non-guest session once, toast once, route `/login`; probes (`/me`, logout) never redirect |
| Guest | Zero network: no socket, no fetches, no probes |
| Correlation | `X-Correlation-ID` propagated request→request; server messages surface `err.error?.message` |

---

## Real-time Collaboration (Yjs)

| Component | Technology |
|-----------|------------|
| CRDT | Yjs (Y.Map for nodes/edges/strokes/texts) |
| Transport | y-websocket provider |
| Server endpoint | `{wsUrl}/ws` — `wsUrl` from `src/config.ts` (derived from `apiUrl` origin by default) |
| Known gap | SVC-O1: client uses the y-websocket protocol; server exposes STOMP — not interoperable yet |
| Awareness | Cursors, selections, user colors |
| Sync | REST snapshot on join → CRDT merge |

**Shared session cache** (`useCollaboration.ts`) prevents duplicate WebSocket connections per diagram.

---

## API Contract Derivation (Local-first)

**File:** `src/contracts.ts`

| Function | Purpose |
|----------|---------|
| `deriveEndpoints(nodes, edges)` | Extracts REST/gRPC/Async endpoints from graph edges |
| `endpointsForNode(nodeId, endpoints)` | Filter endpoints touching a node |
| `endpointForEdge(edgeId, endpoints)` | Find contract for a specific route |
| `contractSummary(endpoints)` | Counts: total, verified, drift |

**Protocol inference:** From edge label (HTTP method, `/path`, protocol tag, gRPC/Async keywords).

---

## Canvas Editor Interactions

**File:** `src/screens/CanvasScreen.tsx` + `src/canvasGeometry.ts` (pure math, unit-tested)

| Interaction | Implementation |
|-------------|----------------|
| Drag-to-resize | E/S/SE grips on single-selected node; 100×50–400×200 clamp; Shift locks aspect; undoable via `checkpoint` |
| Alignment guides + snap | Edge/center anchors within `snapThreshold` (0 disables); cyan dashed guides; single-node drags only |
| Minimap | 160×100 overview with viewport rect; click-to-navigate; toggleable; hidden in focus mode; default on when ≥6 nodes on wide screens |
| Resize/dock state | `dockOpen` (collapses to FAB); `data-icons-ready` + pixel quiescence for tests |

---

## Visual Testing

| Suite | Command | Baselines |
|-------|---------|-----------|
| Visual regression | `npm run test:visual` | `e2e/visual-regression.spec.ts-snapshots/` |
| Critical journeys | `npm run test:e2e` | `e2e/critical-journeys.spec.ts` |
| Responsive smoke | `npx playwright test e2e/smoke.spec.ts` | — |

**Threshold:** `maxDiffPixels: 12000` (~1.6% of 1280×672) to absorb vendor-icon raster variance.

---

## Commands

| Task | Command |
|------|---------|
| (all commands) | run inside `frontend/` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Container image | `docker build -t archflux-web .` |
| Type check | `npx tsc --build --force` |
| Unit tests | `npm test` |
| E2E tests | `npm run test:e2e` |
| Visual regression (update) | `npx playwright test --update-snapshots` |
| Lint | `npm run lint` |

---

## Environment Variables (Frontend)

Runtime (container, written to `/config.json` — preferred, no rebuild needed):

| Variable | Purpose | Default |
|----------|---------|---------|
| `API_URL` | API root (`/api` or `https://api.example.com/api`) | `/api` |
| `WS_URL` | WebSocket origin override | derived from `API_URL` |
| `API_UPSTREAM` | Enables nginx proxy of `/api`, `/ws`, OAuth/SAML paths (integrated topology) | empty |

Build-time fallbacks (Vite, baked into the bundle):

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_URL` | API root fallback | `/api` |
| `VITE_WS_URL` | WebSocket origin fallback | derived |
| `VITE_DEV_API_PROXY` | `npm run dev` proxy target | `http://localhost:3001` |

---

## Theming

| Theme | Token |
|-------|-------|
| Light (default) | `[data-theme="light"]` |
| Dark | `[data-theme="dark"]` |
| Blueprint | `[data-theme="blueprint"]` |

CSS custom properties in `:root` + theme overrides; icons invert in dark mode.

---

## Accessibility

- Semantic HTML + ARIA roles (`role="tab"`, `aria-label`, `aria-selected`)
- Focus management (`useFocusTrap`, `focus-visible` outlines)
- Screen-reader traversal (sr-only node/edge lists)
- Keyboard shortcuts (`ControlOrMeta+K` palette, `Escape` cancel)
- `data-testid` on all interactive elements for reliable E2E

---

## Productization (v3.0.0) — Frontend Deltas

> Contract: [PRODUCT_SPEC Appendix A](PRODUCT_SPEC.md#appendix-a-platform-contracts-moved-from-productization_spec-v300-2026-10-25) §§3–6. Release rule: no capability ships as
> GA until acceptance criteria + operational evidence are met — otherwise labeled Preview, Demo, or Not connected.

### Honest status labeling (Phase 0, PROD-008)

Every simulated or provisional surface carries a visible, non-color-only badge:

| Surface | Required label | Rationale |
|---------|---------------|-----------|
| Living resync with no real connector | **Not connected** — resync makes no change and says so (FE-M2) | No simulated results (v1.5.0) |
| Connector rows (K8s/OpenAPI/Terraform) | **Not connected** + `Connected` only after verified against the real provider | No green "Healthy" for form validation (§6.1) |
| Merge approvals / gating side-effects | **Simulated** where no server call occurs | Truth over theater (§1) |
| REST sandbox responses | **Simulated** (already labeled; keep) | Existing good practice |
| PR list / reviewers | Derived from real checkpoints / the configured team only; empty state otherwise (FE-M3, FE-M5) | No sample data (v1.5.0) |

Status vocabulary (authoritative): Local only · Saved · Saving · Offline · Pending sync · Stale ·
Sync failed · Demo data · Connected · Needs attention. See [UI_REVAMP_SPEC Appendix A §16](UI_REVAMP_SPEC.md#appendix-a-carried-from-ui_ux_spec-v240-deleted-2026-10-25)
for copy and visual rules.

### Source of truth per diagram (contract §5.2)

Each diagram displays exactly one source mode — Local / Cloud document / Git-managed / Connected source —
with field ownership, conflict behavior, and last successful source revision. Never merge models implicitly.

### Save & conflict behavior (contract §6.2, PROD-004)

- Local edits render immediately but stay visibly unsaved until persistence confirms.
- Cloud saves carry a version/ETag; stale writes surface a conflict screen (compare / keep mine / keep remote /
  duplicate-branch). "Keep mine" must not silently discard remote changes.
- Retry transient errors with backoff + jitter; never retry permanent validation/auth errors indefinitely.
- Persist idempotency keys across retries for supporting mutations.

### Import safety (PROD-006)

`importArch` must validate schema, payload size, entity counts, IDs, references, and supported version
**before** mutation; failure leaves the previous graph unchanged and reports unsupported fields (PROD-007).

### Secrets hygiene (PROD-011, Phase 1 — shipped)

The user JWT lives in the HttpOnly `ARCHFLUX_TOKEN` cookie, never in browser storage
(`archflux:auth_token` retired; legacy leftovers wiped on sign-out). Connector PATs remain local-only
with explicit never-validated copy until the server-side credential vault (Phase 1–3).

### No mock data (v1.5.0)

**Rule:** the shipped app contains no fabricated content — no fake diagrams, people, PRs, connectors, drift,
checkpoints, comments, testimonials or simulated sign-in. A first-run user sees an **empty** workspace with
clear empty states and calls to action. Product content that is intentionally authored — the **blueprint
template catalog** and the **shape library** — is kept, and lives outside any "mock" module.

| ID | Gap (verified in code, 2026-10-24) | Resolution |
|----|------|------------|
| FE-M1 | First run seeds `checkout-event-driven-mesh.arch` (9 demo nodes, 8 edges, 3 strokes) from `src/mocks.ts`; "Restore sample" / crash-recovery reload it | First run = one blank `untitled.arch`; "Restore sample" removed; crash recovery loads an empty canvas |
| FE-M2 | `resync()` fakes a k8s sync after 700 ms and injects a "Fraud Detection Worker" node + edge | With no connected source, resync makes no change and reports **Not connected**; drift count starts at 0 / freshness `local` |
| FE-M3 | Git screen appends 3 fabricated PRs (#140–#142); sandbox body/response embed demo ids/cluster | PRs derived only from checkpoints; empty state when none; sandbox defaults to the active document id |
| FE-M4 | Living screen shows 3 fake connectors (K8s/OpenAPI/Terraform) and 4 fake drift lines, incl. "merged PR #142" copy | Connectors = only user-added ones (empty state); drift list empty until a real connector run |
| FE-M5 | Reviews seeds a fake thread from "Elena R."; checkpoints v1.0–v2.2 fabricated; sample reviewer trio; Team settings ships fake members | Threads, checkpoints and team start empty; reviewers derive from Team settings only |
| FE-M6 | Login shows fabricated testimonials and a "Work Email" tab that simulates sign-in locally | Testimonials removed; simulated tab removed — Magic Link (real) is the default email path; Guest mode unchanged |
| FE-M7 | Lint auto-heal hard-codes demo ids (`kafka` hub, `legacy-billing` edge) | Heal binds to the most-connected node, no id special-cases |
| FE-M8 | `mocks.ts` mixes product content (blueprints, shape library) with demo data; 25 loose files in `src/` | `data/blueprints.ts`, `libraryShapes` in `canvas/ShapeRegistry.ts`; `src/` grouped (see Project Structure) |

**Acceptance:**
1. `src/mocks.ts` does not exist; no app module imports from `tests/`.
2. A fresh browser (empty localStorage) renders the canvas with `data-nodes="0"`, the Git screen PR empty
   state, the Living connectors empty state, and no thread/checkpoint/team entries.
3. `resync()` on an empty workspace leaves nodes/edges unchanged and sets a Not-connected status.
4. `grep -rE "Elena|Marcus T\.|Fraud Detection Worker|PR #14[0-2]|checkout-event-driven-mesh" src --exclude-dir=tests`
   returns nothing (icon catalog assets excluded).
5. Unit tests seed their own graph from `tests/fixtures/sampleDiagram.ts`; `tsc -b`, `npm test`, `npm run lint` green.
6. Existing users' persisted documents are untouched (no migration deletes local data).

**Found during v1.5.0 (open, pre-existing — reproduced on `a5b26c91` before any v1.5.0 change):**

| ID | Gap | Next step |
|----|-----|-----------|
| FE-V1 | Visual-regression baselines (`e2e/visual-regression.spec.ts-snapshots`, 2026-10-18) predate the current UI: 29/30 Chromium shots differ | Regenerate only after FE-V2 is fixed, then review each image |
| FE-V2 | Every canvas node's label/tag painted at one fixed x (stacked left of the nodes) — **in all browsers**, not only headless (user report 2026-10-24) | ✅ Root cause: `drawNodeMeta` used the in-node offset `textX` as a canvas x (missing `node.x +`). Fixed; `canvas.test` asserts each label/tag lands inside its node |
| FE-V3 | e2e "focus mode hides UI chrome" fails (no `Focus` button found) | Root cause = FE-Q2 (accessible name lacks "Focus") — fixed |

### UI revamp (v1.7.0)

Design contract: [UI_REVAMP_SPEC.md](UI_REVAMP_SPEC.md). Implementation IDs `UX-P1.*` / `UX-P2.*` are
tracked there with acceptance criteria; this spec's Project Structure gains `components/ui/`
(Button, PageHeader, StatusButton) when Phase 1 lands.

### QA findings (v1.6.0, full-stack test pass 2026-10-24)

| ID | Gap (verified) | Resolution | Acceptance |
|----|------|------------|------------|
| FE-Q1 | **Critical.** Signed-in users cannot put a diagram on the server: "Save diagram to server" on a local doc answers "Local only — save to the server…"; no UI calls `createDiagram`/`listDiagrams`/`deleteDiagram` | Save on a local doc while signed in → `POST /diagrams`, the local doc is re-keyed to the server id (threads/checkpoints move with it) and versioned saves follow. Guests are told to sign in. On start-up with a session, server diagrams missing locally are added to the library (cross-device). Deleting a server doc deletes it on the server | unit: create+rekey, guest path, server list merge, delete; QA: server count 1 after save, other device sees it |
| FE-Q2 | Focus button accessible name "Hide panels and go fullscreen" omits its visible label "Focus" (WCAG 2.5.3) | Accessible name starts with "Focus" | e2e focus-mode journey green |
| FE-Q3 | Login card overflows at 320–390 px (sign-in method tabs don't wrap; card fixed 440 px + 32 px padding) | Tabs wrap; card/stage shrink to the viewport | sweep: no clipped login controls on phones |
| FE-Q4 | Phones: the vertical tool rail covers the empty-canvas card ("+ Add service" hidden) | Empty-state card is offset clear of the rail on narrow screens | sweep screenshot |
| FE-Q5 | Login shows "with the mock email provider the link is only server-logged" to every visitor | Shown only in dev builds | unit: hidden when not DEV |
| FE-Q6 | Dashboard labels every non-synced doc "⚠ Drift" (incl. brand-new local docs) | `local` → "○ Local", `drift` → "⚠ Drift", `fresh` → "● Synced" | unit |
| FE-Q7 | Living "Last webhook ping" shows the current time though no webhook ever arrived | Shows the last re-sync attempt, "never" when none | unit/e2e |
| FE-Q8 | Dashboard card at 320 px: Pin/… buttons overlap the meta text | Card actions wrap below on narrow cards | sweep screenshot |
| FE-Q9 | Contrast < 4.5:1: linter chip (3.48), status badge (2.86 @ 9 px), active rail label (3.59) | Darker tokens for small text; badge ≥ 10 px | axe color-contrast clean on all routes |
| FE-Q10 | ARIA: `role=row` containing inputs (Settings → General), `role=tablist` containing a non-tab button (canvas utility bar) | Valid roles | axe aria-required-children clean |
| FE-Q11 | Phones: the nav tab strip scrolls sideways with no affordance | Edge fade indicates more tabs | visual |
| FE-Q12 | Login offers both "SAML" and "Single Sign-On (SAML)" | One "SSO (SAML)" tab (org slug optional) | unit/e2e |

E2E suites that need a populated canvas seed `tests/fixtures/sampleDiagram.ts` through `e2e/fixtures.ts`
(`seedSampleWorkspace`) — the same 9-node graph the app used to ship, so existing baselines stay comparable.

---

## Known Constraints

1. **No SSR** — pure SPA, path routing (server returns `index.html` for non-`/api` paths)
2. **Single-threaded canvas** — all rendering on main thread
3. **Local-first contracts** — no backend contract registry yet
4. **Yjs awareness only** — full node/edge CRDT sync WIP
5. **Hash routing** — deep links work but no SEO