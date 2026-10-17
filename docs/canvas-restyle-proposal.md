# Canvas Restyle Proposal — ArchFlux Design System v2.0.0 §10

Audit date: 2026-10-16  
Scope: Canvas rendering, node/edge/grid/selection styling only. Geometry and interaction logic preserved (no changes to `canvasGeometry.ts`, hit-testing, snap, or pointer state machines).

---

## 1. Inventory — existing canvas / node / edge / grid / selection files under `src/`

| File | Role | Styling lines / sections |
|---|---|---|
| `src/screens/CanvasScreen.tsx` | Main render pass (nodes, edges, selection, resize grips, guides, grid class) | Draw node: ~878-1118; Edge draw: ~830-874; Selection indicator (logo): ~928-934; Resize grips: ~1206-1217; Guides: ~1219-1236; Grid class: ~2123; Multi-select: ~880; Theme colors hard-coded: `#635BFF`, `#1E1E1E`, `#FFFFFF`, `#D97706`, `#DC2626`, `#22D3EE` |
| `src/canvasGeometry.ts` | Pure geometry (resize handles, guides, snap, minimap) | No colors; geometry only. **Not changed.** |
| `src/styles.css` | Theme tokens (`--bg-canvas`, `--canvas-grid-dot`, `--canvas-grid-line`, `--bg-panel`, `--border-panel`, `--accent-cyan`, etc.) | Dark: `#1F2937` / `#F3F4F6` / `rgba(219,234,254,0.14)`; Light: `#FFFFFF` / `#E5E7EB` / `#DBEAFE`; v2.4 aliases `surface-*`. |
| `src/design-system/tokens/colors.ts` | Token source (`graphite`, `violet`, `neutral`, `semantic`, `canvasPalette`) | `brand.violet.600` = `#8B83FF`; `semantic.light.error` = `#DC2626`; `semantic.dark.error` = `#F87171`; `semantic.light.warning` = `#CA8A04`; `neutral.dark.surface` = `#27272A`; `neutral.light.surface` = `#FFFFFF`. |
| `src/design-system/components/` | (empty in audit) | No canvas components found. |
| `src/design-system/themes/` | (empty in audit) | No theme files found. |
| `src/tests/canvas-geometry.test.ts` | Geometry / snap tests | No styling to change. |
| `src/tests/canvas.test.tsx` | Canvas screen render tests | May need token snapshot updates if colors change; interaction assertions untouched. |
| `src/tests/canvas.accessibility.test.tsx` | A11y tests | Unchanged. |

---

## 2. Proposed token restyling (§10)

Guiding rules from spec:
- **Dark bg**: `#101318`; **major** `#292F3A`; **minor** `#202630`.
- **Light bg**: `#FFFFFF`; **major** `#E0E3EA`; **minor** `#F0F1F5`.
- Nodes: fill / border / text driven by theme + semantic only when needed.
- **Selected brand outline** must be distinguishable from **error**.
- Edges: neutral default; **selected = brand**; **warning only on semantic issue**.
- Grid: zoom-adaptive (line/dot spacing scales with `zoom`; opacity drops with zoom-out).
- Multi-selection: **shared outline** (one bounding rect, not per-node dashes).
- Alignment guides: **restrained** (lower opacity, shorter dash, suppress when >1 node selected).

### 2.1 Background / surface tokens (replace hard-coded canvas bg)

| Context | Old | New (proposed) | Ref / file |
|---|---|---|---|
| Dark canvas bg | `#1F2937` (styles.css / CanvasScreen) | `#101318` | `styles.css` `--bg-canvas` (dark); `CanvasScreen` theme draw |
| Dark surface / panel major | `#374151` / `#3F3F46` | `#292F3A` | `styles.css` `--bg-panel-elevated`; token `graphite.900` proxy |
| Dark surface minor / overlay | `#1E1E1E` / `#2D2D2D` | `#202630` | `CanvasScreen` nodeBg default dark; `styles.css` subtle |
| Light canvas bg | `#FFFFFF` | `#FFFFFF` (keep) | `styles.css` `--bg-canvas` (light) |
| Light surface major | `#F8F9FA` / `#F3F4F6` | `#E0E3EA` | `styles.css` `--bg-panel-subtle`; token `neutral.light.surfaceOverlay` proxy |
| Light surface minor | `#F7F7F5` / `#EDE9FE` | `#F0F1F5` | `styles.css` `--bg-workspace` |

### 2.2 Node tokens (fill, border, text)

