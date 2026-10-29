# Design artboards (source of truth for UI)

These are the finalized screens from the Claude Design canvas
(https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu), copied here so every agent can read them. Each file
is plain HTML with **inline styles**, so you can read exact sizes, colours, spacing and copy straight
from the markup. They need the canvas runtime to render as on the canvas, but the values are all
in the source.

**How to use (every UI task):**
1. Open the artboard the task names, and read the markup for the region you're building.
2. Match it exactly:
   - structure and order of controls;
   - sizes in px, radius, border and shadow;
   - colours (map them to tokens; see Tokens.dc.html);
   - font size and weight;
   - copy, verbatim;
   - `aria-label`s.
3. Ignore the sample data (names like checkout-mesh.arch, "Ravi"). Product code shows real data only.
   Use honest empty states.
4. `{{…}}`, `<sc-for>`, `<sc-if>` and `<dc-import>` are canvas template syntax. `dc-import name="AppBar"`
   means the shared [AppBar.dc.html](AppBar.dc.html).

**Precedence when artboards disagree:**
1. **Component artboards** (AppBar, Elements, States, Boundaries, DisplayStyles, SystemStates) win for
   that component everywhere.
2. **Screen artboards** win for page layout.
3. The newer artboard wins over an older one: the shared AppBar is newer than the app bar drawn
   inside Main and Library.
4. Prose specs (UI_REVAMP_SPEC) win only where an artboard is silent. If prose and an artboard
   disagree, fix the prose (spec-first).

