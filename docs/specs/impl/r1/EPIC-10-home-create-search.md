# EPIC-10 · Home, New diagram, command palette, search, find and replace, quick-add, team templates

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2–3 | **Sources:** CAP-C9, CAP-S3; FL-2, FL-3, FL-17 (search
> part), FL-19; SC-05, SC-07, SC-09, SC-19
> **Design:** "2 Start & library" › Home, NewDiagram; "10 Find & understand" › Search, Palette

---

### R1-E10-T01 · Home screen (SC-05)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E01-T08, R1-E06-T03 |
| **Design** | 2 Start & library › Home (copy verbatim) |

**Change:**
- Create `screens/HomeScreen.tsx` with the route `/home`. `IndexRoute` sends signed-in users to
  `/home` instead of `/dashboard`. Deep links to `/dashboard` keep working; it is the Library.
- The page has these sections:
  1. a greeting with a primary "New diagram" button (opens E10-T02) and "Import";
  2. **Continue:** the last 4 opened docs, with an updated time and a freshness badge;
  3. **For you:** real items only, such as access requests (E07-T04) and docs shared with you in the
     last 7 days. If there are none, the section is hidden. It is never filled with sample data.
  4. **Start from a template:** 4 blueprints, then "All templates →".
  5. the getting-started checklist (E11-T05) while it isn't dismissed.
- **Empty account:** "Your diagrams will show up here" with "New diagram" and "Import".

**Tests:** `src/tests/home-screen.test.tsx`
- `it('continue shows last 4 opened docs')`
- `it('for-you section hidden when there are no items')`
- `it('index route goes to /home when signed in')`
- `no-mock-data.test.tsx` covers the Home route; add it to that test's route list.

---

### R1-E10-T02 · New diagram dialog (SC-09)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E09-T03 |
| **Design** | 2 Start & library › NewDiagram |

**Change:**
- Create `components/NewDiagramDialog.tsx` with the tabs Blank · Template · Import · AI.
  - **Blank:** a name, the default display style (Icon/Card/Shape, stored in `defaults`) and a
    "Create" button.
  - **Template:** a grid of blueprints plus team templates (T07), with a search.
  - **Import:** embeds the ImportDialog step 1.
  - **AI:** an honest notice, "AI drafts arrive in R2". There is no fake generator, and the tab is
    `aria-disabled` with that explanation.
- `N`, from Home or Library, opens the dialog.

**Tests:** `src/tests/new-diagram-dialog.test.tsx`
- `it('blank creates doc with chosen default style')`
- `it('template tab creates from blueprint')`
- `it('AI tab explains R2 and creates nothing')`

---

### R1-E10-T03 · Command registry and palette (SC-19)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T03 |
| **Sources** | FL-19 |

**Read:** `components/AppShell.tsx` L150–L340 and L670–L760 (the current palette).

**Contract:**

```ts
// lib/commands.ts
export type CommandGroup = 'Edit' | 'Arrange' | 'Display' | 'View' | 'Navigate' | 'File' | 'Review' | 'Advanced';
export interface Command {
  id: string;                 // 'arrange.alignLeft'
  title: string;              // 'Align left'
  group: CommandGroup;
  shortcut?: string;          // display form: '⌥⇧L' (mac) / 'Alt+Shift+L'
  keywords?: string[];
  when?: (ctx: CommandContext) => boolean;     // availability (selection count, role, route)
  run: (ctx: CommandContext) => void;
}
export interface CommandContext { route: string; selectionIds: string[]; role: 'owner'|'editor'|'commenter'|'viewer'; actions: DiagramActionsContextValue; ui: DiagramUIContextValue; navigate: (to: string) => void; }
export function registerCommands(cmds: Command[]): () => void;   // returns unregister
export function listCommands(ctx: CommandContext): Command[];
export function searchCommands(ctx: CommandContext, q: string): Command[];  // fuzzy: prefix > word-start > substring; recents boosted
```

**Change:**
- Move the palette out of `AppShell` into `components/CommandPalette.tsx`, backed by the registry.
- It shows **Recent** (the last 5, in `archflux:commands:recent:v1`), then **Suggested for
  selection** (the `when` matches for the current selection), then all commands grouped.
- Each row shows the shortcut.
- Commands are registered by their features: E02, E03, E04 and E06 each call `registerCommands` in
  their module. This task registers the existing actions: new doc, save, export, import, undo/redo,
  zoom, theme, the navigation routes and layout.

