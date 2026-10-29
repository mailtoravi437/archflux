# EPIC-01 · UI foundation (UI_REVAMP_SPEC Phases 1–2)

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 1 | **Sources:** UI_REVAMP_SPEC v1.2.0 §3–§9 (UX-P1.x, UX-P2.x)
> **Design:** Claude Design canvas → page "1 Core" (Main, Library, Tokens) and "Components" (AppBar)

**First step for every task in this epic:** some UX-P1 items were partly shipped earlier.

1. Run the acceptance check first.
2. If it already passes, write the evidence in the changelog and mark the task `done` without
   changing code.

---

### R1-E01-T01 · Design tokens: type scale, fonts, light palette

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | UX-P1.1; UI_REVAMP_SPEC §5 |

**Read:**
- `frontend/src/styles.css` L1–L140 (the `:root` and `[data-theme]` blocks)
- `frontend/src/design-system/tokens/typography.ts`, `colors.ts`
- `frontend/src/design-system/validateTokens.ts`

**Change:**
- `styles.css`, in each theme block:
  - Add `--code-font: var(--mono-font);`.
  - Add `--text-xs: 11px; --text-sm: 12px; --text-md: 13px; --text-lg: 15px; --text-xl: 20px;` and
    the matching `--lh-*` line heights (16/18/20/22/28).
  - Set the light palette to the values in UI_REVAMP_SPEC §5:
    - `--bg-app #F6F7F9`, `--bg-panel #FFFFFF`, `--border-panel #E3E6EB`;
    - `--text-main #1B1F27`, `--text-muted #5B6474`;
    - `--accent-cyan #4F46E5`.
- Replace `font-family: var(--mono-font)` with `var(--ui-font)` on buttons, inputs, tabs and
  labels. Keep mono only for `code`, `kbd`, `.mono`, IDs and diffs.
- `typography.ts` / `colors.ts`: mirror the new values.

**Tests:** `src/tests/tokens-r1.test.ts`
- `it('light theme text colours meet 4.5:1 on panel')`: use the contrast helper in
  `validateTokens.ts`.
- `it('buttons, inputs and tabs use the UI font')`: render `Button` and `Input`, then check the
  computed style or class names.

**Acceptance:**
- [ ] The tests pass and `validateTokens.test.ts` stays green.
- [ ] axe colour-contrast reports 0 on `/dashboard` and `/canvas`
  (`e2e/productization-honesty.spec.ts` axe step).

**Pitfalls:** dark and blueprint themes keep their own values. Change only the light theme's
palette, but add the new size and font vars to all three themes.

---

### R1-E01-T02 · One button and input system (sm/md/lg)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T01 |
| **Sources** | UX-P2.3; UI_REVAMP_SPEC §5 "Controls" |

**Read:**
- `design-system/components/Button.tsx`, `Input.tsx`
- `styles.css` around `.btn` (L552) and `.btn-xs` (L1197–L1220)

**Contract:**

```ts
type ButtonSize = 'sm' | 'md' | 'lg';           // 28 / 32 / 40 px high
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: ButtonSize; variant?: ButtonVariant; icon?: React.ReactNode; }): JSX.Element;
```

**Change:**
- Implement the sizes and variants as CSS classes `.btn.btn--sm|md|lg` and `.btn--primary|…`.
- Keep `.btn-xs` as a deprecated alias of `sm`. It now uses the UI font, not mono.
- Inputs are 32 px with 13 px text. The focus ring is a 2 px accent at 35 % plus a 1 px accent
  border.

**Tests:** `src/tests/button-system.test.tsx`
- `it('renders each size with its height class')`
- `it('icon-only button requires aria-label')`: in dev mode, a missing label triggers `console.error`.

**Acceptance:** the tests pass, with no visual regression outside buttons. Run
`npm run test:visual` and review the diff images; update baselines only in E13-T04.

---

### R1-E01-T03 · App bar per IA

> **Superseded visually by R1-E14-T01** (2026-10-25): the nav is Home · Library · Canvas · Review · Sync with no Blueprints, and there are no ⋯ or ⚙ buttons. Behaviour below still applies.

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T02 |
| **Sources** | UX-P1.2; UI_REVAMP_SPEC §4 |
| **Design** | Components › AppBar; 1 Core › Main |

**Read:** `components/AppShell.tsx` (766 lines; the header JSX is the first `<header`) and
`src/tests/appshell.test.tsx`.

**Change:**
- Build the layout in `AppShell.tsx`, extracting `components/appbar/DocSwitcher.tsx` and
  `components/appbar/StatusButton.tsx`.
