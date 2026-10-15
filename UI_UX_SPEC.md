# ArchFlux UI/UX Design Specification

> **Version:** 2.4.0 | **Last Updated:** 2026-10-15 | **Status:** ✅ Current
> **Part of:** [Master Spec](SPEC.md) | **Maintenance:** [Protocol](SPEC.md#spec-maintenance-protocol)
> **Cross-ref:** [Frontend Spec](FRONTEND_SPEC.md) for implementation, [Backend Spec](BACKEND_SPEC.md) for API contracts.
> **Governing contract:** [Productization Spec v3.0.0](PRODUCTIZATION_SPEC.md) — see
> [§16 Productization — Status Language & Honest Labeling](#16-productization-v300--status-language--honest-labeling).

## About this revision (2.1.0 → 2.2.0)

This revision is a structural and content upgrade. It does not change shipped behavior; it makes the spec reliable enough to build, test, and review against.

**Reconciled (defects in 2.1.0):**

1. **Duplicate and contradictory status entries removed.** Drag-to-resize, alignment guides, minimap, dynamic drift, connector modal, settings preview, and the account menu appeared as both _Shipped_ and _Planned_. Each now has exactly one status, tracked in the [Implementation Ledger](#12-implementation-ledger).
2. **Undo/redo contradiction resolved.** §10 listed "Hide undo/redo off-canvas" as _Planned (deferred)_ while also listing "header undo/redo render on the canvas route only" as _Shipped_. The shipped behavior is canonical (see §10.4).
3. **Unclear phrase fixed.** "after auth Paris rollout" had no referent; replaced by an explicit dependency on the auth rollout ([OQ-6](#14-open-questions-risks-and-assumptions)).
4. **Plan item 7 (checkpoint branch filter)** had no UI-spec section. It is now specified in §7.3.

**Added:**

- §0 Foundations: breakpoints, tokens, typography, motion, state matrix, copy rules, persistence registry, keyboard map, test hooks.
- Per-screen requirement IDs (e.g. `CAN-R12`), states, accessibility, persistence, and acceptance criteria.
- §11 Quality bars (accessibility, performance, resilience, privacy), §12 ledger with status, §13 QA matrix, §14 open questions/risks, §15 changelog.

> **Items marked 🆕 are proposals introduced by this revision** (numeric budgets, new shortcuts, token values). They are not yet confirmed against the codebase and should be validated or edited before being treated as contract. Everything else is carried over from 2.1.0.

---

## Legend and Conventions

| Mark | Meaning                                       |
| ---- | --------------------------------------------- |
| ✅   | Shipped                                       |
| 🚧   | In this release (in progress)                 |
| 📋   | Planned (not started)                         |
| ❌   | Superseded (with rationale)                   |
| 🆕   | Proposed in this revision; needs confirmation |
| ❓   | Status unverified; check before relying on it |

- **Requirement language:** MUST / SHOULD / MAY follow RFC 2119 meaning.
- **Requirement IDs:** `<AREA>-R<n>` (e.g. `CAN-R4`). Areas: `LIB`, `CAN`, `ONB`, `DSH`, `LIV`, `REV`, `MRG`, `BLU`, `SET`, `NAV`. IDs are stable; retired IDs are never reused.
- **Acceptance criteria** use Given/When/Then and map to tests in §13.

---

## Design Principles

1. **Function-first taxonomy.** Users think "I need a database," not "I need an AWS database." Provider is metadata, never the primary axis.
   _In practice:_ categories are functional (Microservices, Data & Streaming…); provider appears as a badge/filter, not a top-level grouping.
   _Anti-pattern:_ a library organized by cloud vendor.
2. **Excalidraw-inspired interactions.** Inline editing, contextual toolbars, minimal chrome.
   _In practice:_ edit labels in place; controls appear next to the selection, not in a distant panel.
   _Anti-pattern:_ modal dialogs for single-field edits.
3. **Progressive disclosure.** Show only what is relevant; hide advanced options until needed.
   _In practice:_ collapsed dock sections, expandable connector rows, advanced settings behind a group.
4. **Visual hierarchy.** Clear information architecture with consistent patterns.
   _In practice:_ one primary action per view; consistent placement of status, filters, and destructive actions.
5. **Keyboard-first.** Every action has a shortcut; power users never need the mouse.
   _In practice:_ every toolbar button has a command-palette entry and, where frequent, a rebindable shortcut.
6. **Local-first honesty.** Simulated or provisional UI is always labeled as such; derived data shows its source.
   _In practice:_ "Simulated" badges on mock webhooks and curated PRs; derived endpoint tables cite "derived from canvas."
   _Anti-pattern:_ a mock row that looks identical to live data.
7. 🆕 **Never lose work.** Drafts survive unmount, reload, and navigation; destructive actions are undoable or two-step.
8. 🆕 **Calm by default.** No unsolicited motion, toasts only for outcomes the user triggered, and no blocking modals for recoverable errors.

---

## 0. Foundations

### 0.1 Responsive breakpoints

Derived from thresholds already stated in 2.1.0 (dock at 600px, minimap at 900px).

| Tier    | Width     | Layout rules                                                                                                                     |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Phone   | < 600px   | Icon-only tab rail; right dock becomes a bottom sheet opened by a FAB; minimap off; hover affordances replaced by tap/long-press |
| Compact | 600–899px | Dock open by default and collapsible; minimap off by default (user can enable)                                                   |
| Regular | ≥ 900px   | Dock open; minimap available (default per Settings)                                                                              |

- CAN/NAV layouts MUST NOT cause horizontal page scroll at any width ≥ 320px.
- The header uses the scroll → wrap → min-width cascade already shipped; any new header control MUST fit that cascade.

### 0.2 Theme and tokens 🆕

All colors, spacing, radii, and shadows come from semantic tokens. Components never hardcode hex values.

| Token group | Examples                                                  | Notes                                           |
| ----------- | --------------------------------------------------------- | ----------------------------------------------- |
| Surface     | `--surface-canvas`, `--surface-panel`, `--surface-raised` | Distinct per theme                              |
| Text        | `--text-primary`, `--text-muted`, `--text-on-accent`      | Body text ≥ 4.5:1 on its surface                |
| Accent      | `--accent`, `--accent-hover`, `--guide`                   | `--guide` is the cyan used for alignment guides |
| Status      | `--ok`, `--warn`, `--error`, `--info`, `--simulated`      | Never rely on color alone (see §11.1)           |
| Elevation   | `--shadow-1/2/3`                                          | Dock, popovers, modals                          |
| Radius      | `--radius-sm/md/lg`                                       | Nodes use `--radius-md`                         |

The theme switcher MUST apply without reload and persist per browser. Canvas, minimap, and thumbnails MUST re-render in the active theme (no baked-in colors in SVG output except user-chosen node colors).

### 0.3 Typography and spacing 🆕

- Base size 14px UI / 16px reading surfaces; scale uses a modular ratio (12 / 14 / 16 / 20 / 24).
- Spacing on a 4px grid (4, 8, 12, 16, 24, 32).
- Numerals in tables, counts, and the storage meter use tabular figures.
- Truncate with ellipsis plus a `title`/tooltip showing the full text; never clip silently.

### 0.4 Motion 🆕

- Durations: micro 100ms, standard 180ms, panel 240ms. Easing: standard ease-out for enter, ease-in for exit.
- `prefers-reduced-motion: reduce` MUST disable pan/zoom animation, dock slide, and toast slide (use opacity or instant change).
- No looping animation except progress indicators.

### 0.5 State matrix

Every data-bearing view MUST define these states. Missing states are spec defects.

| State   | Requirement                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Empty   | Explains what belongs here and offers the primary action (e.g. "Create a blank canvas")                 |
| Loading | Skeleton or inline progress; layout does not shift when data arrives                                    |
| Error   | Plain-language cause, one recovery action (Retry / Reload / Reconnect), details collapsed               |
| Offline | Persistent banner; local-only actions stay enabled; server-dependent actions are disabled with a reason |
| Partial | Derived or simulated data labeled with its source                                                       |
| Success | Inline confirmation or toast; undoable where possible                                                   |

### 0.6 Copy rules 🆕

- Sentence case. Verbs for actions ("Save as blueprint"), nouns for destinations.
- Errors say what happened and what to do next; no raw exception text in the primary line.
- Simulated/provisional surfaces carry the literal label **Simulated** or **Derived from canvas**.
- Counts are always pluralized correctly ("1 shape", "6 shapes").

### 0.7 Persistence registry

One owner per key. Keys are versioned; a version bump ships with a migration or a safe reset. Reads MUST be wrapped in try/catch and tolerate missing, corrupted, or oversized values.

| Key                             | Owner                   | Contents                                              |
| ------------------------------- | ----------------------- | ----------------------------------------------------- |
| `archflux:recent-shapes:v1`     | Library drawer          | Last 8 placed shape ids, newest first                 |
| `archflux:pinned`               | Dashboard               | Pinned diagram ids                                    |
| `archflux:team:v1`              | Team settings / Reviews | Team members and roles (shared store)                 |
| `archflux:blueprints:custom:v1` | Blueprints              | Custom blueprints with full graph payload             |
| `archflux:settings:v1`          | Settings                | Canvas/export/shortcut preferences + webhook fields   |
| `archflux:connectors:v1`        | Living Sync             | Connector list (name, detail, icon, status)           |
| `archflux:dashboard:view:v1`    | Dashboard               | Grid/table view + sort key                            |
| `archflux:minimap:v1`           | Canvas                  | Minimap open/closed preference                        |
| `archflux:v2-light`             | Store persist           | Documents, active doc, review state, pan/zoom, theme   |
| `archflux:mutation-queue:v1`    | API layer               | Queued offline mutations                              |
| `archflux:session`              | Auth gate               | Session mode (`guest`/`email`/…)                      |
| `archflux:auth_token`           | Auth                    | Bearer JWT (never rendered, cleared on sign-out)      |
| `archflux:onboarded`            | Onboarding/Settings     | Setup completed flag (replay clears it)               |
| `archflux:persona` / `:providers` | Onboarding            | Persona choice + provider scope                       |
| `archflux:pending-draft`        | Canvas text editor      | Uncommitted draft rescued on unload                   |
| `archflux:corrupt-backup`       | Error recovery          | Stashed broken graph                                  |
| `archflux:preserve-layout`      | Living Sync             | Keep manual positions during sync                     |
| `archflux:last-ping`            | Living Sync             | Last webhook ping display time                        |
| `archflux:ack-drift:v1` ✦       | Living Sync             | Acknowledged lint-drift ids — **sessionStorage**      |
| `archflux:merged-prs:v1` ✦      | Merge tab               | Merged PR ids — **sessionStorage** (MRG-R6)           |

✦ = session-scoped (survives reload within the tab session, resets when it ends).

### 0.8 Keyboard map

Confirmed shortcuts are marked ✅; all others are 🆕 proposals and MUST be rebindable in Settings with clash detection (shipped).

| Context     | Keys                         | Action                                            |
| ----------- | ---------------------------- | ------------------------------------------------- |
| Onboarding  | `1`–`4`, `Enter`             | Select persona, continue ✅                       |
| Global      | `Ctrl/⌘+K`                   | Command palette ✅                                |
| Global      | `?`                          | Shortcuts dialog ✅                               |
| Canvas      | `Ctrl/⌘+Z`, `Shift+Ctrl/⌘+Z` | Undo, redo                                        |
| Canvas      | `Esc`                        | Clear selection / close popover / exit focus mode |
| Canvas      | Arrow keys / `Shift`+Arrow   | Nudge selection 1px / 10px ✅                     |
| Canvas      | `Delete` / `Backspace`       | Delete selection (undoable)                       |
| Canvas      | `F`                          | Zoom to selection (fit-all when nothing selected) ✅ |
| Canvas      | `M`                          | Toggle minimap ✅                                 |
| Drag/resize | `Shift`                      | Lock aspect on resize ✅                          |
| Drag        | Hold `Alt`                   | Temporarily disable snapping ✅                   |

### 0.9 Test hooks

- Canvas exposes `data-nodes`, `data-edges`, and `data-icons-ready` ✅. Tests MUST wait on `data-icons-ready` before asserting visuals.
- Interactive elements carry stable `data-testid` values (examples used in this spec: `dock-reopen`). New controls MUST add a test id when introduced.
- Visual-baseline tests render in a fixed theme, fixed viewport, and with animations disabled.

---

## 1. Shape Library

### ✅ Shipped: function-first taxonomy

Categories: Microservices, Cloud Native, AI/RAG, Security & Auth, Data & Streaming. Each shape carries provider metadata. The drawer provides search, category pills, and counts (`BlueprintsScreen`, `mocks.ts`).

**Requirements**

- `LIB-R1` Search MUST match shape name, category, and provider, case-insensitively, and update results as the user types.
- `LIB-R2` Category pills MUST show live counts that reflect the current search and provider scope.
- `LIB-R3` The provider scope from onboarding MUST filter the library; empty scope means all shapes (see §3).
- `LIB-R4` Placing a shape (click or drag) adds it at the viewport center or drop point and selects it.
- `LIB-R5` Empty search result shows "No shapes match" with a clear-filters action.

### ✅ Shipped: recently-used strip

Horizontal strip at the top of the drawer showing the last 8 placed shapes, persisted in `archflux:recent-shapes:v1`.

- `LIB-R6` Re-placing a shape moves it to the front without duplicating it.
- `LIB-R7` The strip MUST be hidden (not shown empty) until at least one shape has been placed.
- `LIB-R8` Shape ids that no longer exist in the library MUST be dropped silently on read.
- `LIB-R9` 🆕 The strip is keyboard-reachable and each item announces its name and category.

**Acceptance**

- Given 9 distinct placements, when the drawer opens, then 8 items show with the newest first and the oldest is gone.
- Given a stored id for a removed shape, when the drawer opens, then no error shows and remaining items render.

**Tests:** unit for recency math (dedupe, cap, order, stale-id drop).

---

## 2. Canvas

### 2.1 ✅ Shipped capabilities

- Inline text editing: click-to-type draft with rescue on unmount/reload.
- Contextual floating toolbar: selection-adjacent, memoized position.
- Right dock with Inspector, Linter, and Live tabs: collapsible; default open above 600px; bottom sheet plus FAB on phones.
- Zoom to selection (`panToNode`); undo/redo with depth tooltips.
- Canvas readiness signals for tests (§0.9).
- **Drag-to-resize**, **alignment guides + snap**, **minimap** (details below).

### 2.2 Inline editing

- `CAN-R1` Starting an edit creates a draft that is saved on blur/`Enter`, cancelled on `Esc`.
- `CAN-R2` If the component unmounts or the page reloads mid-edit, the draft MUST be rescued and restored on next load.
- `CAN-R3` Multi-line labels use `Shift+Enter` for newline; `Enter` commits.

### 2.3 Floating toolbar

- `CAN-R4` Appears adjacent to the selection, positioned to remain within the viewport (flips above/below as needed).
- `CAN-R5` Position is memoized so it does not jitter while the selection is stable.
- `CAN-R6` Hidden during drag, resize, pan, and inline edit.
- `CAN-R7` 🆕 On phones the toolbar docks to the bottom edge above the FAB rather than floating.

### 2.4 Drag-to-resize ✅

Grips on East, South, and South-East.

- `CAN-R8` Size is clamped to 100×50 minimum and 400×200 maximum.
- `CAN-R9` Holding `Shift` locks the aspect ratio.
- `CAN-R10` A resize gesture is one undo step: MUST call `checkpoint` before the first change and use `updateNode` for updates so history stays coherent.
- `CAN-R11` Grips are shown only for a single selected node and are at least 24×24 hit area (visual handle may be smaller). 🆕
- `CAN-R12` Resizing re-routes connected edges in real time.

**Acceptance**

- Given a 120×60 node, when the user drags the SE grip to 600×400, then the node is 400×200.
- Given one resize gesture, when the user presses undo once, then the node returns to its pre-gesture size.

### 2.5 Alignment guides and snap ✅

- `CAN-R13` While dragging, edge and center anchors of other nodes within the snap threshold render as cyan (`--guide`) guides and the dragged node snaps to them.
- `CAN-R14` The snap threshold honors Settings (default 5px per the original plan); a threshold of 0/off disables snapping and guides.
- `CAN-R15` Guides disappear on drop and never persist in saved data or exports.
- `CAN-R16` 🆕 Holding the snap-bypass modifier suspends snapping without changing the setting.

### 2.6 Minimap ✅

- `CAN-R17` 160px overview with a viewport rectangle; clicking or dragging navigates the main viewport.
- `CAN-R18` Toggleable; the toggle is persisted. Default is off under 900px and hidden in focus mode.
- `CAN-R19` Must render nodes in under one frame budget for diagrams up to the supported size (see §11.2).

### 2.7 Right dock

- `CAN-R20` Tabs (Inspector, Linter, Live) preserve scroll position and selection when switching.
- `CAN-R21` Collapse state persists per session; the phone FAB (`dock-reopen`) reopens it.
- `CAN-R22` Linter results link to nodes; selecting a result pans to and selects the node.

### 2.8 History

- `CAN-R23` Header undo/redo show depth tooltips (e.g. "Undo (3)"); disabled at stack boundaries.
- `CAN-R24` Every mutating gesture is exactly one history entry (move, resize, delete, paste, blueprint load).

### 2.9 ❌ Superseded: Inspector/Linter permanent split view

Tabs plus a collapsible dock won: a split permanently consumes ~320px of canvas on laptops, while tabs plus collapse provide focus and access. `dockOpen` and the `dock-reopen` FAB are the agreed compromise.

### 2.10 ❌ Superseded: on-canvas undo/redo (bottom-left)

Header undo/redo is canonical: one undo affordance, discoverable everywhere, no duplicated canvas chrome. (See §10.4 for route scoping.)

### 2.11 States

| State            | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Empty canvas     | Hint to open the library or load a blueprint; does not block interaction |
| Loading document | Skeleton canvas; `data-icons-ready` stays false until icons resolve      |
| Load failure     | Error with Retry and "Open dashboard"                                    |
| Offline          | Editing continues locally; Live tab shows the offline state              |

### 2.12 Accessibility

- `CAN-R25` 🆕 Nodes are focusable in a deterministic order (left-to-right, top-to-bottom); `Tab` moves between them, arrow keys nudge.
- `CAN-R26` 🆕 The canvas has a text alternative: an accessible node/edge list (name, type, connections) reachable from the dock.
- `CAN-R27` 🆕 Selection and focus are visually distinct and not conveyed by color alone.

**Tests:** unit for geometry (`canvasGeometry.ts`) and snap math; E2E for minimap toggle, resize clamp, guide visibility.

---

## 3. Onboarding — ✅ Shipped

Skip link (footer-correct copy), four personas including "Other / Not sure," provider pills, blueprint recommendations per persona, keyboard flow.

**Flow**

1. Persona: `1`–`4` selects, `Enter` continues. "Other / Not sure" yields neutral recommendations.
2. Providers: multi-select pills with live preview.
3. Recommendations: blueprints matched to persona (and provider where relevant).

**Requirements**

- `ONB-R1` The skip link is available at every step and its copy matches the footer wording.
- `ONB-R2` Persona selection is reversible until completion; Back preserves choices.
- `ONB-R3` Completing or skipping sets a persisted "onboarded" flag so the flow is not shown again; Settings offers a way to re-run it. 🆕

### ✅ Shipped (this release): provider selection preview

Step 2 shows "Your shape library will show N shapes" with up to 6 shape icons.

- `ONB-R4` Empty selection means all shapes. The count updates immediately on each toggle.
- `ONB-R5` An alias map normalizes provider names (e.g. Google Cloud → GCP); the preview and the library MUST use the same map so counts agree.
- `ONB-R6` When N is 1, copy reads "1 shape"; when N is 0 (a provider with no shapes), show a warning and keep Continue enabled with an explanation. 🆕
- `ONB-R7` Icon previews have empty `alt` text (decorative); the count line carries the information.

**Acceptance:** Given providers "AWS" and "Google Cloud" selected, then the preview count equals the library count after onboarding completes.
**Tests:** unit for alias map and count; E2E keyboard flow `1`–`4` + `Enter`.

---

## 4. Dashboard — ✅ Shipped

Pinning (`archflux:pinned`), recently-opened top five, multi-select with bulk delete, storage meter, grid and table views, empty states.

**Requirements**

- `DSH-R1` Pinned diagrams appear first in both views; unpinning returns them to their normal order.
- `DSH-R2` Recently-opened shows the five most recent, excluding deleted diagrams.
- `DSH-R3` Bulk delete requires confirmation stating the count; it MUST be undoable for a short window (🆕 10s toast with Undo) or explicitly irreversible in the dialog copy.
- `DSH-R4` Storage meter shows used/total with a text value, and switches to a warning style at ≥ 80% 🆕 and error style at ≥ 95% 🆕. Hitting the limit offers "Free up space" (opens bulk-select).
- `DSH-R5` Grid/table choice persists. Table columns are sortable with `aria-sort`. 🆕
- `DSH-R6` Empty states differ for "no diagrams" (offer quick actions) and "no search results" (offer clear search).

### ❌ Superseded: remove "From Template" quick action

Kept. The quick-action row (`Blank Canvas / From Template / Import .arch`) is the fastest path to a new diagram and tests depend on it.

**Quick actions**
| Action | Result |
|--------|--------|
| Blank Canvas | New empty diagram, opens canvas |
| From Template | Opens Blueprints (insert flow with dirty-guard not needed for new doc) |
| Import .arch | Validated import (see §5.4); errors shown inline, nothing partially imported |

**Tests:** E2E for pin persistence, bulk delete, and quick-action row presence.

---

## 5. Living Sync

### 5.1 ✅ Shipped

Status overview, connectors (add/retry/remove, persisted), drift reconciler (accept/reject), idempotent re-sync with progress, file transfer (`.arch` download plus validated import), offline banner.

- `LIV-R1` Re-sync is idempotent: running it twice with no changes yields the same state and no duplicate rows.
- `LIV-R2` Re-sync shows determinate progress when the total is known, otherwise an indeterminate indicator with a Cancel action. 🆕
- `LIV-R3` The offline banner is persistent and explains which actions are unavailable.
- `LIV-R4` `.arch` import validates schema and size before touching the current document; failure leaves the document unchanged and lists the first errors.

### 5.2 ✅ Shipped (this release): dynamic drift

Drift rows derive from live lint state (isolated nodes, dangling wires) merged with upstream rows.

- `LIV-R5` Derived rows are labeled **Derived from canvas**; upstream rows keep their source label.
- `LIV-R6` Lint rows are acknowledged per session (not persisted across sessions).
- `LIV-R7` Accepting a lint row navigates to the canvas and highlights the node; highlight clears on next selection or after a short timeout (🆕 3s).
- `LIV-R8` Rejecting an upstream row records the decision and removes it from the pending count; rejecting is reversible from history. 🆕
- `LIV-R9` Row order is deterministic: severity, then type, then name. 🆕

### 5.3 ✅ Shipped (this release): connector configuration modal

Creation uses a modal with name, type, and target, producing a composed detail line and icon.

- `LIV-R10` Fields validate inline; the Create button is disabled until required fields are valid.
- `LIV-R11` The composed detail is a pure function of the fields (testable without UI).
- `LIV-R12` `Esc` cancels with no side effects; focus returns to the Add button.
- `LIV-R13` Credentials are **not** collected (see Deferred). The modal MUST say so near the target field. 🆕

### 5.4 🚧 In this release: connector contract inspection

OpenAPI connector rows expand to an endpoint table derived from the canvas graph (see [Frontend Spec](FRONTEND_SPEC.md#api-contract-derivation-local-first)).

- `LIV-R14` Expanding a row shows a table: method, path, source node, and (if known) request/response summary.
- `LIV-R15` The table carries the **Derived from canvas** label (local-first honesty).
- `LIV-R16` Empty state when the canvas has no REST/gRPC routes: explains what is needed and links to the library.
- `LIV-R17` Rows are sortable by path and filterable by method. 🆕
- `LIV-R18` Clicking a row selects the source node on the canvas. 🆕
- `LIV-R19` Expansion is keyboard-operable (`Enter`/`Space` toggles; `aria-expanded`).

**Acceptance**

- Given a canvas with two REST routes, when the row expands, then two table rows appear labeled as derived.
- Given a canvas with no routes, when the row expands, then the empty state shows and no empty table renders.

**Tests:** E2E for the resync flow and add-connector flow; unit for derivation.

### 5.5 Deferred

Connector credential storage, backend contract registry (next release).

---

## 6. Reviews

### 6.1 ✅ Shipped

Dynamic PR title from the active document, reviewer avatars with approve/request-changes decisions, checkpoint timeline (tag, restore, two-click delete), checkpoint diff (A/B compare with legend), branch creation (`⑂ Create Branch` → local duplicate plus server branch), threaded comments with resolve/reopen and @mentions.

- `REV-R1` Restoring a checkpoint is undoable and first checkpoints the current state so nothing is lost.
- `REV-R2` Delete is two-click: first click arms (label changes to "Confirm delete," reverts after a few seconds 🆕), second click deletes.
- `REV-R3` Diff A/B selection prevents A = B and labels additions, removals, and modifications in the legend using shape and text in addition to color.
- `REV-R4` Branch creation duplicates locally first; if the server branch fails, the UI shows the failure and offers Retry without losing the local duplicate.
- `REV-R5` Resolved threads collapse but remain reopenable; unresolved count is shown in the tab. 🆕
- `REV-R6` @mentions autocomplete from the team store; unknown handles remain plain text.

### 6.2 ✅ Shipped (this release): reviewers from team settings

Reviewer slots read `archflux:team:v1`; Admins pre-approve; falls back to the static trio when the team list is empty.

- `REV-R7` Changes in Team settings reflect on the next Reviews render without reload.
- `REV-R8` Pre-approval is visually distinct from a user-made approval ("Auto-approved (Admin)"). 🆕
- `REV-R9` The fallback trio is labeled **Sample reviewers** so it is not mistaken for real people (local-first honesty). 🆕

### 6.3 📋 Planned: visual diff view

Side-by-side checkpoint render (two mini canvases) alongside the current text diff. Implementation: side-by-side `BlueprintThumb` (plan item 13).

- `REV-R10` A/B panes share a viewport transform option ("Sync pan/zoom") 🆕.
- `REV-R11` Added, removed, and modified nodes are marked with outline plus icon/pattern, not color alone.
- `REV-R12` Text diff and visual diff stay in sync: selecting an entry highlights it in both.
- `REV-R13` Falls back to text diff when either checkpoint cannot be rendered.

**Acceptance:** Given two checkpoints differing by one added node, then the right pane marks exactly one added node and the text diff lists one addition.
**Tests:** visual baseline.

---

## 7. Merge & Automation (ex-Reviews → Merge tab, `GitScreen`)

### 7.1 ✅ Shipped

Live gating checks computed from canvas state (schema, lint, drift), simulated webhook worker with latency and history, cURL copy.

- `MRG-R1` Gating checks are recomputed whenever the canvas changes; each check shows pass/fail/running with a text label.
- `MRG-R2` Merge is blocked while any required check fails, with the failing check named in the disabled-state tooltip. 🆕
- `MRG-R3` The webhook worker is labeled **Simulated**; latency and history entries show their (simulated) timing.
- `MRG-R4` cURL copy produces a complete, runnable command, redacts secrets by default 🆕, and confirms with a toast.

### 7.2 ✅ Shipped (this release): PRs from checkpoint history

PR list = checkpoint-derived entries (newest first) plus curated mock PRs. Functional merge flips status to ✓ Merged (persisted per session). The branch history card renders the linear checkpoint commit log.

- `MRG-R5` Curated PRs are labeled **Sample** and cannot be merged for real; checkpoint-derived PRs are merge-capable.
- `MRG-R6` Merged status persists for the session; reload within the session keeps it. Across sessions it resets (known limitation, [OQ-3](#14-open-questions-risks-and-assumptions)).
- `MRG-R7` The commit log is linear, newest first, with checkpoint name, time, and branch badge.

### 7.3 Checkpoint branch filter (plan item 7) ✅

`api.listCheckpoints(diagramId, branch?)` backed by `GET checkpoints?branch=`. The branch history card offers a branch input (default: last used, else `main`) plus Load; results list title/meta/branch; unknown branches show "No checkpoints on this branch." The selection persists in `archflux:git-branch:v1`. Local-only docs show a save-to-server hint instead.

- `MRG-R8` The branch history card offers a branch selector (default: current branch). Selecting a branch re-queries with `branch=`.
- `MRG-R9` An unknown or deleted branch returns an empty list, not an error; UI shows "No checkpoints on this branch."
- `MRG-R10` The selected branch is reflected in the URL or session state so reload retains it. 🆕

**Tests:** backend filter test; unit for derivation order.

### 7.4 📋 Planned: branch visualization

Linear history with branch badges (already partly delivered by the commit log). Remaining scope: render fork points and merge points when branches exist. Do not build graph layout until multiple branches are common ([OQ-4](#14-open-questions-risks-and-assumptions)).

---

## 8. Blueprints

### 8.1 ✅ Shipped

Search and category filters with counts, preview modal (node list, counts), load/insert with dirty-guard confirm, undoable loads.

- `BLU-R1` Loading replaces the document; inserting merges into it. Both are one undo step.
- `BLU-R2` The dirty-guard confirm appears only when unsaved changes exist and states what will be replaced.
- `BLU-R3` Search and category counts follow the same rules as the shape library (`LIB-R1`, `LIB-R2`).

### 8.2 ✅ Shipped (this release)

**SVG thumbnails.** Deterministic mini-map from each blueprint's graph payload (nodes as rects, routes as lines), replacing the emoji tile.

- `BLU-R4` Thumbnail output is deterministic: the same payload yields byte-identical SVG.
- `BLU-R5` Bounds and scale are computed from node extents with padding; a single-node or empty payload renders a valid placeholder, never `NaN`. 🆕
- `BLU-R6` Colors use theme tokens so thumbnails adapt to light/dark.

**Edge list in preview.** A routes section sits alongside the node list.

- `BLU-R7` Each route shows source → target by node label; dangling routes are flagged. 🆕

**Save as blueprint.** "Save current canvas as blueprint" with a title input; persists the full payload to `archflux:blueprints:custom:v1`; custom section with delete.

- `BLU-R8` Title is required, trimmed, and limited to 80 characters 🆕; duplicates are allowed but disambiguated with a timestamp suffix. 🆕
- `BLU-R9` Saving is blocked on an empty canvas with an explanation.
- `BLU-R10` If storage is full or unavailable, show a clear error and keep the canvas untouched.
- `BLU-R11` Deleting a custom blueprint is confirmed and not undoable (copy says so). 🆕
- `BLU-R12` Custom blueprints are labeled **Custom** and listed separately from built-ins.

**Acceptance:** Given a canvas with 3 nodes, when saved as "My API," then reload shows the entry in the custom section with a 3-node thumbnail.
**Tests:** unit for bounds/scale and persist/merge/delete; E2E for preview showing routes.

---

## 9. Settings

### 9.1 ✅ Shipped

Canvas defaults, export preferences, per-tool shortcut rebinding with clash detection, reset.

- `SET-R1` Rebinding rejects clashes and names the conflicting action; the user can swap or cancel.
- `SET-R2` Reserved keys (e.g. `Esc`) cannot be rebound. 🆕
- `SET-R3` Changes apply immediately and persist; there is no separate Save.

### 9.2 ✅ Shipped (this release): descriptions, live preview, reset-all

Every control carries a `title` tooltip; the live SVG preview reflects grid and curve choices; Reset-all restores `DEFAULT_SETTINGS` alongside shortcut-only reset.

- `SET-R4` Tooltips are also exposed to assistive tech (associated description), not only as `title`. 🆕
- `SET-R5` The preview updates within one frame of a change and uses the active theme.
- `SET-R6` Reset-all requires confirmation, lists what will reset, and does **not** touch auth tokens, team data, connectors, or documents. 🆕
- `SET-R7` Shortcut-only reset remains available and independent.

### 9.3 Settings badge dependency

The Settings tab shows a warn dot when no auth token is stored (§10.2). A 📋 follow-up widens this to unconfigured webhook secret (see §10.5).

**Tests:** none required for tooltip-only changes; unit for reset scope. 🆕

---

## 10. Navigation & Shell

### 10.1 ✅ Shipped

Tab rail (Library / Precision Canvas / Living Sync / Reviews & Merge / Blueprints / Settings), theme switcher, focus mode, command palette, shortcuts dialog, toasts, docs manager dialog, responsive header (scroll/wrap/min-width cascade), mobile icon-only rail and collapsible dock.

- `NAV-R1` The active tab is indicated by shape/weight and `aria-current`, not color alone.
- `NAV-R2` Focus mode hides all chrome except a minimal exit affordance; `Esc` exits.
- `NAV-R3` Toasts: max 3 visible 🆕, auto-dismiss after 5s unless they carry an action (then 8s 🆕), pause on hover/focus, announced via a polite live region.
- `NAV-R4` Dialogs trap focus, restore focus to the trigger on close, and close on `Esc`.
- `NAV-R5` The command palette lists every action with its shortcut and supports fuzzy search.

### 10.2 ✅ Shipped: account menu and settings badge

- Avatar button with presence dot: green when signed in, amber when guest.
- Menu: Profile & Team, Sign in/out. Sign-out clears the token and resets the guest session.
- Warn dot on the Settings tab when no auth token is stored.
- `NAV-R6` The avatar uses `avatarUrl` from `GET /auth/me`, with initials as fallback when the image is missing or fails to load.
- `NAV-R7` Presence is conveyed by dot **and** accessible text ("Signed in" / "Guest").
- `NAV-R8` Sign-out confirms nothing if there is no unsaved work, otherwise warns first. 🆕

### 10.3 Dependency: auth rollout

The full signed-in experience (richer menu, per-user preferences) depends on the auth rollout. The referent in 2.1.0 ("auth Paris rollout") was unclear and is tracked as [OQ-6](#14-open-questions-risks-and-assumptions).

### 10.4 ✅ Undo/redo scoping (resolution)

Header undo/redo render on the canvas route only. This is shipped and canonical; the 2.1.0 _Planned_ item "Hide undo/redo off-canvas" is closed as done, and the earlier note that this was deferred is withdrawn.

- `NAV-R9` On non-canvas routes the controls are absent (not disabled), and the history is retained for return.

### 10.5 📋 Planned

- Settings issue badge for an unconfigured webhook secret (token case ✅ shipped). Badge count should combine issues and its tooltip list each one. 🆕

---

## 11. Quality Bars

### 11.1 Accessibility (target: WCAG 2.2 AA) 🆕

- Text contrast ≥ 4.5:1; UI component and focus indicators ≥ 3:1 in both themes.
- Full keyboard operability; visible focus; no keyboard traps; logical tab order.
- Status never by color alone (add icon/text/pattern).
- Pointer targets ≥ 24×24 CSS px (matching WCAG 2.2 target size minimum).
- Live regions for toasts, sync progress, and gating-check results.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

### 11.2 Performance budgets 🆕 (validate before enforcing)

| Metric                              | Budget                                 |
| ----------------------------------- | -------------------------------------- |
| Drag/resize frame time at 200 nodes | ≤ 16ms (60fps) on a mid-range laptop   |
| Minimap redraw                      | ≤ one frame; throttle during pan       |
| Blueprint thumbnail render          | ≤ 5ms each; memoize by blueprint id    |
| Tab switch                          | ≤ 100ms to first paint                 |
| Persisted writes                    | Debounced; never on every pointer move |

### 11.3 Resilience

- All `localStorage` access guarded (quota, disabled storage, corrupt JSON).
- Versioned keys; unknown versions are ignored, not crashed on.
- No partial writes: multi-step operations (import, restore, save-as-blueprint) are atomic or fully rolled back.

### 11.4 Privacy and security posture

- Local-first: diagram data stays in the browser unless the user syncs.
- Secrets (tokens, webhook secrets) are never rendered in plain text by default, never logged, and redacted in copied cURL.
- Imported `.arch` content is treated as untrusted: schema-validated, size-capped, and all labels rendered as text (never as HTML).

---

## 12. Implementation Ledger

Replaces the 2.1.0 "Implementation Plan (this release)" table with a status column and requirement mapping.

| #   | Item                              | Frontend                                   | Backend                                | Tests                         | Status        | Reqs        |
| --- | --------------------------------- | ------------------------------------------ | -------------------------------------- | ----------------------------- | ------------- | ----------- |
| 1   | Blueprint SVG thumbnails          | `BlueprintsScreen`: `BlueprintThumb`       | —                                      | unit: bounds/scale            | ✅            | BLU-R4–R6   |
| 2   | Preview edge list                 | `BlueprintsScreen`: routes section         | —                                      | E2E: preview shows routes     | ✅            | BLU-R7      |
| 3   | Save as blueprint                 | custom list + localStorage                 | —                                      | unit: persist/merge/delete    | ✅            | BLU-R8–R12  |
| 4   | Checkpoint PRs + merge            | `GitScreen`: derive from `checkpoints`     | uses existing APIs                     | unit: derivation order        | ✅            | MRG-R5–R7   |
| 5   | Team reviewers                    | `ReviewsScreen`: `archflux:team:v1`        | —                                      | unit: fallback                | ✅            | REV-R7–R9   |
| 6   | Setting descriptions              | `SettingsGeneralScreen` `title` attrs      | —                                      | —                             | ✅            | SET-R4      |
| 7   | Checkpoint branch filter          | `api.listCheckpoints(diagramId, branch?)`  | `GET checkpoints?branch=` + repo query | backend: filter test          | ✅            | MRG-R8–R10  |
| 8   | Drag-to-resize                    | `CanvasScreen` grips + `canvasGeometry.ts` | —                                      | unit: geometry                | ✅            | CAN-R8–R12  |
| 9   | Alignment guides + snap           | drag snap + guide pass                     | —                                      | unit: snap math               | ✅            | CAN-R13–R16 |
| 10  | Minimap                           | 160px overview + toggle                    | —                                      | E2E: toggle                   | ✅            | CAN-R17–R19 |
| 11  | Dynamic drift                     | `LivingScreen` lint-derived rows           | existing lint/sync                     | E2E: resync flow              | ✅            | LIV-R5–R9   |
| 12  | Connector modal                   | `LivingScreen` config dialog               | —                                      | E2E: add flow                 | ✅            | LIV-R10–R13 |
| 13  | Reviews visual diff               | side-by-side `BlueprintThumb`              | —                                      | visual baseline               | 📋            | REV-R10–R13 |
| 14  | Branch history                    | `GitScreen` commit log                     | `GET checkpoints` (existing)           | —                             | ✅ (viz 📋)   | MRG-R7      |
| 15  | Account menu + badge + undo scope | `AppShell`                                 | `GET /auth/me` has `avatarUrl`         | E2E: sign-in menu             | ✅            | NAV-R6–R9   |
| 16  | Settings preview + reset-all      | `SettingsGeneralScreen`                    | —                                      | —                             | ✅            | SET-R5–R7   |
| 17  | Recent shapes                     | drawer strip + recency                     | —                                      | unit: recency math            | ✅            | LIB-R6–R9   |
| 18  | Provider preview                  | `OnboardingScreen` count + icons           | —                                      | unit: alias map               | ✅            | ONB-R4–R7   |
| 19  | Spec updates                      | `UI_UX_SPEC.md`, `SPEC.md` work plans      | `BACKEND_SPEC.md` checkpoints          | gates green                   | ✅            | —           |
| 20  | Connector contract inspection     | `LivingScreen` expandable endpoint table   | — (derived locally)                    | unit: derivation; E2E: expand | 📋            | LIV-R14–R19 |

> Item 20 was described in §5 of 2.1.0 but absent from the plan table; added here.

**Deferred to next release:** connector credential storage, multi-node Redis STOMP broker, backend contract registry.
**Superseded (no work):** Inspector/Linter split view (§2.9), on-canvas undo/redo placement (§2.10), removal of "From Template" (§4).

---

## 13. QA and Test Matrix 🆕

| Area        | Unit                        | E2E                                    | Visual               | Manual / a11y               |
| ----------- | --------------------------- | -------------------------------------- | -------------------- | --------------------------- |
| Library     | recency math, filter counts | place shape, recents persist           | —                    | keyboard strip nav          |
| Canvas      | geometry, snap              | resize clamp, minimap toggle, guides   | guide render         | focus order, reduced motion |
| Onboarding  | alias map, counts           | `1`–`4` + `Enter` flow                 | —                    | screen reader pass          |
| Dashboard   | —                           | pin persistence, bulk delete           | —                    | table sort semantics        |
| Living Sync | derivation, composed detail | resync, add connector, expand contract | —                    | modal focus trap            |
| Reviews     | team fallback               | approve/request changes, restore       | visual diff baseline | color-independent legend    |
| Merge       | derivation order            | merge flips status                     | —                    | live-region announcements   |
| Blueprints  | bounds/scale, persist       | preview routes, save-as                | thumbnail baseline   | —                           |
| Settings    | reset scope                 | rebind clash                           | preview baseline     | tooltip exposure            |
| Shell       | —                           | sign-in menu, undo scoping             | —                    | theme contrast audit        |

**Definition of done (per item):** requirements implemented; states in §0.5 covered; unit + E2E per table; a11y checklist (§11.1) passed; persistence keys registered in §0.7; this spec and `SPEC.md` work plans updated; gates green.

---

## 14. Open Questions, Risks, and Assumptions

### Open questions

| ID   | Question                                                                                                    | Owner            | Impact                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------- | --------------------- |
| OQ-1 | ~~Confirm all persistence keys for §0.7~~ — resolved 2026-10-14: registry inventoried from code (19 keys, 2 session-scoped) | Frontend | Registry completeness |
| OQ-2 | ~~Confirm status of plan item 7 (branch filter)~~ — verified 2026-10-14: `GET ?branch=` + repo query + `checkpointBranchFilter` test green; `MRG-R8–R10` UI contract specified in §7.3 | Backend/Frontend | Ledger accuracy |
| OQ-3 | Should merged PR status persist beyond a session?                                                           | Product          | MRG-R6                |
| OQ-4 | When do multi-branch workflows become common enough to justify graph visualization?                         | Product          | §7.4 scope            |
| OQ-5 | ~~Confirm global shortcut bindings~~ — verified 2026-10-14: palette (`Ctrl/⌘+K`), dialog (`?`), nudge (1/10px), zoom (`F`), minimap (`M`), snap-bypass (`Alt`) all wired; §0.8 updated | Frontend | §0.8 |
| OQ-6 | What did "auth Paris rollout" refer to (a phase, a region, a codename)?                                     | Product          | §10.3                 |
| OQ-7 | Are the proposed performance budgets achievable at the target diagram size?                                 | Frontend         | §11.2                 |

### Risks

| Risk                                                  | Mitigation                                               |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Simulated/derived data mistaken for live data         | Mandatory labels (§0.6), checked in review               |
| localStorage quota/corruption loses custom blueprints | Guarded IO, quota error UX, export option 🆕             |
| Snap/guides degrade performance on large diagrams     | Spatial index for anchors; budget in §11.2               |
| Spec drift from code                                  | Ledger status updated per PR; gates in §13               |
| Accessibility regressions in canvas                   | Node list alternative (CAN-R26) and a11y checks in CI 🆕 |

### Assumptions

- Breakpoints, budgets, token names, and unlisted shortcuts are proposals (🆕) and subject to confirmation.
- Existing shipped behavior is described accurately in 2.1.0.

---

## 15. Changelog

| Version | Date       | Changes                                                                                                                                                                                                  |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4.0   | 2026-10-15 | Productization alignment: §16 status language + honest-labeling requirements (HON-R1–R8); source-mode indicator; Demo/Preview/Not-connected badge rules; no other behavior change |
| 2.3.0   | 2026-10-14 | Implemented §7.3 branch-filter UI; 24px grip hit areas; Alt snap-bypass; phone toolbar dock; dock scroll preservation; persisted minimap toggle; diagram outline; F/M/? keys; fuzzy palette; A=B guard; resolved-thread collapse; branch retry; cURL redaction; drift labels/order; progress cancel; modal trap+Esc; session ack; dashboard storage/view/sort; toast pause; library live counts; settings a11y descriptions + replay tour; recents aria; onboarding pluralization; merged→sessionStorage; persistence registry completed; OQ-1/2/5 resolved |
| 2.2.0   | 2026-10-14 | Reconciled duplicate/contradictory statuses; added foundations, requirement IDs, states, acceptance criteria, quality bars, ledger, QA matrix, open questions; specified branch filter UI; added item 20 |
| 2.1.0   | 2026-10-14 | Prior version: feature status lists and implementation table                                                                                                                                             |

---

## 16. Productization v3.0.0 — Status Language & Honest Labeling

Contract: [PRODUCTIZATION_SPEC.md](PRODUCTIZATION_SPEC.md) §6.1 (status language) + Release rule
(nothing ships as GA without acceptance criteria + operational evidence — otherwise Preview, Demo, or Not connected).
New requirement area: `HON` (honesty). Carries the same weight as all other requirement IDs.

### 16.1 Authoritative status vocabulary

| Label | Meaning | Where it appears |
| ----- | ------- | ---------------- |
| Local only | Saved in this browser; not backed up to the cloud | Doc badge, dashboard card, canvas brand |
| Saved | Server acknowledged the latest version | Freshness pill, doc badge |
| Saving | A save is in progress | Freshness pill (indeterminate, cancellable where bounded) |
| Offline | Remote actions unavailable; local changes may remain | Persistent banner; Live tab |
| Pending sync | Changes queued for remote delivery | Mutation-queue indicator |
| Stale | Source changed or last refresh exceeds policy | Freshness pill, drift rows |
| Sync failed | Last attempt failed; retry + details offered | Freshness pill, Living header |
| Demo data | Illustrative only; no live provider connection | Blueprint-less seed content, simulated results |
| Connected | Credentials + permissions verified against the actual provider | Connector rows only |
| Needs attention | Conflict, permission failure, expired credentials, validation failure | Freshness pill, connector rows, gating checks |

### 16.2 Requirements

- `HON-R1` Every simulated or provisional surface carries a visible **Demo**, **Preview**, **Not connected**,
  **Sample**, **Simulated**, or **Derived from canvas** badge — conveyed by text + shape, never color alone.
- `HON-R2` A connector that has only passed local form validation MUST NOT show a green/healthy/verified state.
  `Connected` requires credentials + permissions verified against the actual provider.
- `HON-R3` The resync outcome and freshness pill MUST read **Demo** until produced by a real connector run
  (current `resync()` is simulated — PROD-008).
- `HON-R4` Each diagram shows exactly one source mode — Local / Cloud document / Git-managed / Connected source —
  with field ownership, conflict behavior, and last successful source revision (§5.2).
- `HON-R5` Unsaved local edits are visibly unsaved until persistence confirms; cloud saves show version/ETag state;
  conflicts open the compare / keep-mine / keep-remote / duplicate-branch screen (§6.2).
- `HON-R6` Import failure leaves the previous graph unchanged and reports the first errors plus unsupported fields
  (PROD-006/007); nothing is partially imported.
- `HON-R7` Badges render in all three themes, survive reload, and are exposed to assistive tech (text, not color).
- `HON-R8` Skipped accessibility tests are either re-enabled or tracked as release blockers with an owner (PROD-012).

**Tests:** unit for badge-derivation logic; E2E asserting Demo/Not-connected badges on Living + merge surfaces;
visual baseline for badge rendering in all themes. QA matrix (§13) gains a "Honesty" row: unit (badge logic),
E2E (labels present), visual (badge rendering), manual (wording review).