**Tests:** `src/tests/commands.test.ts` and `src/tests/command-palette.test.tsx`
- `it('search ranks prefix match first')`
- `it('when() hides unavailable commands')`
- `it('recent commands appear first')`
- `it('Enter runs command and closes; Esc closes and restores focus')`

---

### R1-E10-T04 · Global search (SC-07)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E10-T03, R1-E06-T03 |
| **Design** | 10 Find & understand › Search |

**Change:**
- The palette has a second mode. Typing `/`, or the palette's "Search" tab, searches across:
  - **Diagrams:** server `GET /diagrams?q=` when signed in, plus local docs (title and tags).
  - **Elements:** in all **locally loaded** docs (label, technology, properties values, kind),
    showing "Order Service · payments-saga.arch · Page 2". Opening one opens the doc, switches page,
    selects the element and pans to it.
  - **Templates:** blueprints by title.
- Element search across *unloaded* server diagrams is R3 (catalog, CAP-M4). Show the line "Searching
  elements in open diagrams. Workspace-wide element search is coming". The line is muted.
- The search is debounced 150 ms. Arrow keys, `Tab` for result groups and `Enter` work as expected.

**Tests:** `src/tests/global-search.test.tsx`
- `it('finds element by technology in another loaded doc and opens it selected')`
- `it('server diagram results merge with local without duplicates')`
- `it('records search_performed event without the query text')` (requires E12-T03; skip with
  `it.todo` until then)

---

### R1-E10-T05 · Find and replace, select similar (CAP-C9)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T08 |

**Contract:**

```ts
// state/ops/findReplace.ts
export interface FindQuery { text: string; fields: Array<'label' | 'technology' | 'edgeLabel' | 'properties'>; caseSensitive: boolean; wholeWord: boolean; pageScope: 'page' | 'all'; }
export function findMatches(s: DocState, q: FindQuery, activePageId: string): Array<{ id: string; entity: 'node' | 'edge'; field: string }>;
export const replaceAll: DocOp<[q: FindQuery, replacement: string, activePageId: string]>;
export function similarTo(s: DocState, id: string): string[];   // same kind + displayStyle (+ same iconRef when set) on the page
```

**UI** (wired in R1-E04-T08; this task delivers the ops, store actions `findMatches`/`replaceAll`/`selectSimilar` and tests):
- `Ctrl+F` opens a find bar at the top of the canvas showing "3 of 12". `Enter` / `Shift+Enter`
  step through matches. `Ctrl+H` toggles replace, and "Replace all" is one undo step.
- "Select similar" in the context menu and palette selects `similarTo(id)`.

**Tests:** `src/tests/find-replace.test.ts`
- `it('finds in label and technology')`
- `it('whole word')`
- `it('replace all is one undo step')`
- `it('select similar picks same kind')`

---

### R1-E10-T06 · Quick-add: type to create and connect

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T02, R1-E04-T05 |

**Behaviour:**
- **Open:** with one node selected, `Ctrl+Enter` (or `Tab`) opens a quick-add input next to the
  node, to the right in LR or below in TD.
- **Suggestions:** typing "redis" suggests a Cache kind with the ElastiCache icon, via
  `searchIcons` and the kind labels.
- **Create:** `Enter` creates the element at the next free slot (no overlap; 80 px gap), connects
  the selected node → new node (sync), and selects the new node, so typing again chains.
- **Close:** `Esc` closes. Each create is one undo step.

**Tests:** `src/tests/quick-add.test.tsx`
- `it('creates and connects a cache to the selected service')`
- `it('chains: second Enter connects from the new node')`
- `it('placement avoids overlap')`

---

### R1-E10-T07 · Team templates ("Save as template", CAP-S3)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E06-T03 |

**Design decision**, which needs no new backend: a team template is a normal server diagram whose
`tags` contain the reserved tag `template`. The server already supports tags. List templates with
`GET /diagrams?q=` filtered client-side on the tag. Hide them from Library "All" and show them under
Templates.

**Change:**
- In `BlueprintsScreen`, add a section "Team templates" (signed-in only) that lists diagrams tagged
  `template`.
- The doc ⋯ menu gets "Save as template", which duplicates the doc with the tag `template` and the
  title "<title> (template)".
- Using a template creates a **copy** without the tag.
- The local custom blueprints (`archflux:blueprints:custom:v1`) stay as "My templates".

**Tests:** `src/tests/team-templates.test.tsx`
- `it('save as template creates tagged copy')`
- `it('library hides template-tagged docs')`
- `it('using a template creates untagged copy')`

