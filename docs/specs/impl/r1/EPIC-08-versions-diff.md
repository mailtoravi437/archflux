# EPIC-08 · One timeline, named versions, restore, semantic and visual diff

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2–3 | **Sources:** CAP-V1, CAP-V2; FL-7; SC-27, SC-28;
> REVIEW_VERSIONING_SPEC §2.1–§2.3 (RV-G1, RV-G8); DATA_MODEL_R1 §4.5b, §5
> **Design:** "5 Versions & review" › History, ReviewChanges

**Scope note:** REVIEW_VERSIONING_SPEC §8 lists comment anchors, mentions and the inbox under R1,
while PRODUCT_SPEC §7 puts CAP-K4/K5 in R2. This epic follows PRODUCT_SPEC and does history and diff
only. Decision D8 in BACKLOG records the conflict, and the specs must be reconciled before the R2
kickoff.

---

### R1-E08-T01 · Semantic diff (pure)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |
| **Sources** | REVIEW_VERSIONING_SPEC §2.3 |

**Contract:**

```ts
// lib/semanticDiff.ts
export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';   // moved = only LAYOUT_FIELDS changed (layout split, RV-G8)
export interface FieldChange { field: string; before: unknown; after: unknown; }
export interface ElementChange { id: string; entity: 'node' | 'edge' | 'page' | 'layer'; kind: ChangeKind; label: string; fields: FieldChange[]; }
export interface SemanticDiff { changes: ElementChange[]; summary: { added: number; removed: number; changed: number; moved: number }; }
export const LAYOUT_FIELDS: ReadonlySet<string>; // x, y, w, h, size, customSize, waypoints, labelPos, z, collapsed, stroke, fill, strokeWidth, displayStyle (REVIEW_VERSIONING §2.3 "x/y/size/waypoints/style")
export const IGNORED_FIELDS: ReadonlySet<string>; // isOrphan, isDangling, targetCoords — derived; never reported
export function semanticDiff(before: DocState, after: DocState): SemanticDiff;   // DocState from state/ops/types.ts
export function invertChange(change: ElementChange, current: DocState): DocState; // "revert this change" (for E08-T04)
```

**Rules:**
- Elements are compared by `id`.
- `properties` compare per key (field name `properties.owner`).
- A change touching only `LAYOUT_FIELDS` is `moved`, not `changed`.
- **Semantic, never layout:** `parentId` (re-parenting), `pageId`, `kind`, `label`, `technology`,
  properties, edge endpoints and ports, `relKind`, `lineStyle`, `dashed`, `arrow` and `protocol`.
  These all follow REVIEW_VERSIONING §2.3.
- `IGNORED_FIELDS` are skipped entirely. A change that touches only them produces no entry.
- `added` / `removed` changes carry **every** field of the element, so `invertChange` can rebuild a
  removed element. `changed` / `moved` carry only the fields that differ.
- Inverting an added page or layer removes it the same way `deletePage` / `deleteLayer` do: a page
  takes its elements with it, and a layer's elements move to `ly-default`.
- An edge whose endpoint was removed is reported as `removed`, not changed.
- Output is ordered by entity (page, layer, node, edge), then kind (added, removed, changed, moved),
  then label.

**Tests:** `src/tests/semantic-diff.test.ts`
- `it('detects added/removed nodes by id')`
- `it('label change is changed with before/after')`
- `it('position-only change is moved')`
- `it('property change reports properties.owner')`
- `it('invertChange of an added node removes it and its edges')`
- `it('invertChange of a changed label restores old label without touching other edits')`
- `it('re-parent is changed, style-only edit is moved')`
- `it('derived flags alone produce no change')`
- `it('invertChange of an added page removes its elements; of an added layer moves elements to ly-default')`

---

