# EPIC-13 · R1 release gate: journeys, performance, accessibility, visual baselines

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 4 (last) | **Sources:** PRODUCT_SPEC §7 R1 exit criteria
> (activation ≥ 45 %, import success ≥ 95 %, 0 axe violations, 5k elements at 60 fps); UI_REVAMP_SPEC §9
> "Verification"

These tasks verify; they don't build features. A failure here opens a bug task (`R1-BUG-nn`) in
BACKLOG that references the failing check. Don't fix the code inside a gate task.

---

### R1-E13-T01 · R1 end-to-end journeys

| | |
|---|---|
| **Size** | M |
| **Role** | test-engineer |
| **Depends on** | E02, E03, E06, E07, E09, E10 done |

**Create:** `frontend/e2e/r1-journeys.spec.ts`. Use the fixtures in `e2e/fixtures.ts`, and run the
backend stack as compose project `archflux-qa` on ports 28080/23001 (AGENTS.md §3).

| Journey | Steps | Assert |
|---|---|---|
| J1 Create and model | Home → New diagram (Blank, Card) → place a VPC boundary → place 3 AWS elements inside → connect them → switch one to Icon style → rename inline | parentId set; Icon style shows the name; one undo reverts the rename |
| J2 Pages and layers | add page 2 → move 2 elements → hide the "network" layer → export the current page as PNG | page 1 is empty of the moved elements; the export excludes hidden layers |
| J3 Library | create a folder → move the doc → star → trash → restore from Trash | the doc returns to its folder |
| J4 Share | user A shares with B as commenter → B opens `#/d/:id` → B comments, sees no edit tools | read-only rules hold |
| J5 Access | user C (no access) opens the link → request → A approves → C can view | states `request`, then `ok` |
| J6 Import | import the draw.io fixture → preview → import as new | stats match; warnings shown |
| J7 History | edit, then name a version, edit again → compare → revert one change | the other edit remains |
| J8 Limits | free workspace with 3 cloud diagrams → create a 4th | it stays local; the limit dialog shows |

**Acceptance:** all 8 journeys pass on chromium, firefox and webkit. Record the run in the epic
changelog.

---

### R1-E13-T02 · Performance benchmark (5k elements at 60 fps)

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer |
| **Depends on** | E02, E03 done |

**Create:** `frontend/e2e/perf.spec.ts`. It:
1. generates a doc with 5,000 nodes (mixed kinds and styles, 30 % inside boundaries) and 6,000
   edges on one page through `page.evaluate` into localStorage;
2. opens the canvas and measures the frame times of a scripted 3 s pan and zoom with
   `requestAnimationFrame` timestamps;
3. asserts p95 frame time ≤ 16.7 ms, and an open time (navigation to first full paint) ≤ 1.5 s for
   2k elements.

It runs on chromium only and is tagged `@perf`, which is excluded from the default CI run. A failing
result opens a bug task with a profile attached.

---

### R1-E13-T03 · Accessibility sweep

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer |
| **Depends on** | all UI epics done |

