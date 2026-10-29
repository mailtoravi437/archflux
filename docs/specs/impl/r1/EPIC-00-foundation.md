# EPIC-00 · Foundation: contract, normaliser, hotspot splits

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 0 (blocks almost everything) | **Sources:** DATA_MODEL_R1 §1–§4.1

**Why:** `store.tsx` (2.5k lines) and `CanvasScreen.tsx` (2.7k lines) are edited by nearly every R1
task. Splitting them first, and landing the shared types and normaliser, lets later tasks run in
parallel without merge conflicts. Small-context models can then work on files under 600 lines.

**Rule for this epic:** T03, T07 and T08 are **pure refactors**. They make no behaviour change,
every existing test passes unchanged, and no snapshot is updated.

---

### R1-E00-T01 · Add R1 types and the `normalizeDoc` normaliser

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | DATA_MODEL_R1 §2.1–§2.6 |
| **Design** | none |

**Goal:** every document, old or new, loads into one well-defined shape.

**Read (only these):**
- `frontend/src/types.ts`
- `frontend/src/state/store.tsx` L440–L500 (`isValidNode`, `isValidEdge`, `firstRunDoc`, `blankDoc`)
- `docs/specs/impl/DATA_MODEL_R1.md` §2

**Change / create:**
- `frontend/src/types.ts`: add the following exactly as written in DATA_MODEL_R1 §2:
  - `ElementKind`, `DisplayStyle`, `ElementSize`, `BoundaryKind`, `IconRef`, `PropertyValue`,
    `RelationshipKind`, `Page`, `Layer`;
  - the optional fields on `ArchNode`, `ArchEdge`, `FreeStroke`, `FreeText` and `DiagramDoc`.
- `frontend/src/lib/docModel.ts` (new): the `normalizeDoc`, `normalizeNode`, `normalizeEdge`,
  `defaultPage`, `defaultLayer`, `newId` and `DOC_SCHEMA_VERSION` functions from DATA_MODEL_R1 §2.5.
- `frontend/src/tests/doc-model.test.ts` (new).

**Contract:** DATA_MODEL_R1 §2.5, verbatim.

**Steps:**
1. Add the types. Every new field is optional.
2. Implement `newId(prefix)` as `` `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` ``.
3. `normalizeNode`:
   - set `kind` / `displayStyle` from the legacy table (§2.1) when `kind` is missing;
   - move `tag` into `technology` only when `technology` is missing, and keep `tag` as it is;
   - default `pageId` to the first page's id and `layerId` to `'ly-default'`;
   - clamp `size` to S/M/L.
4. `normalizeEdge`:
   - derive `relKind` from `dashed` / `lineStyle` / `arrow` (§2.3) when it is missing;
   - clamp `labelPos` to 0..1;
   - drop invalid waypoints (non-finite numbers).
5. `normalizeDoc`:
   - reject non-objects with `null`;
   - default `pages`, `layers`, `strokes` and `texts`;
   - normalise every node and edge;
   - break `parentId` cycles and drop `parentId` values that point to a missing node or a node on
     another page;
   - set `schemaVersion: 2`.
6. Keep everything pure. Do not import React or the store.

**Tests (must exist and pass):** `src/tests/doc-model.test.ts`
- `it('fills default page and layer for a v1 doc')`
- `it('maps legacy db/cylinder to kind database, style shape')`
- `it('maps legacy logo shape to display style icon')`
- `it('maps dashed edge to relKind async and dotted to replication')`
- `it('copies tag to technology only when technology is missing')`
- `it('breaks a parentId cycle')`
- `it('drops parentId pointing to a node on another page')`
- `it('is idempotent')`, using `sampleDiagram` from `tests/fixtures/sampleDiagram.ts` and a
  hand-written v1 doc
- `it('returns null for non-object input')`

**Acceptance:**
- [ ] `npx tsc -b && npm run lint && npx vitest run src/tests/doc-model.test.ts`
- [ ] `npm test` is fully green; no other file changed.

