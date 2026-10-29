# EPIC-04 · Arrange, connectors, style tools, context menu

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2 | **Sources:** CAP-C6, CAP-C7, CAP-C8; FL-19; SC-13, SC-18
> **Design:** "3 Edit & model" › CanvasPro (context toolbar, context menu)

Every arrange operation is a pure `DocOp` in `state/ops/arrange.ts`, wired through `applyOp`
(E00-T08). Each user command is one undo step.

**Delivery split** (2026-10-25): T01 and T02 land in two steps.
1. The ops (`state/ops/arrange.ts`), the store actions and the tests go first.
2. **R1-E04-T08** then wires the context-toolbar buttons and shortcuts into `screens/canvas/*`,
   after the current owner of those files releases them.

---

### R1-E04-T01 · Align and distribute

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T08 |
| **Sources** | CAP-C6 |

**Contract:**

```ts
export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export const align: DocOp<[ids: string[], edge: AlignEdge]>;            // relative to selection bounds; ≥ 2 ids
export const distribute: DocOp<[ids: string[], axis: 'h' | 'v']>;       // equal gaps; ≥ 3 ids; order by position
```

**Behaviour:**
- Locked nodes and nodes on locked layers are excluded.
- Boundaries move with their children (use `moveWithChildren`).
- **UI:** a context toolbar "Arrange" group appears when ≥ 2 nodes are selected: six align buttons
  plus Distribute horizontally and Distribute vertically. Each has an `aria-label` such as
  "Align left".
- **Shortcuts:** `Alt+Shift+L/C/R/T/M/B` align; `Alt+Shift+H/V` distribute.

**Tests:** `src/tests/ops-arrange.test.ts`
- `it('align left sets all x to min x')`
- `it('align middle centres on selection bounds')`
- `it('distribute h gives equal gaps')`
- `it('locked nodes are not moved')`
- `it('a boundary moves with its children')`

---

### R1-E04-T02 · Match size, z-order, lock

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E04-T01 |

**Contract:**

```ts
export const matchSize: DocOp<[ids: string[], dim: 'w' | 'h' | 'both']>;   // to the first-selected (primary) node
export const zOrder: DocOp<[ids: string[], cmd: 'front' | 'back' | 'forward' | 'backward']>; // within page and layer
export const setLocked: DocOp<[ids: string[], locked: boolean]>;
```

**Behaviour:**
- **Shortcuts:**
  - `Ctrl+]` / `Ctrl+[` move forward / backward; `Ctrl+Shift+]` / `Ctrl+Shift+[` bring to front /
    send to back.
  - `Ctrl+Shift+L` toggles lock.
- **Locked nodes:** they cannot be moved, resized or deleted. They can still be selected for
  unlocking.

**Tests:** `src/tests/ops-zorder-lock.test.ts`
- `it('front sets z above max on page')`
- `it('locked node ignores drag and delete')`

---

### R1-E04-T03 · Connector waypoints

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T09 |
| **Sources** | CAP-C7 |

**Read:** `lib/canvasGeometry.ts` (`edgePoints`), `canvas/render/edges.ts`.

**Contract:**

```ts
// lib/canvasGeometry.ts
export function edgePath(edge: ArchEdge, from: Box, to: Box | null, opts: { orthogonal: boolean; curve: ConnectorCurve }): { x: number; y: number }[];
// uses waypoints when present: from-port → wp1 → … → to-port; orthogonal mode inserts elbows between consecutive points
export function hitEdgeSegment(path: {x:number;y:number}[], px: number, py: number, tol: number): { index: number; t: number } | null;
```

**Behaviour:**
- **Selected edge handles:** a selected edge shows handles at its waypoints and "+" midpoint handles
  between them.
- **Editing points:**
  - dragging "+" inserts a waypoint;
  - dragging a waypoint moves it, with snapping to the grid;
  - a double-click on a waypoint removes it;
  - "Reset route" in the context toolbar clears all waypoints.
- **Moving endpoints:** when a connected node moves, its waypoints stay, but the first and last
  segments re-route.

**Tests:**
- `src/tests/edge-path.test.ts`:
  - `it('path passes through waypoints in order')`
  - `it('orthogonal adds elbows between waypoints')`
  - `it('hitEdgeSegment finds segment index')`
