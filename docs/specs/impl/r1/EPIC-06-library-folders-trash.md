# EPIC-06 · Library: folders, starred, trash

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 1 (backend), 2 (frontend) | **Sources:** CAP-K6; FL-2, FL-24;
> SC-06, SC-08; DATA_MODEL_R1 §4.2, §5
> **Design:** "1 Core" › Library; "12 Account & governance" › Trash

---

### R1-E06-T01 · V10 migration plus the folders API

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | none |
| **Sources** | DATA_MODEL_R1 §4.2, §5 (folders rows) |

**Read:**
- `backend/src/main/resources/db/migration/V6__workspaces.sql` (idempotent DDL pattern)
- `domain/Workspace.java`, `repo/WorkspaceRepository.java`
- `service/WorkspaceService.java`, `service/AuditService.java`
- `web/DiagramController.java` L1–L120
- `backend/src/test/java/com/archflux/WorkspaceIsolationTest.java`

**Create:**
- `db/migration/V10__folders_trash.sql`: exactly DATA_MODEL_R1 §4.2, plus row-level security
  copied from the V6 pattern (`V6__workspaces.sql` §5 policies and §6 grants, about L226–L310):
  - `ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;` and
    `CREATE POLICY folders_member ON public.folders FOR ALL USING (public.is_workspace_member(folders.workspace_id, public.current_user_id())) WITH CHECK (same)`,
    each preceded by `DROP POLICY IF EXISTS`.
  - `diagram_stars`: `USING (user_id = public.current_user_id())`.
  - The grants for `archflux_app` go inside the same `IF EXISTS (SELECT 1 FROM pg_roles …)` guard.
  - Add a case to `AppRoleTest` proving the app role cannot read another workspace's folders.
- `domain/Folder.java`, `repo/FolderRepository.java`
- `service/FolderService.java`, with `list(user)`, `create(user, name, parentId)`,
  `rename(user, id, name)`, `move(user, id, parentId)`, `trash(user, id)` and `restore(user, id)`:
  - every method is workspace-scoped to the caller's personal or current workspace;
  - maximum depth is 5;
  - a name must be unique among non-trashed siblings (case-insensitive), else **409** with code
    `folder_name_taken`;
  - trashing a folder also trashes the diagrams in it and its subfolders, using the **same
    `deleted_at` timestamp** so restoring it restores them all.
- `web/FolderController.java`: `GET/POST /api/v1/folders`, `PATCH/DELETE /api/v1/folders/{id}` and
  `POST /api/v1/folders/{id}/restore`.
- `web/dto/FolderRequest.java`: `@NotBlank @Size(max=120) name`, plus a nullable `parentId`.

**Audit actions:** `folder.create`, `folder.rename`, `folder.move`, `folder.trash`,
`folder.restore`.

**Tests:** `FolderControllerTest.java`, with the CONVENTIONS §2.5 checklist plus these cases:
- `duplicateSiblingNameIs409()`
- `depthOver5Is422()`
- `trashFolderTrashesContainedDiagrams()`
- `restoreFolderRestoresSameBatchOnly()`: a diagram trashed separately beforehand stays in trash.
- `otherWorkspaceFolderIs404()`
- `MigrationFiles`, `V6UpgradeTest` and `V7UpgradeTest` still pass, since V1–V9 are untouched.

**Acceptance:** `mvn -q -Dtest='FolderControllerTest,MigrationFiles' test`, then the full
`mvn -q test`.

---

### R1-E06-T02 · Soft delete, restore, purge, star, move, list filters

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | R1-E06-T01 |
| **Sources** | DATA_MODEL_R1 §4.2, §5 (diagram rows) |

**Read:**
- `service/DiagramService.java` (`list` L70, `get` L130, `delete` L230, `requireOwnedFor*` L252–L272,
  `toJson` L296)
- `repo/DiagramRepository.java`
- `domain/Diagram.java` (`deletedAt` already mapped)

**Change:**
- `delete` sets `deletedAt = now()`, audits `diagram.trash` and returns 204. No hard delete.
- `list`, `get` and both `requireOwnedFor*` methods exclude trashed rows, so a trashed diagram
  returns 404.
- `list` gains these parameters:
  - `folderId` (null means everything; the literal `root` means no folder);
  - `starred`;
  - `trashed`, which returns only trashed rows and adds `deletedAt` and `purgeAt`;
  - `sort=updated|title`.