| Context | Old | New (proposed) | Source / file |
|---|---|---|---|
| Dark node fill (default) | `#1E1E1E` | `#202630` (minor dark) | `CanvasScreen` ~886 `nodeBg`; `styles.css` dark |
| Light node fill (default) | `#FFFFFF` | `#FFFFFF` (keep) | `CanvasScreen` ~886 |
| Dark node border (unselected) | `node.stroke` / `#6B7280` | `#4B5563` (major-dark edge) or `#292F3A` depending on theme | `CanvasScreen` ~887; token `graphite.700` -> `#52525B` mapped to `#4B5563` refined |
| Light node border (unselected) | `#6B7280` / `#D1D5DB` | `#E0E3EA` (major light) | `styles.css` `--border-panel-bright` |
| Dark node text (label / tag / details) | `#9CA3AF` / `#F9FAFB` | `#D1D5DB` (secondary dark) / `#F0F1F5` (primary) | `CanvasScreen` ~920, 1006, 1013; token `textSecondary` |
| Light node text | `#6B7280` / `#1F2937` | `#475569` / `#101318` | `CanvasScreen`; token `textPrimary` / `textSecondary` |
| Node shadow (selected) | `#635BFF` blur 8 | Brand violet `#8B83FF` blur 10 (brighter for contrast) | `CanvasScreen` ~889; token `violet.600` |

### 2.3 Selection outline (critical: distinguish from error)

| State | Old | New (proposed) | Rationale |
|---|---|---|---|
| Single selected outline | `#635BFF` (`accent-cyan`) | Brand violet `#8B83FF` (token `violet.600`) | Brand, not info-blue |
| Selected outline width | 2 (or 2/zoom) | 2.5 / zoom (slightly bolder) | Visibility |
| Selected outline dash | `[4,4]` (logo) / solid (rect) | Solid for rect/cylinder; dashed only for logo/icon-only | Consistency |
| Error / validation outline | `#DC2626` (red) | `#F87171` (dark) / `#DC2626` (light) — keep semantic error, but **never** use `#635BFF` for error | `semantic.error` already defined; ensure no collision with brand violet |
| Pending / connector-from outline | `#D97706` (orange) | Keep `#D97706` / light `#CA8A04`; separate from selection | Unchanged semantics |

**Distinguishability check:** `#8B83FF` (violet) vs `#DC2626` (red) vs `#D97706` (amber) — clearly distinct in both themes. No overlap with `#635BFF` (old selection = info blue, now removed from selection role).

### 2.4 Multi-selection shared outline (new behavior)

Current: per-node `isSelected` dashes (`#635BFF` at ~929, ~953, ~968).  
Proposal: when `multiSel.length > 1`, draw **one shared bounding rect** around the union of selected nodes, brand violet `#8B83FF`, 2px, dashed `[6,4]`, no per-node dashes.

- File: `CanvasScreen.tsx` around selection-indicator block (~928-934, ~953, ~968, ~1100)
- Geometry untouched: use `minX/minY/maxW/maxH` over `multiSel` ids; compute once per frame.
- Interaction untouched: `multiSel` state array unchanged.

### 2.5 Edge tokens

| Context | Old | New (proposed) | Source |
|---|---|---|---|
| Default edge stroke | `#635BFF` / `edge.color` | `#6B7280` dark / `#A1A1AA` light (neutral) | `CanvasScreen` ~834, ~861, ~869 |
| Selected edge stroke | `#635BFF` | Brand violet `#8B83FF` | `CanvasScreen` ~834, ~861 |
| Edge label (default) | `#D1D5DB` dark / `#6B7280` light | `#9CA3AF` dark / `#6B7280` light (muted) | `CanvasScreen` ~869 |
| Edge label (warning) | Not differentiated | `#FACC15` (dark) / `#CA8A04` (light) **only when `edge.semantic === 'warning'`** | New conditional; use `semantic.warning` |
| Edge arrow fill (selected) | `#635BFF` | `#8B83FF` | `CanvasScreen` ~861 |

Rule enforced: warning color appears on edge **only** when a semantic issue is present (e.g., dangling, conflict, invalid protocol). Otherwise neutral.

### 2.6 Grid — zoom-adaptive

Current: CSS `canvas-layout` with `grid-lines` / `grid-none`; dot/line colors fixed (`--canvas-grid-dot`, `--canvas-grid-line`).

Proposal: make grid spacing and opacity adaptive to `zoom` inside `CanvasScreen` draw pass (or via CSS custom property updated in `useEffect` on `zoom`).

| Zoom range | Dot / line spacing | Opacity (dark) | Opacity (light) |
|---|---|---|---|
| `< 0.3` | 40 world units | `0.08` | `0.15` |
| `0.3 — 0.8` | 20 | `0.12` | `0.25` |
| `0.8 — 2.0` | 10 | `0.18` | `0.35` |
| `> 2.0` | 5 | `0.22` | `0.45` |

- Colors: dark dot -> `rgba(255,255,255,0.08` → `0.22`; light dot -> `#CBD5E1` → `#E0E3EA` (major light). Lines follow same scale.
- File: `CanvasScreen.tsx` (new draw-grid function or update CSS variable via `useRef` / `useEffect` on `zoom`); `styles.css` token refs.
- Geometry untouched: grid is visual only.

### 2.7 Alignment guides — restrained

Current: `#22D3EE` (cyan), 1.5/zoom, dashed `[6/zoom, 4/zoom]`, drawn for any snap.

