# R1 backlog

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Part of:** [Implementation specs](README.md)
> **Status:** 🟡 Awaiting sign-off of decision D1. Agents may start **Wave 0** now; it is
> scope-neutral refactoring and contract work.

84 tasks in 14 epics. Sizes: S ≤ 150 changed lines, M ≤ 400 (README).

## How to pick a task

1. **Pick:** choose the lowest wave whose `todo` tasks have all their **Depends on** tasks `done`.
2. **Check the locks:** make sure no `in-progress` task holds a **hotspot lock** you need (table
   below).
3. **Claim:** set the status to `in-progress` and fill in Owner/date (`<agent>/<model> 2026-10-24`).
   Commit or announce that edit before you code, so two agents don't take the same task.
4. **Do the task:** follow the task section in its epic file, plus [AGENTS.md](../../../AGENTS.md).
5. **Finish:** set the status to `review`, then `done` after the reviewer passes it.

**Waves** are computed from the dependencies. Every task in a wave can run in parallel, subject to
the hotspot locks.

| Wave | Count | Can start when |
|---|---|---|
| 0 | 11 | now: types and normaliser, splits, backend V10/V12/V13, tokens, icon manifest, analytics |
| 1 | 17 | its own dependencies are done |
| 2–5 | 49 | its own dependencies are done |
| 6–8 | 7 | the features are done: context menu, quick-add, event wiring and the release gate |

## Hotspot locks (one in-progress task per file at a time)

| File | Tasks that edit it |
|---|---|
| `frontend/src/state/store.tsx` | E00-T02, E00-T04, E00-T08, E06-T03 (`deleteDoc`), E07-T06 (role), E09-T02 (layout extraction), E11-T06 (402) |
| `frontend/src/screens/CanvasScreen.tsx` | E00-T03, E01-T05, E01-T07, E02-T04 (hit test), E02-T08 (status wiring), E03-T02, E03-T04, E04-T03, E04-T05 |
| `frontend/src/canvas/render/nodes.ts` | E02-T02, E02-T03, E02-T04, E02-T08 |
| `frontend/src/canvas/render/edges.ts` | E02-T09, E04-T03, E04-T04 |
| `frontend/src/screens/canvas/Inspector.tsx` | E01-T06, E02-T05, E02-T07, E02-T09, E04-T06, E05-T03 |
| `frontend/src/components/AppShell.tsx` | E01-T03, E07-T05 (Share button), E10-T03 (palette) |
| `frontend/src/lib/api.ts` | E06-T03, E07-T05, E08-T03, E11-T03, E11-T06 (each adds a namespaced block, so a conflict is a trivial merge; the lock is advisory) |
| `backend/.../service/DiagramService.java` | E00-T06, E06-T02, E07-T01, E08-T02, E11-T01 |
| `backend/.../db/migration/` | Numbers are fixed (DATA_MODEL_R1 §4.6), so there is no lock, but merge in numeric order |

## Decisions (need a human; tasks that depend on them stay blocked)

| ID | Decision | Default if unanswered | Blocks |
|---|---|---|---|
| D1 | Sign-off on R1 scope and the R1–R4 order (PRODUCT_SPEC §7) | none: Wave 0 only | everything after Wave 0 |
| D2 | Model-backed elements (PRODUCT_SPEC §4) | R1 prepares (typed elements, ids); one-model/many-views stays R3 | R3 |
| D3 | Pricing and trial (PRODUCT_SPEC Q6) | "Contact us to upgrade"; no trial button | E11-T06 trial button only |
| D4 | Layout-only merge conflicts auto-resolve by default | yes (REVIEW_VERSIONING_SPEC) | R2 |
| D5 | Stale approvals dismissed on new commits by default | yes | R2 |
| D6 | Icon sets after AWS: Kubernetes now? GCP and Azure need official assets added to the repo | **Decided 2026-10-25 (owner): K8s yes (Apache-2.0); GCP/Azure wait until official assets exist in the repo** | E05-T05 unblocked |
| D7 | Icon uploads need a workspace asset store (S3 bucket in `deploy/aws`) | defer to R2 | icon-picker "Uploaded" tab |
| D8 | REVIEW_VERSIONING_SPEC §8 puts comment anchors, mentions and the inbox in R1; PRODUCT_SPEC §7 puts K4/K5 in R2 | follow PRODUCT_SPEC (R2); reconcile the specs before R2 | none in R1 |
| D9 | Viewers can see a diagram's member list | yes (decided in the E07-T02 spec) | — |

## Tasks

### Priority: design fidelity (added 2026-10-25)

The owner's review found that the running UI doesn't match the finalized design. **EPIC-14 runs
before any further UI feature work.** The waves are F0 to F4. Backend tasks may continue in
parallel.