- Each list item adds `folderId`, `starred`, `deletedAt` and `role`. `role` is the workspace role
  for now; E07 refines it.
- **New endpoints:**
  - `POST /diagrams/{id}/restore`. If its folder is trashed or gone, restore to the root and
    include `"restoredTo": "root"`.
  - `DELETE /diagrams/{id}/purge`, with the body `{confirmTitle}`. It needs the role admin or the
    owner, and a `confirmTitle` equal to the title (case-sensitive); otherwise **422**
    `title_mismatch`. It hard-deletes using the existing hard-delete code and audits
    `diagram.purge`.
  - `PUT` / `DELETE /diagrams/{id}/star`.
  - `PATCH /diagrams/{id}` with the body `{folderId}`. The folder must be in the same workspace and
    not trashed, else **422**.
- `service/TrashPurgeJob.java`: a `@Scheduled(cron = "0 17 3 * * *")` job that purges rows past
  retention (30 days, or 90 when `plan = 'team'`) in batches of 100, audits each purge as `system`,
  and is disabled when `archflux.trash.purge-enabled=false` (the test profile default).

**Tests:** `DiagramTrashTest.java`
- `deleteMovesToTrashAndHidesFromList()`
- `trashedGetIs404()`
- `restoreReturnsToFolderOrRoot()`
- `purgeRequiresExactTitle()`
- `purgeForbiddenForEditor()`
- `starFiltersList()`
- `moveToFolderInOtherWorkspaceIs422()`
- `purgeJobRemovesOnlyExpired()`: call the job method directly with a fixed `Clock`.
- Update the existing `DiagramControllerTest` delete expectations to soft-delete semantics, and list
  them in the changelog.

**Pitfalls:**
- `DiagramService.delete` currently calls `entityManager.flush()` / `clear()` because of cascades.
  Keep that only in the purge path.
- The checkpoint, thread and revision endpoints go through `requireOwnedFor*`, so they also return
  404 for a trashed diagram. That is intended.

---

### R1-E06-T03 · Frontend API and library state

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E06-T02 |

**Read:**
- `lib/api.ts` L150–L390 (the `api` object)
- `state/store.tsx`: the `deleteDoc` and library merge effect (grep `removeDocLocally`,
  `serverDiagramToDoc`)

**Change:**
- `lib/api.ts` adds `api.folders.{list,create,rename,move,trash,restore}` and
  `api.diagrams.{restore,purge,star,unstar,move,list(params)}`, typed with response interfaces in
  `lib/contracts.ts`.
- Create `state/library.ts`, a small hook-based store (`useLibrary()`) separate from
  `DiagramProvider`, holding `folders`, `currentFolderId`, `trash` and `starredIds`, with these
  actions:
  - `refresh()`, `createFolder`, `renameFolder`, `moveFolder`, `trashFolder`, `restoreFolder`;
  - `moveDoc(docId, folderId)`, `toggleStar(docId)`;
  - `restoreDoc(docId)`, `purgeDoc(docId, confirmTitle)`.
- **Local-only docs** (not signed in): `deleteDoc` moves the doc to a local trash
  (`archflux:trash:v1`, 30-day expiry checked on load) instead of dropping it. Folders and stars are
  local too (`archflux:library:v1`).
