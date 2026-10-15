# ArchFlux Frontend Specification

> **Version:** 1.3.0 | **Last Updated:** 2026-10-15 | **Status:** ✅ Current
> **Part of:** [Master Spec](SPEC.md) | **Maintenance:** [Protocol](SPEC.md#spec-maintenance-protocol)
> **Governing contract:** [Productization Spec v3.0.0](PRODUCTIZATION_SPEC.md) — see
> [Productization (v3.0.0) Deltas](#productization-v300--frontend-deltas) below.

## Repository Overview
**Package:** `archflux` (root)
**Type:** React 19 + TypeScript + Vite SPA
**Architecture:** Single Page Application with hash routing
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

```
src/
├── components/          # Reusable UI components
│   ├── AppShell.tsx     # Top header + main outlet + dock
│   ├── ToolPalette.tsx  # Left vertical tool rail
│   ├── CollaborationPanel.tsx # Presence + collab state
│   └── ErrorBoundary.tsx
├── screens/             # Route-level pages
│   ├── CanvasScreen.tsx      # Main diagram editor (2600+ lines)
│   ├── DashboardScreen.tsx   # Document library + quick actions
│   ├── LivingScreen.tsx      # Live sync + connectors + drift
│   ├── ReviewsScreen.tsx     # Version checkpoints + threads
│   ├── BlueprintsScreen.tsx  # Template gallery
│   ├── SettingsGeneralScreen.tsx
│   ├── LoginScreen.tsx       # OAuth/SAML/Magic Link
│   ├── AuthCallbackScreen.tsx
│   └── OnboardingScreen.tsx
├── hooks/               # Custom React hooks
│   ├── useCollaboration.ts     # Yjs + WebSocket presence
│   ├── useDiagram.ts           # Split-context facade
│   └── useFocusTrap.ts
├── store.tsx            # 5 split React Contexts + persistence
├── types.ts             # Shared domain types (ArchNode, ArchEdge, etc.)
├── api.ts               # Fetch wrapper with auth token + mutation queue
├── contracts.ts         # API contract derivation (local-first)
├── canvasGeometry.ts    # Pure canvas math: resize grips, snap, minimap
└── mocks.ts             # Seed diagram data
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
| `archflux:session` | Auth mode (guest/token) |
| `archflux:onboarded` | Boolean |
| `archflux:pending-draft` | Uncommitted text editor rescue |

**Debounce:** 300ms on graph changes; synchronous flush on `beforeunload`.

---

## Real-time Collaboration (Yjs)

| Component | Technology |
|-----------|------------|
| CRDT | Yjs (Y.Map for nodes/edges/strokes/texts) |
| Transport | y-websocket (STOMP over WebSocket) |
| Server endpoint | `/ws` (Spring Boot STOMP) |
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
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Type check | `npx tsc --build --force` |
| Unit tests | `npm test` |
| E2E tests | `npm run test:e2e` |
| Visual regression (update) | `npx playwright test --update-snapshots` |
| Lint | `npm run lint` |
| OpenAPI generation | `npm run generate:openapi` |

---

## Environment Variables (Frontend)

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_URL` | Backend REST base | `/api` |
| `VITE_WS_URL` | WebSocket endpoint | `ws://localhost:3001` |

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

> Contract: [PRODUCTIZATION_SPEC.md](PRODUCTIZATION_SPEC.md) §§3–6. Release rule: no capability ships as
> GA until acceptance criteria + operational evidence are met — otherwise labeled Preview, Demo, or Not connected.

### Honest status labeling (Phase 0, PROD-008)

Every simulated or provisional surface carries a visible, non-color-only badge:

| Surface | Required label | Rationale |
|---------|---------------|-----------|
| Living resync result / freshness pill after simulated run | **Demo** (until backed by a real connector run) | `resync()` is currently simulated (PROD-008) |
| Connector rows (K8s/OpenAPI/Terraform) | **Not connected** + `Connected` only after verified against the real provider | No green "Healthy" for form validation (§6.1) |
| Merge approvals / gating side-effects | **Simulated** where no server call occurs | Truth over theater (§1) |
| REST sandbox responses | **Simulated** (already labeled; keep) | Existing good practice |
| Sample PRs / sample reviewers | **Sample** (already labeled; keep) | Existing good practice |

Status vocabulary (authoritative): Local only · Saved · Saving · Offline · Pending sync · Stale ·
Sync failed · Demo data · Connected · Needs attention. See [UI_UX_SPEC](UI_UX_SPEC.md#productization-v300--status-language)
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

### Secrets hygiene (PROD-011, Phase 1)

`archflux:auth_token` and connector PATs must leave browser `localStorage` for server-side session/credential
storage. Until then, settings screens state that secrets are stored locally and never validated server-side.

---

## Known Constraints

1. **No SSR** — pure SPA, hash routing only
2. **Single-threaded canvas** — all rendering on main thread
3. **Local-first contracts** — no backend contract registry yet
4. **Yjs awareness only** — full node/edge CRDT sync WIP
5. **Hash routing** — deep links work but no SEO