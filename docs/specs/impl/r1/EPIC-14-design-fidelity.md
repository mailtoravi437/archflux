# EPIC-14 · Design fidelity: make the app look like the finalized design

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** priority, before further UI feature work
> **Sources:** the finalized artboards in [docs/design/artboards/](../../../design/artboards/README.md),
> UI_REVAMP_SPEC v1.2.x. **Opened:** 2026-10-25, after the owner reviewed the running app: "frontend
> doesn't look like what we finalized in design".

## Why this epic exists (root cause)

1. **The prose drifted from the design.** Implementation tasks pointed at UI_REVAMP_SPEC §4 prose,
   which predates the final shared **AppBar** artboard. For example, the prose keeps ⋯, ⚙ and a
   Blueprints tab, while the final artboard has Home · Library · Canvas · Review · Sync, a Search
   field, a primary action and the avatar. Agents built the prose.
2. **Acceptance was behavioural only.** Tests checked roles and labels, not layout, sizes or
   colours, so an off-design UI passed review.
3. **Most visual tasks hadn't run yet.** The tool rail, docked inspector, bottom view toolbar,
   Library page and Home were all still todo.
4. **Snapshots locked in the wrong look.** Visual baselines were regenerated (2026-10-25) on the
   off-design UI. They must be regenerated again after this epic, with human approval
   (E13-T04 rule).

## Rule added for every UI task (see AGENTS.md §3, CONVENTIONS §1.4)

- **The artboard is the source of truth.** The task names an artboard file. The agent reads its
  markup and matches:
  - structure and control order;
  - px sizes, radius, borders and shadows;
  - colours, as tokens;
  - type size and weight;
  - copy, verbatim;
  - `aria-label`s.
- **Fidelity check:** a task's acceptance includes `npm run design:shots` (E14-T06). The reviewer
  compares the screenshot side by side with the artboard and ticks the task's **Fidelity
  checklist**. A fidelity miss fails review.
- **Conflicts:** when prose and an artboard disagree, follow the precedence rules in the artboards
  README, then fix the prose in the same change.

---

### R1-E14-T01 · App bar = `AppBar.dc.html`

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | none (replaces the visual result of R1-E01-T03; its behaviour and tests stay) |
| **Design** | [AppBar.dc.html](../../../design/artboards/AppBar.dc.html) (component, wins); Main and Library for context |

**Read:** `AppBar.dc.html` (whole), `components/AppShell.tsx`, `components/appbar/*`,
`src/tests/appbar.test.tsx`, `src/tests/appshell.test.tsx`.

**Fidelity checklist** (values from the artboard):
- [ ] **Bar:** 48 px high, `#FFFFFF`, 1 px bottom border `#E3E6EB`, `padding: 0 16px`, gap 16.
- [ ] **Logo:** a 26×26 tile with radius 7 in the accent colour (`--accent-cyan`), holding the white
      hexagon/cube glyph from the artboard SVG (14 px, stroke 2.4), plus "ArchFlux" in 15/700.
      Replace the current ⚡ tile.
- [ ] **Doc switcher**, shown only on `/canvas`: a 1×20 divider, then a button 32 high with padding
      0 10, the title in 600 and a 14 px chevron. It has no border. The title is capped: the button
      has `max-width: 240px`, the title is one line with a text-overflow ellipsis, and the full name is in
      the `title` tooltip and the `aria-label` ("Diagram: <name>. Switch, rename or create"). A long title
      never moves the nav or the search (follow-up R1-E14-T08).
- [ ] **Nav:** `margin-left: 12px`, gap 2, **text-only** links (no icons, no pill container).
  - [ ] Each link is 32 high, padding 0 12, radius 6.
  - [ ] Active: `#EEF0FF` background, `#4338CA` text, weight 600. Inactive: `#5B6474`, weight 500.
  - [ ] Order: **Home · Library · Canvas · Review · Sync**. Show Home only once `/home` exists
        (E10-T01); until then start at Library.
  - [ ] Review shows a count badge (18 px pill, `#E3E6EB`) when there are open reviews (Main
        artboard).
  - [ ] Blueprints leaves the nav. It stays reachable from Library ("Templates"), the New diagram
        dialog and the command palette.
- [ ] **Search field:** a spacer, then the field: 200 wide (220 in screen artboards; use 200), 32
      high, `#F6F7F9` background, 1 px `#E3E6EB` border, radius 6, a search icon, the text "Search"
      (muted) and a `⌘K` kbd chip (JetBrains Mono 11 px, white, bordered). It opens the command
      palette. Replace the bare `⌘K` button.
- [ ] **Status button**, shown only on `/canvas`: a 32-high bordered button with an 8 px dot and the
      label. Keep the StatusButton labels and menu from E01-T03. The dot is green `#15803D` when
      saved, grey `#8A93A3` when local, amber when there are issues.