- **Clarifications (2026-10-25):**
  - `api.folders` and `api.diagrams` are namespaced blocks inside `api`; response types are in `lib/contracts.ts`.
  - `useLibrary()` is a module-level store (`useSyncExternalStore`) in `state/library.ts`; local persistence
    lives in `state/libraryLocal.ts` (shared with the store's `deleteDoc`). It adds `setCurrentFolder(id)`.
  - `refresh()` loads folders, trashed folders/docs, starred ids and doc folders (server when signed in, plus
    the local trash). Local docs of a signed-in user stay local (`doc-*` ids).
  - The store gains `restoreLocalDoc(doc)` (used by `restoreDoc` for local trash entries).
  - Signed-out `trashFolder` hides the folder tree and returns its docs to the root; it never deletes docs.
- **Honest states:** when signed out, the Library shows "Folders sync when you sign in". There is no
  fake server state.

**Tests:** `src/tests/library-state.test.tsx`
- `it('signed-in delete calls DELETE and lists doc in trash')`: mock `fetch`.
- `it('local delete goes to local trash and restores')`
- `it('local trash entries older than 30 days are dropped on load')`
- `it('toggleStar is optimistic and rolls back on error')`

---

### R1-E06-T04 · Library UI: folder tree, breadcrumbs, star, move (SC-06)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E06-T03, R1-E01-T08 |
| **Design** | 1 Core › Library |

**Change:**
- In `screens/DashboardScreen.tsx`, add a left sub-nav with All · Recent · Starred · Shared with me ·
  Trash, then the folder tree (`role="tree"`, arrow keys expand and collapse).
- Show breadcrumbs above the grid.
- Each card has a star toggle (`aria-pressed`, label "Star <title>") and a ⋯ menu with Open,
  Rename, Duplicate, Move to… (a folder chooser dialog), Move to trash.
- Dragging a card onto a folder moves it, with a keyboard alternative through "Move to…".
- "New folder" sits in the page header's secondary actions.
- **Empty folder state:** "This folder is empty" with the actions "New diagram" and "Move diagrams
  here".

**Tests:** `src/tests/library-ui.test.tsx`
- `it('creates a folder and navigates into it via breadcrumbs')`
- `it('star toggle filters Starred view')`
- `it('Move to… dialog moves doc')`
- `it('tree supports arrow-key navigation')`

---

### R1-E06-T05 · Trash screen (SC-08)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E06-T03 |
| **Design** | 12 Account & governance › Trash (copy verbatim) |

**Change:**
- Create `screens/TrashScreen.tsx` with the route `/trash`, linked from the Library sub-nav.
- The table columns are Item · From · Deleted by · Removed in, with Restore and Delete forever
  buttons.
- **Copy**, verbatim:
  - Header: "Items are permanently removed after 30 days (Team: 90). Restoring puts them back where
    they were."
  - Dialog title: "Delete “<title>” forever?"
  - Dialog body: "Removes the diagram, its N versions, … This can't be undone and is recorded in the
    audit log."
  - The dialog has the input "Type the name to confirm". Its "Delete forever" button stays disabled
    until the input equals the title. N comes from the list item, or "its versions" if unknown.
- Only owners and admins see "Delete forever". Others see "Only owners can delete forever".
- **Removed in** is shown in red when ≤ 1 day remains ("Tomorrow") and in amber when ≤ 7 days.

**Tests:** `src/tests/trash-screen.test.tsx`
- `it('restore removes row and toasts "Restored to <folder>"')`
- `it('delete forever button disabled until name typed exactly')`
- `it('non-owner does not see delete forever')`

---

## Changelog
- 2026-10-25 R1-E06-T05 done: `screens/TrashScreen.tsx`, route `/trash` (App.tsx); `TrashDoc` gains `role` and `versions` (state/library.ts); Deleted by shows You for local items and an em dash for server items (the API does not return it); folders can be restored but have no Delete forever (no API); toast names the folder when it still exists, else Library; `trash-screen.test.tsx` (3).
- 2026-10-25 R1-E06-T04 done: Library sub-nav (`LibrarySidebar`), folder tree (`FolderTree`, role=tree, arrow keys, drop target), breadcrumbs, star toggle (`aria-pressed`), Move to… / Move diagrams here / New folder dialogs (`LibraryDialogs`), card menu now Open, Rename, Duplicate, Move to…, Move to trash; `library-ui.test.tsx` (4). Shared with me is an honest empty state (sharing is E07). Not built: rename/trash folder UI. Extra files: styles.css (libside/libdlg).
- 2026-10-25 R1-E06-T01 done: V10 (folders, folder_id, diagram_stars, RLS including diagrams_workspace_member, purge_expired_trash), FolderService and FolderController; 11 tests plus an AppRoleTest case. Also fixed PostgresIT, BackupRestoreTest and MigrationFiles to sort migrations by version number (V10 sorted before V2 as a string). Reviewed by coordinator, targeted classes re-run green.
- 2026-10-25 R1-E06-T02 done: soft delete, restore (restoredTo), purge (TITLE_MISMATCH), star/unstar, move, list filters, TrashPurgeJob; DiagramTrashTest 8; DiagramControllerTest and AuditExportTest updated for soft-delete semantics. Full suite 143 pass. Reviewed by coordinator.
- 2026-10-25 R1-E06-T03 done: api.folders/api.diagrams, contracts types, state/library.ts + libraryLocal.ts, store local-trash on `deleteDoc` and `restoreLocalDoc`; 4 tests in library-state.test.tsx. Full vitest 392 pass.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-26 Library and Trash routes covered by R1-E13-T05 routes audit (guest and signed in, no console errors); sidebar Templates opens `/blueprints`. No status change.