| Page | File | Screen | Size |
|---|---|---|---|
| 1 · Core screens | [Main.dc.html](Main.dc.html) | SC-12 Canvas workspace — node selected | 1440×900 |
| 1 · Core screens | [Library.dc.html](Library.dc.html) | SC-06 Library | 1440×900 |
| 1 · Core screens | [Review.dc.html](Review.dc.html) | SC-30 Review — Overview tab & merge box | 1440×900 |
| 1 · Core screens | [Sync.dc.html](Sync.dc.html) | SC-32 Sync overview | 1440×900 |
| 1 · Core screens | [Phone.dc.html](Phone.dc.html) | SC-48 Canvas — phone | 390×844 |
| 1 · Core screens | [Tokens.dc.html](Tokens.dc.html) | Design tokens & controls | 1200×900 |
| Components | [AppBar.dc.html](AppBar.dc.html) | App bar (shared component) | 1440×48 |
| Components | [Elements.dc.html](Elements.dc.html) | Elements — standard notation (UI_REVAMP_SPEC §5A.2) | 1440×1240 |
| Components | [States.dc.html](States.dc.html) | Element anatomy, sizes & states (§5A.1, §5A.5) | 1440×900 |
| Components | [Boundaries.dc.html](Boundaries.dc.html) | Boundaries & relationships (§5A.3, §5A.4) | 1440×900 |
| Components | [Example.dc.html](Example.dc.html) | Example: checkout system in standard notation | 1440×900 |
| Components | [DisplayStyles.dc.html](DisplayStyles.dc.html) | Display styles (Icon · Card · Shape), inline editing & icon picker (§5A.1b) | 1440×1000 |
| 2 · Start & library | [Home.dc.html](Home.dc.html) | SC-05 Home | 1440×900 |
| 2 · Start & library | [NewDiagram.dc.html](NewDiagram.dc.html) | SC-09 New diagram — AI tab | 1440×900 |
| 2 · Start & library | [ImportMap.dc.html](ImportMap.dc.html) | SC-10 Import mapping preview | 1440×900 |
| 3 · Edit & model | [CanvasPro.dc.html](CanvasPro.dc.html) | SC-12/13/15/16 Containers, pages, layers, outline, context toolbar | 1440×900 |
| 3 · Edit & model | [DataFormat.dc.html](DataFormat.dc.html) | SC-14/20/21 Properties, data linking & conditional formatting | 1440×900 |
| 4 · Share & collaborate | [Share.dc.html](Share.dc.html) | SC-22 Share dialog | 1440×900 |
| 4 · Share & collaborate | [Live.dc.html](Live.dc.html) | SC-23/24/25 Presence, comments, notifications | 1440×900 |
| 4 · Share & collaborate | [CommentsDetail.dc.html](CommentsDetail.dc.html) | SC-24 Comment threads — anchors, states, suggestion, decision | 1440×900 |
| 5 · Versions & review | [History.dc.html](History.dc.html) | SC-27/28 History & visual diff | 1440×900 |
| 5 · Versions & review | [ReviewLifecycle.dc.html](ReviewLifecycle.dc.html) | Review lifecycle & version model | 1440×900 |
| 5 · Versions & review | [Proposals.dc.html](Proposals.dc.html) | SC-29 Proposals list & create proposal | 1440×900 |
| 5 · Versions & review | [MergeConflict.dc.html](MergeConflict.dc.html) | SC-31b Merge conflict resolver | 1440×900 |
| 5 · Versions & review | [ReviewChanges.dc.html](ReviewChanges.dc.html) | SC-30b Review — Changes tab, inline comment + suggestion, submit review | 1440×900 |
| 6 · Sync & rules | [Drift.dc.html](Drift.dc.html) | SC-33/35 Connect source & drift inbox | 1440×900 |
| 6 · Sync & rules | [Policies.dc.html](Policies.dc.html) | SC-36/37 Policies & rule builder | 1440×900 |
| 7 · Present, export & AI | [Present.dc.html](Present.dc.html) | SC-38 Present mode | 1440×900 |
| 7 · Present, export & AI | [Assistant.dc.html](Assistant.dc.html) | SC-40/11 AI assistant — proposed edit (R2) + R1 dock placeholder | 1440×900 |
| 7 · Present, export & AI | [Export.dc.html](Export.dc.html) | SC-39/26 Export & publish | 1440×900 |
| 8 · Workspace admin | [Members.dc.html](Members.dc.html) | SC-41 Members & teams | 1440×900 |
| 9 · Onboarding, access & public view | [Welcome.dc.html](Welcome.dc.html) | SC-02 Workspace setup / join | 1440×900 |
| 9 · Onboarding, access & public view | [FirstRun.dc.html](FirstRun.dc.html) | SC-04 First-run canvas + getting-started checklist | 1440×900 |
| 9 · Onboarding, access & public view | [AccessStates.dc.html](AccessStates.dc.html) | SC-50 Access states: request access, read-only, expired, not found | 1440×900 |
| 9 · Onboarding, access & public view | [PublicView.dc.html](PublicView.dc.html) | SC-55 Public viewer (no account) | 1440×900 |
| 10 · Search, impact & editing surfaces | [Search.dc.html](Search.dc.html) | SC-07 / SC-51 Search + element page | 1440×900 |
| 10 · Search, impact & editing surfaces | [Impact.dc.html](Impact.dc.html) | SC-52 Impact mode (blast radius) | 1440×900 |
| 10 · Search, impact & editing surfaces | [Palette.dc.html](Palette.dc.html) | SC-17/18/19 Command palette, context menu, shape library | 1440×900 |
| 10 · Search, impact & editing surfaces | [Mapping.dc.html](Mapping.dc.html) | SC-34 Sync mapping | 1440×900 |
| 11 · GitHub & notifications | [GitHub.dc.html](GitHub.dc.html) | SC-43 GitHub integration setup | 1440×900 |
| 11 · GitHub & notifications | [Notifications.dc.html](Notifications.dc.html) | SC-25 / SC-53 Inbox + notification preferences | 1440×900 |
| 12 · Plans, trash & admin | [Limits.dc.html](Limits.dc.html) | SC-54 / SC-45 Limit reached + plan & billing | 1440×900 |
| 12 · Plans, trash & admin | [Trash.dc.html](Trash.dc.html) | SC-08 Trash & recovery | 1440×900 |
| 12 · Plans, trash & admin | [Audit.dc.html](Audit.dc.html) | SC-44 / SC-42 Audit log + SSO test-before-enforce | 1440×900 |
| 13 · Mobile | [MobileLibrary.dc.html](MobileLibrary.dc.html) | SC-47 Mobile library | 390×844 |
| 13 · Mobile | [MobileReview.dc.html](MobileReview.dc.html) | SC-49 Mobile comment + review | 390×844 |
| Components | [SystemStates.dc.html](SystemStates.dc.html) | SC-56 System states library | 1440×900 |

