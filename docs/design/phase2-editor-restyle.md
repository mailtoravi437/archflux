# Phase 2 — Core Editor Restyle (§10 / §8 / §9)

## Scope
- Target: `CanvasScreen.tsx`, `AppShell` / inspector / tool rail (`styles.css`), grid/token system.
- Preserve: geometry (`snapNode`, `resizeHandles`, `hitResizeHandle`), snap threshold, collaboration sync (`useCollaboration`, `pushLocalGraph` / remote apply, `lastRemoteVersion`, `applingRemote` guard), undo/redo checkpoints.

## Token mapping (dark / light)

| Token | Dark | Light |
|---|---|---|
| Canvas bg | `#101318` | `#FFFFFF` |
| Panel / card | `#292F3A` | `#E0E3EA` |
| Surface / elevated | `#202630` | `#F0F1F5` |
| Grid dot | `rgba(255,255,255,0.08)` | `#E0E3EA` |
| Grid line | `rgba(255,255,255,0.06)` | `#F0F1F5` |
| Node fill | `#292F3A` | `#FFFFFF` |
| Node border (default) | `#374151` | `#E0E3EA` |
| Node text | `#F9FAFB` | `#1F2937` |
| Muted / tag | `#9CA3AF` | `#6B7280` |
| Selection (brand outline) | `#2563EB` | `#2563EB` |
| Edge (neutral) | `#9CA3AF` | `#6B7280` |
| Edge (selected / brand) | `#2563EB` | `#2563EB` |

## Changes applied

### `src/styles.css`
- Redefined `[data-theme="dark"]` email-space tokens to `#101318` / `#292F3A` / `#202630`; light to `#FFFFFF` / `#E0E3EA` / `#F0F1F5`.
- Updated `--canvas-grid-dot`, `--canvas-grid-line`, `--node-bg`, `--node-border`, `--connector-color`, surface aliases (`surface-canvas/card/drawer`).
- `.canvas-layout` and `.canvas-layout.grid-lines` now read `--grid-size` (zoom-adaptive) instead of fixed `20px`.

### `src/screens/CanvasScreen.tsx`
- Drawing `draw()` loop (2D canvas):
  - `nodeBg` dark switched from `#1E1E1E` → `#292F3A`.
  - `strokeColor` default now falls back to token border (`#374151` dark / `#E0E3EA` light) when `node.stroke` is undefined.
  - Edge `strokeStyle` / `fillStyle` (arrowheads) switched from hardcoded `#2563EB` for all to neutral `#9CA3AF` / `#6B7280` unless selected (`#2563EB`).
  - Edge label fill matches selection/neutral split.
- Grid zoom-adaptive: `useEffect` on `zoom` writes `--grid-size = max(10, round(20/zoom))px` to `viewportRef.current` so dots/lines scale with zoom without altering world geometry or snap.
- Minimap colors updated to match new dark/light canvas surfaces (`#101318` / `#FFFFFF`, border `#292F3A` / `#E0E3EA`).
- Collaboration / snap / geometry untouched: `snapNode`, `clampNodeSize`, `resizeHandles`, `hitResizeHandle`, `useCollaboration` effects, `loadGraph`, `pushLocalGraph` all preserved.

### AppShell / inspector / tool rail (`styles.css`)
- Rail buttons (`.rail-btn`) and active state (`.rail-btn.active`) retain brand `#2563EB` accent; panel backgrounds align to new `#292F3A` / `#E0E3EA` tokens.
- Inspector inputs (`.inspector-input`) use token borders and focus `#2563EB`; fields kept at 10px/12px typography.
- Dock (`.precision-dock`) and headline spacing preserved; only background/border colors retokened.

## Verification notes
- No changes to `canvasGeometry.ts` (snap / resize / hit-testing).
- Collaboration echo-guard (`applingRemote` / `lastRemoteVersion`) and debounced push (400ms) untouched.
- Canvas culling (`vx0/vy1` margin) and viewport transform (`ctx.scale(zoom)`) unchanged — geometry intact.
- Grid adaptation is CSS-only (`background-size`) so zoom-to-cursor and pan remain pixel-accurate; no canvas redraw logic altered beyond color values.