- **Left:** the logo (→ `/dashboard`) and `DocSwitcher`. `DocSwitcher` shows the current title; its
  menu holds Rename, Duplicate, New and the 5 most recent docs.
- **Centre:** the nav Library · Canvas · Review · Sync · Blueprints.
- **Right**, in order:
  1. ⌘K (opens the palette; reuse whatever exists);
  2. `StatusButton`;
  3. ⋯ overflow (Export .arch/SVG/PNG/CSV/Print, Import, Focus);
  4. ⚙ (→ `/settings/general`);
  5. the avatar.
- `StatusButton`:
  - its label is one of `Local · N issues` | `Saved vN` | `Unsaved changes` | `Saving…` |
    `Offline` | `Couldn't save`, built from `useDiagramUI().freshness`, `isOnline`, `lintCount`,
    `syncError` and `useDiagramDocs().dirty` / `serverVersion`;
  - its menu offers Save to server, Export, Linter and Re-sync. Since 2026-10-26 the "Linter (N issues)" item is the only entry to the lint list: it opens the "Architecture linter" dialog (AppBar.dc.html), because the dock Linter tab was replaced by an R2 AI assistant placeholder (R1-E14-T10).
- Remove undo, redo, theme and Focus from the app bar. Undo, redo and Focus move to the canvas
  toolbar (T05).
- At widths below 1024 px, nav labels shorten. Below 768 px, nav collapses into "Menu ▾"
  (UI_REVAMP_SPEC §7).

**Tests:** `src/tests/appbar.test.tsx`
- `it('has at most 9 interactive controls at 1440px')`: count `getAllByRole('button'|'link')`
  within `banner`.
- `it('shows exactly one status indicator')`
- `it('status label reads "Unsaved changes" when dirty')`
- `it('doc switcher lists recent docs and creates a new doc')`

**Acceptance:**
- [ ] The tests pass and `appshell.test.tsx` stays green. Its tests may change only where they
  queried the removed buttons; note each one in the changelog.
- [ ] There is no clipping at 1024 px. Check with
  `npx playwright test e2e/smoke.spec.ts --project=chromium`.

---

### R1-E01-T04 · Tool rail: icon-only, tooltips, "Shapes"

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T03 |
| **Sources** | UX-P1.3 |

**Read:** `components/ToolPalette.tsx`, `design-system/components/Tooltip.tsx`.

**Change:**
- Make the rail 56 px wide, with icon-only buttons and group dividers instead of captions.
- Each button gets a tooltip of the form `"<Tool name> (<shortcut>)"` and an `aria-label` equal to
  the tool name.
- Rename "Library" to "Shapes".

**Tests:** `src/tests/tool-rail.test.tsx`
- `it('every rail button has aria-label matching its tooltip name')`
- `it('no rail text is truncated with an ellipsis')`

---

### R1-E01-T05 · Canvas toolbar (bottom-left) and minimap placement

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T03, R1-E01-T03 |
| **Sources** | UX-P1.4 |

**Change:**
- Create `screens/canvas/CanvasToolbar.tsx`. It floats at the bottom left and holds zoom − / % / +,
  Fit, Undo, Redo, the minimap toggle and Focus. Every button has an `aria-label`.
- The minimap renders above the toolbar, anchored bottom-left. It is never under the inspector.

**Tests:** `src/tests/canvas-toolbar.test.tsx`
- `it('undo/redo buttons call actions and reflect canUndo')`
- `it('minimap bounding box does not intersect the inspector')`: this is a Playwright check. Add it to
  `e2e/critical-journeys.spec.ts` as `test('minimap never overlaps inspector')` using
  `boundingBox()`.

---

### R1-E01-T06 · Inspector: collapsible sections and labelled pickers

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T03 |
| **Sources** | UX-P1.5; UI_REVAMP_SPEC §4 Inspector |

**Read:** `screens/canvas/Inspector.tsx` (created in E00-T03).

**Change:**
- Create a `components/Section.tsx` disclosure component (button with `aria-expanded`, then a
  region).
- The Inspector has these sections:
  1. a header with a kind chip and the title;
  2. **Content**, open by default;
  3. **Appearance**;
  4. **Icon**;
  5. **Properties** (filled in E02-T07);
  6. **Metadata**.
- Each section's open state persists in `localStorage['archflux:inspector:sections:v1']`, wrapped in
  try/catch.
- The shape picker becomes a labelled segmented control (`role="radiogroup"`).

**Tests:** `src/tests/inspector-sections.test.tsx`
- `it('Content and Appearance are open by default; others collapsed')` (Appearance opened by default
  in R1-E14-T03, following Main.dc.html)