## Changelog

- 2026-10-26 Main.dc.html: right dock tabs are now Inspector · AI assistant · Live · History (text only; the Linter tab
  and its amber count pill are removed, History added to match the shipped dock). Assistant.dc.html: new "R1 state"
  (the dock "AI assistant" tab is an honest "Assistant arrives in R2" notice: no sample output, no input, no actions;
  the existing screen is the R2 target). AppBar.dc.html: the status menu "Linter (N issues)" item opens an
  "Architecture linter" dialog, the only home of the lint list (spec in the comment above the header). Owner decision:
  the assistant is R2, so nothing that looks like AI output may appear in R1.
- 2026-10-26 AppBar.dc.html: the doc switcher title is capped (`max-width: 240px`, one line, ellipsis, full name in
  `title` and in the `aria-label`); nav and search keep their positions. States.dc.html: new section "Inspector,
  nothing selected: diagram outline rows" (28 px kind-tinted glyph, ellipsis name, right-aligned connection count,
  hover / selected / focus states). Both are new states, not redesigns of existing ones.
- 2026-10-26 Palette.dc.html: Shapes drawer placement and z-order (drawer 46, above the 44 chrome; body scrolls inside
  the drawer), tile spec (68 px, 11 px / 13 px label, 2-line clamp, `title` = full name, `aria-label` = full label).
  Main.dc.html: selection toolbar ("Element actions") placement rule (12 px above the selection box, flips below
  when there is no room, never covers the selection) and the canvas chrome z-order. Both are new rules for existing
  components, not redesigns.
- 2026-10-26 Sync.dc.html: new "R1 STATES" frame (drift empty state with no "matches upstream" claim, saved source row that is always
  "Not connected", Activity section for the re-sync log, offline and failed-sync notice strips, and what Bind / Remove /
  Dismiss do). Live.dc.html: new "R1 STATE" frame for the 320 px dock tab "Live" (connected, alone, local-only diagram,
  guest, reconnecting), the presence pill (2+ people, no Follow) and the avatar palette; comments and notifications stay
  the R2 target in the existing frame. Both are new states, not redesigns. Owner decision: Comments (SC-24) and
  notifications (SC-25) are R2 (BACKLOG D8).
- 2026-10-26 Sync.dc.html: the saved source row has no Retry button (R1 has no live provider; Remove only), and the
  Activity result line for a Re-sync with no connected source reads "No re-sync: no live source is connected" (no
  progress bar, no "Polling", no toast claiming work ran; Last re-sync stays Never). Live.dc.html: the dock frame is a
  full-height column (flex column, height 100%, min-height 0) so the R2 line is pinned to the bottom with a 1 px
  hairline. Both are corrections of states, not redesigns. Honesty rule: no progress indicator for work that is not
  running.
- 2026-10-26 Sync.dc.html: Add source dialog notes. Saving a source shows "Not connected" at once (no "Polling" state, no
  timer) with the toast "Source saved. Not connected: no provider is verified yet."; the helper text no longer says
  connectors poll specs. A correction of a state, not a redesign.

## Changes
- 2026-10-29 History.dc.html (SC-27/28): two-entry compare. Each timeline row has a checkbox
  (`aria-label="Select <title> for compare"`); the History header has a "Compare selected" button
  (28px, #4F46E5) that is enabled only when exactly two entries are ticked, with a polite status line
  ("Select two versions to compare", "Select one more version", "2 selected · older on the left",
  "Select only two versions · N selected"). The compare header shows both labels with a "Swap" button
  and "Exit compare Esc" (the From/To selects were removed). "Revert this change" is offered only when
  the right side is the current version.
