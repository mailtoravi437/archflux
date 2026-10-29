# EPIC-02 · Typed elements, notation, display styles, inline editing

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 1–2 | **Sources:** CAP-M1, CAP-M2, CAP-S1 (notation);
> UI_REVAMP_SPEC §5A.1–§5A.6 (UX-A12); DATA_MODEL_R1 §2.1–§2.3, §2.6
> **Design:** canvas page "Components" → Elements, States, DisplayStyles, Example

**Renderer rule:**
- The node pass is `canvas/render/nodePass.ts` (`drawNodePass` dispatches on `effectiveNodeStyle`: card, shape, icon, or the legacy renderers for nodes with no style). Geometry is in `canvas/render/shapes.ts`, state marks in `canvas/render/status.ts`.
- All drawing goes in `canvas/render/nodes.ts` and `canvas/render/edges.ts` (after E00-T07).
- Renderer tests use the recording mock context pattern from `src/tests/canvas.test.tsx`: a fake
  `CanvasRenderingContext2D` that records `fillText`, `strokeRect`, `arc`, `setLineDash` and similar
  calls.
- Assert on recorded calls, not on pixels.

---

### R1-E02-T01 · Notation table (`canvas/notation.ts`)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |
| **Sources** | UI_REVAMP_SPEC §5A.2, §5A.3, §5A.4 |

**Contract:**

```ts
import type { ElementKind, BoundaryKind, RelationshipKind, ElementSize } from '../types';
export type BaseShape = 'card' | 'card-dashed' | 'person' | 'browser' | 'cylinder' | 'cylinder-braces'
  | 'cylinder-bolt' | 'cylinder-search' | 'pipe' | 'pipe-log' | 'bucket' | 'globe' | 'card-clock' | 'card-pulse'
  | 'card-chevron' | 'card-lambda' | 'note';
export interface KindNotation { label: string; color: string; glyph: string; baseShape: BaseShape; }
export const KIND_NOTATION: Record<Exclude<ElementKind, 'boundary'>, KindNotation>;
export interface BoundaryNotation { label: string; stroke: string; dash: number[]; fill: string | null; radius: number; width: number; }
export const BOUNDARY_NOTATION: Record<BoundaryKind, BoundaryNotation>;
export interface RelNotation { dash: number[]; head: 'filled' | 'open'; both: boolean; verb: string; }
export const REL_NOTATION: Record<RelationshipKind, RelNotation>;
export const SIZE_BOX: Record<ElementSize, { w: number; h: number }>; // S 64×64, M 200×80, L 240×120
export function notationFor(kind: ElementKind | undefined): KindNotation;   // undefined → service
```

**Values:**
- Copy the colours and dashes **exactly** from the UI_REVAMP_SPEC tables: §5A.2 colours, §5A.3
  boundaries, §5A.4 relationships (sync `[]`, async `[6,4]`, replication `[2,4]`).
- `frame` is `#6B7280` dashed `[4,4]` with radius 12.
- `swimlane` is `#C3C8D1` solid with fill `#F6F7F9` and radius 0.
- `note` is `#B45309` on `#FEF3C7` (exported as `NOTE_FILL`) with the base shape `note`.
- **Dashed boundaries** (region, AZ, k8s-namespace, c4-system, trust) use dash `[6,4]`.
- **Boundary radius and width:** radius is 0 (AWS square corners), except c4-system and frame,
  which use 12. Width is 1.5, except trust, which is 2.
- **Boundary labels** use the short prefixes "AWS Cloud", "Region", "VPC", "AZ", "Public subnet",
  "Private subnet", "SG", "Cluster", "ns", "System", "Trust boundary", "Frame" and "Lane".
- `notationFor('boundary')` returns the service notation. Boundaries are drawn from
  `BOUNDARY_NOTATION`.

**Tests:** `src/tests/notation.test.ts`
- `it('every ElementKind except boundary has a notation')`
- `it('database, queue and service have different base shapes')`: the grayscale-distinguishable
  rule.
- `it('colours match UI_REVAMP_SPEC §5A.2')`: assert at least service `#2563EB`, database `#B45309`
  and queue `#BE185D`.

---

### R1-E02-T02 · Card style renderer

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T01, R1-E00-T07 |
| **Sources** | UI_REVAMP_SPEC §5A.1 |

**Goal:** `displayStyle === 'card'` draws the §5A.1 anatomy.

**Read:** `canvas/render/nodes.ts`, `src/tests/canvas.test.tsx` (mock context), `canvas/notation.ts`.

