# EPIC-12 · System states library and product instrumentation

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 1 (T01, T03), 3 (T02, T05) | **Sources:** FL-28, SC-56;
> PRODUCT_SPEC §7A "Instrumentation plan"; DATA_MODEL_R1 §4.5
> **Design:** "Components" › SystemStates (copy verbatim)

---

### R1-E12-T01 · State components

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T02 |

**Contract:**

```tsx
// components/states/index.ts
export function Skeleton(props: { lines?: Array<{ w: string; h: number }>; label: string }): JSX.Element;      // aria-busy, shows after 300ms (delay prop default 300)
export function EmptyState(props: { title: string; body: string; action?: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } }): JSX.Element;
export type BannerKind = 'offline' | 'save_failed' | 'newer_version' | 'access_changed' | 'session_expired' | 'rate_limited';
export function StatusBanner(props: { kind: BannerKind; detail?: string; onPrimary: () => void; onSecondary?: () => void }): JSX.Element; // role=status (offline/rate) or role=alert (save_failed/access_changed)
export function NotFoundState(props: { signedInAs?: string; errorId?: string; onRequestAccess?: () => void; onSwitchAccount?: () => void }): JSX.Element;
export const BANNER_COPY: Record<BannerKind, { title: string; body: string; safe: string; primary: string; secondary?: string }>;
```

`BANNER_COPY` is copied **verbatim** from the SystemStates artboard. For example, `offline` is:
- title "Offline — editing locally"
- body "Changes are saved on this device and upload when you reconnect."
- safe "N unsynced edits stored locally; closing the tab keeps them."
- primary "Retry now", secondary "Download copy".

**Rules:**
- `Skeleton` renders nothing for the first 300 ms, so fast loads never flash. After 10 s it adds
  "Still loading — the server is slow." with "Keep waiting".
- `prefers-reduced-motion` disables the shimmer.

**Tests:** `src/tests/system-states.test.tsx`
- `it('skeleton hidden before 300ms, visible after')`: use fake timers.
- `it('banner roles: alert for save_failed, status for offline')`
- `it('copy matches BANNER_COPY')`
- `it('NotFoundState never renders a diagram title prop')`: it has no such prop, and this is
  checked by type.

---

### R1-E12-T02 · Apply states across the app

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E12-T01 |

**Change:** replace ad-hoc spinners, empty texts and error toasts:

| Where | State |
|---|---|
| Lazy route fallback (`app/withFallback.tsx`) | `Skeleton` |
| Library empty, folder empty, Trash empty, Review empty ("No proposals yet" per artboard), Sync not connected | `EmptyState` |
| Canvas: offline (`isOnline=false`) | banner `offline` |
| Canvas: `syncError` | banner `save_failed`, showing the attempt count |
| Canvas: `saveConflict` | banner `newer_version`, then the existing `ConflictDialog` |
| Canvas: role downgraded (403 on save) | banner `access_changed`, with "Export my copy" |
| 401 after a session | banner `session_expired` |
| 429 | banner `rate_limited`, with a `Retry-After` countdown |

- Only one banner shows at a time, by priority: access_changed > session_expired > save_failed >
  newer_version > offline > rate_limited.

**Tests:** `src/tests/states-wiring.test.tsx`
- `it('offline shows offline banner with unsynced count')`
- `it('429 shows rate_limited with countdown')`
- `it('banner priority picks access_changed over offline')`
- `it('library empty uses EmptyState')`

---

### R1-E12-T03 · Client analytics module

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | PRODUCT_SPEC §7A instrumentation; privacy rule |

**Contract:**

```ts
// lib/analytics.ts
export type EventName =
  | 'workspace_created' | 'diagram_created' | 'element_added' | 'relationship_added'
  | 'share_invited' | 'link_published' | 'access_requested' | 'access_granted'
  | 'search_performed' | 'search_result_opened'
  | 'limit_reached' | 'upgrade_viewed'
  | 'import_completed' | 'export_completed' | 'version_restored' | 'compare_opened';
export type EventProps = Record<string, string | number | boolean>;  // enum-like strings ≤ 40 chars only
export function track(name: EventName, props?: EventProps): void;   // queues; never throws
export function flush(): Promise<void>;                             // POST /api/v1/events {events:[…]} ≤ 50; on failure drop silently (no retry storm)
export function setAnalyticsEnabled(on: boolean): void;             // workspace setting; off → track() is a no-op
```