---

## Changelog
- 2026-10-25 R1-E10-T04 done: global search in the palette (Search tab or leading `/`): `components/search/*` (searchEngine, useGlobalSearch 150 ms debounce, SearchResultsView, openHit, SearchReveal + reveal store), `api.search.diagrams`, `search_performed` (counts only) and `search_result_opened` events; CommandPalette and AppShell mounting; `global-search.test.tsx` (5). Not built: the SC-51 element page and a Comments group (no catalog/comment search yet, R3); the muted "workspace-wide element search is coming" line is shown.
- 2026-10-25 R1-E10-T06 done (QuickAdd now uses store `insertConnected`: one undo step, test added; the open item below is resolved; E04-T05 dependency still todo): `lib/quickAdd.ts` (suggestions, next free slot, planQuickAdd), `components/quickadd/QuickAdd.tsx` + `QuickAddHost.tsx` (Ctrl/Cmd+Enter, Tab on focused canvas, palette command), mounted in AppShell on /canvas; `quick-add.test.tsx` (6). Open: create + connect is TWO undo steps (insertNode then connectNodes); needs a store action `insertConnected(node, fromId)` using applyOp (store.tsx, other owner). Flow direction is always LR (no doc layout direction stored). Depends on E04-T05 (todo).
- 2026-10-25 R1-E10-T07 done: team templates as tagged server diagrams: `lib/teamTemplates.ts`, `state/teamTemplates.ts`, `api.templates`, "Team templates" section in BlueprintsScreen (signed in; local ones labelled "My templates"), "Save as template" in the Library card menu, template docs hidden from Library lists; `team-templates.test.tsx` (5). Server list is the first 100 diagrams. NewDiagramDialog Templates tab does not list team templates yet.
- 2026-10-25 R1-E10-T02 done: `components/NewDiagramDialog.tsx` (Blank, Templates, Import file, Generate with AI); Import tab opens ImportDialog on top instead of embedding step 1; AI tab aria-disabled with the R2 notice; opened by Library and Home "New diagram" and the `N` key on the Library; e2e critical-journeys and visual-regression now click Create in the dialog (not run here); `new-diagram-dialog.test.tsx` (3). Team templates tab content waits for E10-T07.
- 2026-10-25 R1-E10-T01 done: `screens/HomeScreen.tsx`, route `/home`, `IndexRoute` sends signed-in users to /home (guests keep /dashboard), Home first in the app bar nav (appbar.test.tsx expectations updated: 5 links), `state/recentDocs.ts` (opened ids, written by AppShell on /canvas) feeds Continue; For you hidden (no real items yet); checklist waits for E11-T05; `home-screen.test.tsx` (4). no-mock-data.test.tsx has no route list, so it was not changed.
- 2026-10-25 R1-E10-T03 done: Command registry and palette (SC-19, FL-19). Pure module `lib/commands.ts`: `registerCommands`, `listCommands`, `searchCommands` (prefix>word-start>substring>subsequence + recents boost), `suggestedForSelection` (selection-dependent `when`), `recentCommands` (persisted via `archflux:commands:recent:v1`, max 5). `CommandPalette` (registry-backed, `useSyncExternalStore` for versioned re-renders, focus trap, autoFocus, Esc/Enter, shortcut column, Recent/Suggested/Groups sections). AppShell: `useAppCommands` registers app-level commands (navigate, export, save, import, layout, theme, zoom, undo/redo, fit, shape inserts, doc opens); inline fuzzy matcher removed. New tests: `commands.test.ts`, `command-palette.test.tsx`. Reviewed by coordinator.
- 2026-10-25 R1-E10-T05 done: Find and replace, select similar (CAP-C9). `findMatches(s, q, pageId)` with `FindQuery` (text, fields, caseSensitive, wholeWord, pageScope); `replaceAll(s, q, replacement, pageId)` (one undo step, all fields); `similarTo(s, id)` (same kind+displayStyle+iconRef on page). Store actions wire to `findReplace` ops and `undo`/`loadGraph`. New tests: `find-replace.test.tsx` (unit + store). Reviewed by coordinator.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-26 R1-E10-T07 verified end to end by R1-E13-T05 (routes-audit.spec.ts, real archflux-qa API): Save as template from the Library menu, the template listed under Blueprints, Use template creates an untagged copy with the same 2 nodes and title; New diagram Templates tab and Blueprints Insert/Load assert real node counts. No product change in this epic.
