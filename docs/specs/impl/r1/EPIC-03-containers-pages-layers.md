# EPIC-03 · Containers, frames, swimlanes, pages, layers

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2 | **Sources:** CAP-C2, CAP-C3, CAP-C4, CAP-C5; SC-15;
> UI_REVAMP_SPEC §5A.3; DATA_MODEL_R1 §2.2 (boundary rules), §2.4
> **Design:** "Components" › Boundaries, Example; "3 Edit & model" › CanvasPro (pages bar, layers)

---

### R1-E03-T01 · Boundary rendering

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T01, R1-E00-T07 |
| **Sources** | UI_REVAMP_SPEC §5A.3 |

**Change:**
- Create `canvas/render/boundaries.ts`, exporting
  `drawBoundaryPass(ctx, node, opts: { isDark: boolean; selected: boolean; childCount: number })`.
  - Draw a rect with the stroke, dash, width, fill and radius from `BOUNDARY_NOTATION[boundaryKind]`.
  - The label is drawn inside the top left (x+10, y+18), 12 px / 600, as
    `"<notation.label> · <node.label>"`. For example "VPC · 10.0.0.0/16".
  - For `cloud` boundaries with an `iconRef`, draw the provider logo at 20 px before the label.
  - A **swimlane** draws its label rotated -90° in a 28 px left header band.
  - **Collapsed**: draw a 28 px-high chip `"<label> · <childCount>"` at (x, y) and no body.
- **Draw order:** boundaries are drawn before regular nodes, and deeper boundaries after shallower
  ones (sort by depth, then `z`).

**Tests:** `src/tests/render-boundaries.test.ts`
- `it('VPC uses solid #8C4FFF 1.5px')`
- `it('region is dashed #00A4A6')`
- `it('label is inside top-left')`
- `it('collapsed draws chip with child count and no body')`
- `it('boundaries are painted before child nodes')`

---

### R1-E03-T02 · Containment: drop in, move together, auto-fit

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E03-T01, R1-E00-T08 |
| **Sources** | CAP-C2; DATA_MODEL_R1 §2.2 rules |

**Contract:**

```ts
// lib/containment.ts (pure)
export function descendantsOf(nodes: ArchNode[], id: string): string[];
export function depthOf(nodes: ArchNode[], id: string): number;
export function containerAt(nodes: ArchNode[], x: number, y: number, excludeIds: Set<string>, pageId: string): ArchNode | null; // deepest boundary containing point
export function fitBoundary(nodes: ArchNode[], id: string, padding?: number): { x: number; y: number; w: number; h: number }; // padding 24, label band 28
// state/ops/containment.ts
export const reparent: DocOp<[ids: string[], parentId: string | null]>;   // rejects cycles and depth > 6
export const moveWithChildren: DocOp<[id: string, dx: number, dy: number]>;
```

**Behaviour:**
- **Drop to reparent:** when a drag of node(s) ends, `containerAt(drop point)` decides the new
  `parentId`. Dropping outside every boundary sets `parentId = null`.
- **Highlight:** while dragging over a boundary, it highlights with a 2 px accent dashed outline.
- **Moving a boundary** moves all of its descendants. The drag frames stay history-silent and one
  undo step is recorded on grab (CONVENTIONS §1.2).
- **Auto-fit:** after a child moves or resizes and its new bounds overflow the parent, the parent
  grows to `fitBoundary`. It never shrinks automatically. Shrinking is the explicit "Fit to
  contents" action in the context toolbar.
- **Hit testing:** test nodes first, deepest first, then boundaries by their **border band and label
  only** (8 px), so clicks inside an empty area of a boundary select the boundary. A marquee inside
  a boundary selects children, not the boundary.
- **Delete:** deleting a boundary asks "Delete boundary only / Delete with contents". "Boundary only"
  re-parents the children to the boundary's parent.

**Tests:**
- `src/tests/containment.test.ts`: the pure functions, cycle rejection and the depth limit.
- `src/tests/containment-canvas.test.tsx`:
  - `it('dropping a node inside a VPC sets parentId')`
  - `it('moving the VPC moves its children; one undo restores all')`
  - `it('child overflow grows the parent')`
  - `it('delete boundary only re-parents children')`