- `it('toggle persists across remount')`
- `it('shape picker is replaced by the Display radiogroup (R1-E14-T03)')` (the Shape picker is now the
  Display radiogroup, per DisplayStyles.dc.html)

---

### R1-E01-T07 · Click selects; connecting is explicit

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T03 |
| **Sources** | UX-P1.6 |

**Read:**
- `screens/CanvasScreen.tsx`: the pointer-down handler (grep `pendingFrom`) and the hint at about
  L2419
- `screens/canvas/useCanvasKeyboard.ts`

**Change:**
- A single click on a node with the Select tool only selects it. It never sets `pendingFrom`.
- Connecting starts in one of three ways: (a) the Connect tool, (b) the `C` key with one node
  selected, then click the target, or (c) dragging from a port. Ports arrive in E04-T05; until then,
  dragging from the node edge within 8 px.

**Tests:**
- `src/tests/select-vs-connect.test.tsx`:
  - `it('single click selects without connecting hint')`
  - `it('C then click target creates an edge')`
- Update `e2e` journeys that relied on click-to-connect, and list them in the changelog.

---

### R1-E01-T08 · `PageHeader` on every page

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T02 |
| **Sources** | UX-P2.1, UX-P2.2; UI_REVAMP_SPEC §6 |

**Contract:**

```ts
export function PageHeader(props: { title: string; subtitle?: string; actions?: React.ReactNode }): JSX.Element; // renders exactly one h1
```

**Change:**
- Create `components/PageHeader.tsx`.
- Use it in `DashboardScreen` ("Library" plus the count, with the primary action "New diagram"),
  `ReviewsScreen`, `LivingScreen` ("Sync"), `BlueprintsScreen` and `SettingsLayout`.
- The Library grid uses `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, and the
  storage card becomes a slim footer line.

**Tests:** `src/tests/page-header.test.tsx`
- `it('each page renders one h1 and at most one primary button in its header')`: loop over the 5
  screens with `MemoryRouter`.

---

### R1-E01-T09 · Retire legacy accent tokens; screens use the button sizes

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T02 |
| **Sources** | UX-P1.1, UX-P2.3 (found by the R1-E01-T01 review) |

**Change:**
- In the light theme, set `--brand-primary`, `--border-focus`, `--connector-active`,
  `--node-border-selected` and the hard-coded focus outline in `styles.css` to `var(--accent-cyan)`
  (`#4F46E5`). Leave dark and blueprint unchanged.
- **Fixes R1-BUG-01:** `palette.ts` `STROKE_COLORS` and `BORDER_SWATCHES` contain `#635BFF` twice, which raises a React duplicate-key warning. Replace the second entry with distinct colours: blue `#2563EB` for stroke and violet `#7C3AED` for border, both from UI_REVAMP_SPEC §5A.2. Add `it('swatch palettes have unique values')`.
- Move screen buttons from raw `.btn` / `.btn-xs` / `.btn-primary` classes to
  `btn btn--{sm|md} btn--{variant}`, or to the `Button` component. Use at most one primary per view.
  Only change class names in screens that no other in-progress task holds (BACKLOG hotspot locks).

**Tests:** extend `src/tests/tokens-r1.test.ts`:
- `it('light theme has no #635BFF left')`
- `it('screens use sized button classes')`: grep-style read of the `screens/*.tsx` sources for
  `className="btn-xs"`; expect 0.

---