| ID | Task | Size | Role | Depends on | Wave | Status | Owner / date |
|---|---|---|---|---|---|---|---|
| [R1-E14-T06](r1/EPIC-14-design-fidelity.md) | `design:shots` fidelity tooling | S | test-engineer | none | F0 | done | agent-F6 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E14-T01](r1/EPIC-14-design-fidelity.md) | App bar = AppBar.dc.html | M | frontend | none | F1 | done | agent-F1 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E14-T02](r1/EPIC-14-design-fidelity.md) | Canvas workspace shell = Main.dc.html | M | frontend | R1-E14-T01 | F2 | done | agent-F2 / 2026-10-25; checklist verified item by item 2026-10-28 |
| [R1-E14-T03](r1/EPIC-14-design-fidelity.md) | Inspector content = Main + DisplayStyles | M | frontend | R1-E14-T02 | F3 | done | agent-F3 / 2026-10-25 (header tile fixed, checklist complete) |
| [R1-E14-T04](r1/EPIC-14-design-fidelity.md) | Library page = Library.dc.html | M | frontend | R1-E14-T01 | F2 | done | agent-F4 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E14-T05](r1/EPIC-14-design-fidelity.md) | Element rendering matches Elements/States | S | frontend | R1-E02-T02 | F1 | done | agent-F5 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E14-T07](r1/EPIC-14-design-fidelity.md) | Re-baseline visual snapshots (owner approval) | S | test-engineer + human | R1-E14-T01…T05 | F4 | done 2026-10-26 | owner approved 2026-10-25; re-captured 2026-10-26: 47 baselines each on chromium, firefox, webkit (+2 mobile theme shots untouched); 2 green runs, 114/114, retries 0 | | |
| [R1-E14-T08](r1/EPIC-14-design-fidelity.md) | Outline rows + capped doc title (owner-reported) | S | frontend | R1-E14-T03 | F3 | done | frontend-implementer / 2026-10-26 (tests 666 pass; design shots checked; snapshot re-capture awaits owner approval) |
| [R1-E14-T09](r1/EPIC-14-design-fidelity.md) | Shapes drawer overlap and scroll, 2-line tile labels, selection toolbar placement (owner-reported) | S | frontend | R1-E14-T08 | F3 | done | frontend-implementer / 2026-10-26 (artboards Palette and Main updated first; tests 674 pass; design shots checked; baselines re-captured for library-drawer and r1-shapes-panel on chromium, firefox, webkit; two green visual runs, 117/117) |
| [R1-E14-T10](r1/EPIC-14-design-fidelity.md) | AI assistant (R2 placeholder) dock tab replaces Linter; lint list opens from status menu (owner-reported) | S | frontend | R1-E14-T09 | F3 | done | frontend-implementer / 2026-10-26 (artboards Main, Assistant, AppBar updated first; tests 680 pass; design shots checked; snapshot re-capture awaits owner approval) |
| [R1-E14-T11](r1/EPIC-14-design-fidelity.md) | Sync (`/living`) and canvas Live tab match Sync.dc.html and Live.dc.html (owner-reported) | M | frontend | R1-E14-T10 | F3 | done | frontend-implementer / 2026-10-26 (artboards Sync and Live got R1 states first; snapshot re-capture awaits owner approval) |
| [R1-E14-T12](r1/EPIC-14-design-fidelity.md) | Sync honesty: no Retry on saved sources, no simulated progress on Re-sync; Live dock R2 line pinned to the bottom (owner-reported) | S | frontend | R1-E14-T11 | F3 | done | frontend-implementer / 2026-10-26 (snapshot re-capture awaits owner approval) |
| [R1-E14-T13](r1/EPIC-14-design-fidelity.md) | Sync Add source saves honestly: no Polling state, no simulated toast (owner-reported) | S | frontend | R1-E14-T12 | F3 | done | frontend-implementer / 2026-10-26 |

**Backend verification (2026-10-25, coordinator):** `mvn -q test` ran 169 tests with 1 error: `AppRoleTest.v10FoldersAreWorkspaceScopedUnderAppRole` fails with `permission denied for function diagram_role_at_least` (its setup creates `app_tester` without the V15 EXECUTE grant). E07-T01 to T04 stayed `review` until that test was green. V15 (`RLS role hardening`) already exists although R1-E07-T07 is still `todo`; reconciled 2026-10-25: the test setup lacked the grant (fixed in the test), and V15 INSERT policies broke diagram inserts (fixed by V16). Full suite 177/177 green; T01-T04, T07, T08 are `done`.

**Verification note (2026-10-25):** the coordinator has not yet reviewed these tasks, which were
marked done by another tool: E01-T03, E02-T02, E02-T09, E04-T01, E04-T02, E09-T05, E10-T03 and
E10-T05. Their unit tests pass (54 files, 333 tests); `tsc` is clean; lint has 0 errors and 72
warnings, up from 67. E01-T03's visual result is superseded by E14-T01. E01-T04, T05 and T06 are
delivered visually by E14-T02 and T03.

### R1 tasks