**Pitfalls:**
- Edges between children don't change.
- Edges to a collapsed boundary's children are drawn to the chip (E03-T03).

---

### R1-E03-T03 · Collapse and expand boundaries

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E03-T02 |

**Change:**
- Add a `toggleCollapse(id)` action (one undo step), available in the context toolbar and with the
  `Alt+C` shortcut.
- While a boundary is collapsed:
  - its descendants are not drawn and not hit-testable;
  - edges to them are drawn to the chip edge, deduplicated per external endpoint with a count
    badge "×3".

**Tests:** `src/tests/collapse.test.tsx`
- `it('collapsed hides descendants from render and hit test')`
- `it('edges reroute to chip with count')`

---

### R1-E03-T04 · Pages bar and per-page rendering

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T04 |
| **Sources** | CAP-C4; SC-15 |
| **Design** | 3 Edit & model › CanvasPro (bottom pages bar) |

**Change:**
- Create `screens/canvas/PagesBar.tsx`, docked at the bottom centre, styled as the CanvasPro "Pages bar" (tabs read "2 · Containers"; the Layers toggle sits at its right end):
  - one tab per page (`role="tablist"`) plus a "+" button that calls `addPage`;
  - a double-click on a tab renames it inline;
  - the tab context menu offers Rename, Duplicate, Delete, Move left and Move right;
  - `Ctrl+PageUp` / `Ctrl+PageDown` switch pages.
- Rendering, hit testing, the minimap, export ("current page" scope) and lint all filter by
  `pageId === activePageId`.
- **Page links (CAP-C4):** add a node property `linkPageId`. A small "↗" badge on the node switches
  pages when clicked. (field defined in DATA_MODEL_R1 §2.2).

**Tests:** `src/tests/pages-bar.test.tsx`
- `it('adds, renames, switches pages via tabs')`
- `it('canvas only renders nodes of the active page')`
- `it('Ctrl+PageDown goes to next page')`
- `it('page link badge switches page')`
- `it('51st page is refused with toast "A diagram can have up to 50 pages"')`: the limit matches ARCH_LIMITS. Enforce it in `ops/pages.ts addPage`.

---

### R1-E03-T05 · Layers panel

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T04 |
| **Sources** | CAP-C5; SC-15 |

**Change:**
- Create `screens/canvas/LayersPanel.tsx`: the "Layers" popover of CanvasPro.dc.html (260 px, bottom right), opened by the "Layers · N" button in the pages bar (the artboard wins over the earlier "left-dock tab" wording).
  - It lists layers, ordered top to bottom.
  - Each row has a visibility toggle (`aria-pressed`, label "Hide <name>"), a lock toggle, a
    double-click rename and drag reorder (with keyboard alternatives: Move up / Move down buttons).
  - "Move selection here" calls `moveToLayer`.
- **Hidden layers** are not drawn, not hit-tested and not exported, unless export opts in.
- **Locked layers** are drawn but not selectable or movable. Their elements get the lock status.
- **Draw order:** by layer `order`, then `z`.

**Tests:** `src/tests/layers-panel.test.tsx`
- `it('hiding a layer removes its elements from render and hit test')`
- `it('locked layer elements cannot be selected')`
- `it('move selection to layer')`
- `it('reorder changes draw order')`
- `it('21st layer is refused with toast "A diagram can have up to 20 layers"')`: enforce it in `ops/layers.ts addLayer`.

---

### R1-E03-T06 · Frames and swimlanes

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E03-T02 |
| **Sources** | CAP-C3 |

**Change:**
- Add the Frame (`Shift+F`) and Swimlane (`Shift+W`) tools, also in the palette (the tool rail is fixed by Main.dc.html, and `F` stays fit-to-view). Each is created by dragging out a rect, as a
  boundary with `boundaryKind` set to `frame` or `swimlane`.
- **Swimlanes:** a lane that touches a lane on the same page shares its edge. "Add lane below" in the
  context toolbar creates a lane of equal width directly below.
- **Frames** appear in an "Outline" list (SC-16) that is ready for Present mode in R2. They don't
  block children from being hit-tested.

**Tests:** `src/tests/frames-swimlanes.test.tsx`
- `it('F + drag creates a frame boundary')`
- `it('add lane below aligns width and y')`