### R1-E08-T02 · Backend: named versions, restore, `source`

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T01 (for `AccessService`; if it isn't done, use `requireOwnedForWrite` and leave a TODO tagged with this task ID) |
| **Sources** | DATA_MODEL_R1 §4.5b, §5 (revision rows) |

**Read:**
- `service/RevisionService.java`
- `domain/DiagramRevision.java`
- `web/DiagramController.java` L121–L150
- `web/dto/DiagramUpdateRequest.java`
- V7 L42–L68

**Create / change:**
- `V14__named_versions.sql`, per §4.5b.
- `DiagramRevision` gets `name` and `description`.
- `RevisionService.name(diagramId, revId, name, description)`.
- `RevisionService.restore(user, diagramId, revId)` copies the revision snapshot into
  `diagram.graph` through `DiagramService.update(..., source="restore")`, so a new revision is
  recorded with `message = "Restored " + (name ?? shortId)`.
- The list adds a `named` filter and an `authorName` join on `users`.
- `DiagramUpdateRequest.source` is validated against `{manual, revert, import}`.
- Audit `version.name`, `version.restore`.

**Tests:** `NamedVersionTest.java`
- `nameAndListNamedOnly()`
- `restoreCreatesNewRevisionNotRewind()`: the revision count goes up by 1, and the graph equals the
  old snapshot.
- `revertSourceAccepted_otherSourceRejected()`
- `viewerCannotNameOrRestore()`
- `V7UpgradeTest` and `MigrationFiles` still pass.

---

### R1-E08-T03 · History panel: one timeline (SC-27)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E08-T02, R1-E08-T01 |
| **Design** | 5 Versions & review › History |

**Read:**
- `components/RevisionsSection.tsx`
- `state/revisions.ts`
- `lib/api.ts` L215–L260

**Change:**
- Create `state/timeline.ts`:

```ts
export interface TimelineEntry { id: string; kind: 'revision' | 'checkpoint' | 'local'; createdAt: number; authorName: string | null;
  source: string; name: string | null; message: string | null; isCurrent: boolean; }
export function buildTimeline(revs: ServerRevision[], checkpoints: SnapshotCheckpoint[], localCps: SnapshotCheckpoint[]): TimelineEntry[]; // newest first, sessions coalesced (same author, gaps < 10 min) into one group header
```

- Create `components/history/HistoryPanel.tsx`, a right-dock tab named "History" in the canvas. It
  shows:
  - grouped entries: day header, then session group ("[author] · 14 edits · 10:02–10:31"), then
    named versions highlighted;
  - per entry: a source icon and label (edit, import, restore, revert, sync), plus the actions
    Compare with current, Restore, and Name this version (`Ctrl+Shift+S` names the latest);
  - for local-only docs: local checkpoints only, with the note "Sign in to keep full history".
- `RevisionsSection` on Reviews reuses `buildTimeline`, leaving one source of truth.

- Local `SnapshotCheckpoint`s (`tagCheckpoint` / `restoreCheckpoint` in store.tsx) must also store and restore `pages` and `layers`. Today, restoring a checkpoint keeps the current pages (found in the E00-T04 review).

**Tests:** `src/tests/timeline.test.ts` and `src/tests/history-panel.test.tsx`
- `it('merges revisions and checkpoints newest first')`
- `it('coalesces same-author edits within 10 min')`
- `it('Name this version calls PATCH and shows name')`
- `it('Restore asks confirm then calls restore and reloads doc')`
- `it('local doc shows sign-in note')`
- `it('restoring a local checkpoint restores its pages')`

---

### R1-E08-T04 · Compare view and visual diff overlay (SC-28)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E08-T03, R1-E02-T08 |
| **Design** | 5 Versions & review › ReviewChanges |

**Change:**
- **Compare mode** opens from History with "Compare with current" or a pick of any two entries.
  - **Two-entry rule (2026-10-29):** every timeline row has a checkbox. "Compare selected" in the
    History header is enabled only when exactly two entries are ticked (0, 1 or 3+ disables it, with
    a status line saying why). The older entry (lower position in the timeline) is the left side and
    the newer the right; "Swap" flips them. The diff is computed between those two versions, not
    against the current doc. "Revert this change" is offered only when the right side is the
    current version (the newest revision, loaded as the live doc) and the user may edit.
  - The canvas becomes read-only and draws the **after** state with the `NodeStatus.diff` flags:
    - added: green;
    - changed: amber tint;
    - removed: ghost nodes from **before**, red dashed at 60 % alpha;
    - moved: a thin arrow from the old to the new position, when the "Show layout changes" toggle
      is on (off by default).
  - A left change list groups the changes by kind with counts. Clicking one pans to the element.
    Each row has "Revert this change", which applies `invertChange` to the current doc and saves
    with `source=revert`.
  - A bar at the top reads "Comparing <left label> → <right label>" (e.g. "Saga orchestration → Current"), with the controls "Swap",
    "Exit compare" and `Esc`.
- **Keyboard:** `J` / `K` move to the next or previous change.

**Tests:** `src/tests/compare-view.test.tsx`
- `it('renders removed nodes as ghosts with diff flag')`
- `it('change list click pans to element')`
- `it('revert this change saves with source revert and leaves other edits')`
- `it('layout changes hidden by default')`
- `it('Esc exits compare and restores editing')`

---

## Changelog
- 2026-10-29 R1-E08-T04 done: two-entry compare built. HistoryPanel (checkbox per row, "Compare selected", status line, onComparePair older-left), components/compare/PairCompare.tsx (swap, canRevert only when right is current), HistoryScreen wired. Tests src/tests/compare-pair.test.tsx (4, written first and failing on the missing module); full vitest 131 files / 719 passed, tsc clean, lint 0 errors. No backend change (GET /revisions/{id} serves any version). Not captured: signed-in compare screenshot (design:shots is guest-only).
- 2026-10-29 R1-E08-T04 in progress: building the two-entry compare (checkbox pick, exactly two, older left, Swap). Artboard History.dc.html updated first (README Changes).
- 2026-10-28 R1-E08-T04 back to review: the spec asks for any two entries to be compared; only current-vs-entry (with swap) exists. The 2026-10-25 done status overstated this. Not built yet.
- 2026-10-25 R1-E08-T03 done: History is a right-dock tab in CanvasScreen ("History", next to Live); local checkpoints now store and restore pages and layers (store `tagCheckpoint`/`restoreCheckpoint`; test in `read-only-and-checkpoints.test.tsx`). Compare from the dock opens `#/history` and the version must be picked again there.
- 2026-10-25 R1-E08-T03 review: state/timeline.ts, components/history/HistoryPanel.tsx, screens/HistoryScreen.tsx (route `#/history`); tests timeline (3), history-panel (3). Not done: test 'restoring a local checkpoint restores its pages' (needs store.tsx tagCheckpoint/restoreCheckpoint change), RevisionsSection reuse of buildTimeline, canvas dock tab mount.
- 2026-10-25 R1-E08-T04 review: state/compare.ts, components/compare/{CompareView,CompareCanvas,revert}.tsx, hosted by screens/HistoryScreen.tsx at `#/history`; change list is on the right per History.dc.html (artboard wins); tests compare-view (5). Not built: pick of any two entries (only 'with current' + Swap).
- 2026-10-25 R1-E08-T02 review: V14__named_versions.sql (name/description, length checks, widened source check with `revert`, partial index, column-level UPDATE(name, description) grant, label UPDATE policy) plus V17__revision_label_editor_only.sql (V14 runs before V15 creates `diagram_role_at_least`, so the EDITOR+ policy gate lives in V17; added to DATA_MODEL_R1 §4.6). RevisionService.listFor/name/restore (restore goes through DiagramService.update with new revision-message overload, `@Lazy` to avoid a cycle), GET revisions `?named=true` with `authorName`, PATCH revisions/{revId}, POST revisions/{revId}/restore, PUT diagram `source` validated to manual|revert|import (422). DiagramRevision gets name/description and `@DynamicUpdate`. Tests: versions/NamedVersionTest (5); V7UpgradeTest still passes. Waiting on a green full backend suite (see E11-T02 note).
- 2026-10-25 R1-E08-T01 done: lib/semanticDiff.ts with LAYOUT_FIELDS and IGNORED_FIELDS as decided, invertChange; 9 tests. Created state/ops/types.ts (E00-T08 contract). Follow-up: once R1-E00-T08 lands, make page/layer invert reuse state/ops/pages.ts and layers.ts. Reviewed by coordinator.
- 1.0.0 (2026-10-24): epic created.