**Change:**
- In `drawNodePass`, branch on `node.displayStyle ?? 'card'`. Card drawing goes into
  `drawCardNode(ctx, node, icons, opts)`, which draws the following.
  - **Box:** a rounded rect with radius 8 (`card-dashed` for `external`, with dash `[6,4]` and fill
    `#F3F4F6`). The border is 1.5 px in `node.stroke ?? notation.color`; the fill is
    `node.fill ?? surface`.
  - **Icon slot:** 32 px at (x+12, y+12). Use the icon from `iconRef` / `iconSrc` when present,
    otherwise the kind glyph tinted with the kind colour. `iconRef === null` hides the slot and
    shifts the text left.
  - **Name:** 13 px / 600 at (x+56, y+28). It wraps to 2 lines max, then ends in "…" (helper
    `wrapText(ctx, text, maxWidth, maxLines)` in `render/text.ts`).
  - **Second line:** `"<Kind label> · <technology>"`, 11 px / 500, muted.
  - **Property line**, optional: the value of `node.properties[opts.propertyLineKey]`, shown as
    `"Owner: X"`. The key comes from `doc.defaults.propertyLine` and defaults to `owner`. Draw
    nothing when the value is empty.
  - **Status slot**, at the top right: the drift dot, lint dot and comment count, from
    `opts.status` (T08).
- Sizes come from `SIZE_BOX`. A node with explicit `w`/`h` keeps them.

**Tests:** `src/tests/render-card.test.ts`
- `it('draws name and kind·technology inside the box')`: every `fillText` x/y lies within
  `[node.x, node.x+w] × [node.y, node.y+h]`.
- `it('wraps long names to two lines with ellipsis')`
- `it('external kind uses dashed border')`
- `it('iconRef null hides icon slot and shifts text left')`

**Pitfalls:**
- The label-position bug FE-V2 came from forgetting `node.x`. Always draw text at `node.x + offset`.
- `ctx.measureText` in jsdom returns width 0 unless the mock defines it. Use the mock from
  `canvas.test.tsx`, which approximates 7 px per character.

---

### R1-E02-T03 · Shape style renderer (notation geometry)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T02 |
| **Sources** | UI_REVAMP_SPEC §5A.2 (Notation column) |

**Change:** (geometry values come from `Elements.dc.html` and `DisplayStyles.dc.html`; the artboard wins)
- Create `canvas/render/shapes.ts` with one path builder per `BaseShape`:
  `pathFor(shape, x, y, w, h): (ctx) => void` (the silhouette; the caller fills and strokes), plus
  `paintShape` for the inner details and `shapeContent` for where the text goes.
  - **cylinder:** a cap ellipse (radius y = 13/104 of the height) with a body and a front rim. It has
    its own path builder: the legacy `drawCylinderBody` ratios (15 %) do not match the artboard.
  - **cylinder variants:** the same cylinder. The inner glyph is the kind glyph in the icon slot (bolt,
    magnifier); cylinder-braces writes `{ } ` in front of the "Kind · technology" line.
  - **pipe:** a horizontal cylinder (end-cap radius x = 15/210 of the width), **queue** adds three
    round 6 px bars in `#F9A8D4`, **pipe-log** five 1.5 px segment lines in `#DDD6FE`; both sit behind the text.
  - **bucket:** a trapezoid (base 14/170 narrower per side) with an elliptical top and rim.
  - **person:** a head circle (r = h × 0.18) plus a body, radii 28 on top and 10 below, overlapping the head by 6.
  - **browser:** a rect with a **16 px** title bar and 3 dots (artboard value; was 12).
  - **globe:** a circle with 2 meridians (`drawGlobeOutline`). Shape style still draws `cdn` as the card, as the Elements artboard does.
  - **note:** a rect with a 14 px folded corner.
  - **card-\* and card-dashed:** shape style draws these as the card (`drawCardNode`), as the artboards do.
- In shape style the icon (**28 px**, artboard value; was 24) sits at the left with the name (13/600, left aligned, ≤ 2 lines, one line when the geometry is short) and "Kind · technology" to its right, inside the geometry. Person and note have no icon (person text is centred).

**Tests:** `src/tests/render-shapes.test.ts`
- `it('database in shape style draws an ellipse cap')`: the mock records `ellipse`.
- `it('queue draws a horizontal pipe')`: the ellipse calls have rotation 0 and are on the left and
  right sides.
- `it('person draws a head arc')`
- `it('text stays within geometry bounds for every base shape')`

---

### R1-E02-T04 · Icon style renderer (fixes UX-A12)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T02 |
| **Sources** | UI_REVAMP_SPEC §5A.1b; UX-A12 bug |