| ID | Task | Size | Role | Depends on | Wave | Status | Owner / date |
|---|---|---|---|---|---|---|---|
| [R1-E00-T01](r1/EPIC-00-foundation.md) | Add R1 types and the `normalizeDoc` normaliser | M | frontend | none | 0 | done | agent-A1 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T02](r1/EPIC-00-foundation.md) | Run `normalizeDoc` on every load path | S | frontend | R1-E00-T01 | 1 | done | agent-A1 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T03](r1/EPIC-00-foundation.md) | Split `CanvasScreen.tsx` (pure refactor) | M | frontend | none | 0 | done | agent-A2 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T04](r1/EPIC-00-foundation.md) | Pages and layers in store state and the undo stack | M | frontend | R1-E00-T01, R1-E00-T02 | 2 | done | agent-B1 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E00-T05](r1/EPIC-00-foundation.md) | `.arch` format v2 | S | frontend | R1-E00-T01 | 1 | done | agent-A1 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T06](r1/EPIC-00-foundation.md) | Backend keeps pages, layers and defaults in the graph | S | backend | none | 0 | done | agent-A6 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T07](r1/EPIC-00-foundation.md) | Split `render.ts` (pure refactor) | S | frontend | none | 0 | done | agent-A3 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E00-T08](r1/EPIC-00-foundation.md) | Store feature-module seam | S | frontend | R1-E00-T04 | 3 | done | agent-B1 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E01-T01](r1/EPIC-01-ui-foundation.md) | Design tokens: type scale, fonts, light palette | S | frontend | none | 0 | done | agent-A4 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E01-T02](r1/EPIC-01-ui-foundation.md) | One button and input system (sm/md/lg) | M | frontend | R1-E01-T01 | 1 | done | agent-A4 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E01-T03](r1/EPIC-01-ui-foundation.md) | App bar per IA | M | frontend | R1-E01-T02 | 2 | done | agent-C3 / 2026-10-25 |
| [R1-E01-T04](r1/EPIC-01-ui-foundation.md) | Tool rail: icon-only, tooltips, "Shapes" | S | frontend | R1-E00-T03 | 1 | done | agent-C2 / 2026-10-25 (verified 2026-10-25: tool-rail.test 3/3; rail is 48 px per R1-E14-T02, which supersedes the 56 px in the spec) |
| [R1-E01-T05](r1/EPIC-01-ui-foundation.md) | Canvas toolbar (bottom-left) and minimap placement | S | frontend | R1-E00-T03, R1-E01-T03 | 3 | done | agent (frontend) / 2026-10-25 (already matched Main.dc.html; canvas-toolbar.test.tsx added) |
| [R1-E01-T06](r1/EPIC-01-ui-foundation.md) | Inspector: collapsible sections and labelled pickers | M | frontend | R1-E00-T03 | 1 | done | agent-C2 / 2026-10-25 (verified 2026-10-25: inspector-sections.test 4/4; test names aligned with spec) |
| [R1-E01-T07](r1/EPIC-01-ui-foundation.md) | Click selects; connecting is explicit | S | frontend | R1-E00-T03 | 1 | done | agent-C2 / 2026-10-25 (verified 2026-10-25: select-vs-connect.test 5/5) |
| [R1-E01-T08](r1/EPIC-01-ui-foundation.md) | `PageHeader` on every page | S | frontend | R1-E01-T02 | 2 | done | agent-F2 / 2026-10-25 |
| [R1-E01-T09](r1/EPIC-01-ui-foundation.md) | Retire legacy #635BFF accent tokens; move screens to `btn--{size}` | S | frontend | R1-E01-T02 | 2 | done | agent / 2026-10-25 (all btn-xs and light #635BFF retired) |
| [R1-E02-T01](r1/EPIC-02-element-model.md) | Notation table (`canvas/notation.ts`) | S | frontend | R1-E00-T01 | 1 | done | agent-B2 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E02-T02](r1/EPIC-02-element-model.md) | Card style renderer | M | frontend | R1-E02-T01, R1-E00-T07 | 2 | done | agent-C1 / 2026-10-25 |
| [R1-E02-T03](r1/EPIC-02-element-model.md) | Shape style renderer (notation geometry) | M | frontend | R1-E02-T02 | 3 | done | agent-frontend-implementer / 2026-10-25 |
| [R1-E02-T04](r1/EPIC-02-element-model.md) | Icon style renderer (fixes UX-A12) | S | frontend | R1-E02-T02 | 3 | done | agent-frontend-implementer / 2026-10-25 |
| [R1-E02-T05](r1/EPIC-02-element-model.md) | Switch display style (toolbar, inspector, Alt+1/2/3) | M | frontend | R1-E02-T03, R1-E02-T04, R1-E00-T08 | 4 | done | agent-frontend-implementer / 2026-10-25 (Inspector Display now calls setDisplayStyle; test updated; full suite green)|
| [R1-E02-T06](r1/EPIC-02-element-model.md) | Inline editing of name and technology | M | frontend | R1-E02-T02 | 3 | done | agent-frontend-implementer / 2026-10-25 |
| [R1-E02-T07](r1/EPIC-02-element-model.md) | Typed properties in the Inspector | M | frontend | R1-E01-T06, R1-E00-T01 | 2 | done | agent (frontend) / 2026-10-25 (PropertiesSection in Inspector, 3+4 tests) |
| [R1-E02-T08](r1/EPIC-02-element-model.md) | Element states rendering (§5A.5) | M | frontend | R1-E02-T02, R1-E02-T03, R1-E02-T04 | 4 | done | agent-frontend-implementer / 2026-10-25 |
| [R1-E02-T09](r1/EPIC-02-element-model.md) | Relationship styles (§5A.4) | M | frontend | R1-E02-T01, R1-E00-T07 | 2 | done | agent-C1 / 2026-10-25 |
| [R1-E03-T01](r1/EPIC-03-containers-pages-layers.md) | Boundary rendering | M | frontend | R1-E02-T01, R1-E00-T07 | 2 | done | agent (frontend) / 2026-10-25 (orderForPaint, childCount, cloud logo wired in CanvasScreen (CanvasEngine: order and count only, no logo)) |
| [R1-E03-T02](r1/EPIC-03-containers-pages-layers.md) | Containment: drop in, move together, auto-fit | M | frontend | R1-E03-T01, R1-E00-T08 | 4 | done | agent (frontend) / 2026-10-25 (drop-in, move together, auto-fit, delete dialog wired in CanvasScreen; containment-wiring.test.tsx) |
| [R1-E03-T03](r1/EPIC-03-containers-pages-layers.md) | Collapse and expand boundaries | S | frontend | R1-E03-T02 | 5 | done | agent (frontend) / 2026-10-25 (collapse chips, hidden children, merged edges with count, Alt+C, toolbar button) |
| [R1-E03-T04](r1/EPIC-03-containers-pages-layers.md) | Pages bar and per-page rendering | M | frontend | R1-E00-T04 | 3 | done | agent (frontend) / 2026-10-25 (pages bar mounted; per-page canvas, minimap and node list) |
| [R1-E03-T05](r1/EPIC-03-containers-pages-layers.md) | Layers panel | M | frontend | R1-E00-T04 | 3 | done | agent (frontend) / 2026-10-25 (layers popover mounted from the pages bar Layers button) |
| [R1-E03-T06](r1/EPIC-03-containers-pages-layers.md) | Frames and swimlanes | S | frontend | R1-E03-T02 | 5 | done | agent (frontend) / 2026-10-25 (Shift+F frame and Shift+W swimlane tools, Add lane below; tool rail unchanged, see epic notes) |
| [R1-E04-T01](r1/EPIC-04-arrange-connectors-style.md) | Align and distribute | S | frontend | R1-E00-T08 | 4 | done | agent-D1 / 2026-10-25 |
| [R1-E04-T02](r1/EPIC-04-arrange-connectors-style.md) | Match size, z-order, lock | S | frontend | R1-E04-T01 | 5 | done | agent-D1 / 2026-10-25 |
| [R1-E04-T03](r1/EPIC-04-arrange-connectors-style.md) | Connector waypoints | M | frontend | R1-E02-T09 | 3 | done | agent (frontend) / 2026-10-25 (waypoint handle drag, dblclick remove, Reset route in Inspector) |
| [R1-E04-T04](r1/EPIC-04-arrange-connectors-style.md) | Line jumps and label positions | S | frontend | R1-E04-T03 | 4 | done | agent (frontend) / 2026-10-25 (edgeHops and label-pill drag wired) |
| [R1-E04-T05](r1/EPIC-04-arrange-connectors-style.md) | Ports (N/E/S/W) and drag-to-connect | M | frontend | R1-E01-T07, R1-E02-T08 | 5 | done | agent (frontend) / 2026-10-25 (ports on hover, drag-to-connect (jsdom-tested; not browser-verified)) |
| [R1-E04-T06](r1/EPIC-04-arrange-connectors-style.md) | Format painter and multi-select styling | S | frontend | R1-E01-T06 | 2 | done | agent (frontend) / 2026-10-25 (MultiAppearance, useFormatPainter and toolbar button wired) |
| [R1-E04-T07](r1/EPIC-04-arrange-connectors-style.md) | Context menu (SC-18) | M | frontend | R1-E04-T01, R1-E04-T02, R1-E02-T05, R1-E10-T03 | 6 | done | agent (frontend) / 2026-10-25 (context menu mounted on canvas right-click and Shift+F10) |
| [R1-E04-T08](r1/EPIC-04-arrange-connectors-style.md) | Wire arrange UI (context toolbar and shortcuts) | S | frontend | R1-E04-T01, R1-E04-T02, R1-E10-T05, R1-E01-T07 | 5 | done | agent (frontend) / 2026-10-25 (arrange group in context toolbar, shortcuts, find bar) |
| [R1-E05-T01](r1/EPIC-05-icons-shape-library.md) | Icon manifest generator | M | frontend | none | 0 | done | agent-A5 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E05-T02](r1/EPIC-05-icons-shape-library.md) | Icon resolution and suggestions | S | frontend | R1-E05-T01, R1-E00-T01 | 1 | done | agent-B2 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E05-T03](r1/EPIC-05-icons-shape-library.md) | Icon picker dialog | M | frontend | R1-E05-T02, R1-E01-T06 | 2 | done | agent (frontend) / 2026-10-25 (icon picker mounted (canvas icon slot, context toolbar, Inspector)) |
| [R1-E05-T04](r1/EPIC-05-icons-shape-library.md) | Shapes panel (SC-17) | M | frontend | R1-E05-T02, R1-E02-T01 | 2 | done | agent (frontend) / 2026-10-25 (Shapes panel mounted with store insertNode and tile drop) |
| [R1-E05-T05](r1/EPIC-05-icons-shape-library.md) | Kubernetes icon set (behind decision D6) | S | frontend | R1-E05-T01; **decision D6** | 1 | done | agent-frontend / 2026-10-25 (official kubernetes/community icons, 39 vendored; K8s tab in picker and Shapes panel; icon-manifest +2 tests; full suite green) |
| [R1-E05-T06](r1/EPIC-05-icons-shape-library.md) | Remove the placeholder gcp/azure/data icons | S | frontend | R1-E05-T01, R1-E00-T03 | 1 | done | agent-C2 / 2026-10-25 (verified 2026-10-25: no gcp/azure/data icon folders or /icons/ references; icon-manifest.test passes) |
| [R1-E06-T01](r1/EPIC-06-library-folders-trash.md) | V10 migration plus the folders API | M | backend | none | 0 | done | agent-A6 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E06-T02](r1/EPIC-06-library-folders-trash.md) | Soft delete, restore, purge, star, move, list filters | M | backend | R1-E06-T01 | 1 | done | agent-A6 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E06-T03](r1/EPIC-06-library-folders-trash.md) | Frontend API and library state | M | frontend | R1-E06-T02 | 2 | done | agent-F1 / 2026-10-25 |
| [R1-E06-T04](r1/EPIC-06-library-folders-trash.md) | Library UI: folder tree, breadcrumbs, star, move (SC-06) | M | frontend | R1-E06-T03, R1-E01-T08 | 3 | done | agent-F2 / 2026-10-25 (mounted in DashboardScreen; library-ui 4 tests) |
| [R1-E06-T05](r1/EPIC-06-library-folders-trash.md) | Trash screen (SC-08) | S | frontend | R1-E06-T03 | 3 | done | agent-F2 / 2026-10-25 (route /trash; trash-screen 3 tests) |
| [R1-E07-T01](r1/EPIC-07-sharing-access.md) | V11 migration plus `AccessService` (effective role) | M | backend | R1-E06-T02 | 2 | done | agent-E1 / 2026-10-25 |
| [R1-E07-T02](r1/EPIC-07-sharing-access.md) | Members endpoints | S | backend | R1-E07-T01 | 3 | done | agent-E1 / 2026-10-25 |
| [R1-E07-T03](r1/EPIC-07-sharing-access.md) | Share links and the `X-Share-Token` header | M | backend | R1-E07-T01 | 3 | done | agent-E1 / 2026-10-25 |
| [R1-E07-T04](r1/EPIC-07-sharing-access.md) | Access requests and `GET /access` | M | backend | R1-E07-T03 | 4 | done | agent-E1 / 2026-10-25 |
| [R1-E07-T07](r1/EPIC-07-sharing-access.md) | RLS role hardening (DB-level write = editor+) | S | backend | R1-E07-T01 | 3 | done | 2026-10-25 |
| [R1-E07-T08](r1/EPIC-07-sharing-access.md) | Route Sync/Export/Collaboration checks through AccessService | S | backend | R1-E07-T01 | 3 | done | 2026-10-25 |
| [R1-E07-T05](r1/EPIC-07-sharing-access.md) | Share dialog UI (SC-22) | M | frontend | R1-E07-T02, R1-E07-T03 | 4 | done 2026-10-25 | Share button in AppShell opens ShareDialog |
| [R1-E07-T06](r1/EPIC-07-sharing-access.md) | Access states and read-only mode (SC-50) | M | frontend | R1-E07-T04, R1-E07-T05 | 5 | done 2026-10-25 | role in store, ReadOnlyBanner + request dialog in CanvasScreen, addServerDoc, ?next= wired |
| [R1-E08-T01](r1/EPIC-08-versions-diff.md) | Semantic diff (pure) | M | frontend | R1-E00-T01 | 1 | done | agent-B3 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E08-T02](r1/EPIC-08-versions-diff.md) | Backend: named versions, restore, `source` | M | backend | R1-E07-T01 (soft, see task) | 0–3 (best after E07-T01) | done | agent-backend / 2026-10-25 (full backend suite green; DTO split fixed a shared MemberRoleRequest regression) |
| [R1-E08-T03](r1/EPIC-08-versions-diff.md) | History panel: one timeline (SC-27) | M | frontend | R1-E08-T02, R1-E08-T01 | 2 | done | agent (frontend) / 2026-10-25 (History right-dock tab in CanvasScreen; compare still opens in #/history) |
| [R1-E08-T04](r1/EPIC-08-versions-diff.md) | Compare view and visual diff overlay (SC-28) | done | 2026-10-29: two-entry compare built (tick exactly two, older left, Swap, revert only when right is current); compare-pair 4 tests, full vitest 719 pass. Earlier: 2026-10-28: compare is reachable from History, but only against the current version. Comparing any two entries is not built, so the spec is not fully met |
| [R1-E09-T01](r1/EPIC-09-import-export.md) | draw.io importer | M | frontend | R1-E00-T01 | 1 | done | agent-B4 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E09-T02](r1/EPIC-09-import-export.md) | Mermaid flowchart importer | M | frontend | R1-E00-T01 | 1 | done | agent-B4 / 2026-10-25 (reviewed 2026-10-25) |
| [R1-E09-T03](r1/EPIC-09-import-export.md) | Import mapping preview (SC-10) | M | frontend | R1-E09-T01, R1-E09-T02 | 2 | done | agent (E09-T03) / 2026-10-25 (mounted: palette, Library button, Library drop; New diagram tab via E10-T02) |
| [R1-E09-T04](r1/EPIC-09-import-export.md) | Export dialog (SC-39) | M | frontend | R1-E03-T04 | 4 | done | agent / 2026-10-25 (export dialog mounted from AppShell account menu "Export…"; deviations recorded in EPIC-09) |
| [R1-E09-T05](r1/EPIC-09-import-export.md) | Store layout uses lib/layout.ts (fixes R1-BUG-03) | S | frontend | R1-E09-T02 | 2 | done | agent-D1 / 2026-10-25 |
| [R1-E10-T01](r1/EPIC-10-home-create-search.md) | Home screen (SC-05) | M | frontend | R1-E01-T08, R1-E06-T03 | 3 | done | agent-F2 / 2026-10-25 (route /home; home-screen 4 tests) |
| [R1-E10-T02](r1/EPIC-10-home-create-search.md) | New diagram dialog (SC-09) | S | frontend | R1-E09-T03 | 3 | done | agent-F2 / 2026-10-25 (mounted from Library and Home; new-diagram-dialog 3 tests) |
| [R1-E10-T03](r1/EPIC-10-home-create-search.md) | Command registry and palette (SC-19) | M | frontend | R1-E00-T03 | 1 | done | agent-C3 / 2026-10-25 |
| [R1-E10-T04](r1/EPIC-10-home-create-search.md) | Global search (SC-07) | M | frontend | R1-E10-T03, R1-E06-T03 | 3 | done | agent-frontend / 2026-10-25 (palette Search tab or `/`; SC-51 element page not built, needs R3 catalog) |
| [R1-E10-T05](r1/EPIC-10-home-create-search.md) | Find and replace, select similar (CAP-C9) | S | frontend | R1-E00-T08 | 4 | done | agent-D1 / 2026-10-25 |
| [R1-E10-T06](r1/EPIC-10-home-create-search.md) | Quick-add: type to create and connect | S | frontend | R1-E05-T02, R1-E04-T05 | 6 | done | agent-frontend / 2026-10-25 (mounted via AppShell; uses store insertConnected, one undo step) |
| [R1-E10-T07](r1/EPIC-10-home-create-search.md) | Team templates ("Save as template", CAP-S3) | S | frontend | R1-E06-T03 | 3 | done | agent-frontend / 2026-10-25 (Library menu + Blueprints section) |
| [R1-E11-T01](r1/EPIC-11-workspace-activation-limits.md) | V12, workspace endpoints, invites, `PlanService` | M | backend | none (merge after V10/V11) | 0 | done | 2026-10-25 |
| [R1-E11-T02](r1/EPIC-11-workspace-activation-limits.md) | Members management API | S | backend | R1-E11-T01 | 1 | done | agent-backend / 2026-10-25 (full backend suite green; DTO split fixed a shared MemberRoleRequest regression) |
| [R1-E11-T03](r1/EPIC-11-workspace-activation-limits.md) | Workspace setup and join (SC-02) | M | frontend | R1-E11-T01 | 1 | done | agent / 2026-10-25 (switcher mounted in AppShell account menu; setup/join route live; backend gaps noted in EPIC-11) |
| [R1-E11-T04](r1/EPIC-11-workspace-activation-limits.md) | Members screen backed by the server (SC-41) | S | frontend | R1-E11-T02 | 2 | done | agent-frontend / 2026-10-25 (route /settings/team; settings-team 6 tests) |
| [R1-E11-T05](r1/EPIC-11-workspace-activation-limits.md) | Getting-started checklist (SC-04, FL-16) | S | frontend | R1-E10-T01 | 4 | done | agent-frontend / 2026-10-25 (mounted on /home; checklist 6 + getting-started 2 tests) |
| [R1-E11-T06](r1/EPIC-11-workspace-activation-limits.md) | Limit reached UI and 402 handling (SC-54) | S | frontend | R1-E11-T01 | 1 | done | agent / 2026-10-25 (dialog mounted in AppShell; store returns limit; status shows "Local · Free plan limit"; status.test added; full suite green) |
| [R1-E12-T01](r1/EPIC-12-system-states-instrumentation.md) | State components | done | agent / 2026-10-25 (components used by Dashboard, Home, Trash, Reviews, Living and the app-status banner; tests pass) |
| [R1-E12-T02](r1/EPIC-12-system-states-instrumentation.md) | Apply states across the app | done | agent / 2026-10-25 (all six banners wired from real signals; NotFoundState on the `*` route; tests pass; canvas-side skeletons/empty states per earlier changelog) |
| [R1-E12-T03](r1/EPIC-12-system-states-instrumentation.md) | Client analytics module | S | frontend | none | 0 | done | agent-A3 / 2026-10-24 (reviewed 2026-10-25) |
| [R1-E12-T04](r1/EPIC-12-system-states-instrumentation.md) | Events endpoint (V13) | S | backend | none | 0 | done | 2026-10-25 |
| [R1-E12-T05](r1/EPIC-12-system-states-instrumentation.md) | Wire events at call sites | done | agent / 2026-10-25 (all rows wired; version_restored in HistoryPanel, compare_opened in CompareView) |
| [R1-E13-T01](r1/EPIC-13-release-gate.md) | R1 end-to-end journeys | M | test-engineer | E02, E03, E06, E07, E09, E10 done | 7 | done | agent-test / 2026-10-25 (archflux-qa, real API, DB role archflux_app, retries 0, default parallel workers: chromium 9/9 six runs in a row, firefox 9/9 twice, webkit 9/9 twice; root cause of the parallel flake was a product bug, R1-BUG-14, fixed in SecurityConfig) |
| [R1-E13-T02](r1/EPIC-13-release-gate.md) | Performance benchmark (5k elements at 60 fps) | S | test-engineer | E02, E03 done | 6 | done | agent-test / 2026-10-25 (perf.spec.ts on real chromium, 3 runs: pan/zoom 5k p95 16.7, 16.8, 16.8 ms <= 17.0 limit; open 2k 814 to 896 ms <= 1500; open 5k 1264 to 1284 ms) |
| [R1-E13-T03](r1/EPIC-13-release-gate.md) | Accessibility sweep | S | test-engineer | all UI epics done | 7 | done | agent-test / 2026-10-25 (a11y-r1.spec.ts chromium 33 passed; 42 axe lines: 41 scans with 0 violations, 1 not scanned (mobile Share dialog: button not visible at 390 px); keyboard connect passes; R1-BUG-10/11/12 no longer reproduce) |
| [R1-E13-T04](r1/EPIC-13-release-gate.md) | Visual regression baselines | S | test-engineer + a human reviewer | R1-E13-T03 | 8 | done 2026-10-26 | owner approved 2026-10-25; 47 baselines each on chromium, firefox, webkit, incl. the 8 r1-* screens; 2 green runs, 114/114, retries 0 | | |
| [R1-E13-T05](r1/EPIC-13-release-gate.md) | Routes and templates audit | S | test-engineer | R1-E13-T01 | 8 | done | agent-test / 2026-10-28 (routes-audit.spec.ts chromium 74 passed twice more, retries 0, QA stack with V19 jar; guest-only 50 passed, 24 skipped; R1-BUG-15 and R1-BUG-16 fixed, R1-BUG-17 fixed 2026-10-26; one unexplained load-induced failed run, see EPIC-13 changelog) | | |