**Out of scope:** calling `normalizeDoc` from the store (T02) and rendering anything new.

**Pitfalls:**
- `ArchNode.tag` is still used by the renderer today. Don't remove or empty it.
- Keep `shape` as well: the current renderer reads it until R1-E02.

**Open questions:** none

---

### R1-E00-T02 · Run `normalizeDoc` on every load path

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |
| **Sources** | DATA_MODEL_R1 §1.2 |

**Goal:** no code path can put an un-normalised doc into state.

**Read (only these):**
- `frontend/src/state/store.tsx` L223–L260 (`serverDiagramToDoc`) and L346–L440 (`loadPersisted`)
- `frontend/src/lib/archFormat.ts` L79–L190 (`validateArchImport`)
- `frontend/src/data/blueprints.ts` L100–end (`blueprintGraph`)

**Change:**
- `store.tsx`:
  - `loadPersisted` maps `docs` through `normalizeDoc` and filters out nulls;
  - `serverDiagramToDoc` returns `normalizeDoc(...)`, so the server's top-level `pages` / `layers` /
    `defaults` are read (they come from E00-T06);
  - `loadGraph` and `mergeGraph` normalise incoming nodes and edges with `normalizeNode` /
    `normalizeEdge`.
- `archFormat.ts`: the success result's nodes and edges are normalised.
- `blueprints.ts`: `blueprintGraph` returns normalised nodes and edges.

**Tests:**
- `src/tests/doc-model-wiring.test.tsx`:
  - `it('a v1 localStorage doc loads with pages and layers')`: seed `archflux:v2-light` with a v1
    doc, render `DiagramProvider`, read with `useDiagramDocs`.
  - `it('serverDiagramToDoc keeps pages from the server graph')`
  - `it('.arch v1 import yields normalised nodes')`

**Acceptance:**
- [ ] `npm test` is fully green, including `persist.test.tsx`, `cloud-save.test.tsx` and
  `archFormat.test.ts` unchanged.
- [ ] tsc and lint are clean.

**Pitfalls:** `isValidNode` runs before normalising, so keep it. Normalise after the existing
validation, not instead of it.

---

### R1-E00-T03 · Split `CanvasScreen.tsx` (pure refactor)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | CODEBASE_MAP §2.5 |

**Goal:** the editor's parts live in files under 700 lines each, with identical behaviour.

**Read:** `frontend/src/screens/CanvasScreen.tsx`, in chunks:
- L1–200 (imports and helpers)
- L1400–1570 (keyboard)
- L1940–2320 (right dock: Inspector)
- L2320–2420 (Linter)

**Create** `frontend/src/screens/canvas/`:
- `Inspector.tsx`: the right-dock Inspector tab body. Props:
  `{ checkpointInspector: (key: string) => void }`. It reads store selection and actions through the
  hooks, and screen-local state (text, stroke and route selection) through `CanvasLocalContext.ts`.
- `LinterPanel.tsx`: the Linter tab body (the lint cards).
- `useCanvasKeyboard.ts`: the global keydown/keyup effect, as
  `useCanvasKeyboard(deps: CanvasKeyboardDeps): void`. Pass explicitly every ref and callback the
  effect uses today.
- `Swatches.tsx`: move `Swatches` here. The swatch constants go in `palette.ts`, because exporting arrays from a `.tsx` file trips lint's only-export-components rule.
- `recentShapes.ts`: move `pushRecentShape`, `loadRecentShapes` and `recordShapeUse`. Re-export them
  from `CanvasScreen.tsx` because tests import them from there.

**Change:** `CanvasScreen.tsx` imports and renders these parts. It keeps the canvas element, the
pointer handlers and the layout.

**Tests:** no new behaviour tests. Every existing test passes **without edits**.

**Acceptance:**
- [ ] `npm test` passes, with `canvas.test.tsx`, `canvas.accessibility.test.tsx`, `qa-fixes.test.tsx`
  and `ux-release.test.ts` unchanged.