**Change:**
- `displayStyle === 'icon'`, or legacy `shape === 'logo'`, draws:
  - the icon tile at 48, 64 or 96 px (from `size` S/M/L), centred horizontally;
  - the **name below it, always**: 13/600, centred, wrapping to 2 lines, never overlapping the icon;
  - an optional technology line under the name (11 px muted).
- The hit area (`nodeBounds(node)` in `lib/canvasGeometry.ts`) covers the icon and the label. Add
  `nodeBounds` if it doesn't exist and use it for hit testing in `CanvasScreen` (`hitsNode`).
- Tile look (States.dc.html size S): white tile, 1.5 px kind-colour border, radius 10 × tile/64; the
  official icon is 62.5 % of the tile (40 of 64); a kind glyph sits on the tinted tile. The tile edge
  is `size` S/M/L = 48/64/96, or the node's own `min(w, h)` clamped to 48–96 when `size` is unset.
- Selection draws a ring around tile + label and no resize handles (the size is S/M/L).

**Tests:** `src/tests/render-icon-style.test.ts`
- `it('draws the name under an official SVG icon')`: this is the regression for UX-A12, where an
  `iconSrc` node in logo mode drew no name.
- `it('label never overlaps the icon tile')`
- `it('nodeBounds includes the label area')`

---

### R1-E02-T05 · Switch display style (toolbar, inspector, Alt+1/2/3)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T03, R1-E02-T04, R1-E00-T08 |
| **Sources** | UI_REVAMP_SPEC §5A.1b "Switching" |
| **Design** | Components › DisplayStyles |

**Contract:**

```ts
// state/ops/displayStyle.ts
export const setDisplayStyle: DocOp<[ids: string[], style: DisplayStyle]>;
// Actions context
setDisplayStyle: (ids: string[], style: DisplayStyle) => void;   // one undo step via applyOp
```

**Behaviour:**
- Switching keeps `id`, the text, the icon, the properties and the edges. Only `displayStyle` changes,
  plus `w`/`h`, which are reset to `SIZE_BOX[size]` for card and shape, and to the icon tile (`ICON_TILE[size]`,
  48/64/96 square) for icon, unless the node was custom sized (`node.customSize === true`,
  DATA_MODEL_R1 §2.2). Locked nodes and boundaries are skipped. The tile box means connectors meet the tile, not the label.
- **UI:** in `screens/canvas/ContextToolbar.tsx`, a floating bar above the selection appears for
  ≥ 1 selected nodes. Its first control is the segmented "Display: Icon · Card · Shape"
  (`role="radiogroup"`). Add the same control to the Inspector's Appearance section.
- **Keyboard:** `Alt+1` / `Alt+2` / `Alt+3` switch to icon / card / shape on the selection.

**Tests:**
- `src/tests/display-style.test.tsx`:
  - `it('switching 3 selected nodes is one undo step')`
  - `it('edges stay attached after switching')`: edge `from`/`to` are unchanged and the endpoints
    are recomputed from the new bounds.
  - `it('Alt+2 sets card style')`
  - `it('context toolbar radiogroup reflects mixed selection as no checked option')`
- `src/tests/ops-display-style.test.ts`: pure op tests.

---

### R1-E02-T06 · Inline editing of name and technology

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T02 |
| **Sources** | UI_REVAMP_SPEC §5A.1b "Editing text" |

**Read:** `screens/CanvasScreen.tsx` around L1570–L1615 (the existing dblclick rename).

**Change:**
- Create `screens/canvas/InlineEditor.tsx`: an absolutely positioned `<input>` over the node's name
  rect, converted to screen coordinates with zoom and pan.
- **Opening it:** double-click, or `Enter` with one node selected.
- **Keys:**
  - `Tab` moves to the technology line; `Shift+Tab` moves back.
  - `Enter` commits and `Esc` cancels.
  - An empty name restores the previous one.
- One edit session is one undo step. The drafts live in the editor; on commit the screen calls
  `checkpoint()` once and then `updateNode` (`label`, `technology`, and the legacy `tag` mirror).
  Esc and an unchanged commit write nothing and record no undo entry. Blur (a click elsewhere) commits.
- Both inputs are visible while editing (name 22 px, technology 20 px, gap 4), laid out per style by
  `inlineEditRects` in `canvas/render/nodePass.ts`.
- **Accessibility:** add an `aria-live="polite"` region saying "Editing name of <label>" or
  "Editing technology of <label>". The input's `aria-label` is "Name" or "Technology".