- `src/tests/waypoints-canvas.test.tsx`:
  - `it('drag midpoint handle inserts waypoint; one undo removes it')`

---

### R1-E04-T04 · Line jumps and label positions

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E04-T03 |

**Change:**
- **Line jumps:** where two edge paths cross on the same page, the edge drawn later draws a 6 px
  semicircle hop. Compute crossings in `lib/edgeCrossings.ts` (`crossings(paths): {edgeId; x; y}[]`,
  O(n²) over segments, skipped above 400 edges for performance).
- **Label position:** dragging an edge label pill moves `labelPos` along the path, clamped to
  0.05–0.95.

**Tests:** `src/tests/edge-crossings.test.ts`
- `it('detects a crossing of two segments')`
- `it('ignores shared endpoints')`
- `src/tests/render-relationships.test.ts`: add `it('draws a hop at crossings')`.

---

### R1-E04-T05 · Ports (N/E/S/W) and drag-to-connect

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T07, R1-E02-T08 |
| **Sources** | UI_REVAMP_SPEC §5A.1 ("4 ports appear on hover") |

**Change:**
- **Ports:** on hover with the Select or Connect tool, draw 4 port dots of 8 px at the mid-edges of
  the node bounds (`nodeBounds`).
- **Connecting:**
  - dragging from a port draws a preview line;
  - releasing over a node connects to the nearest port of the target, setting `fromPort`/`toPort`;
  - releasing over empty canvas creates a dangling edge with `targetCoords`, as today.
- **Routing:** edges with ports start and end at those port points.

**Implementation notes (2026-10-25):**
- Geometry in `lib/canvasGeometry.ts`: `nodePorts`, `portPoint`, `nearestPort`, `hitPort`, and `fromPort`/`toPort` in `edgePath`
  (ported ends use `nodeBounds`). The dots are the DOM overlay `screens/canvas/PortHandles.tsx` (visual only,
  `pointer-events: none`); `CanvasScreen` does the hit testing. `connectNodes(from, to, targetCoords?, ports?)` stores the ports.
- A port drag released on empty canvas creates a dangling edge once it is 12 px long. The older "drag from within 8 px of the
  node edge" gesture (R1-E01-T07) is kept for node edges away from a port.

**Tests:** `src/tests/ports.test.tsx`
- `it('hover shows 4 ports')`
- `it('drag from E port to node connects with fromPort e')`
- `it('nearest target port chosen')`

---

### R1-E04-T06 · Format painter and multi-select styling

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T06 |
| **Sources** | CAP-C8 |

**Contract:**

```ts
export const STYLE_KEYS = ['stroke', 'fill', 'strokeWidth', 'displayStyle', 'size'] as const;
export const copyStyle: (n: ArchNode) => Pick<ArchNode, typeof STYLE_KEYS[number]>;
export const pasteStyle: DocOp<[ids: string[], style: Partial<ArchNode>]>;
```

**Behaviour:**
- **Format painter:** `Ctrl+Alt+C` copies the style and `Ctrl+Alt+V` pastes it onto the selection.
  The context-toolbar "Format painter" button arms a one-shot paste on the next click.
- **Multi-select:** the Inspector's Appearance section edits all selected nodes at once. A field
  whose values differ shows "Mixed".

**Implementation notes (2026-10-25):**
- Ops: `state/ops/style.ts` (`STYLE_KEYS`, `copyStyle`, `pasteStyle`, `sharedStyle`). A copied key with no
  value clears the key on paste. Locked nodes keep their style. Store action `pasteStyle(ids, style)` is one
  undo step.
- Hook: `screens/canvas/useFormatPainter.ts` (copy, paste, one-shot `arm`/`applyArmed`, `Ctrl/Cmd+Alt+C/V`,
  Esc disarms). Multi-select UI: `screens/canvas/MultiAppearance.tsx` (Colour, Fill, Border, Display with "Mixed").