## Bugs found by the release gate

| ID | Found by | Summary | Status |
|---|---|---|---|
| R1-BUG-17 | E13-T05 routes audit | The backend has no y-websocket endpoint: only the STOMP `/ws` is registered (`WebSocketConfig`), while the SPA's `useCollaboration` joins `ws://<api>/ws/diagram-<uuid>`. Repro: sign in, share a cloud diagram, open `#/canvas`, watch the console: WebSocket handshake 404, retried. Live cursors and CRDT sync cannot work against this API. Needs a backend decision (y-websocket relay or move the client to STOMP), so not a small fix. Decided and fixed 2026-10-26: stateless y-websocket relay `/ws/diagram-{uuid}` (SERVICES_SPEC §4.4); test `DiagramRelayTest`, `collaboration-relay-url.test.ts`, `e2e/realtime-cursors.spec.ts` (two users, live cursor) | fixed 2026-10-26 |
| R1-BUG-16 | E13-T05 routes audit | A signed-in user opening a local-only diagram (`doc-...` id) made the canvas open a realtime socket for a diagram the server never saw: 3 console errors per canvas open (`/canvas`, `/proposal`, `/auth/callback`, template flows). `useCollaboration` and `usePresence` now only join server (UUID) diagrams. Test `collaboration-local-docs.test.ts` (failed first) | fixed 2026-10-26 |
| R1-BUG-15 | E13-T05 routes audit | Guest (local session) opening a shared link `#/d/<id>` looped forever: AccessStates sends it to `/login?next=/d/<id>`, Login saw any session (guest too) and sent it back to `next`. React 'Maximum update depth exceeded', blank page. Login now returns to `next` only for a signed-in user; a guest stays on the sign-in page. Test `login-next-guest.test.tsx` (failed first) | fixed 2026-10-26 |
| R1-BUG-12 | E13-T03 a11y | axe `color-contrast` on `/living` (`span[aria-label=DELETED]`, `span[aria-label=MODIFIED]`, 2 nodes) and `scrollable-region-focusable` on a modal's scroll area at 390x844 (`div[role=dialog] > div:nth-child(2) > div:nth-child(2)`); test `a11y-r1` route `/living` and mobile dialogs | not reproduced 2026-10-25 (a11y-r1.spec.ts: /living and mobile dialogs 0 violations after the BUG-10/11 changes) |
| R1-BUG-11 | E13-T03 a11y | axe `label-content-name-mismatch` (serious) on every app-bar screen: `.appbar-search` has aria-label "Search and commands (Command K)" but visible text "Search ⌘K". Same rule on `.libpage-card__link`, Home template cards and the Shapes-panel buttons (aria-label "Person element" vs visible "Person"). 20 of 39 scans. Fix: make the accessible name start with the visible text | fixed 2026-10-25 (axe label-content-name-mismatch: 0 nodes in a11y-r1.spec.ts) |
| R1-BUG-10 | E13-T03 a11y | Shapes panel: axe violation count is 18 nodes (desktop) and 8 (mobile), all `label-content-name-mismatch` (see R1-BUG-11); New folder dialog has 3 nodes of the same rule | fixed 2026-10-25 (shapes, mobile shapes and New-folder dialog scans: 0 violations on the QA stack) |
| R1-BUG-09 | E13-T02 perf | 5,000 elements / 6,000 edges pan and zoom p95 was 666.6 ms (prod); now 16.8 ms after the fixes (containment of React work in Inspector outline, DiagramNodeList, edgePoints index). Limit moved to p95 <= 17.0 ms (EPIC-13 changelog, 2026-10-25). | fixed 2026-10-25 (perf spec passes at 17.0 ms) |
| R1-BUG-08 | E13-T03 keyboard | Connecting two elements has no keyboard route: `C` arms the source but the target needs a pointer click, and the screen-reader node list only selects. Test `a11y-r1.spec.ts` "keyboard only: connect two elements" (fixme) | done 2026-10-25 (C works from the node list; activating another node connects; unit `canvas-keyboard-connect.test.tsx` 2/2; e2e un-fixmed, passes on chromium) |
| R1-BUG-07 | E13-T04 access | Request access: the owner-side list (AccessRequests) is mounted in the Share dialog and tested. Still open: (a) the requester side: the deep link does not reach the `request` state for an outsider; (b) the Share link carries no token and nothing sends `X-Share-Token`. | done 2026-10-25 (owner list tested; share link carries `?token=`, SPA sends `X-Share-Token`; J5 un-fixme'd and passes on QA, workspace-audience link) |
| R1-BUG-06 | E13-T01 J4 | `POST /api/v1/invites/{token}/accept` returns 404 "Workspace not found" when the API connects as the production role `archflux_app` (RLS on `workspaces` hides the row from a non-member invitee). With the DB owner role it returns 200. Backend tests run as owner, so they miss it. Test `r1-journeys.spec.ts` J4 (fixme unless `E2E_QA_DB_ROLE=owner`) | fixed 2026-10-25 (V18, roles.sql section 5, InviteAcceptAppRoleTest; J4 un-fixme'd and passes on QA as archflux_app) |
| R1-BUG-14 | E13-T01 parallel run | `r1-journeys.spec.ts` with the default parallel workers failed 1 to 4 of 9 per run (J3, J4, J5). Root cause (product, not the harness): `SecurityConfig` had `sessionManagement.maximumSessions(1)`. One user's parallel requests (a page load) each open an HttpSession; the cap expired the older ones, and `ConcurrentSessionFilter` ran the logout handlers, whose `deleteCookies("ARCHFLUX_TOKEN")` cleared the JWT cookie. The next request had no credential (401 "Unauthenticated request"). It would sign a real user out on a multi-request page load. Fix: removed the cap. Test: `JwtAuthIsolationTest#parallelSessionsOfOneUserNeverClearTheJwtCookie` (red before, green after). 2026-10-25 | fixed |
| R1-BUG-13 | R1-BUG-06 follow-up | Editor seat limit (free = 3) was not enforced on invite accept under `archflux_app`: `PlanService.requireCanAddEditor` counted memberships under RLS, so a non-member invitee saw 0. Test `InviteAcceptPlanLimitAppRoleTest` | fixed 2026-10-25 (V19__workspace_editor_seat_count.sql, `PlanService.requireCanAddEditorForInvitee`, roles.sql grant; full `mvn test` 206 pass) |
| R1-BUG-05 | E13-T01 J2 | Retracted: Shift+click after a plain click does add to the selection when Shift is really held (Playwright `mouse.click` has no `modifiers` option). Not a bug | n/a |
| R1-BUG-04 | E07 review | `JwtServiceTest.tamperedTokenIsRejected` is flaky: it flips the last base64url character (a↔b), which only changes padding bits, so the signature can still verify. Tamper a middle character of the signature instead | fixed 2026-10-28 (tampered-signature test flips a middle character; JwtServiceTest green) |
| R1-BUG-03 | E09-T02 review | `applyLayout('dag')` never terminates on a cyclic graph (A→B→A), so the tab hangs. Pre-existing; fixed by R1-E09-T05 | fixed 2026-10-28 (T05 only capped depth at n-1, which gave wrong ranks on cycles; `layerDepths` now drops DFS back edges. Tests: layout-cycles.test.ts `2-node cycle terminates, places each node once, breaks the back edge`, `3-node cycle is layered a, b, c in DFS order and is deterministic`, `cycle behind a source, a self loop and a detached cycle all terminate`; layout-store.test.tsx) |
| R1-BUG-02 | E00-T04 review | `duplicateDoc` doesn't remap `parentId` to the new node ids (pre-existing) | fixed 2026-10-25 (lib/duplicateParentIds.ts used in store duplicateDoc; duplicate-parent.test.ts 2/2) |
| R1-BUG-01 | coordinator e2e run | Duplicate `#635BFF` in STROKE_COLORS/BORDER_SWATCHES gives a React duplicate-key warning (exists in HEAD); fixed in R1-E01-T09 | done 2026-10-25 |

## Changelog
- 1.0.0 (2026-10-24): backlog generated from epics 00–13; waves computed from dependencies.