- [ ] `npx playwright test e2e/critical-journeys.spec.ts` passes.
- [ ] `CanvasScreen.tsx` is ≤ 1,500 lines, and each new file is ≤ 700.

**Pitfalls:**
- The keyboard effect closes over `stateRef`. Pass the ref itself, not `.current`.
- Keep the effect's dependency array identical.
- Don't rename `aria-label`s, because tests query them.

---

### R1-E00-T04 · Pages and layers in store state and the undo stack

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01, R1-E00-T02 |
| **Sources** | DATA_MODEL_R1 §2.4; CONVENTIONS §1.2 |

**Goal:** pages and layers are first-class document state. They are persisted, saved to the server
and undoable. No UI comes with this task.

**Read:**
- `store.tsx` L800–L960 (snapshot, undo, redo), the persist effect around L670–L720, and the context
  interfaces L42–L170
- `state/useDiagram.ts`

**Change:**
- `GraphSnap` becomes `{nodes, edges, strokes, texts, pages, layers}`.
- Add `pagesState` and `layersState`, loaded from the active doc. They are written in the doc on
  persist and included in the `saveActiveDoc` PUT/POST graph.
- UI context: add `activePageId: string` and `setActivePageId(id)`. The default is the first page.
- Core context: expose `pages: Page[]`, `layers: Layer[]` and
  `docDefaults: NonNullable<DiagramDoc['defaults']>`. `docDefaults` is persisted and saved like
  pages, but it is **not** in the undo stack.
- Actions context, exactly:

```ts
addPage: (name?: string) => string;            // returns id, activates it
renamePage: (id: string, name: string) => void;
deletePage: (id: string) => void;              // refuses the last page (toast "A diagram needs at least one page"); clears linkPageId pointing to it
reorderPages: (orderedIds: string[]) => void;
duplicatePage: (id: string) => string;         // deep-copies elements with new ids, remaps edges/parentId; '' for unknown id; named "<name> copy", inserted after source
addLayer: (name?: string) => string;
updateLayer: (id: string, patch: Partial<Omit<Layer, 'id'>>) => void;
deleteLayer: (id: string) => void;             // moves its elements to 'ly-default'; refuses 'ly-default' (toast "The default layer cannot be deleted")
moveToLayer: (ids: string[], layerId: string) => void;
setDocDefaults: (patch: Partial<NonNullable<DiagramDoc['defaults']>>) => void;
```

- `addNode` and `placeShape` set `pageId: activePageId`. Text and stroke creation do the same.
- Every action above is one undo step.
- Also, found in the T02/T05 review:
  - `mergeGraph` renames colliding node ids, but it must also rewrite `parentId` references to the
    renamed ids. It drops any `linkPageId` that points to a page the doc doesn't have, and inserted
    nodes land on the **active** page.
  - `importArch` must put the imported `pages` / `layers` / `defaults` into doc state. Today only
    the nodes keep their `pageId`.
- Extra tests:
  - `it('mergeGraph remaps parentId of renamed nodes')`
  - `it('importArch v2 restores pages and layers')`

**Tests:** `src/tests/pages-layers-store.test.tsx`
- `it('new doc has one page and default layer')`
- `it('addPage activates the new page and new nodes land on it')`
- `it('deletePage removes its elements and edges; last page cannot be deleted')`
- `it('duplicatePage copies elements with fresh ids and remaps edges')`
- `it('undo restores a deleted page with its elements')`
- `it('deleteLayer moves elements to default layer')`
- `it('pages survive persist → reload')`

**Acceptance:** the tests above pass; `npm test` is green; tsc and lint are clean.

**Out of scope:** the pages bar UI (E03-T04), the layers panel (E03-T05) and render filtering
(E03-T04).

**Pitfalls:**
- The undo stack is capped at 30 entries. Keep the cap.
- `rekeyDoc` must carry pages and layers across the local → server id change.