- **Pending integration** (files owned by other tasks, not edited here): Inspector renders
  `<MultiAppearance nodes={selectedNodes} />` when more than one node is selected; CanvasScreen calls
  `useFormatPainter` with `multiSel`, the context toolbar "Format painter" button calls `arm()`, and the next
  canvas click calls `applyArmed(idsUnderPointer)`.

**Tests:** `src/tests/format-painter.test.tsx`
- `it('copy/paste style applies stroke+fill to 2 nodes in one undo')`
- `it('inspector shows Mixed for differing fills')`

---

### R1-E04-T07 · Context menu (SC-18)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E04-T01, R1-E04-T02, R1-E02-T05, R1-E10-T03 |
| **Sources** | FL-19; SC-18 |

**Change:**
- Create `screens/canvas/ContextMenu.tsx` (`role="menu"`). It opens on right-click or
  `Shift+F10` / the context-menu key, at the pointer or the selection centre.
- The menu has five groups:
  - **Edit:** Cut, Copy, Paste, Duplicate, Delete, Select similar.
  - **Arrange:** Align ▸, Distribute ▸, Bring to front, Send to back, Lock.
  - **Display:** Icon / Card / Shape, Replace icon, Collapse (boundaries only).
  - **Review:** Comment, Copy link to element.
  - **Advanced:** Move to layer ▸, Move to page ▸, Properties.
- Items come from the command registry `lib/commands.ts` (E10-T03), so labels and shortcuts match
  the palette.
- **Keyboard:** arrow keys, Enter, Esc, and the right arrow to open submenus. Focus returns to the
  canvas when the menu closes.
- Unavailable items are **hidden**, not disabled (FL-15 read-only rule).

**Implementation notes (2026-10-25):**
- `screens/canvas/useCanvasCommands.ts` registers the element commands (Edit, Arrange, Display, Review, Advanced) in
  `lib/commands.ts` while the canvas is mounted; `ContextMenu.tsx` lists them, so the palette shows the same titles and shortcuts.
  The in-app clipboard is `screens/canvas/nodeClipboard.ts` (Paste lands to the right of the diagram via `mergeGraph`).
- Items that need a feature that does not exist yet are not listed: "Collapse" waits for R1-E03-T03.
- New: `moveToPage(ids, pageId)` (ops/pages.ts, store action); edges that would cross pages are removed. "Link to page", "Go to
  linked page" and "Remove page link" set `linkPageId` (R1-E03-T04). "Copy link to element" copies
  `#/canvas?doc=<id>&element=<id>`; the canvas selects and centres that element on arrival.
- `role` comes from the Docs context (`useDiagram().role`); null (local doc) counts as owner.

**Tests:** `src/tests/context-menu.test.tsx`
- `it('opens on contextmenu with grouped items')`
- `it('Shift+F10 opens at selection')`
- `it('arrow navigation and Esc returns focus')`
- `it('viewer role hides editing items')`

---

### R1-E04-T08 · Wire arrange UI (context toolbar and shortcuts)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E04-T01, R1-E04-T02, R1-E10-T05, R1-E01-T07 |

**Change:**
- Create `screens/canvas/ContextToolbar.tsx`, or extend it if E02-T05 created it first. It holds the
  Arrange group from T01 (align ×6, distribute ×2) and Match size, Bring to front, Send to back and
  Lock from T02.
- Add the shortcuts from T01, T02 and E10-T05 (`Ctrl+F` / `Ctrl+H` find bar) to
  `screens/canvas/useCanvasKeyboard.ts`.
- Create the find bar UI `screens/canvas/FindBar.tsx` (E10-T05 UI part).

**Implementation notes (2026-10-25):**
- The Arrange group in `ContextToolbar.tsx` follows the dark icon group of the CanvasPro "Context toolbar over multi-selection"
  artboard; buttons appear only when they apply (align ≥ 2 nodes, distribute ≥ 3). Shortcuts run the registered commands
  (`runCanvasCommand`), so a locked or too-small selection is a no-op. Also wired: `Ctrl+C/X/V`, `Ctrl+]`/`Ctrl+[`,
  `Ctrl+Shift+]`/`[`, `Ctrl+Shift+L`, `Ctrl+F` / `Ctrl+H` (`FindBar.tsx`).