- [ ] **Primary action**, shown only on `/canvas`: a filled accent button 32 high with padding 0 14
      and weight 600. It reads **"Share"** once R1-E07-T05 exists. Until then it reads **"Save"**
      (as in Main.dc.html) and calls `saveActiveDoc`.
- [ ] **Notifications bell:** **not shown in R1**, since there are no real notifications until R2
      (no-fake-UI rule).
- [ ] **Avatar:** a 32 px circle, `#E8EAFD` background, `#4338CA` text, weight 700, the user's
      initial. No status dot. Its menu holds Theme, Settings (⚙ moves here), Profile & team, and
      Sign out / Sign in.
- [ ] **Removed from the bar:** the ⋯ overflow and the ⚙ button. Export, Import and Focus are
      reachable through the palette, the canvas view toolbar (Focus) and the avatar menu
      (Settings).
- [ ] **Library route:** no doc switcher, no status, no primary action (as in `Library.dc.html`).

**Tests:**
- Update `appbar.test.tsx`, changing only the expectations that encoded the old layout. List each
  one.
- Add `it('nav is text-only Library·Canvas·Review·Sync with active styling')`.
- Add `it('search field opens the palette')`.
- Add `it('primary action reads Save until sharing exists')`.
- Add `it('no notifications bell in R1')`.

**Acceptance:** the tests pass; `npm run design:shots` produces `appbar-canvas.png` and
`appbar-library.png`; the reviewer ticks every checklist item against `AppBar.dc.html`.

---

### R1-E14-T02 · Canvas workspace shell = `Main.dc.html`

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E14-T01 |
| **Design** | [Main.dc.html](../../../design/artboards/Main.dc.html) L69–L170 (canvas, rail, view toolbar, minimap), L170–L178 (inspector frame) |

**Read:** that artboard range, `screens/CanvasScreen.tsx` (layout JSX only), `components/ToolPalette.tsx`,
`screens/canvas/Minimap.tsx`, `styles.css` (the rail, dock and minimap rules).

**Fidelity checklist:**
- [x] **Canvas:** background `#FFFFFF` with a dot grid `radial-gradient(#DADDE3 1px, transparent 1px)`
      at 20 px (light theme; dark and blueprint keep their own grid colours).
- [x] **Tool rail:** floating at `left 12, top 12`, **48 px wide**, `padding: 6px 4px`, white,
      1 px `#E3E6EB` border, radius 10, shadow
      `0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.06)`.
  - [x] Buttons are 38×38 with radius 8 and an 18 px stroke icon `#3D4553`. Active: `#EEF0FF`
        background with icon `#4338CA`.
  - [x] Order and groups, with 24×1 dividers: **Select (V), Pan (H) | Service (S), Gateway (G),
        Database (D), Queue (Q), Shapes library (L) | Connect (C), Draw (P), Text (T),
        Comment (M)**.
  - [x] Each button has `aria-label` "Select (V)" and so on, and `title` "Select  V". Use the
        artboard's SVG paths for the icons.
  - [x] Remove the extra top "shapes" icon and the old icon set, and keep the tool-lock behaviour.
- [x] **Inspector frame:** **docked**, not floating. A full-height `<aside aria-label="Inspector">`,
      320 wide, white, with a 1 px left border `#E3E6EB` (288 at 1024–1279 px wide, per
      UI_REVAMP §7).
  - [x] Tab list `aria-label="Right panel"`, `padding: 8px 12px 0`, with a bottom border. The tabs
        are **text only** ("Inspector", "AI assistant", "Live", "History"; no count pills; changed
        2026-10-26, see R1-E14-T10), 36 high. The active tab has a 2 px accent underline, weight 600.
  - [x] A close "×" button (28 px) sits on the right. Closing hides the dock; the canvas toolbar
        gains a "Show panel" button.
  - [x] Remove the emoji/icon tab heads and the floating card.
- [x] **View toolbar,** new: `role="toolbar" aria-label="View"` at `left 72, bottom 16`, 40 high,
      white, bordered, radius 10, with the rail shadow. It holds:
      **Zoom out · 100% (Reset zoom to 100%) · Zoom in · Fit to screen (F) | Undo · Redo | Hide
      minimap (aria-pressed) · Focus mode**. Buttons are 32×32 with radius 6. This delivers
      R1-E01-T05.
- [x] **Minimap:** `left 72, bottom 66`, 176×108, padding 8, white, bordered, radius 10, with the
      shadow. Its inner area is `#F6F7F9` with radius 6, and the viewport is drawn as a rect with a
      1.5 px accent border. Nodes are tinted by kind colour at about 50 %. Remove the bottom-right
      minimap icon.