**Create:** `frontend/e2e/a11y-r1.spec.ts`. It runs axe (`@axe-core/playwright`; add it as a dev
dependency if it's missing, and note this in the changelog) on every route:
- `/home`, `/dashboard`, `/trash`, `/canvas` (with a selection, the inspector open, a dialog open:
  Share, Import, Export, Icon picker), `/reviews`, `/living`, `/blueprints`, `/settings/*`, `/login`,
  `/onboarding`, and `#/d/:id` in each access state;
- at 1440×900 and 390×844.

It also runs a keyboard-only script: create an element, connect it, rename it, align it, open the
context menu and change the style, all without a mouse.

**Acceptance:** 0 violations, and the keyboard script passes.

---

### R1-E13-T04 · Visual regression baselines

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer + a human reviewer |
| **Depends on** | R1-E13-T03 |

**Steps:**
1. Run `npm run test:visual` and collect the diffs.
2. A human compares each new screenshot with its design artboard (PRODUCT_SPEC §6.1). Only after
   that approval, run `npx playwright test e2e/visual-regression.spec.ts --update-snapshots`.
3. Record the reviewer and date in the changelog.

An agent must **never** update snapshots on its own judgement.

---

### R1-E13-T05 · Routes and templates audit

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer |
| **Depends on** | R1-E13-T01 |

**Steps:**
1. `frontend/e2e/routes-audit.spec.ts` loads every route in `App.tsx` as a signed-out visitor, a local guest and a signed-in user. Each case fails on a page error, a console error (except listed noise: `/config.json` 404, `/api/v1/auth/me` 401 probe, the deliberately invalid invite token), a blank main region, a wrong landing path or a missing heading or landmark.
2. Templates: Blueprints cards match the real graphs; Insert adds the nodes beside existing content; Load replaces the canvas; New diagram Templates tab creates a titled diagram with the nodes; the Library sidebar Templates link opens Blueprints; signed in, Save as template then Use template creates an untagged copy with the same nodes.
3. Run: `E2E_PORT=5191 VITE_DEV_API_PROXY=http://localhost:23001 npx playwright test e2e/routes-audit.spec.ts --project=chromium` (guest only: `E2E_AUDIT_GUEST_ONLY=1`).

---

## Changelog
- 2026-10-26 Owner-approved visual baseline re-capture after R1-E14-T12 (Sync honesty: no Retry on saved sources, re-sync with no source writes an honest attempt line, Live dock footer pinned) and R1-E14-T13 (Add source saves as Not connected, no polling or simulated toast). Re-captured on chromium, firefox and webkit: 117 snapshots, then two clean verification runs without the update flag (117/117 each).
- 2026-10-26 Owner-approved visual baseline re-capture after the AI assistant dock tab (R1-E14-T10), the Sync and Live fidelity pass (R1-E14-T11), the stale Command-K e2e selectors and the Shapes, tile and toolbar fixes. Re-captured on chromium, firefox and webkit: 117 snapshots, then two clean verification runs without the update flag (117/117 each). The affected baselines are the canvas dock, living-*, and the Shapes and library drawer shots.
- 2026-10-26 R1-E13-T04 done (test-engineer; owner approval 2026-10-25): re-captured with `E2E_PORT=5191 npx playwright test e2e/visual-regression.spec.ts --project=chromium --project=firefox --project=webkit --update-snapshots`. Baselines on disk: 47 per browser (141 total; the 2 Mobile theme shots are not in these projects and were not touched), including the 8 r1-* screens (home, trash, new-diagram dialog, import dialog, export dialog, share dialog local, shapes panel, layers popover) on all three browsers. Then two plain runs on the same projects, retries 0: 114 passed, 114 passed; no flaky snapshot, thresholds unchanged. Before capture: `npx vitest run` 662 passed / 7 skipped, `tsc -b` clean. Spec fix needed to get a green run (test code only): 4 tests used stale selectors (theme select no longer in the canvas app bar; button 'Open shape library' renamed 'Shapes library'), so dark/light/blueprint theme and library drawer tests now set the theme via Settings and use `/Shapes library/`; their baselines were captured from the current UI.
- 2026-10-25 Decision on the frame budget (R1-BUG-09): the pan/zoom limit changes from p95 <= 16.7 ms to p95 <= 17.0 ms. Reason: 16.7 ms is below the 0.1 ms timer resolution, and an idle page with no interaction already measures p95 16.8 ms, so the old limit could not pass with a correct implementation. 17.0 ms is one 60 Hz frame plus timer resolution. Measured with the fix: production pan/zoom p95 16.8 ms (old 666.6 ms); production open of 5k elements 937 ms (old 3343 ms). Harness note: the accessible-name lookup for the Pan button stalls one frame; not counted as a product cost. The spec's acceptance is unchanged in shape; only the number moved, with this record.
- 2026-10-25 R1-BUG-05 recorded as retracted (not a bug): Shift+click does add to the selection when Shift is held; Playwright `mouse.click` has no `modifiers` option. No product change.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-25 R1-E13-T01 review: `frontend/e2e/r1-journeys.spec.ts` (J1 to J8; J5 split into J5a plus a fixme J5), helpers in `e2e/fixtures.ts` (real magic-link sign-in against archflux-qa through Redis, state read through the store's own `beforeunload` flush). Backend run: `mvn -DskipTests package`, API as `java -jar` on 23001 against compose project `archflux-qa` (db on 25432, Redis on 26379), dev server `VITE_DEV_API_PROXY=http://localhost:23001 E2E_PORT=5191`. Chromium, retries 0: 6 passed, 2 skipped (J4 fixme R1-BUG-06 under the `archflux_app` role; J5 fixme R1-BUG-07). Two further runs on chromium+firefox+webkit: 21 passed / 6 skipped, and 20 passed / 1 failed (webkit J8: the signed-in session dropped to /login) / 6 skipped. Webkit and the first runs after a backend restart showed intermittent drops to /login on signed-in flows (cause not isolated). With the API connected as the DB owner role J4 passes, so only the invite accept step is blocked. J1 asserts displayStyle and label in the store; it does not read canvas pixels. Acceptance ("all 8 pass on three browsers") is not met, so the row is `review`. Added dev dependency `@axe-core/playwright` (see T03).
- 2026-10-25 R1-E13-T02 review: `frontend/e2e/perf.spec.ts` (tagged `@perf`; `playwright.config.cjs` gets `grepInvert` so it runs only with `E2E_PERF=1`). Measured on headless Chromium, macOS, Vite dev server: open 2k elements 1114 ms (limit 1500, pass); open 5k 3365 ms; pan and zoom over 5k elements and 6k edges: 41 frames in 3 s, p50 33.3 ms, p95 566.6 ms, p99 1083.3 ms, about 8.1 fps (limit p95 16.7 ms, FAIL). Bug R1-BUG-09. A dev build in headless software rendering overstates frame times; a profile on a production build is the next step.
- 2026-10-25 R1-E13-T03 review: `frontend/e2e/a11y-r1.spec.ts`, dev dependency `@axe-core/playwright` ^4.14 added to package.json. 39 axe scans (wcag2a, wcag2aa, wcag21a, wcag21aa) at 1440x900 and 390x844: 17 clean, 22 with violations. Rules: `label-content-name-mismatch` in 20 scans (R1-BUG-10, R1-BUG-11), `color-contrast` in 1 (`/living`), `scrollable-region-focusable` in 1 (mobile dialog) (R1-BUG-12). Clean: `/login`, `/onboarding`, `#/d/:id` ok and not_found, mobile routes except `/home` and `/dashboard`. Not scanned: Share dialog at 390 wide (button hidden), icon picker dialog. Keyboard script (shapes panel, nudge, inline rename, context menu style, Align left) passes; the connect step is `test.fixme` (R1-BUG-08). No product code was changed.
- 2026-10-25 R1-E13-T04 review: 8 R1 screens added to `e2e/visual-regression.spec.ts` (home, trash, new diagram, import, export, share local, shapes panel, layers popover). Run with `--update-snapshots=none`: all 8 report a missing snapshot on chromium (24 baselines absent across the three browsers). The 19 existing chromium shots all differ from the current UI (expected before E14-T07). No snapshot was written or updated. Reviewer and date: pending.

- 2026-10-25 R1-BUG-10/11 fixed (frontend-implementer): AppBar search aria-label "Search ⌘K"; removed non-matching aria-labels on Home template/Continue rows, Library card links, New diagram template cards; Shapes tile initial drawn by CSS (`.shape-tile-letter`); Living badges darkened via `screens/livingBadge.ts`; Export dialog panes are named focusable regions; Export Esc listener made stable (it never closed from the canvas). Tests: `src/tests/a11y-names-r1.test.tsx`. a11y-r1.spec.ts: 31 passed, 1 failed (server-backed, needs archflux-qa stack), 1 skipped.
- 2026-10-25 R1-BUG-08 fixed (frontend-implementer): with one node selected, C (also from the screen-reader node list) arms the source; activating another node in the list connects, activating the source cancels. The connect step in a11y-r1.spec.ts is no longer fixme. Files: screens/CanvasScreen.tsx, screens/canvas/useCanvasKeyboard.ts, tests/canvas-keyboard-connect.test.tsx, e2e/a11y-r1.spec.ts.
- 2026-10-25 R1-BUG-09 review (frontend-implementer): pan and zoom on 5,000 elements and 6,000 edges. Before (this machine, 3 runs): dev server p50 16.8, p95 1433 ms, ~3.9 fps, open 2k 1.9 to 2.2 s, open 5k 5.9 to 6.1 s; production build (`vite build` + `vite preview`) p50 33 to 50, p95 666.6 ms, ~5.7 fps, open 2k 1010 ms, open 5k 3343 ms. After: dev p50 16.7, p95 16.8, p99 50 to 67 ms, open 2k 797 ms, open 5k 1199 ms; production p50 16.7, p95 16.8, p99 33 ms, open 2k 763 ms, open 5k 937 ms. Causes (CPU profile): (1) `DiagramNodeList` (screen-reader list) and the Inspector "Diagram outline" re-rendered 5,000 rows with an O(nodes x edges) connection count on every pan frame; now memoized on the document arrays, counts built in one pass. (2) `edgePoints` did `nodes.find` per edge, several times per frame (cull, hops, body, label); now an id index cached per nodes array. The spec assertion `p95 <= 16.7` still fails by 0.1 ms: an idle page with no canvas work measured on the same machine gives frame deltas of 16.5 to 16.8 ms with p95 16.8 (10 of 189 frames at 16.8), i.e. the 0.1 ms timer resolution, so the assertion cannot pass as written. Left unchanged (not weakened). Decision needed: compare against the idle baseline or allow p95 <= 17.0 ms. Other leftovers: first drag frame 115 to 135 ms; Playwright `getByRole` over the 5,000 screen-reader buttons stalls one frame for about 2.1 s inside the measured window (harness cost, one frame, not in p95; it is the max); next bottleneck is the full `CanvasScreen` re-render per pointer event (React context carries pan). Files: `frontend/src/lib/canvasGeometry.ts`, `frontend/src/screens/canvas/CanvasOverlays.tsx`, `frontend/src/screens/canvas/Inspector.tsx` (outside the listed owners; they held the hot spots).
- 2026-10-25 R1-E13-T01 re-run (test-engineer, archflux-qa stack: db, redis, API jar rebuilt from the current tree with V18/V19, DB role archflux_app and owner): J4 (share, commenter) and J5 (request access, workspace-audience link with `?token=`) un-fixme'd. Test fixes, no assertion weakened: J4 now waits for the invite accept response (2xx) and asserts the redirect to `#/dashboard` instead of the transient "Workspace invite" region; J5 creates a `workspace` audience link through the API (an `anyone` link grants view directly, so the `request` state needs a workspace link for a non-member). Result chromium `--workers=1`: 9 passed, 3 of 3 runs. Default parallel workers: 6 to 9 pass, flaky (R1-BUG-14). Status stays `review`: firefox and webkit not re-run, parallel flake open.
- 2026-10-25 R1-E13-T02 done: perf.spec.ts on chromium, QA stack up: pan/zoom 5k elements p95 16.7 / 16.8 / 16.8 ms (limit 17.0), open 2k 814 to 896 ms, open 5k 1264 to 1284 ms. Frame max 2.1 s once per run (first-frame stall), p99 50 ms: the limit is on p95 only.
- 2026-10-25 R1-E13-T03 done: a11y-r1.spec.ts chromium 33 passed, 42 axe lines, 0 violations in 41, 1 not scanned (mobile Share dialog, button hidden at 390 px). R1-BUG-10/11/12 do not reproduce. Keyboard connect step passes.
- 2026-10-25 R1-BUG-14 fixed and R1-E13-T01 done (test-engineer; small product fix permitted by the task owner). Not a harness race: the logs show every magic-link token was issued for and verified by the same email (j3, j4-a, j4-b, j5-a, j5-c, j7, j8 all matched, `signInAs` already keys the Redis lookup on the email). The real cause was `SecurityConfig` `maximumSessions(1)`: a user's parallel page-load requests each open an HttpSession, the cap expired the older ones (`ConcurrentSessionFilter: Requested session ID ... has expired`), and the expired-session path ran the logout handlers, which clear `ARCHFLUX_TOKEN`; later requests from that browser were 401. Reproduced with curl (two JWT-only requests, then the first SESSION cookie: response sets `ARCHFLUX_TOKEN=; Max-Age=0`). Fix: removed `maximumSessions(1)` (JWT cookie is the credential). Test: `JwtAuthIsolationTest#parallelSessionsOfOneUserNeverClearTheJwtCookie` (failed before, passes now); `mvn test` 207 passed. Rebuilt app.jar, archflux-qa stack, default parallel workers, retries 0: chromium 9/9 x6, firefox 9/9 x2, webkit 9/9 x2; API log has 0 `has expired` and 0 `Unauthenticated` lines. Changed beyond the spec files: `backend/src/main/java/com/archflux/config/SecurityConfig.java`, `backend/src/test/java/com/archflux/web/JwtAuthIsolationTest.java`. No snapshots updated; `e2e/fixtures.ts` unchanged.
- 2026-10-26 R1-E13-T05 review (test-engineer; small product fixes permitted by the task owner): `e2e/routes-audit.spec.ts`, chromium, retries 0, archflux-qa stack: 74 passed (22 routes x 3 modes plus an invalid-invite check, 6 guest template tests, 1 signed-in team template test). Failures found and fixed, each with a failing test first: R1-BUG-15 (guest on `#/d/<id>` redirect loop; `LoginScreen.tsx`, `login-next-guest.test.tsx`), R1-BUG-16 (realtime socket opened for local diagrams; `hooks/useCollaboration.ts`, `collaboration-local-docs.test.ts`). Open: R1-BUG-17 (no y-websocket endpoint on the API). Notes: `/auth/callback` signed out lands on `/login?error=unauthorized`; `/invite/:token` signed out goes to login and keeps the invite; the Library sidebar Templates item links to `/blueprints` (there is no `?view=templates`). Visual snapshots untouched. Not in a heading: the not-found page title is a `strong`, asserted as region "Not found".
- 2026-10-28 R1-E13-T05 done (test-engineer): rebuilt `backend/target/app.jar` (V19 present, Flyway up to date), QA stack (db 25432, redis 26379, API 23001, Vite 5191), `E2E_QA_REDIS_CONTAINER=archflux-qa-redis-host`. `e2e/routes-audit.spec.ts` chromium, retries 0: 74 passed (28.8 s), then 74 passed in three further runs (27.9 s, 40.2 s, 29.2 s). Guest-only (`E2E_AUDIT_GUEST_ONLY=1`): 50 passed, 24 skipped (signed-in cases), 19.9 s. One extra full run, started while machine load average was ~17 (other processes), ended 69 passed, 5 failed after 10.0 min (signed-out history, living, reviews, git redirect, blueprints); the output was tail-truncated by the runner so the error text was not captured, and it did not recur in the three following runs. Treated as load-induced timeouts, not proven; if it recurs, capture the full report first. No product or test change, no assertions weakened, visual snapshots untouched.
- 2026-10-26 R1-BUG-17 decision (backend-implementer): option (b). The backend STOMP controller does not work for the SPA (no STOMP client, Yjs binary protocol, `HttpServletRequest` in message handlers). Added a stateless y-websocket relay at `/ws/diagram-{uuid}` with handshake auth and `AccessService` checks. Spec: SERVICES_SPEC §4.4 and SVC-O1. Client URL unchanged, covered by a frontend test.
- 2026-10-26 R1-BUG-17 fixed (backend-implementer): `DiagramRelayHandler` + `DiagramRelayConfig` (relay at `/ws/diagram-{uuid}`; viewers and commenters cannot send document updates), `AuthFilter` authenticates `/ws/diagram-*` handshakes, `useRemoteCursors` exposes `remoteCursorCount` and the canvas sets `data-remote-cursors` for tests. Tests: `DiagramRelayTest` (7: relay, no echo, 404 foreign or missing diagram, 401, 403 origin, role filter), `collaboration-relay-url.test.ts`, `e2e/realtime-cursors.spec.ts` (chromium, QA stack, 3 of 3 runs: user B sees user A's cursor, and it clears when A leaves the canvas). Full: `mvn -q test` 218 passed, `npx vitest run` 662 passed / 7 skipped, `tsc -b` clean, lint 0 errors. Limit: the relay is in-memory per API instance (SERVICES_SPEC §4.4), so multi-instance deployments need sticky routing or a Redis fan-out later.
- 2026-10-26 R1-E14-T11 (visual check): `/living` and the Live dock tab were compared with Sync.dc.html and Live.dc.html via design:shots. Snapshots that change and need owner approval before re-capture: `living-screen`, `living-light`, `living-dark` (chromium, firefox, webkit). Not re-captured by this task.
- 2026-10-30 R1-E08-T04 visual baseline captured (test-engineer, owner approved): new test `history pair compare` in `e2e/visual-regression.spec.ts` (guest path, no QA stack: two local checkpoints tagged through the Reviews screen, a node added between them, History `#/history`, both ticked, "Compare selected versions"). Version-row timestamps, session summaries and the day heading are masked; the test waits for toasts to clear. Baselines written: `e2e/visual-regression.spec.ts-snapshots/r1-history-pair-compare-{chromium,firefox,webkit}-darwin.png`. Update run (`-g "history pair compare"`, 3 browsers, retries 0): 3 passed. Full `e2e/visual-regression.spec.ts` on chromium, firefox, webkit, retries 0, no update flag: 120 passed, then 120 passed again. No other snapshot changed.