**Tests:** `src/tests/arrange-ui.test.tsx`
- `it('Align left button aligns selection')`
- `it('Alt+Shift+H distributes')`
- `it('Ctrl+F opens find bar showing match count')`

---

## Changelog

- 2026-10-26 R1-E14-T09 (owner-reported): the context toolbar anchors 12 px above the selection box and flips below it when there is no room above, never covering the selection (rule in Main.dc.html); files: `screens/canvas/contextToolbarPlacement.ts`, `canvas/ContextToolbar.tsx`, `tests/context-toolbar-placement.test.ts`.
- 2026-10-25 R1-E04-T05 done: ports and drag-to-connect; files: lib/canvasGeometry.ts, state/store.tsx (connectNodes ports), screens/CanvasScreen.tsx, screens/canvas/PortHandles.tsx, tests/ports.test.tsx.
- 2026-10-25 R1-E04-T07 done: context menu; files: screens/canvas/{ContextMenu,useCanvasCommands,nodeClipboard,useCanvasKeyboard}.ts(x), state/ops/pages.ts + store (moveToPage), CanvasScreen.tsx (+ deep link, tab stop on the canvas); extra: store `duplicateSelected(id?)`, Inspector Duplicate button passes no event.
- 2026-10-25 R1-E04-T08 done: arrange group, shortcuts, find bar; files: screens/canvas/{ContextToolbar,FindBar,useCanvasKeyboard}.tsx, CanvasScreen.tsx, tests/arrange-ui.test.tsx.
- 2026-10-25 R1-E04-T01 done: Align and distribute (CAP-C6). `align(st, ids, edge)` (left/center/right/top/middle/bottom) and `distribute(st, ids, axis)` (h/v, ≥3 ids, ordered by position). Locked nodes and nodes on locked layers excluded. Shortcuts: `Alt+Shift+L/C/R/T/M/B`, `Alt+Shift+H/V`. New test: `ops-arrange.test.ts`. Reviewed by coordinator.
- 2026-10-25 R1-E04-T02 done: Match size, z-order, lock. `matchSize(st, ids)` (w/h/both, ≥2), `zOrder(st, ids, 'front'|'back')`, `setLocked(st, ids, true|false)`. Same locked exclusion. New tests added to `ops-arrange.test.ts` + `ops-zorder-lock.test.ts`. Reviewed by coordinator.
- 2026-10-25 R1-E04-T06 done (logic and components; canvas/Inspector wiring pending): ops/style.ts, store `pasteStyle`, useFormatPainter, MultiAppearance; 4 tests in format-painter.test.tsx.
- 2026-10-25 R1-E04-T06 done: Inspector renders MultiAppearance for multi-select; useFormatPainter called in CanvasScreen; context toolbar "Format painter" arms a one-shot paste; files: CanvasScreen.tsx, canvas/ContextToolbar.tsx, canvas/Inspector.tsx.
- 2026-10-25 R1-E04-T03 done: waypoint / "+" handle drag, double-click remove, Reset route (Inspector, not the context toolbar); `canvas/edgeHandles.ts`, `tests/waypoints-canvas.test.tsx`; files: CanvasScreen.tsx, Inspector.tsx.
- 2026-10-25 R1-E04-T04 done: `edgeHops` once per frame and `zoom` in edge flags (CanvasScreen, CanvasEngine); label-pill drag sets `labelPos` via `labelPosFromPoint`.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-25 R1-E04-T03 done (geometry and drawing; editing pending): `edgePath`, `hitEdgeSegment`, waypoint-aware `edgePoints` in `lib/canvasGeometry.ts`; selected-edge handles (`edgeHandlePoints`) drawn in `render/edges.ts`; tests `edge-path.test.ts` and additions to `render-relationships.test.ts`. `waypoints-canvas.test.tsx` and drag/double-click/Reset route need CanvasScreen.
- 2026-10-25 R1-E04-T04 done (render and logic; wiring pending): `lib/edgeCrossings.ts`, `edgeHops`, hop arcs in `drawEdgePass` (`hops` flag), `clampLabelPos`/`labelPosFromPoint`; tests `edge-crossings.test.ts` and `render-relationships.test.ts`. Call sites must pass `hops` and handle the pill drag.
