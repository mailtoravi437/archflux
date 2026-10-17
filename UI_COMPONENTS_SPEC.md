# ArchFlux UI Components Specification — Shell Chrome, Shapes, Icons & Annotation

> **Version:** 1.0.0 | **Last Updated:** 2026-10-16 | **Status:** ✅ Current
> **Part of:** [Master Spec](SPEC.md) | **Maintenance:** [Protocol](SPEC.md#spec-maintenance-protocol)
> **Companion to:** [UI/UX Spec](UI_UX_SPEC.md) (design intent) · [Frontend Spec](FRONTEND_SPEC.md) (implementation) · [Backend Spec](BACKEND_SPEC.md) (API contracts)
> **Governing contract:** [Productization Spec v3.0.0](PRODUCTIZATION_SPEC.md) — honest labeling applies to every surface below.

This document is the **component-level** specification for the editor chrome: the left **Sidebar** (tool rail),
the **Topbar** (command header), the **Shapes** surfaces (tool-palette shapes, shape library, node shapes),
the **Icons** registry, and the **Annotate** surfaces (connector + note + review pins). It is deliberately
more granular than [UI_UX_SPEC.md](UI_UX_SPEC.md) §10 (Navigation & Shell): it fixes geometry, tokens,
states, keyboard behavior, and test hooks so the surfaces can be built, reviewed, and tested without guessing.

## Legend and conventions

| Mark | Meaning                                       |
| ---- | --------------------------------------------- |
| ✅   | Shipped in the current codebase               |
| 🚧   | In this release (in progress)                 |
| 📋   | Planned (not started)                         |
| 🆕   | Proposed by this revision; needs confirmation |
| ❓   | Status unverified; check before relying on it |

- **Requirement language:** MUST / SHOULD / MAY per RFC 2119.
- **Requirement IDs:** `<AREA>-R<n>`. Areas: `SID` (sidebar), `TOP` (topbar), `SHP` (shapes), `ICO` (icons), `ANN` (annotate), `DCK` (right dock), `GEN` (cross-cutting). IDs are stable; retired IDs are never reused.
- **Token rule:** components reference semantic tokens only (`--bg-panel`, `--accent-cyan`, `--border-panel`, `--text-main`, `--text-muted`, `--text-dim`, `--panel-shadow`, …). Hardcoded hex appears only in `styles.css` token definitions, never in component markup. (Matches [UI_UX_SPEC](UI_UX_SPEC.md) §0.2.)
- **Source files:** `src/components/AppShell.tsx` (topbar), `src/components/ToolPalette.tsx` (sidebar), `src/screens/CanvasScreen.tsx` (library drawer, right dock, annotation composer), `src/iconRegistry.tsx` + `public/icons/**` (icons), `src/styles.css` (all chrome CSS).

---

## 1. Sidebar — Left Vertical Tool Rail

**File:** `src/components/ToolPalette.tsx` · **CSS:** `.vertical-tool-rail`, `.rail-*` (styles.css:881–957) · **Status:** ✅ Shipped

A floating, scrollable toolbox pinned to the top-left of the canvas. It is the primary way to choose the active
canvas tool and to open the shape library. It is **canvas-route only** and is hidden in focus/presenting mode.

### 1.1 Anatomy

```
┌─ .vertical-tool-rail  (118px wide) ─┐
│  [🗄 Shapes]              ← library toggle │
│  ─────────────── divider ────────── │
│  NAVIGATE                           │
│  [▶ Select] [✋ Pan]      ← 2-col grid │
│  ─────────────── divider ────────── │
│  SHAPES                             │
│  [◻ Service] [⇥ Gateway]             │
│  [▤ Database] [≡ Queue]              │
│  ─────────────── divider ────────── │
│  CREATE                             │
│  [✏ Draw] [T Text]                    │
│  ─────────────── divider ────────── │
│  ANNOTATE                           │
│  [⛓ Connect] [💬 Note]               │
└─────────────────────────────────────┘
```

### 1.2 Geometry and tokens ✅

| Property        | Value                                                |
| --------------- | ---------------------------------------------------- |
| Position        | absolute, `top: 16px`, `left: 12px`                  |
| Width           | `118px` (fixed)                                      |
| Padding         | `10px 8px`                                           |
| Radius          | `12px`                                               |
| Background      | `var(--bg-panel)`                                    |
| Border          | `1px solid var(--border-panel)`                      |
| Shadow          | `var(--panel-shadow)`                                |
| Max height      | `calc(100% - 32px)`, `overflow-y: auto`              |
| Z-index         | `40` (below library drawer `41`)                     |
| Group grid      | `.rail-grid` = 2 columns, `4px` gap                  |
| Button radius   | `8px`                                                |
| Icon size       | 20×20 in grid buttons; 16×16 in the library toggle   |
| Label           | `.rail-label` 10–11px, `--mono-font`, weight 600     |
| Group heading   | `.rail-group-label` 9px, `--mono-font`, weight 700, `--text-dim` |

### 1.3 Groups and item inventory ✅

Groups render in this fixed order. Each item maps to a `CanvasTool` (see `TOOLS` in `CanvasScreen.tsx:23`).

| Group      | Item      | Label    | Icon                          | Shortcut | Lockable |
| ---------- | --------- | -------- | ----------------------------- | -------- | -------- |
| —          | Library   | Shapes   | `/icons/general/database.svg` | `L`      | n/a      |
| Navigate   | Select    | Select   | `/icons/tools/select.svg`     | `V`      | no       |
| Navigate   | Pan       | Pan      | `/icons/tools/pan.svg`        | `H`      | no       |
| Shapes     | Service   | Service  | `/icons/tools/service.svg`    | `S`      | yes      |
| Shapes     | Gateway   | Gateway  | `/icons/tools/gateway.svg`    | `G`      | yes      |
| Shapes     | Database  | Database | `/icons/tools/database.svg`   | `D`      | yes      |
| Shapes     | Stream    | Queue    | `/icons/tools/stream.svg`     | `Q`      | yes      |
| Create     | Draw      | Draw     | `/icons/tools/draw.svg`       | `P`      | no       |
| Create     | Text      | Text     | `/icons/tools/text.svg`       | `T`      | no       |
| Annotate   | Connector | Connect  | `/icons/tools/connector.svg`  | `C`      | yes      |
| Annotate   | Comment   | Note     | `/icons/tools/comment.svg`    | `N`      | yes      |

- `SID-R1` The rail MUST expose `role="toolbar"` with `aria-label="Canvas tools"`; every button MUST have `title` and `aria-label`.
- `SID-R2` Grid buttons MUST carry `data-tool="<toolId>"` (tests depend on it; see `canvas.accessibility.test.tsx`, `canvas.test.tsx`).
- `SID-R3` Icons MUST have empty `alt` (`alt=""`) because the adjacent `.rail-label` supplies the accessible name at the group level; the button's `aria-label` is authoritative.
- `SID-R4` The library toggle MUST reflect open state via `.active` and MUST stay visually distinct from tool selection.
- `SID-R5` The active tool MUST be marked with `.active` (accent glow), and MUST NOT be conveyed by color alone — the label + lock glyph carry the state too.

### 1.4 Tool locking ✅

Re-clicking an already-active **lockable** tool toggles a persistent lock (`lockedTool`), declared in `LOCKABLE = ['service','gateway','db','stream','connector','comment']` (`CanvasScreen.tsx:36`).

- `SID-R6` When a lockable tool is locked, the rail button MUST show `.rail-lock` (lock glyph, top-right, 10×10) with `aria-label="locked"`.
- `SID-R7` Locking MUST push a toast ("… tool locked — re-click or Esc to unlock"); unlocking MUST push the inverse toast.
- `SID-R8` Selecting any other tool MUST clear the lock (`setLockedTool(null)`).
- `SID-R9` `Esc` on the canvas MUST unlock the active tool and cancel any pending connector source.

### 1.5 States

| State    | Behavior                                                              |
| -------- | --------------------------------------------------------------------- |
| Default  | Transparent button; muted label/icon on `--bg-panel`                  |
| Hover    | `--bg-panel-subtle` bg, `--border-panel` border, `--text-main`        |
| Active   | `--accent-cyan-glow` bg, `--accent-cyan` border + text                |
| Locked   | Active + `.rail-lock` glyph in the button's top-right corner          |
| Focus    | Visible `focus-visible` ring (≥3:1 against `--bg-panel`) — GEN-R3      |
| Disabled | Not applicable (all tools always enabled on the canvas route)         |
| Presenting | Rail hidden (`.workspace-body.presenting` display:none; styles.css:1564) |

### 1.6 Responsive

- `SID-R10` At `<600px` the rail MUST collapse to icon-only: labels, group headings, and dividers hidden; buttons square (styles.css:1797–1815). The `data-tool` + `aria-label` contract still holds so tests and screen readers are unaffected.
- `SID-R11` The rail MUST remain operable without horizontal page scroll at widths ≥ 320px.
- `SID-R12` In focus/presenting mode the rail is removed from the DOM flow (CSS-hidden), not merely dimmed.

### 1.7 Keyboard map (canvas)

| Keys                | Action                                            |
| ------------------- | ------------------------------------------------- |
| `V` / `H`           | Select / Pan                                      |
| `P` / `T`           | Draw (freehand, stays active) / Text              |
| `S G D Q`           | Service / Gateway / Database / Queue (lockable)   |
| `C`                 | Connector (lockable)                              |
| `N`                 | Note (lockable)                                   |
| `L`                 | Toggle shape library                              |
| `Esc`               | Clear selection / cancel connector / unlock tool  |

- `SID-R13` Single-key shortcuts MUST NOT fire while a text input, textarea, select, or contenteditable holds focus (`AppShell.tsx:313`).
- `SID-R14` Shortcuts MUST be rebindable in Settings with clash detection (see [UI_UX_SPEC](UI_UX_SPEC.md) §9.1).

### 1.8 Acceptance criteria

- **Given** the canvas route, **when** the rail renders, **then** every `data-tool` button exposes a non-empty accessible name.
- **Given** the Service tool selected, **when** the user clicks it again, **then** a lock glyph appears and a lock toast fires; **when** the user clicks Pan, **then** the lock clears.
- **Given** a 360px viewport, **when** the canvas loads, **then** the rail shows icons only with no horizontal scroll.

**Tests:** `canvas.accessibility.test.tsx` (toolbar roles, tool activation), `canvas.test.tsx` (rail icons render, labels list, connect-hint), `ux-release.test.ts` (shortcuts).

---

## 2. Topbar — Command Header

**File:** `src/components/AppShell.tsx` (`.top-header`, lines 352–520) · **CSS:** styles.css:276–466 · **Status:** ✅ Shipped

A single row (48px) that carries brand, document identity, health signals, primary navigation, and global actions.
It uses the scroll → wrap → min-width cascade at narrow widths and never causes horizontal page scroll.

### 2.1 Anatomy (left → right)

| Region            | Contents                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Brand group**   | `.brand-logo` (hex `⚡` badge → canvas), `.brand-name` "ArchFlux" + dirty dot `•`, `.brand-tagline` "Living System Canvas"                 |
| **Doc breadcrumb**| Diagrams-count button `🗂 {n}` (opens docs manager), `repo/`, editable `.doc-title-input` (max 80), `[git:main]` + dirty dot              |
| **Source badge**  | `HonestyBadge` — source mode label (Local / Cloud document / Git-managed / Connected source), `data-testid="source-mode-badge"`          |
| **Freshness pill**| `.freshness-pill` with `.status-pulse-dot`; tone class `fresh` / `drift` / `syncing`; click → Living Sync                                  |
| **Linter chip**   | `.btn.linter-chip` `🔍 {n}`; warn color when `n>0` (+ `.pulse` micro-animation), success color at 0; click → canvas                        |
| **Screen tabs**   | `.screen-tabs` nav: Library, Precision Canvas, Living Sync (drift badge), Reviews & Merge (unresolved-thread badge), Blueprints, Settings (warn `!` when guest) |
| **Header actions**| `⌘K` palette, `?` shortcuts, (canvas only) undo `↩` / redo `↪` with depth tooltips, theme `<select>`, `⛶ Focus`, (server docs) `💾 Save vN`, (on conflict) `⚠ Conflict — resolve`, `Export .arch`, account menu |

### 2.2 Geometry and tokens ✅

| Property        | Value                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Height          | `48px` (fixed); wraps to `height:auto` under 900px (styles.css:1590)     |
| Padding         | `0 12px`                                                                |
| Background      | `var(--bg-panel)`; border-bottom `1px solid var(--border-panel)`        |
| Shadow          | `0 1px 4px rgba(0,0,0,0.1)`                                             |
| Z-index         | `60` (above canvas chrome `40–41`, below toasts/dialogs `90–95`)        |
| Brand hex       | 26×26, radius `6px`, `#2563EB`, white bold glyph                        |
| Brand name      | 15px, weight 800, letter-spacing `-0.5px`                               |
| Tagline         | 8px, `--mono-font`, uppercase, `--accent-cyan`                          |
| Breadcrumb      | `--mono-font` 11px, `--bg-panel-subtle` chip, radius 6                  |
| Freshness pill  | `--mono-font` 10px, radius 16px, `3px 8px` padding                      |
| Screen tabs     | `--bg-workspace` container, radius 6; active tab `--bg-panel` + accent  |

- `TOP-R1` Every header control MUST expose `title` **and** `aria-label`; controls that navigate use `role="button"` + keyboard handlers (`Enter`/`Space`).
- `TOP-R2` Flex children MUST keep `min-width: 0` so the header never overflows (styles.css:299–301).
- `TOP-R3` The active route MUST be marked with `.active` **and** `aria-current` for the Settings tab; tab badges MUST combine a count/glyph with accessible text.
- `TOP-R4` The dirty indicator MUST appear as a text-adjacent dot and MUST have a `title` explaining "modified in this session (auto-saved locally)".

### 2.3 Screen tabs (primary navigation)

| Tab label        | Path                  | Icon                              | Badge                          |
| ---------------- | --------------------- | --------------------------------- | ------------------------------ |
| Library          | `/dashboard`          | `/icons/general/library.svg`      | —                              |
| Precision Canvas | `/canvas`             | `/icons/tools/select.svg`         | —                              |
| Living Sync      | `/living`             | `/icons/general/sync.svg`         | `warn` drift count when `>0`   |
| Reviews & Merge  | `/reviews`            | `/icons/tools/comment.svg`        | `cyan` unresolved threads      |
| Blueprints       | `/blueprints`         | `/icons/general/blueprint.svg`    | —                              |
| Settings         | `/settings/general`   | `/icons/tools/settings.svg`       | `warn` `!` when not signed in  |

- `TOP-R5` Tabs MUST be `NavLink`s (hash router) so deep links and the back button work.
- `TOP-R6` The Reviews & Merge entry MUST open the Merge tab when navigated from the `⌘G` shortcut (`AppShell.tsx:319`, `209`).
- `TOP-R7` The tab rail MUST scroll horizontally (thin scrollbar) rather than wrap mid-row on compact widths.

### 2.4 Header actions

| Control             | Visibility        | Behavior                                                        |
| ------------------- | ----------------- | --------------------------------------------------------------- |
| `⌘K` palette        | always            | Opens command palette (focus-trapped; fuzzy list)               |
| `?` shortcuts       | always            | Opens shortcuts dialog (focus-trapped)                          |
| Undo `↩` / Redo `↪` | canvas only       | Depth tooltips "Undo (n)"; disabled at stack boundaries         |
| Theme `<select>`    | always            | Light / Blueprint / Dark; applies without reload and persists   |
| `⛶ Focus`           | always            | Enters presenting mode (hides chrome, requests fullscreen)       |
| `💾 Save vN`        | server docs only  | Saves active doc; shows conflict affordance on stale writes      |
| `⚠ Conflict`        | when conflict     | Opens `ConflictDialog` (compare / keep mine / keep remote / fork)|
| `Export .arch`      | always            | Downloads validated `.arch` payload                              |
| Account menu        | always            | Avatar/initials + presence dot; Profile & Team, Sign in/out      |

- `TOP-R8` Undo/redo MUST be absent (not disabled) on non-canvas routes, and history is retained for return ([UI_UX_SPEC](UI_UX_SPEC.md) NAV-R9).
- `TOP-R9` The account button MUST be `aria-haspopup="menu"` + `aria-expanded`; the menu MUST be `role="menu"` with `menuitem` children and close on outside click. 🆕 `Esc` SHOULD also close it and restore focus to the trigger (current global `Esc` closes the palette/shortcuts/docs but not the account menu — gap).
- `TOP-R10` The presence dot MUST be paired with accessible text ("Signed in" / "Guest"); never color alone (NAV-R7).
- `TOP-R11` The source-mode `HonestyBadge` MUST render exactly one mode and MUST NOT imply live connectivity when the mode is `local` (local-first honesty).

### 2.5 States

| State          | Behavior                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| Guest          | Settings badge `!`, account dot amber, "Guest mode" menu label            |
| Dirty          | `•` next to name and `[git:main]`; Save shows `•`                         |
| Sync drift     | Freshness pill `drift` (amber); Living Sync tab badge count                |
| Saving/Conflict| `⚠ Conflict — resolve` appears; Save disabled-state explained via tooltip |
| Offline        | Freshness pill reflects last state; server actions disabled with reason   |
| Focus mode     | Header hidden; "FOCUS MODE — Esc to exit" pill shown                      |

### 2.6 Responsive cascade

- `TOP-R12` Regular (≥900px): single 48px row, all regions visible.
- `TOP-R13` Compact (600–899px): header wraps (`height:auto`, `flex-wrap:wrap`); tabs wrap to a second row.
- `TOP-R14` Phone (<600px): brand tagline hidden; tab text may collapse to icons; freshness pill and linter chip MAY be hidden but their state MUST remain reachable from Living Sync / canvas (styles.css:1792–1793).
- `TOP-R15` No header variant may cause horizontal page scroll at ≥320px.

### 2.7 Acceptance criteria

- **Given** the canvas route, **when** the header renders, **then** undo/redo are present; **given** the dashboard route, **then** they are absent.
- **Given** a guest session, **when** the header renders, **then** the Settings tab shows the `!` badge and the account dot is amber with text "Guest".
- **Given** 360px width, **when** the header renders, **then** there is no horizontal page scrollbar.

**Tests:** `appshell.test.tsx`, `auth-session.test.tsx`, `honesty.test.tsx`, `canvas.test.tsx` (undo scoping), `ux-release.test.ts`.

---

## 3. Shapes

"Shapes" spans three related surfaces: **(a) the tool-rail shape tools**, **(b) the Shape Library drawer**, and **(c) the
node shapes** drawn on the canvas. Providers are metadata, never the primary axis ([UI_UX_SPEC](UI_UX_SPEC.md) Design Principle 1).

### 3.1 Shape library drawer ✅

**File:** `CanvasScreen.tsx:2209–2303` · **CSS:** `.library-drawer`, `.lib-*` (styles.css:959–1026) · **Status:** ✅ Shipped

Floating panel opened from the rail's `Shapes` toggle or `L`.

| Property   | Value                                                          |
| ---------- | -------------------------------------------------------------- |
| Position   | absolute, `top: 16px`, `left: 142px` (clears the 118px rail)    |
| Width      | `320px`                                                        |
| Max height | `calc(100% - 32px)`                                            |
| Radius     | `12px`; bg `--bg-panel`; border `--border-panel`               |
| Z-index    | `41`                                                           |
| Grid       | `.lib-grid` = 3 columns, 6px gap, scrolls at `max-height: 300px`|

**Header:** database icon + "Shape Library" + `badge-count cyan {n}` + `Close ✕`.

**Body (top → bottom):** search input → recently-used strip (when non-empty) → category pills → shape grid → empty state → footer hint.

- `SHP-R1` Search MUST match label, tag, provider, and category, case-insensitively, and update live ([UI_UX_SPEC](UI_UX_SPEC.md) LIB-R1).
- `SHP-R2` Category pills MUST show live counts reflecting the current search ([UI_UX_SPEC](UI_UX_SPEC.md) LIB-R2). Categories: `all`, `general`, `compute`, `storage`, `database`, `network`, `messaging`, `observability`; pills use `role="tab"` + `aria-selected`.
- `SHP-R3` The provider scope chosen at onboarding MUST filter the library; empty scope = all shapes (LIB-R3).
- `SHP-R4` Clicking a shape places it at the viewport center; dragging a shape (`text/archflux-shape` payload) places it at the drop point ([UI_UX_SPEC](UI_UX_SPEC.md) LIB-R4).
- `SHP-R5` The recently-used strip shows the last 8 placed shapes newest-first, persisted in `archflux:recent-shapes:v1`; hidden until ≥1 placement; stale ids dropped silently (LIB-R6–R8).
- `SHP-R6` The empty search state MUST show "No shapes match …" plus a **Clear** action that resets query + category (LIB-R5).
- `SHP-R7` Every shape tile MUST expose `title` (`label — tag. Click to place, or drag onto canvas.`); icon images are decorative (`alt=""` + `aria-hidden`), the label carries the name.
- `SHP-R8` The drawer is a `role="dialog"` with `aria-label="Shape library"`; `Esc` MUST close it and return focus to the rail toggle.
- `SHP-R9` Footer hint MUST state placement semantics: "Click places at view center · drag places precisely".

### 3.2 Shape tile anatomy

```
┌──────────────┐
│   [icon 28]  │  ← iconSrc (SVG) or emoji glyph fallback
│    EC2       │  ← .lib-shape-label (11px, weight 600, ellipsis)
│     AWS      │  ← .lib-shape-tag (9px, --mono-font, --text-dim)
└──────────────┘
  hover: --accent-cyan border + text; cursor grab → grabbing
```

- `SHP-R10` Tiles MUST truncate long labels with ellipsis and expose the full text via `title`.
- `SHP-R11` Tiles MUST be keyboard focusable and place on `Enter`/`Space`.

### 3.3 Node shapes (canvas) ✅

Node shape is a per-node property edited in the Inspector (`CanvasScreen.tsx:2452`). Rendering is deterministic from the node payload ([FRONTEND_SPEC](FRONTEND_SPEC.md) canvas interactions).

- `SHP-R12` Supported node shapes MUST cover at least service box, gateway, cylinder (database), and stream/queue; the shape control lists them with text labels, not color alone.
- `SHP-R13` Fill/border/stroke-width controls MUST use `.Swatches` with an explicit "Automatic fill" (null) option for fill.
- `SHP-R14` All shape edits MUST funnel through `checkpoint` + `updateNode`/`updateEdge` so each edit is one history entry (CAN-R24).
- `SHP-R15` Icon choice per node MUST come from the icon registry (§4); unknown ids render the DefaultIcon fallback, never blank.

### 3.4 Shapes states

| State               | Behavior                                                            |
| ------------------- | ------------------------------------------------------------------- |
| Drawer closed       | Rail toggle `.active` off; drawer absent from DOM                    |
| Empty search        | "No shapes match …" + Clear                                         |
| No recents yet      | Recents strip hidden entirely                                       |
| Placing (click)     | Node added at view center and selected                               |
| Placing (drag)      | Drag ghost; on drop node added at pointer and selected               |
| Storage unavailable | Recents read guarded; drawer still renders (GEN-R6)                  |

### 3.5 Acceptance criteria

- **Given** 9 distinct placements, **when** the drawer opens, **then** exactly 8 recents show, newest-first.
- **Given** the search "redis", **when** typed, **then** only matching tiles show and the `All` pill count equals the visible tile count.
- **Given** an empty result set, **when** Clear is clicked, **then** the query resets and all shapes return.

**Tests:** unit for recency math + filter counts; E2E for place-by-click and place-by-drag; `canvas.test.tsx` for library toggling.

---

## 4. Icons

**Files:** `src/iconRegistry.tsx`, `public/icons/**` · **Status:** ✅ Shipped

Icons are external SVG files referenced by a kebab-case name registry and rendered as `<img>` (or inline SVG for
fallbacks). This keeps vendor icon sets (AWS/GCP/Azure) independent of the JS bundle.

### 4.1 Icon sets

| Set         | Directory              | Examples                                              | Used by                      |
| ----------- | ---------------------- | ----------------------------------------------------- | ---------------------------- |
| `general`   | `public/icons/general` | `library`, `sync`, `blueprint`, `database`, `gateway` | Topbar tabs, drawer headings |
| `tools`     | `public/icons/tools`   | `select`, `pan`, `draw`, `text`, `connector`, `comment`, `lock`, `settings` | Sidebar rail, topbar         |
| `aws`       | `public/icons/aws`     | `ec2`, `lambda`, `ecs`, `rds`, `s3`, `sqs`            | Shape library tiles          |
| `gcp`       | `public/icons/gcp`     | `compute`, `gke`, `sql`, `storage`, `bigquery`        | Shape library tiles          |
| `azure`     | `public/icons/azure`   | `vm`, `aks`, `functions`, `sql`, `cosmosdb`           | Shape library tiles          |
| `data`      | `public/icons/data`    | `kafka`, `redis`, `postgres`, `mongo`, `elastic`      | Shape library tiles          |
| `node-icons`| `public/icons/node-icons` | `box`, `gateway`, `database`, `stream`, `lock`, `k8s`, `globe` | Node fallback glyphs   |

Total: 68 SVG files today. `public/icons/tools/more.svg` exists for overflow affordances.

### 4.2 Registry contract ✅

- `ICO-R1` The registry (`.iconPaths`) MUST map a stable kebab-case name to a public URL (`/icons/<set>/<name>.svg`).
- `ICO-R2` `getIcon(name)` MUST return a memoized component (`iconCache`) and `undefined` for unknown names; `hasIcon(name)` MUST report membership.
- `ICO-R3` `getIconComponent(name)` MUST return a fallback grid glyph (`DefaultIcon`) when the name is unknown — never render nothing.
- `ICO-R4` Registry icon components MUST render `<img alt="">` with default 24×24 dimensions, overridable via `style`.
- `ICO-R5` `preloadIcons()` MUST warm the browser cache at startup; canvas readiness MUST wait for `data-icons-ready` before visual assertions ([UI_UX_SPEC](UI_UX_SPEC.md) §0.9).

### 4.3 Naming and sizing conventions

- `ICO-R6` Names MUST be lowercase kebab-case, `<provider>-<resource>` for vendor sets (`aws-rds`, `gcp-gke`) and `<role>` for tools (`select`, `connector`).
- `ICO-R7` Standard sizes: 16px (topbar tabs, headings), 20px (rail grid buttons), 18px (recents), 24px (registry default), 28px (library tiles). Any new size MUST be a token on the 4px grid.
- `ICO-R8` Icons MUST be monochrome-safe: tool/general icons use `currentColor` where inline and invert in dark mode via CSS filter (styles.css:1576–1582); vendor icons keep brand color.

### 4.4 Accessibility

- `ICO-R9` Decorative icons MUST use `alt=""` (optionally `aria-hidden="true"`); the adjacent label or button `aria-label` MUST carry meaning.
- `ICO-R10` Icons MUST NOT be the sole indicator of state (pair with text/label/`aria-label`).
- `ICO-R11` Icons MUST meet ≥3:1 non-text contrast against their surface in every theme ([UI_UX_SPEC](UI_UX_SPEC.md) §11.1).

### 4.5 Acceptance criteria

- **Given** an unknown icon name, **when** rendered, **then** the DefaultIcon grid shows (no blank, no crash).
- **Given** dark theme, **when** tool/general icons render, **then** they invert to remain legible.
- **Given** a canvas load, **when** tests wait on `data-icons-ready`, **then** all placed node icons have resolved.

**Tests:** `canvas.test.tsx` (rail icons present, all have `src`), visual-regression suite (fixed theme/viewport).

---

## 5. Annotate

Annotation covers the two rail tools — **Connector** and **Note** — plus the review-pin composer they feed.
Annotations are the human layer over the diagram: connecting nodes and pinning review comments.

### 5.1 Connector ✅

Rail item: **Connect** (`connector` tool, `C`, lockable) · **Files:** `CanvasScreen.tsx` (`pendingFrom`, `connectNodes`).

Flow: click A (source) → click B (target) creates an edge. Clicking source then empty canvas creates a dangling route to a free point.

- `ANN-R1` Starting a connection MUST set `pendingFrom` and render the `.connect-hint` banner: "◉ Connecting from **{label}** — click a target node · Esc to cancel" with `role="status"` and an `Esc` button.
- `ANN-R2` `Esc` (or the banner's button) MUST cancel the pending connection without creating an edge.
- `ANN-R3` Clicking the same node twice, or clicking empty canvas, MUST NOT create a self-edge; empty-canvas clicks create a dangling edge.
- `ANN-R4` The connector tool is lockable (SID-R6): locked mode lets the user draw multiple connections without re-selecting.
- `ANN-R5` Newly created edges MUST be undoable as one history entry and selectable, exposing the Route Inspector.
- `ANN-R6` Edge labels/colors/protocol/line-style/arrow controls MUST update via `updateEdge` under `checkpoint` (route inspector, `CanvasScreen.tsx:2493–2545`).

### 5.2 Note / Comment ✅

Rail item: **Note** (`comment` tool, `N`, lockable) · **File:** `CanvasScreen.tsx:2783–2808`.

Flow: select Note → click a node or empty canvas → a composer appears.

- `ANN-R7` Clicking a node with the Note tool MUST open the composer anchored to that node ("Pin review on [{label}]"); clicking empty canvas pins to "Canvas area" (`__canvas`).
- `ANN-R8` The composer MUST be a focus-trapped `role="dialog"` (`aria-label="Comment on {label}"`) with an autofocused textarea, `aria-label="Review comment text"`.
- `ANN-R9` **Post pin** MUST be disabled until the trimmed comment is non-empty.
- `ANN-R10` Cancel / `Esc` MUST close the composer with no side effects; posting MUST call `addThread(nodeId, text, label)` and clear the composer.
- `ANN-R11` Posted pins MUST appear as threads in Reviews & Merge; the Reviews tab MUST show an unresolved-thread count badge in the topbar.
- `ANN-R12` Threads MUST support resolve/reopen with resolved items collapsed but reopenable ([UI_UX_SPEC](UI_UX_SPEC.md) REV-R5).
- `ANN-R13` Freehand **Draw** (`P`) creates strokes (not threaded) and persists as `strokes`; it is a Create tool, not an annotation.

### 5.3 Annotation states

| State                | Behavior                                                      |
| -------------------- | ------------------------------------------------------------- |
| Idle                 | No hint, no composer                                          |
| Connecting (pending) | `.connect-hint` banner visible; target hover highlights       |
| Composing note       | Focus-trapped composer anchored bottom-center                 |
| Posted               | Thread appears in Reviews; unresolved badge increments        |
| Cancelled            | Hint/composer removed; tool unlocked via `Esc`                |

### 5.4 Acceptance criteria

- **Given** the connector tool active, **when** the user clicks node A, **then** the connect hint names A; **when** the user presses `Esc`, **then** no edge is created.
- **Given** an empty comment, **when** the composer renders, **then** Post pin is disabled; **when** text is entered, **then** it enables and creates a thread.
- **Given** a posted pin, **when** the user opens Reviews & Merge, **then** the thread is listed and the topbar badge reflects the unresolved count.

**Tests:** `canvas.test.tsx` (connect-hint appears/clears), `canvas.accessibility.test.tsx` (connector button), `collaboration.test.ts` (threads).

---

## 6. Right Utility Dock (supporting chrome)

**File:** `CanvasScreen.tsx:2305–2830` · **CSS:** `.linter-inspector`, `.utility-*` (styles.css:176–217, 1076) · **Status:** ✅ Shipped

Included here because the Annotate and Shapes surfaces hand off to it (Inspector shows the selected shape/edge; Linter shows issues).

| Property  | Value                                                          |
| --------- | -------------------------------------------------------------- |
| Position  | absolute, `top: 20px`, `right: 20px`                           |
| Width     | `320px` (280px compact, styles.css:1589)                       |
| Radius    | `12px`; bg `--bg-panel`; border `--border-panel`               |
| Tabs      | `.utility-tabbar` `role="tablist"`: **Inspector**, **Linter** (+count), **Collaborators** |

- `DCK-R1` Tabs MUST be `role="tab"` with `aria-selected`; panels use `role="tabpanel"` with matching labels.
- `DCK-R2` Selecting anything on canvas MUST auto-switch to **Inspector**.
- `DCK-R3` Scroll position per tab MUST be preserved across switches (`dockScrollRef`).
- `DCK-R4` The dock MUST collapse via the collapse button and reopen via the `dock-reopen` FAB (`data-testid="dock-reopen"`); collapse state persists per session.
- `DCK-R5` Linter results MUST link to nodes (selecting a result pans to and selects the node).
- `DCK-R6` The Inspector MUST render shape controls (fill/border/icon/width/shape) for nodes, route controls for edges, and text-style controls for text — all one undo step each (SHP-R14).
- `DCK-R7` On phones the dock becomes a bottom sheet with the FAB; on `<600px` it is closed by default (`dockOpen` init, `CanvasScreen.tsx:431`).

**Tests:** `canvas.test.tsx` (dock reopen, inspector focus), `canvas.accessibility.test.tsx`.

---

## 7. Cross-cutting requirements

### 7.1 Tokens (GEN)

- `GEN-R1` All chrome colors MUST resolve from semantic tokens; themes: `light`, `blueprint`, `dark` ([FRONTEND_SPEC](FRONTEND_SPEC.md) Theming). Theme changes MUST apply without reload and persist per browser.
- `GEN-R2` Geometry (radius, spacing) MUST sit on the 4px grid; radii use 6/8/12.

### 7.2 Accessibility (target WCAG 2.2 AA)

- `GEN-R3` Visible focus indicators ≥3:1 in all themes; no keyboard traps.
- `GEN-R4` Pointer targets ≥24×24 CSS px (rail grid buttons, tab buttons, icon buttons).
- `GEN-R5` Status (tool active, lock, drift, guest, source mode) MUST NOT rely on color alone.
- `GEN-R6` All `localStorage` reads for chrome (recents, minimap toggle, dock collapse, theme) MUST be guarded against quota/disabled/corrupt values and versioned.

### 7.3 Motion

- `GEN-R7` Rail/tab hover transitions ≤150ms; no looping animation except defined indicators (`.status-pulse-dot`, progress bars).
- `GEN-R8` `prefers-reduced-motion: reduce` MUST disable the linter-chip pulse and status-dot glow animation.

### 7.4 Z-index layers

| Layer                     | Z    |
| ------------------------- | ---- |
| Canvas chrome (rail)      | 40   |
| Library drawer            | 41   |
| Top header                | 60   |
| Focus-mode pill           | 80   |
| Popovers / account menu   | 90–91|
| Docs manager / palette / shortcuts | 92–95 |
| Toasts                    | top  |

- `GEN-R9` New chrome MUST claim an unused layer and MUST NOT exceed the toast layer.

### 7.5 Test hooks

- `GEN-R10` Interactive chrome MUST carry stable `data-testid` / `data-tool` / `data-testid="source-mode-badge"` hooks where tests reference them.
- `GEN-R11` Canvas readiness MUST gate on `data-icons-ready` and pixel quiescence before visual assertions.

---

## 8. Implementation ledger

| #  | Item                    | Primary file                         | Status | Reqs                    |
| -- | ----------------------- | ------------------------------------ | ------ | ----------------------- |
| 1  | Left tool rail          | `ToolPalette.tsx`, `styles.css`      | ✅     | SID-R1–R14              |
| 2  | Tool locking + toast    | `ToolPalette.tsx`, `CanvasScreen.tsx`| ✅     | SID-R6–R9               |
| 3  | Topbar shell + tabs     | `AppShell.tsx`                       | ✅     | TOP-R1–R15              |
| 4  | Source-mode badge       | `HonestyBadge.tsx`, `AppShell.tsx`   | ✅     | TOP-R11                 |
| 5  | Shape library drawer    | `CanvasScreen.tsx`                   | ✅     | SHP-R1–R11              |
| 6  | Node shapes + inspector | `CanvasScreen.tsx`                   | ✅     | SHP-R12–R15, DCK-R6     |
| 7  | Icon registry + sets    | `iconRegistry.tsx`, `public/icons`   | ✅     | ICO-R1–R11              |
| 8  | Connector annotation    | `CanvasScreen.tsx`                   | ✅     | ANN-R1–R6               |
| 9  | Note / review pins      | `CanvasScreen.tsx`, `ReviewsScreen`  | ✅     | ANN-R7–R12              |
| 10 | Right utility dock      | `CanvasScreen.tsx`                   | ✅     | DCK-R1–R7               |
| 11 | Rail node/edge accessible list | `CanvasScreen.tsx`            | 📋     | [UI_UX_SPEC](UI_UX_SPEC.md) CAN-R26 |
| 12 | Zoom-to-fit control in rail | `ToolPalette.tsx`                | 📋     | 🆕                      |

**Definition of done (per item):** requirements implemented; states in §1.5 / §2.5 / §3.4 / §5.3 covered; unit +
E2E per referenced suite; a11y checklist (§7.2) passed; any new persistence registered in [UI_UX_SPEC](UI_UX_SPEC.md) §0.7;
this spec and [SPEC.md](SPEC.md) work plans updated; lint + typecheck + gates green.

---

## 9. Acceptance summary (happy paths)

| # | Given → When → Then                                                                    |
| - | -------------------------------------------------------------------------------------- |
| 1 | Canvas route → rail renders → all `data-tool` buttons have accessible names             |
| 2 | Service tool → click twice → lock glyph + toast; click Pan → lock clears                |
| 3 | 360px width → canvas loads → icon-only rail, no horizontal scroll                       |
| 4 | Canvas route → topbar renders → undo/redo present; dashboard route → absent             |
| 5 | Guest session → topbar renders → Settings `!` badge + amber account dot with text        |
| 6 | 9 placements → drawer opens → exactly 8 recents, newest-first                           |
| 7 | Search "redis" → results filter → `All` count equals visible tiles                      |
| 8 | Unknown icon name → renders → DefaultIcon grid (no blank/crash)                         |
| 9 | Connector tool → click A → hint names A; press `Esc` → no edge created                  |
| 10| Note tool → click node → composer opens; empty text → Post disabled; text → thread      |
| 11| Post pin → open Reviews → thread listed + topbar unresolved badge increments            |
| 12| Canvas selection → dock auto-switches to Inspector → shape controls operate (one undo)  |

---

## 10. Open questions and risks

| ID   | Item                                                                             | Owner     | Impact     |
| ---- | -------------------------------------------------------------------------------- | --------- | ---------- |
| OQ-1 | Should the rail gain a persistent Shapes section for pinned/favorite shapes?     | Product   | §3 scope   |
| OQ-2 | Confirm exact rail geometry at 118px vs. a token (`--rail-width`) 🆕             | Frontend  | §1.2       |
| OQ-3 | Should the freshness pill + linter chip remain visible on phones?                | Product   | TOP-R14    |
| OQ-4 | Elevate annotations (notes/threads) to first-class export model?                 | Backend   | §5 scope   |

| Risk                                             | Mitigation                                              |
| ------------------------------------------------ | ------------------------------------------------------- |
| Rail label truncation hides tool meaning         | Icon + tooltip + `aria-label`; never icon-only without name context |
| Vendor-icon color violates contrast in themes    | Keep brand color for vendor icons; contrast check in CI |
| Header overflow at awkward widths                | `min-width:0` cascade + wrap rule; responsive smoke test|
| Annotation composer focus leak on unmount        | `useFocusTrap` + guarded commit (textDraft pattern)     |

---

## 11. Changelog

| Version | Date       | Changes                                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 1.0.0   | 2026-10-16 | Initial component-level spec: sidebar, topbar, shapes, icons, annotate, right dock, cross-cutting |