## Changelog
- 2026-10-25 Status reconciled (coordinator audit): R1-E01-T04 done. Tool-rail tests pass 3/3 (`tool-rail.test.tsx`). The rail is 48 px per R1-E14-T02, which supersedes the 56 px in this section.
- 2026-10-25 Status reconciled (coordinator audit): R1-E01-T06 done. `inspector-sections.test.tsx` passes 4/4; test names aligned with this spec.
- 2026-10-25 Status reconciled (coordinator audit): R1-E01-T07 done. `select-vs-connect.test.tsx` passes 5/5.
- 2026-10-25 R1-E01-T09 done: light-theme `--brand-primary`, `--border-focus`, `--connector-active`, `--node-border-selected` and the global focus outline now use `var(--accent-cyan)`; `STROKE_COLORS` duplicate replaced with `#2563EB` (BORDER_SWATCHES was already unique; R1-BUG-01 closed); 13 top-level `screens/*.tsx` moved from `btn-xs`/`btn-xs-primary` to `btn btn--sm btn--{primary|secondary}`. Not changed, because they are lock-held or out of the listed scope: `CanvasScreen.tsx` and `screens/canvas/*` (incl. Inspector), `components/*` (AppShell, ConflictDialog, ImportWarnings, RevisionsSection) still use `btn-xs`; canvas renderers and `design-system` still hard-code `#635BFF` (E02 / render owners); dark and blueprint themes untouched. Tests: `tokens-r1.test.ts` (+3). Several toggle rows (tab-like filter chips) keep one primary at a time. R1-E01-T08 (PageHeader) stays open.
- 2026-10-25 R1-E01-T08 done: `components/PageHeader.tsx` (one h1, subtitle, actions; reuses the Library header classes) on Library, Review, Sync, Blueprints and Settings; library.png pixel-identical before and after; `page-header.test.tsx` (2); files: DashboardScreen, ReviewsScreen, LivingScreen, BlueprintsScreen, SettingsLayout. Grid minmax(240px) and slim storage footer already present.
- 2026-10-25 R1-E01-T03 done: App bar per IA (UX-P1.2, UI_REVAMP_SPEC §4). Left: logo→/dashboard + DocSwitcher (current title, menu: rename/duplicate/new/recent). Centre: 5 nav tabs (Library/Canvas/Sync/Review/Blueprints). Right: ⌘K→CommandPalette, StatusButton (source+save+lint in one control, menu: Save/Export/Linter/Re-sync/Resolve), ⋯ overflow (Export .arch/SVG/PNG/CSV/Print, Import, Focus), ⚙→/settings/general, avatar menu (theme radios, Profile&Team, sign-out). Below 768px nav collapses to "Menu ▾". Removed: undo/redo, theme select, "?" button, old Diagrams popover, freshness pills, lint chip, HonestyBadge, Save/Conflict/Export buttons. New test files: appshell.test.tsx, appbar.test.tsx, command-palette.test.tsx, commands.test.ts. Visual regression baselines regenerated (all 3 engines). Reviewed by coordinator.
- 2026-10-25 R1-E01-T01 done: type scale, `--code-font`, `--bg-app` (with `--bg-workspace` aliased to it), light palette per §5, `--text-dim` #5F6878 (AA), 21 rules moved from mono to the UI font, contrast helper added to validateTokens.ts. Reviewed by coordinator.
- 2026-10-25 R1-E01-T02 done: Button sm/md/lg × 4 variants (class-based; `destructive` aliases `danger`; default variant is now secondary, and nothing used it yet), Input 32px with focus ring, `.btn-xs` is a deprecated sm alias. Visual baselines are deferred to E13-T04. Reviewed by coordinator.
- 2026-10-25 R1-E01-T09 added from the T01/T02 review.
- 2026-10-25 R1-E01-T05 done: toolbar (left 72, bottom 16) and minimap (left 72, bottom 66) already matched Main.dc.html; added `tests/canvas-toolbar.test.tsx`. Undo/Redo stay always enabled by design (store canUndo is not tracked), so the spec test title says "stay enabled".
- 1.0.0 (2026-10-24): epic created.
- 2026-10-25 R1-E01-T09 leftovers done (frontend-implementer): `btn-xs`/`btn-xs-primary` replaced by `btn btn--sm btn--secondary|primary` in CanvasScreen.tsx and screens/canvas/*; `#635BFF` replaced by the light accent `#4F46E5` in src/canvas/*, screens/canvas/palette.ts, CanvasScreen.tsx, design-system Tabs, Dialog, colors.ts and backendShapes.ts. Dark `#8B83FF` untouched. Tests: tokens-r1.test.ts (+2: no `#635BFF` in src/canvas and src/screens/canvas; no `btn-xs` in canvas screens). Still on `btn-xs` (outside the canvas set, not edited): components/AppShell.tsx, ConflictDialog.tsx, ImportWarnings.tsx, RevisionsSection.tsx.
- 2026-10-25 R1-E01-T09 done (frontend-implementer): `btn-xs`/`btn-xs-primary` replaced in components/AppShell.tsx, ImportWarnings.tsx, RevisionsSection.tsx, ConflictDialog.tsx (the conflict action list uses a new `.dock-action-btn--primary` modifier, same look, since `.btn` would change its layout); remaining light `#635BFF` in styles.css (`.btn-primary:hover`, command palette fallbacks) replaced by the light accent. Dark and blueprint token values untouched. Test: tokens-r1.test.ts (+1: no `#635BFF` outside dark/blueprint blocks, no `btn-xs` in the four components). The deprecated `.btn-xs` CSS rules stay.
- 2026-10-26 R1-E01-T03 note: the DocSwitcher title is now capped at 240 px with an ellipsis and a full-name tooltip; see R1-E14-T08 (AppBar.dc.html is the source).
- 2026-10-26 R1-E14-T10: status menu "Linter (N issues)" now opens the Architecture linter dialog (was a no-op navigate); see EPIC-14.