**Rules:**
- Flush every 10 s, on `visibilitychange` to hidden (`navigator.sendBeacon`), and when the queue
  reaches 50.
- Signed-out and guest sessions don't send anything (the queue is dropped).
- `props` values are checked at runtime, so diagram content can't leak:
  - a string longer than 40 characters is replaced with `"[redacted]"`, with a dev-console warning;
  - non-primitive and non-finite values are dropped;
  - only the first 10 keys are kept, matching the server's 10-key 422 rule in T04, so a batch is
    never rejected for size. Any extra keys are dropped, with a dev warning.
  - The test title `drops long string props` covers the redaction.
- The client calls `fetch` directly, not the `lib/api.ts` helper, so a 401 on `/events` never
  triggers the global sign-out handler.
- Cross-origin deployments need the API's CORS settings to allow credentials for the beacon. On
  AWS the API is same-origin through Caddy, so no change is needed.
- `R1-E12-T05` adds the remaining events from §7A that need R2 features (`proposal_*`,
  `review_*`, `thread_*`) when those features exist. Don't add them to the union yet.

**Tests:** `src/tests/analytics.test.ts`
- `it('batches and flushes at 50')`
- `it('drops long string props')`
- `it('no-op when disabled or signed out')`
- `it('flush failure does not throw or retry')`

---

### R1-E12-T04 · Events endpoint (V13)

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | none (number V13 per DATA_MODEL_R1 §4.6) |

**Create:**
- `V13__product_events.sql`, per §4.5, plus `workspaces.analytics_enabled`.
- `web/EventsController.java`: `POST /api/v1/events` takes `{events:[{name, props}]}` (≤ 50) and
  returns 202.
- `service/ProductEventService.java`:
  - it validates the name against an allow-list mirroring `EventName`, kept in one Java `Set`;
  - it rejects props values that are strings longer than 40 characters, nested objects, or more
    than 10 keys (**422**);
  - it drops the batch silently with 202 when `analytics_enabled = false`;
  - the user and workspace come from the auth context, never from the body.
- The endpoint is rate-limited by the existing filter. Don't audit-log events, since they are not
  security events.

**Tests:** `ProductEventsTest.java`
- `acceptsAllowListedBatch()`
- `rejectsUnknownName422()`
- `rejectsLongString422()`
- `disabledWorkspaceDropsSilently()`
- `unauthenticatedIs401()`

---

### R1-E12-T05 · Wire events at call sites

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E12-T03, R1-E12-T04, plus each feature's task |

**Change:** add `track()` calls. Each is one line, with no logic change.

| Event | Where | Props |
|---|---|---|
| `diagram_created` | store `newDoc`, NewDiagramDialog, import | `source: blank\|template\|import\|duplicate` |
| `element_added` | `addNode`, `placeShape`, quick-add | `kind` |
| `relationship_added` | `connectNodes` | `relKind` |
| `share_invited` | ShareDialog | `role` |
| `link_published` | ShareDialog | `audience`, `role` |
| `access_requested` | RequestAccess | `role` |
| `search_performed` | global search (debounced, on result shown) | `scope: diagrams\|elements\|all`, `results: number` |
| `search_result_opened` | search | `type` |
| `limit_reached` | LimitDialog open | `limit` |
| `import_completed` | ImportDialog | `format`, `nodes: number` |
| `export_completed` | ExportDialog | `format`, `scope` |
| `version_restored` / `compare_opened` | History | none |

**Tests:** `src/tests/analytics-wiring.test.tsx`, which mocks `track`:
- `it('placing a shape tracks element_added with kind')`
- `it('search tracks counts, never the query')`

---