---

## Changelog
- 2026-10-25 R1-E03-T02/T03/T06 done (wiring): `CanvasScreen` drag uses `moveWithChildren` (history-silent, ancestors do not grow mid-drag), drop calls `setParent` + `growBoundaries`, a dashed accent outline marks the target boundary, resize grows ancestors, boundaries hit only on border band and label (their interior reaches the canvas; the 8 px edge-connect drag skips boundaries), delete asks "boundary only / with contents", collapse hides children from draw, hit test and node list with merged "×N" edges, Alt+C and toolbar Collapse/Expand/Fit to contents/Add lane below, `Shift+F` frame and `Shift+W` swimlane tools (palette commands too). The tool rail is unchanged because Main.dc.html fixes its items. New store actions: moveWithChildren, setParent, growBoundaries, toggleCollapse, fitToContents, deleteBoundary, createBoundary, addLaneBelow; deleting a boundary through the generic delete keeps its children. Tests: `containment-wiring.test.tsx`. Not built: the frames Outline list (SC-16, R2 Present).
- 2026-10-25 R1-E03-T05: `orderForPaint(nodes, layerOrder)` paints per layer, boundaries first within a layer; test in `render-boundaries.test.ts`.
- 2026-10-25 R1-E03-T04 done: pages bar, per-page canvas (`lib/pageView.ts` feeds the canvas, minimap and node list), page-link badge, 50-page limit (ops + toast); files: screens/canvas/PagesBar.tsx, screens/CanvasScreen.tsx, screens/canvas/{Minimap,CanvasOverlays}.tsx, state/ops/pages.ts, state/store.tsx, tests/pages-bar.test.tsx. Export "current page" scope is left to R1-E09-T04.
- 2026-10-25 R1-E03-T05 done: layers popover, hidden layers not drawn or hit-tested, locked layers drawn but not selectable, draw order by layer then `z`, 20-layer limit, `reorderLayers` op; files: screens/canvas/LayersPanel.tsx, state/ops/layers.ts, state/store.tsx, tests/layers-panel.test.tsx.
- 2026-10-25 R1-E03-T01 done: CanvasScreen paints via `orderForPaint`, passes `childCount` (collapsed) and `boundaryLogo` (cloud + iconRef); CanvasEngine passes order and childCount only (scene has no icon manifest).
- 1.0.0 (2026-10-24): epic created.
- 2026-10-25 R1-E03-T01 done (renderer; call-site wiring pending): `canvas/render/boundaries.ts` (`drawBoundaryPass`, `orderForPaint`), dispatched from `drawNodePass`; optional `childCount`/`boundaryLogo` flags; new test `render-boundaries.test.ts` (8). Label uses the spec's 12px/600 at (x+10, y+18) with the artboard's darker label tints. Call sites must iterate `orderForPaint(nodes)` and pass `childCount` for collapsed chips.
- 2026-10-25 R1-E03-T02 review (logic only): `lib/containment.ts` (descendantsOf, depthOf, ancestorsOf, containerAt, fitBoundary, hitsBoundaryChrome), `state/ops/containment.ts` (reparent, moveWithChildren, growAncestors, fitToContents, deleteBoundary); tests `containment.test.ts`, `containment-canvas.test.tsx` (reducer-level, 16) + `tests/fixtures/containment.ts`. Wiring pending in store.tsx (applyOp actions) and CanvasScreen (drop -> containerAt/reparent, highlight, hit band, delete prompt).
- 2026-10-25 R1-E03-T03 review (logic only): `lib/containmentCollapse.ts` (hiddenByCollapse, visibleNodes, chipFor, routeEdges with count), `state/ops/containmentCollapse.ts` (toggleCollapse); test `collapse.test.tsx` (3). Wiring pending: store action, Alt+C, CanvasScreen draw/hit via visibleNodes, edges via routeEdges with "xN" badge.
- 2026-10-25 R1-E03-T06 review (logic only): `state/ops/containmentLanes.ts` (createBoundary, addLaneBelow, frameOutline); test `frames-swimlanes.test.tsx` (5). Wiring pending: tool rail Frame (F) and Swimlane, context toolbar "Add lane below", Outline list.