- [x] **Leftovers from the T05 review**, all in CanvasScreen/CanvasEngine:
  - Remove the old 12 px `#635BFF` e/s/se resize grips. Resizing uses the four 8 px corner handles
    that the renderer now draws (`drawSelectionChrome`), and hit-testing moves to the corners.
  - Draw edge label pills in a **separate pass after nodes**, so pills are never hidden under a
    node.
  - Pass a `hovered` flag to the node pass for hover ports and shadow (§5A.5).
  - Draw selection handles at a constant 8 **screen** px by dividing by zoom.

**Tests:** `src/tests/canvas-shell.test.tsx`
- `it('rail lists tools in design order with labels')`
- `it('inspector is docked with text tabs and close')`
- `it('view toolbar has zoom, fit, undo, redo, minimap, focus')`
- `it('minimap sits above the view toolbar on the left')`
- Plus the existing canvas, a11y and e2e suites.

**Acceptance:** the tests pass; `design:shots` → `canvas-empty.png` and `canvas-selected.png`;
the reviewer ticks the checklist against Main.dc.html.

---

### R1-E14-T03 · Inspector content = `Main.dc.html` and `DisplayStyles.dc.html`

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E14-T02 |
| **Design** | Main.dc.html L180–L237; DisplayStyles.dc.html (Display control wins over Main's "Shape" control) |

**Fidelity checklist:**
- [x] **Body:** padding 16, gap 16.
- [x] **Header:** a 32 px icon tile with radius 8, tinted with the kind colour (`#E8F0FE` for
      service blue); the title in 15/600; the subtitle "Service · 2 connections" in 11 px muted.
      The subtitle reads `<Kind label> · N connections`, counted from the edges.
      *2026-10-25 check:* matches except the tile shows a 12 px kind-colour square, not the artboard's service glyph, and the tint is the kind colour at 14 % (about `#E1EAFC`), not a fixed `#E8F0FE`. Fixed 2026-10-25, see changelog.
- [x] **Section headers:** buttons in 12/600 with a chevron (`aria-expanded`). Sections after the
      first have a 1 px top border `#EEF0F3` and 12 px of padding above.
- [x] **Content** (open): Label, Technology and Details inputs. Labels are 12 px muted above the
      field. Inputs are 32 high with 13 px text, a 1 px `#E3E6EB` border and radius 6. Details is a
      textarea 56 high with the placeholder "Shown inside the node — e.g. region, replicas".
- [x] **Appearance:**
  - [x] **Colour:** six 24 px circular swatches, each with an `aria-label`: Blue `#2563EB`, Violet
        `#7C3AED`, Green `#15803D`, Amber `#D97706`, Red `#DC2626`, Gray `#6B7280`. The selected
        swatch has a 2 px white ring plus a 2 px colour ring and `aria-pressed`. This replaces the
        duplicate-`#635BFF` swatches (**fixes R1-BUG-01**).
  - [x] **Display:** a segmented radiogroup **Icon · Card · Shape** (from the DisplayStyles
        artboard). Its track is `#F1F2F5` with radius 8 and padding 2; the selected segment is white
        with a shadow and weight 600, 28 high. It writes `displayStyle` (E02-T05 adds the
        multi-select behaviour).
  - [x] **Border:** a radiogroup **Thin · Regular · Bold · Dashed** mapping to `strokeWidth`
        1 / 1.5 / 2.5 and dashed. Same segmented style.
- [x] **Collapsed rows:**
  - [x] **Icon:** the summary on the right shows the current icon name with a chevron; it opens the
        icon picker (E05-T03, or the existing picker until then).
  - [x] **Metadata:** the summary "Port, repo, spec".
- [x] **Footer:** a 1 px top border, then **Duplicate** (secondary) and **Delete** (white, with a
      1 px `#F5C2C2` border and `#B91C1C` text), each flex-grow, 32 high.
- [x] **Decisions taken in the T03 build (2026-10-25):**
  - The node **Status** field (`health`) leaves the Inspector, since the artboard's Content section has only Label, Technology and Details. The field stays in the data model, and a follow-up must say where status is edited.
  - **Properties** was dropped in the T03 build but is restored (coordinator decision 2026-10-25, see changelog): E02-T07 specifies typed properties.
  - **Shape** (Rectangle/Rounded/Logo/Cylinder) is replaced by the **Display** radiogroup, as the DisplayStyles artboard wins.
  - **Dashed** writes the new `borderDashed` field (DATA_MODEL_R1 §2.2); the stroke width is kept.
  - **Focus** leaves the footer; the outline and the canvas do the same job.
- [x] **Nothing selected:** keep the honest copy "Nothing selected — click a node or route to edit
      its properties here." in the body style, followed by the outline list. Drop the "Jump to node"
      select in favour of the outline and search.
  - [ ] **Outline rows (R1-E14-T08, States.dc.html "Inspector, nothing selected"):** compact rows, not
        buttons with a border: 36 high, padding 0 8, gap 10, radius 6, no border; a 28 px kind-tinted
        glyph tile (radius 7); the name on one line, 13/500, ellipsis, full name in `title`; the
        connection count right-aligned, 11 px `#5B6474`, the number only. Accessible name
        `"<name>, <tag>, N connections"`. Hover `#F6F7F9`, selected `#EEF0FF`, keyboard focus a 2 px
        `#4F46E5` inset ring; each row is focusable and selects the node.

**Tests:** `src/tests/inspector-fidelity.test.tsx`
- `it('header shows kind and connection count')`
- `it('colour swatches are six named unique colours')`
- `it('display radiogroup writes displayStyle')`
- `it('border radiogroup maps to strokeWidth')`
- `it('footer has Duplicate and Delete')`

---

### R1-E14-T04 · Library page = `Library.dc.html`

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E14-T01 |
| **Design** | [Library.dc.html](../../../design/artboards/Library.dc.html) (whole) |

**Fidelity checklist:**
- [ ] **Main:** `padding: 28px 32px`; content `max-width: 1200px`, centred, as a column with gap 20.
- [ ] **Header row** (aligned to the bottom, gap 16):
  - [ ] `h1` "Library" in 22/28/700.
  - [ ] Subtitle in 13 px muted: "N diagrams · X saved to the server · Y on this device", computed
        from real docs. When signed out it reads "N diagrams on this device".
  - [ ] "Import .arch", secondary, 36 high.
  - [ ] "New diagram", primary, 36 high, with a + icon.
- [ ] **Toolbar:**
  - [ ] A search field with an icon and the placeholder "Search diagrams by name or tag".
  - [ ] A **Source** segmented radiogroup: All · Server · This device.
  - [ ] "Sort" with a select (Last modified · Name).
  - [ ] Remove Grid/Table and Select from the toolbar. Keep Table as a toggle only if the artboard
        is silent; it is, so move it into Sort's overflow.
- [ ] **Card grid:** `repeat(auto-fill, minmax(240px, 1fr))`. Each card is a link with:
  - [ ] a **thumbnail preview** at the top, drawn from the doc's real nodes as small tinted rects,
        using the minimap renderer;
  - [ ] below it the title (600) and a line with a **source chip** ("Saved vN" on `#E8EAFD` /
        `#4338CA`, or "This device" on `#F1F2F5` / `#3D4553`) and the meta "N nodes · <relative
        time>".
  - [ ] Remove the `[git:main]` mono chip and the "open" badge from the card face, and move Pin
        and ⋯ to hover/focus.
- [ ] **Footer line:** a muted line, "This device: X of 25 diagrams · N KB used · Manage storage",
      replacing the Storage card (UX-P2.2).

**Tests:** `src/tests/library-fidelity.test.tsx`
- `it('header shows h1, real counts and two actions')`
- `it('source filter filters server vs device')`
- `it('cards show thumbnail, title, source chip, meta')`
- `it('storage is a footer line, not a card')`

---

### R1-E14-T05 · Element rendering matches `Elements.dc.html` and `States.dc.html`

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E02-T02 |
| **Design** | Elements.dc.html (card M), States.dc.html (selected, hover), Main.dc.html L92–L139 (edges, pills) |

Check the R1-E02-T02/T09 renderer against the artboards and fix the differences.

**Fidelity checklist:**
- [ ] **Card M:** 200×80, padding 12, gap 10, radius 8, 1.5 px kind border.
  - [ ] Official icons are drawn at 32 px with radius 4 and **no tile**. Generic glyphs sit on a
        28 px tile, radius 6, with the kind tint (`#E8F0FE` blue, `#F1EBFE` violet, `#FEF3E2`
        amber, `#F1F2F5` grey).
  - [ ] Name 13/600; lines 2 and 3 in 11 px `#5B6474`.
- [ ] **Selected:** a 3 px `rgba(79,70,229,.35)` ring (from the States component artboard, which wins over Main's .25) plus four **8 px square handles** (white
      fill, 1.5 px `#4F46E5`, radius 2) at the corners.
- [ ] **Edges:** 1.5 px `#8A93A3` lines. Label pills are 11 px `#3D4553` on white with a 1 px
      `#E3E6EB` border and radius 999, padding 2 8.
- [ ] **"Not connected" node** (`isOrphan`, meaning no relationships; a sync-source status replaces it in R3): dashed `#8A93A3` border, with the second line "Not connected" in `#92400E` 500 weight.
- [ ] Line 2 is "Kind · technology" (Elements component), not technology alone as in Main.

**Tests:** extend `render-card.test.ts` with `it('official icon has no tile; generic glyph has 28px tint tile')`
and `it('selected draws 3px ring and four 8px handles')`.

---

### R1-E14-T06 · `design:shots` fidelity tooling

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer |
| **Depends on** | none (do first) |

**Create:**
- `frontend/scripts/design-shots.mjs`, run with `npm run design:shots`. It:
  - starts Vite on port **5191** (never 5173) and seeds a guest session plus a fixture doc from
    `src/tests/fixtures/sampleDiagram.ts` in localStorage, the fixture being for tests only;
  - captures at 1440×900, light theme, into `frontend/test-results/design-shots/`:
    `appbar-canvas.png`, `appbar-library.png`, `canvas-empty.png`, `canvas-selected.png` (first
    node selected), `library.png`, and (when its route exists) `home.png`;
  - shuts Vite down.
- `docs/design/FIDELITY.md`: how the reviewer compares (open the artboard on the canvas link and the
  PNG side by side, then tick the task checklist). It lists the artboard for each shot.

**Acceptance:** `npm run design:shots` writes the PNGs and exits 0 without touching ports
5173/3001/8080.

---

### R1-E14-T07 · Re-baseline visual snapshots after the fidelity pass

| | |
|---|---|
| **Size** | S |
| **Role** | test-engineer + human |
| **Depends on** | R1-E14-T01…T05 |

The 2026-10-25 baselines captured the off-design UI. After T01–T05 pass review, and **only after the
owner approves the screenshots**, run `npm run test:visual -- --update-snapshots`. Record the
approver and date in the changelog.

---

### R1-E14-T09 · Drawer overlap, tile labels, selection toolbar placement (owner-reported)

Done 2026-10-26. Artboards: Palette.dc.html (drawer placement, z-order, tile spec), Main.dc.html (selection toolbar
rule, chrome z-order). Code: `ShapeLibrary.tsx` (shrinkable panel, 2-line clamp, `title`), `styles.css` (drawer
z-index 46), `canvas/contextToolbarPlacement.ts` + `ContextToolbar.tsx` (12 px gap, flip below). Tests:
`context-toolbar-placement.test.ts`, `shapes-panel-layout.test.tsx`, e2e "shapes drawer rows are reachable".
Re-captured baselines: `library-drawer` and `r1-shapes-panel` (chromium, firefox, webkit).

---

### R1-E14-T10 · AI assistant dock tab replaces the Linter tab (owner request 2026-10-26)

**Scope decision (R1):** the AI assistant is R2 (PRODUCT_SPEC §3.7, FL-11, SC-40). In R1 the dock tab is an honest placeholder; nothing may look like AI output.

- Design first: Main.dc.html (tabs Inspector · AI assistant · Live · History), Assistant.dc.html ("R1 state"), AppBar.dc.html (status menu "Linter" opens the lint dialog).
- Dock tab labels are exactly `Inspector`, `AI assistant`, `Live`, `History`. No "Linter" tab and no lint count pill in the dock.
- The "AI assistant" panel (`role="tabpanel"`, `aria-label="AI assistant"`) shows: "Coming in R2" pill, heading "Assistant arrives in R2", the not-available text, a "What it will do" list and a pointer to the status menu Linter. No input, no button, no generated content.
- The lint list (`LinterPanel`, unchanged behaviour: Inspect, Auto-bind, Prune Wire, Tag REST, Auto-Heal All) moves into `LintDialog`, opened from the status menu "Linter (N issues)" in the app bar. N is `lintCount`, the same number as the status label.
- Tests: `src/tests/canvas-shell.test.tsx` (tabs), `src/tests/ai-assistant-tab.test.tsx`, `src/tests/lint-dialog.test.tsx`.
- Out of scope: any AI call, prompt input, settings for AI. Visual baselines are re-captured only after owner approval (affected: dock on canvas shots, `linter-chip-with-issues.png`, `linter-panel.png`).

### R1-E14-T11 · Sync (`/living`) and Live tab match their artboards (owner request 2026-10-26)

**Scope decision (R1):** Comments (SC-24) and the notifications inbox (SC-25) are R2 (PRODUCT_SPEC §7, BACKLOG D8). R1 ships presence only. Sync sources and drift are R3 and form-only, so no state may claim a live provider.

- Design first: Sync.dc.html ("R1 STATES": drift empty, saved source row, Activity, offline and failed strips), Live.dc.html ("R1 STATE": Live dock tab states and the presence pill).
- Sync, `/living` (SC-32): h1 `Sync` with subtitle "Compare this diagram with what is running. Connect a source to detect drift."; header actions `Re-sync` (secondary) and `Add source` (primary); four stat cards (Status, Sources, Mapped services, Last re-sync); a Drift section (rows: pill, name, reason, `Bind`/`Remove`, `Dismiss`; honest empty state "No drift on the canvas"); a Sources section (saved rows plus the three dashed buttons Kubernetes cluster, OpenAPI contract, Terraform state); Files (`Download .arch`, `SVG`, `CSV`, `Import .arch`); Activity (re-sync log).
- Honesty: Status reads `Not connected` unless a real connection exists; saved sources always show `Not connected`; Last re-sync is `Never` until a real attempt; drift rows come only from the canvas (isolated element, dangling route); no "matches upstream" text.
- Live tab (SC-23, R1 part): `role="tabpanel"` `aria-label="Live collaborators"`; connected list ("N here", you marked), alone, local-only, guest and reconnecting states; real names (account name), fixed avatar palette; presence pill on the canvas only while connected with 2+ people; no Follow, no comments, no notifications.
- Tests: `src/tests/sync-screen.test.tsx`, `src/tests/live-tab.test.tsx`, `src/tests/presence-identity.test.ts`; e2e `critical-journeys.spec.ts` and `productization-honesty.spec.ts` updated for the new labels.
- Out of scope: any provider call, comments panel, notifications inbox, Follow, Drift inbox and Mapping screens (R3). Visual baselines are not re-captured without owner approval (affected: `living-screen`, `living-light`, `living-dark`).

### R1-E14-T12 · Sync honesty and Live dock footer (owner request 2026-10-26)

**Honesty rule (applies to every screen):** no progress indicator, "Polling" state or success toast for work that is not running.

- Design first: Sync.dc.html (saved source row without Retry; Activity line for a Re-sync with no source) and Live.dc.html (dock frame as a full-height column), noted in the artboards README.
- Sync: a saved source shows `Not connected` and a `Remove` button only (no Retry; there is no live provider in R1). `Re-sync` with no connected source shows no progress bar, no "Polling", no toast; it writes the Activity line `No re-sync: no live source is connected`, Status stays `Not connected` and `Last re-sync` stays `Never`. Offline behaviour is unchanged (failed-sync strip). A connected-source path is out of scope (R3).
- Live dock: the panel is a full-height column (`display:flex; flex-direction:column; height:100%; min-height:0`) and the R2 line is its last child with `margin-top:auto` and a 1 px top hairline.
- Tests: `src/tests/sync-screen.test.tsx`, `src/tests/live-tab.test.tsx`.
- Out of scope: any provider call. Visual baselines are not re-captured without owner approval (affected: `living-screen`, `living-light`, `living-dark`, and the canvas dock shots that show the Live tab).

### R1-E14-T13 · Sync Add source saves honestly (owner request 2026-10-26)

- Design first: Sync.dc.html Add source dialog notes, README changelog.
- Saving a source adds the row at once with status `Not connected`. No `Polling` state, no timer, no "simulated" text. Toast: `Source saved. Not connected: no provider is verified yet.` Dialog helper text: "No credentials needed. Secrets are never collected here. Saving records the source only; nothing is checked."
- Tests: `src/tests/sync-screen.test.tsx`. Out of scope: any provider call.

---

## Changelog
- 2026-10-26 Owner-approved visual baseline re-capture after R1-E14-T12 (Sync honesty: no Retry on saved sources, re-sync with no source writes an honest attempt line, Live dock footer pinned) and R1-E14-T13 (Add source saves as Not connected, no polling or simulated toast). Re-captured on chromium, firefox and webkit: 117 snapshots, then two clean verification runs without the update flag (117/117 each).
- 2026-10-26 R1-E14-T13 (frontend-implementer): Sync Add source no longer runs an 800 ms "Polling" state or a "simulated" toast; the row saves as Not connected with the toast "Source saved. Not connected: no provider is verified yet." Files: screens/LivingScreen.tsx, tests/sync-screen.test.tsx. Baselines not re-captured.
- 2026-10-26 R1-E14-T12 (frontend-implementer): artboards first (Sync.dc.html, Live.dc.html, README), then spec, then tests, then code. Sync: Retry removed from saved sources; Re-sync no longer shows simulated progress or a toast and logs "No re-sync: no live source is connected"; Last re-sync stays Never. Live dock: panel is a full-height flex column so the R2 line is pinned to the bottom. Files: screens/LivingScreen.tsx, state/store.tsx (resync log line, no toast), components/CollaborationPanel.tsx, tests. Baselines not re-captured (affected: living-screen, living-light, living-dark, Live dock shots).
- 2026-10-26 Owner-approved visual baseline re-capture after the AI assistant dock tab (R1-E14-T10), the Sync and Live fidelity pass (R1-E14-T11), the stale Command-K e2e selectors and the Shapes, tile and toolbar fixes. Re-captured on chromium, firefox and webkit: 117 snapshots, then two clean verification runs without the update flag (117/117 each). The affected baselines are the canvas dock, living-*, and the Shapes and library drawer shots.

- 2026-10-26 R1-E14-T09 (owner-reported, three issues): artboards first (Palette.dc.html drawer placement and tile spec; Main.dc.html selection toolbar placement and chrome z-order; README changelog), then code. Owner approved re-capture of the affected visual baselines.
- 2026-10-26 R1-E14-T07 done (test-engineer; owner approval 2026-10-25): re-captured with `E2E_PORT=5191 npx playwright test e2e/visual-regression.spec.ts --project=chromium --project=firefox --project=webkit --update-snapshots`. Baselines on disk: 47 per browser (141 total; the 2 Mobile theme shots are not in these projects and were not touched), including the 8 r1-* screens (home, trash, new-diagram dialog, import dialog, export dialog, share dialog local, shapes panel, layers popover) on all three browsers. Then two plain runs on the same projects, retries 0: 114 passed, 114 passed; no flaky snapshot, thresholds unchanged. Before capture: `npx vitest run` 662 passed / 7 skipped, `tsc -b` clean. Spec fix needed to get a green run (test code only): 4 tests used stale selectors (theme select no longer in the canvas app bar; button 'Open shape library' renamed 'Shapes library'), so dark/light/blueprint theme and library drawer tests now set the theme via Settings and use `/Shapes library/`; their baselines were captured from the current UI.
- 2026-10-25 Fidelity pass against Main.dc.html (coordinator). Fixed in the Inspector node branch: Appearance is open by default, as in the artboard (Colour, Display and Border visible without a click); the Diagram outline shows only when nothing is selected, per T03. Updated inspector-sections.test.tsx to match (Appearance default open; the persisted state is unchanged). Checked against the artboards: tool rail order and labels, docked inspector, text tabs with Linter count, View toolbar, minimap, corner handles, and the old #635BFF resize grips are gone (the snap-guide colour stays, since no artboard covers it). Full suite 57 files / 358 tests pass; tsc clean; lint 0 errors. T02 and T03 stay in `review` until the reviewer ticks the checklists.
- 2026-10-25 R1-E14-T02 verified (status review): the rail, docked Inspector, View toolbar, minimap, corner handles and edge-pill pass are in place. canvas-shell.test (4) passes; the full suite passes (57 files, 358 tests); tsc is clean; design:shots `canvas-selected.png` matches the Main structure. Not yet ticked item by item against Main.dc.html; the reviewer does that.
- 2026-10-25 R1-E14-T03 built (Inspector node branch): header with kind and connection count, Content/Appearance/Icon/Metadata sections, six named colours, Display and Border radiogroups, Duplicate/Delete footer. Added the node `borderDashed` field (DATA_MODEL_R1 §2.2, now 1.2.1).
- 2026-10-25 R1-E14-T04 done: the Library matches Library.dc.html (signed-in light screenshot checked by the coordinator).
  - Thumbnails reuse `minimapTransform`/`worldToMini`, drawn as SVG.
  - The footer "X of 25" counts every doc stored in the browser, server copies included.
  - A server doc with no known version shows the chip "Saved".
  - Table view is an icon toggle after Sort.
  - Relative time: just now / N min ago / N hours ago / yesterday / N days ago / last week / N weeks ago / date.
  - Dropped: the Recently-opened strip, the separate Pinned section (pinned docs sort first), the quick-create row, the Creation and Node-count sorts, and the toolbar Select (bulk select now comes only from "Free up space").
  - Pin and ⋯ sit over the thumbnail.
  - E2E matcher updates: critical-journeys, productization-honesty, visual-regression (matchers only).
  - Baselines dashboard-grid and dashboard-table go to T07.
- 2026-10-25 R1-E14-T01 done: the app bar matches AppBar.dc.html (screenshots at 1440, 1024 and 390 checked by the coordinator).
  - New tokens in all 3 themes: `--accent-text`, `--accent-soft`, `--avatar-bg`, `--status-dot-saved`, `--status-dot-local`.
  - Decisions:
    - In R1, the Review badge counts unresolved comment threads.
    - The Sync drift badge was dropped, since no artboard shows one.
    - Accessible names keep the E01-T03 strings that tests rely on ("Diagram: X…", "Status: …", "Account (…)"); the search field uses the artboard's name.
    - The status button has no chevron, following AppBar over Main.
  - Responsive: below 1280 px the search becomes icon-only; below 768 px the brand name, search and Save hide (Save stays in the status menu), and nav collapses to "Menu ▾" below 768 px, not the 768–1023 range in UI_REVAMP §7.
  - Also edited e2e/critical-journeys.spec.ts, whose 2 steps used the removed ⋯ menu.
  - Tests: 343 unit, e2e 22/22.
- 2026-10-25 R1-E14-T05 done: card M anatomy, official-icon/no-tile vs 28 px tinted glyph tile, selection ring plus 8 px corner handles, edges 1.5 px #8A93A3 with white pills, "Not connected" orphan styling; canvas.test details x 134. Screenshot compared with Elements/Main by coordinator; the ring alpha follows States (.35). Leftovers moved to T02.
- 2026-10-25 R1-E14-T06 done: scripts/design-shots.mjs (port 5191 strict, API proxy pointed at a closed port so the owner's :3001 is never hit, fixture transpiled with esbuild), docs/design/FIDELITY.md. Library is the `#/dashboard` route. Reviewed by coordinator.
- 2026-10-25 R1-E14-T03 done (frontend-implementer): header tile is now a 32 px, radius 8 tile with the artboard tint (`glyphTileTint`, `#E8F0FE` for service) and the kind glyph, drawn by `drawKindGlyph` on a small canvas (`KindTile` in screens/canvas/Inspector.tsx) so it matches the canvas card. Screenshot canvas-selected.png checked: tile, tint, title 15/600 and subtitle match Main.dc.html; the glyph is the app's service hexagon, not the artboard's monitor drawing. Coordinator decision: the extra Inspector rows the artboard lacks stay, because later tasks specify them: the Properties row (E02-T07 typed properties), the "Arrows nudge • Del deletes" hint (E04/E01 keyboard hints) and the History tab (E08-T03 history dock).
- 1.0.0 (2026-10-25): epic created after the owner's design review; artboards copied to
  docs/design/artboards/.
- 2026-10-25 R1-E14-T02/T03 checklist pass (frontend-implementer): computed styles read in headless Chromium (1440x900, light) and compared with Main.dc.html. T02: every item matches (rail 48 px, 38 px buttons, order, labels, docked 320 px aside, tab bar, close, View toolbar, minimap, leftovers). Extra tab "History" (E08) sits after Live; not in the artboard. T03 fixes: body now 16 padding and 16 gap, section hairline `#EEF0F3` (none above the first), 12 px padding above each section, header button without padding, 14 px SVG chevrons (components/Section.tsx), inputs on the panel colour (not tinted), segmented track `#F1F2F5`, footer 13 px with divider; files: screens/canvas/Inspector.tsx, components/Section.tsx, styles.css (`.inspector-node`). Not matched: header glyph (see above); the Inspector also shows a Properties row and an "Arrows nudge" hint that the artboard does not have (kept, E02 and a11y need them). Status stays `review` for the reviewer.
- 2026-10-26 R1-E14-T08 done (frontend-implementer): outline rows and capped doc title redesigned in the artboards first (States.dc.html new Inspector outline section, AppBar.dc.html title cap), then implemented; files: Inspector.tsx, DocSwitcher.tsx, styles.css, tests inspector-outline.test.tsx and appbar.test.tsx.
- 2026-10-26 R1-E14-T10 done: Linter dock tab replaced by an R2 "AI assistant" placeholder; lint list opens from the status menu in a dialog; artboards Main, Assistant, AppBar updated first; files: CanvasScreen.tsx, screens/canvas/AiAssistantPanel.tsx, screens/canvas/LintCards.tsx (was LinterPanel.tsx), components/LintDialog.tsx, components/AppShell.tsx, styles.css (dock tabs 8 px padding / 2 px gap so four tabs fit), tests, e2e/visual-regression.spec.ts (two tests replaced; new baselines await owner approval).
- 2026-10-26 R1-E14-T11 review (frontend-implementer): artboards Sync and Live gained R1 states first (README changelog); then `/living` rebuilt to SC-32 and the canvas Live tab rebuilt to the Live artboard (presence only). Files: screens/LivingScreen.tsx, components/CollaborationPanel.tsx (+ PresencePill), lib/presence.ts, hooks/useCollaboration.ts (identity), screens/CanvasScreen.tsx (pill, tab count), styles.css (syncpage-*), scripts/design-shots.mjs and docs/design/FIDELITY.md (sync.png, live-tab.png), e2e labels in critical-journeys, productization-honesty, smoke, visual-regression. Removed with the redesign: preserve-layout checkbox, inline connector-name input, connection callout, Accept/Reject reconciler table (upstream drift rows had no producer), heal-to-hub on Bind. Baselines not re-captured.
- 2026-10-28 R1-E14-T02 done (frontend-implementer): every checklist item re-verified against Main.dc.html with getComputedStyle in headless Chromium (1440x900, light, own Vite on :5192) and a screenshot of the selected canvas. Matched: dot grid 20 px `#DADDE3` on white; rail 12/12, 48 wide, 6/4 padding, border `#E3E6EB`, radius 10, shadow, 38 px buttons radius 8, icon colours `#3D4553`/`#4338CA` with the artboard SVG paths, order, 24x1 dividers, aria-labels and titles; docked 320 px aside with 1 px left border, tab bar padding `8px 12px 0`, 36 px text tabs, 2 px accent underline, weight 600, 28 px close and Show panel; View toolbar 72/16, 40 high, 32 px buttons radius 6, order and aria-pressed; minimap 72/66, 176x108, padding 8, inner `#F6F7F9` radius 6; no old grips; corner handles 8 px. Fixes needed: none. Known non-differences: the `role=tablist` sits on the inner tab group, not the wrapper (same accessible name); the selection toolbar's dark action segment is outside T02 (T09). design:shots could not run on 5191 at the time (another agent held the port), so the screenshot came from the same fixture on :5192.