## Changelog
- 2026-10-25 R1-E12-T05 done: version_restored (HistoryPanel, after a successful restore, local or server) and compare_opened (CompareView mount, once per opening) via lib/analytics.track with no props; tests in history-panel.test.tsx and compare-view.test.tsx; files: components/history/HistoryPanel.tsx, components/compare/CompareView.tsx.
- 2026-10-25 R1-E12-T02 done: lib/apiSignals.ts (new, small signal store) fed by lib/api.ts: HTTP 429 raises rate_limited with the Retry-After countdown (seconds or date, 30 s default, capped 600 s), 401 on a real (non-guest, non-probe) session raises session_expired before the login redirect; AppStatusBanner renders both (Sign in / Keep working offline; Got it, no Status page button because none exists). Unknown paths render NotFoundState (`page` variant, "Page not found", Go to home) via app/NotFoundRoute.tsx; index route still redirects. Tests: states-banner-wiring.test.tsx (+4, incl. `429 shows rate_limited with countdown`), not-found-route.test.tsx.
- 2026-10-25 R1-E12-T02 done (follow-up): components/states/{AppStatusBanner.tsx,selectBanner.ts} select one banner by priority (access_changed > session_expired > save_failed > newer_version > offline > rate_limited) from real signals (offline, syncError while online, saveConflict, in-session write-to-read role downgrade); mounted in AppShell main (2 lines); tests/states-banner-wiring.test.tsx (5). Not raised, no client signal exists yet: session_expired, rate_limited (429 Retry-After), unsynced-edit count; NotFoundState has no access route yet.
- 2026-10-25 R1-E12-T05 done (follow-up): remaining rows were wired by store/ShareDialog/RequestAccess/ExportDialog/search owners (tests: store-analytics, global-search); version_restored/compare_opened pending History UI.
- 2026-10-25 R1-E12-T05 review (partial): track() wired for diagram_created (Dashboard blank/duplicate, NewDiagramDialog blank/template, ImportDialog import, DocSwitcher, useAppCommands) and import_completed (ImportDialog); limit_reached already in LimitDialog. Remaining rows are in store/canvas/ShareDialog/search/History (see report); tests/analytics-wiring.test.tsx (2 of 4 named-or-equivalent; element_added and search rows need the store hook and a search UI).
- 2026-10-25 R1-E12-T02 review (partial): Skeleton in withFallback and library loading; EmptyState in Dashboard (shared/starred/folder/filters/none), Home, Trash, Reviews checkpoints, Living connectors and sync log; tests/states-wiring.test.tsx (3). Canvas banners and NotFoundState need CanvasScreen/AppShell and an access route (none exists); not done.
- 2026-10-25 R1-E12-T01 done: components/states/{index.ts,components.tsx,copy.ts} (Skeleton, EmptyState, StatusBanner, NotFoundState, BANNER_COPY verbatim); StatusBanner takes real `detail`/`safeDetail` and falls back to generic text, never artboard example data (added optional `safeDetail`, `Skeleton` `delay`/`onKeepWaiting` props); tests/system-states.test.tsx (6). Wiring is T02.
- 2026-10-25 R1-E12-T04 done: V13__product_events.sql (table, name check, insert-only RLS, workspaces.analytics_enabled), EventsController, ProductEventService, EventsRequest DTO, web/ProductEventsTest (5 tests). Name allow-list mirrors EventName in one Set; props accept strings (<=40 chars), numbers and booleans, max 10 keys, else 422; batch 1..50 else 422; opted-out workspace returns 202 and stores nothing. Not audited (not security events). The current workspace is the caller's personal workspace until X-Workspace-ID is wired to events.
- 2026-10-25 R1-E12-T03 follow-up: client caps props at the first 10 keys (+1 test, 5/5). Reviewed by coordinator.
- 2026-10-25 R1-E12-T03 done: lib/analytics.ts plus tests/analytics.test.ts (4 tests). It uses fetch directly, not lib/api.ts, so a 401 on events can't sign the user out; sendBeacon on hide. Reviewed by coordinator.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-26 R1-E14-T10: note only. The AI assistant stays R2; the R1 dock tab is a placeholder with no AI states, no instrumentation.
- 2026-10-26 R1-E14-T11 (states): Sync gets an honest drift empty state ("No drift on the canvas", no "matches upstream" claim), saved sources always `Not connected`, offline and failed-sync strips; the Live dock tab gets connected, alone, local-only, guest and reconnecting states. Artboards Sync.dc.html and Live.dc.html carry them.
- 2026-10-26 R1-E14-T12 (honest states): no progress indicator, "Polling" state or success toast for work that is not running. Sync: saved sources have no Retry (no live provider in R1); Re-sync with no connected source logs "No re-sync: no live source is connected" in Activity, shows no progress bar, and leaves Last re-sync at Never.
- 2026-10-26 R1-E14-T13 (honest states): Sync Add source has no timed "Polling" state and no "simulated" toast; a saved source is Not connected at once and the toast says no provider is verified yet.
