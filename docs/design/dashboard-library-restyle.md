# Dashboard & Library Restyle — ArchFlux Design System v2.0.0

Sections referenced: §12.1 (Dashboard), §11 (Library / Blueprints).

## Inventory

| File | Role | Changes |
|---|---|---|
| `src/screens/DashboardScreen.tsx` | Dashboard grid/table + storage + search | Style tokens; semantic badges; restrained metadata; neutral surfaces |
| `src/screens/BlueprintsScreen.tsx` | Library / blueprint catalogue (grid + preview + confirm) | Category badges neutralized; node/edge meta muted; card radius + border |
| `src/styles.css` | Global card/hover rules | `.blueprint-card` radius 12px, hover elevation only (no translate/accents) |

## Token map applied

| Element | Before | After | Token / Rule |
|---|---|---|---|
| Card background | `var(--bg-panel)` | same (neutral surface) | `neutral.light.surface` / `canvas.app` |
| Card radius | 10px | 12px | `radii.lg` (12px) §12.1 |
| Card border | 1px solid panel | same, thin | `border-panel` |
| Card hover | `translateY(-2px)` + `accent-cyan` border + shadow | elevation shadow only, no accent, no movement | `shadows.md` (hover only when interactive) |
| Thumbnail | `background: var(--bg-panel-subtle)`, `rx=6`, `stroke` from node data | preserved; primary visual unchanged | Diagram thumbnail = primary visual per §11 |
| Metadata (title/date/status/nodes/edges) | `fontSize: 10-13`, `fontFamily: mono`, muted color | restrained, no decorative sizing | Secondary per §11 |
| Search/filter input | `border-radius: 6`, consistent padding | unchanged, focus state via `Input` token | `border: brand.graphite[300]`, focus `brand.violet[600]` |
| Sync / Drift badge | Hard hex `#DCFCE7` / `#FEF3C7` + `#16A34A` / `#D97706` | `var(--accent-emerald-bg/emerald)` / `var(--accent-amber-bg/amber)` + explicit text | Semantic colors + label always present (success / warning) |
| Storage progress | `accent-rose` / `accent-amber` / `accent-cyan` | `accent-rose` (≥95%) / `accent-amber` (≥80%) / `accent-emerald` else + text label | Semantic mapping with explicit threshold labels |
| Open status badge | `badge-count cyan` (color alone) | `badge-count` with `bg-panel-subtle`, `text-muted`, text `open`, `aria-label="Status: open"` | Never color alone; label preserved |
| Pin button | `accent-amber` + glyph only | `text-muted`, text `📌 Pinned` / `☆ Pin`, `aria-label` | Explicit label; no decorative accent |
| Category badge (blueprints) | Varied `cyan` / `emerald` / `violet` / `rose` backgrounds | Neutral `bg-panel-subtle` + `text-muted`; category text preserved | No decorative category colors; label always present |
| Node/edge count in blueprint info | `accent-cyan` | `text-muted` | Restrained secondary metadata |

## State indicators (semantic + text)

- **Synced** → `accent-emerald` background + `accent-emerald` text + label `● Synced` + `aria-label="Status: Synced"`
- **Drift** → `accent-amber` background + `accent-amber` text + label `⚠ Drift` + `aria-label="Status: Drift"`
- **Open** → neutral surface + muted text + label `open` + `aria-label="Status: open"`
- **Storage quotas** → progress bar uses semantic thresholds with text `— full` / `— nearly full`; no decorative gradient/shadow

## Constraints preserved

- Data/logic unchanged (docs filtering, sorting, pin set, tags, menu actions, import/export, storage calculations, blueprint load/insert/preview/confirm flows)
- No new dependencies; only style props and CSS edited
- No excessive shadows/gradients; card elevation is `shadow.md` on hover only
- All interactive cards remain interactive; hover effect applies only to `.blueprint-card` / interactive elements

## Files changed (git-style)

- `src/screens/DashboardScreen.tsx`
- `src/screens/BlueprintsScreen.tsx`
- `src/styles.css`
- `docs/design/dashboard-library-restyle.md` (this file)