Proposal (restrained):
- Color: `#A1A1AA` dark / `#D1D5DB` light (low-contrast guide, not brand cyan).
- Line width: `0.75 / zoom` (thinner).
- Dash: `[4/zoom, 6/zoom]` (shorter segments, more gap).
- Opacity: `0.35` (suppressed when `multiSel.length > 1` — do not draw guides in multi-select mode to reduce clutter).
- Suppress when `zoom < 0.4` (too small to matter).
- File: `CanvasScreen.tsx` ~1221-1235 (`guidesRef` draw loop).

---

## 3. File-change map (what changes, what stays)

| File | Change type | Lines / sections | Notes |
|---|---|---|---|
| `src/screens/CanvasScreen.tsx` | Edit (styling only) | ~886 (`nodeBg` default dark/light); ~887 (`strokeColor`); ~889 (`shadowColor`); ~928-934 (logo selection); ~953 (rect selection outline); ~968 (cylinder selection); ~1100 (comment selection); ~834/861/869 (edge colors); ~1211-1216 (grip colors); ~1221-1223 (guide colors); ~2123 (grid class); new ~880 multi-select shared-outline block | All geometry/coordinates untouched. Replace hard-coded hex with token refs or theme-conditional variables. |
| `src/styles.css` | Edit | `--bg-canvas`, `--canvas-grid-dot`, `--canvas-grid-line`, `--bg-panel`, `--bg-panel-subtle`, `--border-panel`, `--border-panel-bright`, `--accent-cyan` (remove or restrict to non-selection), add `--brand-violet` / `--surface-canvas` updated | No layout break; variable-only. |
| `src/design-system/tokens/colors.ts` | Edit / add | Add `canvas` group mapping `dark.background = '#101318'`, `dark.major = '#292F3A'`, `dark.minor = '#202630'`, `light.background = '#FFFFFF'`, `light.major = '#E0E3EA'`, `light.minor = '#F0F1F5'` | Reference for imports into CanvasScreen if using token module directly (currently CanvasScreen uses raw hex; proposal is to either import or keep CSS vars). |
| `docs/canvas-restyle-proposal.md` | Create | This file | — |

### What is explicitly NOT changed (geometry / interaction preserved)
- `canvasGeometry.ts` — resize handles, snap logic, guide computation, minimap transforms.
- `CanvasScreen.tsx` pointer handlers (`onMouseDown`, `onMouseMove`, `onMouseUp`) — selection state (`selectedId`, `multiSel`, `selectedEdgeId`) unchanged; only rendering of those states changes.
- Node size clamping (`clampNodeSize`), hit-testing (`hitResizeHandle`), snap distance logic.
- Edge polyline calculation (`edgePoints`) — points unchanged; only `ctx.strokeStyle` changed.
- Collaboration / state sync — no data-model changes.
- Accessibility tree (roles, labels) — unchanged.

---

## 4. Token references (proposed new / updated)

From `src/design-system/tokens/colors.ts` and `src/styles.css`:

- `brand.violet.600` → `#8B83FF` (selection outline, shadow, selected edge)
- `brand.graphite.950` → `#18181B` (text primary dark — consider mapping to `#101318` for canvas bg specifically)
- `brand.graphite.900` → `#27272A` (surface major dark — map to `#292F3A`)
- `semantic.dark.error` → `#F87171`; `semantic.light.error` → `#DC2626`
- `semantic.dark.warning` → `#FACC15`; `semantic.light.warning` → `#CA8A04`
- `neutral.dark.background` → `#101318` (proposal: override for canvas bg)
- `neutral.dark.surface` → `#292F3A`
- `neutral.dark.borderSubtle` → `#202630`
- `neutral.light.background` → `#FFFFFF`
- `neutral.light.surface` → `#F0F1F5`
- `neutral.light.border` → `#E0E3EA`

---

## 5. Verification / test impact

- `canvas-geometry.test.ts` — **zero impact** (no styles).
- `canvas.accessibility.test.tsx` — **zero impact** (roles/labels unchanged).
- `canvas.test.tsx` — **snapshot updates likely** (color values in rendered canvas SVG/text or pixel assertions). No test logic changes needed.
- Visual regression / screenshot tests — expect updates due to new palette; confirm brand violet visible for selection, red distinct from violet, grids adaptive.

---

## 6. Summary for parent session

- **Inventory**: 4 core files (`CanvasScreen.tsx`, `canvasGeometry.ts`, `styles.css`, `design-system/tokens/colors.ts`) plus 3 test files; no dedicated node/edge/grid/selection component files exist beyond `CanvasScreen.tsx`.
- **Restyle plan**: Dark `#101318/292F3A/202630`; Light `#FFFFFF/E0E3EA/F0F1F5`; nodes filled with theme surfaces and bordered by theme borders; selected state uses brand violet `#8B83FF` (not info-blue `#635BFF`, and clearly not error `#DC2626`); edges neutral by default, brand-selected, warning-only-on-issue; grid zoom-adaptive; multi-selection gets one shared outline; guides restrained to low-contrast short dashes suppressed in multi-select.
- **No geometry/interaction broken**: Only `ctx.*Style`, `ctx.fillStyle`, `ctx.strokeStyle`, `shadowColor`, and a new shared-outline computation block are proposed; all coordinate / hit / state logic preserved.