**Tests:** `src/tests/inline-edit.test.tsx`
- `it('Enter opens name editor, typing + Enter commits')`
- `it('Tab moves to technology, Shift+Tab back')`
- `it('Esc cancels without change')`
- `it('empty name restores previous')`
- `it('one undo reverts the whole edit session')`
- `it('announces "Editing name of Order Service"')`

---

### R1-E02-T07 · Typed properties in the Inspector

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T06, R1-E00-T01 |
| **Sources** | CAP-M1; DATA_MODEL_R1 §2.6 |

**Change:**
- Create `screens/canvas/PropertiesSection.tsx`, which goes in the Inspector's "Properties" section.
  - The standard keys (§2.6) render as typed inputs: text, URL, number with a "USD/mo" suffix, and
    selects for `dataClass` and `tier`.
  - "Add property" accepts a custom key, validated against `^[a-z][a-zA-Z0-9]{0,31}$` with at most
    30 keys and values of at most 500 characters. Errors show inline under the field.
  - A "Show on card" select picks the property line key and stores it in
    `doc.defaults.propertyLine` (DATA_MODEL_R1 §2.4).
- Create `lib/properties.ts` with `STANDARD_PROPERTIES`, `validatePropertyKey`, `validatePropertyValue`
  and `formatPropertyValue`.

**Tests:**
- `src/tests/properties.test.ts`: the validators and formatting.
- `src/tests/properties-section.test.tsx`:
  - `it('edits owner and shows it on card line')`
  - `it('rejects invalid custom key with message')`
  - `it('one undo per field edit')`

---

### R1-E02-T08 · Element states rendering (§5A.5)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T02, R1-E02-T03, R1-E02-T04 |
| **Sources** | UI_REVAMP_SPEC §5A.5 |
| **Design** | Components › States |

**Contract:**

```ts
export interface NodeStatus {
  drift?: boolean; lint?: 'error' | 'warn' | null; comments?: number;
  diff?: 'added' | 'removed' | 'changed' | null; proposed?: boolean; locked?: boolean;
  hovered?: boolean; focused?: boolean; multiSelected?: boolean;
}
// NodePaintFlags gains: status?: NodeStatus
```

**Rendering**, the same in all 3 styles:

| State | Drawing |
|---|---|
| hover | ports plus a subtle shadow |
| selected | 2 px accent ring plus handles |
| focus-visible | 2 px solid accent ring offset by 3 px (States artboard: solid, not dashed) |
| locked | a lock glyph at the top right |
| drift | an amber dot plus the "Drift" text in card style |
| lint | a red or amber dot |
| comments | a pin with the count |
| proposed | a green dashed border plus a "Proposed" chip |
| removed | red dashed border, 60 % alpha, name struck through |
| changed | amber tint fill `#FEF3C7` |

**Wiring:** `CanvasScreen` builds `status` from lint results, threads, `locked` and the diff overlay
(from E08). For now only threads (open threads, as the count pin; resolved threads keep the green
tick pin), `locked` and `multiSelected` are wired. Lint has no per-node source beyond orphans (already
drawn as "Not connected"), drift has no per-node data, and diff is fed by E08-T03.
Multi-selected nodes draw the ring without resize handles.

**Tests:** `src/tests/render-states.test.ts`, with one `it` per state that asserts its distinguishing
draw call.

---

### R1-E02-T09 · Relationship styles (§5A.4)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T01, R1-E00-T07 |
| **Sources** | CAP-M2; UI_REVAMP_SPEC §5A.4; UX-P1.7 |

**Change:**
- In `canvas/render/edges.ts`:
  - The dash comes from `REL_NOTATION[edge.relKind ?? 'sync']`.
  - Arrowheads are a filled triangle (sync, replication) or an open V (async). `bidirectional`
    draws heads at both ends.
  - The label is drawn as `"<label> · <protocol>"` when a protocol is set. It is a pill: 11 px Inter
    on a surface fill with a 1 px border, at `labelPos` (default 0.5) along the path, never italic.
  - A `step` number draws a 18 px circle badge at the path start + 16 px.
- In the inspector edge section, add a "Relationship" radiogroup (Sync request · Async message · Data
  replication · Bidirectional) and a Step number input. The existing protocol select stays.

**Tests:** `src/tests/render-relationships.test.ts`
- `it('async uses dash [6,4] and open arrow')`
- `it('label pill uses sans 11px and a background rect')`: this also covers UX-P1.7.
- `it('bidirectional draws two heads')`
- `it('step badge renders number')`

---