---

### R1-E00-T05 · `.arch` format v2

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |
| **Sources** | DATA_MODEL_R1 §3 |

**Read:** `frontend/src/lib/archFormat.ts` (whole) and `src/tests/archFormat.test.ts`.

**Change:**
- Set `SUPPORTED_ARCH_VERSION = 2`.
- Add `pages`, `layers` and `defaults` to `ArchExportInput`, `buildArchExport` and the known-keys
  list.
- Add `pages ≤ 50` and `layers ≤ 20` to `ARCH_LIMITS` and enforce them with the same error style.
- Import v1 and v2, normalising both.

**Tests:** extend `archFormat.test.ts` with these cases:
- `it('exports version 2 with pages and layers')`
- `it('imports a v1 file')`
- `it('round-trips pages, layers, parentId, relKind')`
- `it('rejects 51 pages')`
- Existing tests that assert `version: 1` on export are updated to `2`. That is the only edit
  allowed to existing tests.

**Acceptance:** `npx vitest run src/tests/archFormat.test.ts`, then the full `npm test`.

---

### R1-E00-T06 · Backend keeps pages, layers and defaults in the graph

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | none |
| **Sources** | DATA_MODEL_R1 §4.1 |

**Goal:** saving a doc with pages to the server and loading it back loses nothing.

**Read:**
- `backend/src/main/java/com/archflux/util/JsonCanonicals.java` L60–L95
- `backend/src/main/java/com/archflux/service/DiagramService.java` L95–L230 and L296–L320
- `backend/src/test/java/com/archflux/DiagramControllerTest.java` (pattern)

**Change:**
- `JsonCanonicals.canonicalGraph` keeps the arrays `pages` and `layers` (from `graph` only, since
  there are no flat params), the object `defaults` and the integer `schemaVersion`. All other keys
  are still dropped.
- `requireValidGraphTypes` returns 422 when `pages` or `layers` is not an array, or `defaults` is
  not an object.
- `DiagramService.toJson` also emits top-level `pages`, `layers`, `defaults` and `schemaVersion`,
  each defaulting to an empty list, empty map or null.
- The checkpoint snapshot and revision snapshot paths go through the same canonicaliser. Verify this
  with grep for `canonicalGraph`.

**Tests:** `backend/src/test/java/com/archflux/GraphAllowListTest.java` (new, extends `PostgresIT`)
- `pagesLayersDefaultsRoundTrip()`: POST, then GET, and the values are equal.
- `unknownGraphKeyIsDropped()`: a `{"graph":{"nodes":[],"evil":{...}}}` save comes back without
  `evil`.
- `pagesNotArrayIs422()`
- `revisionSnapshotKeepsPages()`

**Acceptance:** `mvn -q -Dtest=GraphAllowListTest test`, then the full `mvn -q test`.

**Pitfalls:**
- `JsonCanonicals.toCanonicalJson` sorts keys. Equality tests must compare parsed JSON, not strings.
- `diagrams.graph` content hashes may change for new docs only. Old rows are untouched until they
  are next saved.

---

### R1-E00-T07 · Split `render.ts` (pure refactor)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | CODEBASE_MAP §2.4 |

**Read:** `frontend/src/canvas/render.ts` (480 lines).

**Create:**
- `canvas/render/edges.ts`: `drawEdgePass` and its types.
- `canvas/render/nodes.ts`: `drawNodePass`, `drawNodeMeta`, `drawNodeDetailsBlock`,
  `drawIconImage`, `drawCylinderBody` and `ellipsize`.
- `canvas/render/annotations.ts`: `drawInkPass`, `drawFreeTextPass` and `drawThreadPinPass`.
- `canvas/render/types.ts`: `NodeIconSource`, `CanvasPaletteFlags` and the flag interfaces.

**Change:** `canvas/render.ts` becomes a barrel that re-exports everything, so no import path in the
app or tests changes.

**Acceptance:** `npm test` passes unchanged, and every file is ≤ 300 lines.

---

### R1-E00-T08 · Store feature-module seam

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T04 |
| **Sources** | CONVENTIONS §1.2 |

**Goal:** new features add pure reducers in `state/ops/*.ts` instead of growing `store.tsx`.

**Change:**
- Create `state/ops/types.ts`:

```ts
import type { ArchNode, ArchEdge, FreeStroke, FreeText, Page, Layer } from '../../types';
export interface DocState { nodes: ArchNode[]; edges: ArchEdge[]; strokes: FreeStroke[]; texts: FreeText[]; pages: Page[]; layers: Layer[]; }
export type DocOp<A extends unknown[] = []> = (s: DocState, ...args: A) => DocState;
```

- In `store.tsx`, add one internal helper
  `applyOp(label: string, op: (s: DocState) => DocState): void`. It:
  1. snapshots, so the op is one undo step. If the op changes no slice, it records no undo step;
  2. applies the op;
  3. sets every changed slice, compared by reference;
  4. calls `setDirty(true)` and `schedulePersist()`;
  5. pushes a log line with `label`.
- Move the page and layer actions from T04 onto `applyOp`, using pure ops in `state/ops/pages.ts`
  and `state/ops/layers.ts`.

**Tests:** `src/tests/ops-pages.test.ts` (pure reducer tests: no React, no store); T04's tests still
pass.

**Acceptance:** `npm test` is green.

**Note to later tasks:** align/distribute (E04), display style (E02-T05), containment (E03-T02) and
z-order (E04-T02) **must** be written as `DocOp`s in `state/ops/` and wired through `applyOp`.

---

## Changelog
- 2026-10-25 R1-BUG-02 fixed: `duplicateDoc` remaps each child's `parentId` to the copied parent, or drops it when the parent was not copied (`lib/duplicateParentIds.ts`, `duplicate-parent.test.ts` 2/2). Status: fixed.
- 2026-10-25 R1-E00-T06 done: canonicalGraph keeps pages/layers/defaults/schemaVersion (stored only when present); toJson emits them; 422 on wrong types; GraphAllowListTest 7. Reviewed by coordinator.
- 2026-10-25 R1-E00-T04 done: pages/layers/docDefaults/activePageId in the store, undo snapshot extended, persist/save/rekey/import/reload carry them; 9 tests. Reviewed by coordinator.
- 2026-10-25 R1-E00-T08 done: state/ops/pages.ts and layers.ts plus applyOp (no empty undo steps); 9 pure tests. Reviewed by coordinator.
- 2026-10-25 R1-E00-T03 done: CanvasScreen.tsx went from 2672 to 1470 lines across 17 files in screens/canvas/. Beyond the original list it extracted ShapeLibraryDrawer, Minimap, SelectionToolbars, CommentComposer, TextDraftEditor, CanvasOverlays, useVendorIcons, useRemoteCursors, useCollabGraphSync, CanvasLocalContext and types. Tests unchanged (226 pass); e2e critical-journeys 17/17 on chromium (coordinator run). Reviewed by coordinator.
- 2026-10-25 R1-E00-T01 done: R1 types (additive), lib/docModel.ts, 9 tests. Reviewed by coordinator.
- 2026-10-25 R1-E00-T02 done: normalizeDoc on loadPersisted, serverDiagramToDoc, loadGraph/mergeGraph, .arch import and blueprints; 3 wiring tests. Reviewed by coordinator.
- 2026-10-25 R1-E00-T05 done: .arch v2 with pages/layers/defaults, limits 50/20, field allow-list; store exportArch writes v2; 4 tests. Reviewed by coordinator.
- 2026-10-25 R1-E00-T07 done: render.ts became a barrel over render/{types,edges,nodes,annotations}.ts (≤ 268 lines each), with identical exports and tests unchanged; files: canvas/render.ts, canvas/render/*. Reviewed by coordinator.
- 1.0.0 (2026-10-24): epic created.