## Changelog
- 2026-10-25 R1-E02-T03 done: Shape style renderer. `canvas/render/shapes.ts` (pathFor/paintShape/shapeContent: cylinder family, pipe, pipe-log, bucket, person, browser, note, globe outline) and `canvas/render/nodePass.ts` (`drawNodePass` dispatcher moved out of nodes.ts; `drawShapeNode`). Legacy renderer renamed `drawLegacyNode`. Geometry from the Elements artboard (cap 13/104, 16 px browser bar, 28 px icon); card-family kinds draw as cards. Files: render/shapes.ts, render/nodePass.ts, render/nodes.ts, canvas/render.ts, tests/render-shapes.test.ts, tests/fixtures/recordingCtx.ts.
- 2026-10-25 R1-E02-T04 done: Icon style renderer (UX-A12). `drawIconNode`: bordered tile 48/64/96, name always below (13/600, 2 lines), technology line; legacy `shape: 'logo'` maps to icon style. `lib/canvasGeometry.ts`: `effectiveNodeStyle`, `iconTileSize`, `nodeBounds`, `hitsNode`, `sharedNodeStyle`. CanvasScreen: node hit testing and double-click use `hitsNode`, icon nodes have no resize grips, handles are drawn only for legacy-style nodes (CanvasEngine likewise). Test: render-icon-style.test.ts.
- 2026-10-25 R1-E02-T06 done: Inline editing. `screens/canvas/InlineEditor.tsx` (name + technology inputs over the node, Tab/Shift+Tab, Enter/Esc, blur commits, aria-live "Editing name of <label>"). Double-click and Enter (new `beginNodeEdit` dep of useCanvasKeyboard) open it; commit = one `checkpoint()` + `updateNode`. `inlineEditRects` in nodePass.ts. Test: inline-edit.test.tsx.
- 2026-10-25 R1-E02-T08 done: Element states (§5A.5). `canvas/render/status.ts`, `NodeStatus` + `NodePaintFlags.status`, `drawStateOverlays` shared by card/shape/icon: focus ring, lock, drift dot + "Drift" label (card), lint dot, comment count pin, proposed (green dashed + chip), removed (red dashed, 60 %, struck), changed (amber fill), multi-select ring without handles. CanvasScreen wires locked, open-thread counts and multiSelected only (no honest per-node lint/drift/diff source yet). Test: render-states.test.ts.
- 2026-10-25 R1-E02-T05 done (Inspector hook-up pending): `state/ops/displayStyle.ts` (`setDisplayStyle`, `boxForStyle`), store action `setDisplayStyle` (one undo via applyOp), `screens/canvas/ContextToolbar.tsx` (Display radiogroup, mixed selection checks nothing), Alt+1/2/3 in useCanvasKeyboard. The Inspector Display radiogroup (R1-E14-T03, other owner) still calls `updateNode({ displayStyle })`, so it does not reset w/h; it should call `setDisplayStyle([id], v)`. Tests: ops-display-style.test.ts, display-style.test.tsx.
- 2026-10-25 R1-E02-T02 done: Card style renderer (UI_REVAMP_SPEC §5A.1). `drawNodePass` dispatches `displayStyle === 'card'` to `drawCardNode` (rounded rect, 32px icon slot, name/subtitle/property line/details, ports, `iconRef`→manifest/fallback, `propertyLineKey` from `docDefaults`). CanvasScreen loads icon manifest once and threads `iconEntries` + `propertyLineKey` through `stateRef` to the pass. Updated canvas.test.tsx: details column x 136 (was 120), y 160–224. Reviewed by coordinator.
- 2026-10-25 R1-E02-T09 done: Relationship styles (§5A.4). Edge pass: dash from `REL_NOTATION[relKind]`, arrowheads (filled triangle sync/replication, open V async, both ends bidirectional), label pill "label · protocol", step badge 18px at start+16px. Inspector edge section: Relationship radiogroup (Sync/Async/Replication/Bidirectional via `REL_LABELS`) + Step number input, both bound to `relKind`/`step` with `checkpointInspector`. New test: `render-relationships.test.ts`. Reviewed by coordinator.
- 2026-10-25 R1-E02-T01 done: canvas/notation.ts, 5 tests. Reviewed by coordinator.
- 2026-10-25 R1-E02-T07 done: `lib/properties.ts`, `screens/canvas/PropertiesSection.tsx` in the Inspector, tests `properties.test.ts`, `properties-section.test.tsx`; inspector-fidelity mock gained multiSel/checkpoint/docDefaults.
- 1.0.0 (2026-10-24): epic created.
