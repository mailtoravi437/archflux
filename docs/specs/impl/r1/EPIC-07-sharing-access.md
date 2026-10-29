# EPIC-07 · Share dialog, roles, links, access states

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2 (backend), 3 (frontend) | **Sources:** CAP-K2; FL-6, FL-15;
> SC-22, SC-50; DATA_MODEL_R1 §4.3, §5
> **Design:** "4 Share & collaborate" › Share; "9 Onboarding & access" › AccessStates

**Security requirements**, which every task in this epic carries:
- Share tokens are 32 random bytes in base64url. Only the SHA-256 hash is stored, and the token is
  returned once.
- Token comparison is constant-time, through the hash lookup.
- Tokens never appear in logs. `RequestLoggingFilter.redactQuery` already redacts query values;
  tokens travel in the header `X-Share-Token`, never in the query.
- A link grants at most `commenter`, and links never grant editing.
- Every share, role change, link create or revoke, and access decision is audited.

---

### R1-E07-T01 · V11 migration plus `AccessService` (effective role)

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | R1-E06-T02 |
| **Sources** | DATA_MODEL_R1 §4.3 (tables, effective role, matrix) |

**Read:**
- `service/DiagramService.java` (`requireOwnedFor*`, `update`, `delete`)
- `service/WorkspaceService.java` (`roleOf`)
- `service/ThreadService.java`, `service/CheckpointService.java` (their access checks)
- `V6__workspaces.sql` (the RLS pattern)

**Create:**
- `V11__sharing.sql`: the three tables, RLS (V6 pattern) and the owner backfill:
  `INSERT INTO diagram_members(diagram_id,user_id,role) SELECT id, owner_id, 'owner' FROM diagrams ON CONFLICT DO NOTHING;`
- `domain/DiagramMember.java`, `domain/ShareLink.java`, `domain/AccessRequest.java`, plus
  repositories.
- `service/AccessService.java`:

```java
public enum DiagramRole { VIEWER, COMMENTER, EDITOR, OWNER;  // ordered
  public boolean atLeast(DiagramRole r) { return compareTo(r) >= 0; } }
public enum Action { VIEW, COMMENT, EDIT, SHARE, TRASH, PURGE }
/** Highest of: explicit member row, workspace role mapping, valid share link token (may be null). Empty = no access. */
public Optional<DiagramRole> effectiveRole(UUID userId, UUID diagramId, @Nullable String shareToken);
/** 404 when no access at all (no existence leak); 403 when role too low. Returns the loaded diagram. */
public Diagram require(UUID userId, UUID diagramId, Action action, @Nullable String shareToken);
static DiagramRole minimumFor(Action a); // VIEW→VIEWER, COMMENT→COMMENTER, EDIT/TRASH→EDITOR, SHARE→EDITOR (limits in T02), PURGE→OWNER
```

- Workspace role mapping per §4.3: admin → OWNER, editor → EDITOR, reviewer → COMMENTER, viewer →
  VIEWER.

**Change:**
- Replace `DiagramService.requireOwnedForRead/Write` internals with `AccessService.require(...)`,
  keeping the method names as delegates.
- Thread and reply creation require `COMMENT`. Checkpoint creation and restore require `EDIT`.
- Diagram list items return `role` as the effective role.
- **Reconcile legacy writes to 404:** `PUT` and `DELETE /diagrams/{id}` from a non-member still
  return 403 today. The existing tests `writesToForeignDiagramAreForbidden` and
  `WorkspaceIsolationTest` assert this. With `AccessService`, no access means **404**, so update
  those assertions and list them in the changelog.

**Tests:** `AccessServiceTest.java`
- `ownerBackfilledFromOwnerId()`
- `workspaceReviewerIsCommenter()`
- `explicitMemberHigherThanWorkspaceRoleWins()`
- `noAccessIs404NotForbidden()`
- `viewerCannotEdit403()`
- `commenterCanCreateThread()`
- Existing `WorkspaceIsolationTest`, `DiagramControllerTest` and `JwtAuthIsolationTest` stay green.

---

### R1-E07-T02 · Members endpoints

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T01 |

**Create:**
- `web/ShareController.java`, with `GET /diagrams/{id}/members`, `POST /diagrams/{id}/members`
  (`{email, role}`), `PUT /diagrams/{id}/members/{userId}` (`{role}`) and
  `DELETE /diagrams/{id}/members/{userId}`.
- `service/ShareService.java`.

**Rules:**
- Requires `SHARE`.
- An editor may add or change roles only up to `editor`, and may not demote an owner.
- The last owner can't be removed or demoted (**409** `last_owner`).
- **Unknown emails:**
  - If the email matches a user in the same workspace, add them directly.
  - Otherwise create a pending workspace invite. This needs E11-T01; until then return **422**
    `user_not_found` with the message "Invite them to the workspace first".
- Notify the added user through `EmailService` with the subject "<name> shared <title> with you" and
  a link to `#/canvas?doc=<id>`. The mock sender is used in dev.
- Audit `share.member_add`, `share.member_role`, `share.member_remove`.

**Tests:** `ShareMembersTest.java`
- `editorCannotGrantOwner()`
- `lastOwnerRemovalIs409()`
- `addWorkspaceMemberByEmail()`
- `nonWorkspaceEmailIs422()`
- `viewerCanListMembersButNotChange()`: viewers get 200 on GET, as in Google Docs and Lucidchart,
  and 403 on POST, PUT and DELETE.

---

### R1-E07-T03 · Share links and the `X-Share-Token` header

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T01 |

**Change:**
- Add `POST /diagrams/{id}/links` (`{role: viewer|commenter, audience: workspace|anyone,
  expiresAt?}`). It returns `{id, url: "<APP_URL>/#/d/<id>?link=1", token}` **once**.
- Add `GET /diagrams/{id}/links`, which returns the links without tokens, and
  `DELETE /diagrams/{id}/links/{linkId}`, which sets `revoked_at`.
- **Audience `anyone`** requires `workspaces.public_links_allowed = true`. The column is added in
  V11 (DATA_MODEL_R1 §4.3). Otherwise return **403** `public_links_disabled`.
- **Filter changes:**
  - `AuthFilter` lets an `X-Share-Token` request reach **only** `GET /diagrams/{id}`,
    `GET /diagrams/{id}/threads*` and `GET /diagrams/{id}/access` without a JWT, when
    `audience = anyone`.
  - With a JWT, the token adds the link role through `AccessService`.
  - Expired or revoked tokens are treated as no token, and `/access` reports `expired`.
- **Rate limits:** the existing `RateLimitFilter` buckets apply. Add a stricter bucket of 30/min per
  IP for token-only requests.

**Tests:** `ShareLinkTest.java`
- `tokenReturnedOnceAndHashedAtRest()`
- `anyoneLinkReadsWithoutJwt()`
- `anyoneLinkCannotPut()`
- `workspaceLinkRequiresMembership()`
- `revokedLinkDenied()`
- `expiredLinkReportsExpired()`
- `tokenNotLogged()`: capture the log appender and assert that no token appears.

---

### R1-E07-T04 · Access requests and `GET /access`

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T03 |
| **Sources** | FL-15 states |

**Change:**
- `GET /diagrams/{id}/access` always returns 200 with a body
  `{state, role?, title?, ownerName?}`:
  - **`ok`:** the caller has access.
  - **`trashed`:** shown to owners or admins only; it carries the title so they can restore.
  - **`expired`:** the token is expired or revoked.
  - **`request`:** the caller is signed in and has no access, but either holds a valid workspace
    link or is in the diagram's workspace. It carries the title and owner name.
  - **`not_found`:** everything else. It never confirms the diagram exists.
- `POST /diagrams/{id}/access-requests` (`{role, note}`) is allowed only when the state would be
  `request`. A pending request already open returns **409**. It notifies the owners by email.
- `GET /access-requests?status=pending` returns the requests on diagrams where the caller has
  `SHARE`.
- `POST /access-requests/{id}/approve` (optional body `{role}`, so an owner can downgrade) creates
  the member row and notifies the requester. `POST /access-requests/{id}/deny` notifies the
  requester as well.
- Audit `access.request`, `access.approve`, `access.deny`.

**Tests:** `AccessRequestTest.java`
- `strangerGetsNotFoundState()`
- `sameWorkspaceNoMemberGetsRequestState()`
- `duplicatePendingIs409()`
- `approveCreatesMember()`
- `trashedVisibleOnlyToOwner()`

---

### R1-E07-T05 · Share dialog UI (SC-22)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E07-T02, R1-E07-T03 |
| **Design** | 4 Share & collaborate › Share (copy and layout) |

**Change:**
- `lib/api.ts` adds `api.sharing.{members, addMember, setRole, removeMember, links, createLink,
  revokeLink}`.
- Create `components/ShareDialog.tsx`, opened by a "Share" button in the app bar (right side,
  before the status button). It has:
  - an invite row with an email input (accepting comma-separated emails), a role select (Editor ·
    Commenter · Viewer) and an Invite button;
  - a "People with access" list: avatar, name, email and a role select, plus Remove. The last owner
    row has no remove button.
  - a "General access" section: Restricted / Anyone in <workspace> / Anyone with the link (hidden
    when not allowed), with a role (Viewer/Commenter), an optional expiry and "Copy link".
  - "Copy link" shows the token once; afterwards it says "Link created — copy it now. For security
    we can't show it again."
- **Signed out or local-only doc:** the dialog shows "Save this diagram to the cloud to share it" with
  the button "Save to cloud".

**Tests:** `src/tests/share-dialog.test.tsx`
- `it('invites by email with role')`
- `it('last owner has no remove')`
- `it('creating a link shows token once with copy')`
- `it('local doc shows save-to-cloud state')`
- `it('dialog traps focus and closes on Esc')`

---

### R1-E07-T06 · Access states and read-only mode (SC-50)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E07-T04, R1-E07-T05 |
| **Design** | 9 Onboarding & access › AccessStates (copy verbatim) |

**Change:**
- **Route `#/d/:id`** is the shareable deep link. Before it loads the doc, it calls
  `GET /diagrams/:id/access`:
  - `ok`: open the doc in the canvas, then redirect to `/canvas?doc=:id`.
  - `request`: `components/access/RequestAccess.tsx` shows the title and owner, a role select and a
    note, then sends the request and reports "Request sent — we'll email you when [owner] responds".
  - `expired`: "This link has expired · Ask [owner] for a new link".
  - `trashed`: "In trash — Restore" for owners.
  - `not_found`: "We can't open this diagram" plus "Switch account" and the error ID (the SC-56
    pattern).
  - Signed out: go to `/login?next=/d/:id`, then return.
- **Read-only mode:**
  - The store gets `role: DiagramRole` in the Docs context from the server list or get.
  - When `role < editor`:
    - all editing affordances (the tool rail drawing tools, inspector inputs, the context toolbar,
      delete and keyboard edit shortcuts) are **hidden, not just disabled**;
    - a banner reads "View only · Request edit access", or "Can comment" for commenters;
    - the store actions are no-ops that log a warning.

**Tests:** `src/tests/access-states.test.tsx`
- `it('request state submits request')`
- `it('not_found never shows a title')`
- `it('viewer sees no editing tools and banner')`
- `it('commenter can add a comment but not edit')`
- `it('signed-out deep link returns after login')`

---

### R1-E07-T07 · RLS role hardening

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T01 |
| **Sources** | E07 review (2026-10-25) |

**Why:** V10 `diagrams_workspace_member` and V11 `diagrams_diagram_member`, `diagram_members_access` and
`threads_diagram_access` are `FOR ALL`. As a result any collaborator, even a viewer, passes the
**write** policies at the DB level. Role checks are enforced only in the service (`AccessService`).
RLS should also hold as a second line of defence.

**Change:**
- In `V12__…` (renumber per DATA_MODEL §4.6, since V12 is reserved for invites; use the next free
  number and update §4.6), split each `FOR ALL` policy above into `FOR SELECT` (any access) and
  `FOR INSERT/UPDATE/DELETE`.
- The write side requires a new `SECURITY DEFINER` helper, `diagram_role_at_least(diagram, uid,
  'editor')`:
  - `diagram_members` writes require `owner`, or `editor` for rows with role ≤ editor;
  - thread and reply writes require ≥ `commenter`.
- Never edit V10 or V11. Use `DROP POLICY IF EXISTS` and recreate.

**Tests:** extend `AppRoleTest`:
- `viewerCannotUpdateDiagramUnderAppRole`
- `viewerCannotInsertMemberRowUnderAppRole`
- `commenterCanInsertThreadButNotUpdateDiagram`

---

### R1-E07-T08 · Sync, Export and Collaboration use AccessService

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | R1-E07-T01 |

**Change:**
- `SyncService` and `ExportService` still check workspace membership, and `CollaborationController`
  (websocket) still checks for the owner only. Route each through `AccessService.require(...)`:
  - export needs `VIEW`;
  - sync apply needs `EDIT`;
  - websocket join needs `VIEW`, and update needs `EDIT`.
- No access returns 404 / a refused join.

**Tests:**
- `explicitViewerCanExport()`
- `viewerCannotSyncApply()`
- `nonMemberJoinRefused()`

---

## Changelog
- 2026-10-25 Decision (coordinator): a signed-in user with no link and no workspace membership still gets `not_found` from GET /access, not `request`. That is deliberate tenant isolation: it does not reveal that the diagram exists. `request` is reached by a link holder or a workspace member. The request-access journey therefore starts from a share link. J5 (e2e) stays fixme until the QA stack run.
- 2026-10-25 R1-BUG-07 done (frontend-implementer): the Share dialog copies `#/d/:id?token=<token>` (`shareLinkUrl` in `lib/access.ts` replaces the server's `?link=1`; the "shown once" note stays). `AccessStatesScreen` reads `token` from the hash query, keeps it in memory only (`setShareToken`/`getShareToken` in `lib/api.ts`, never localStorage), and strips it from the address bar once signed in; a signed-out visitor keeps it in `?next=` through login. `request()` sends `X-Share-Token` on `/v1/diagrams/:id...` (access state, diagram load) when a token is held for that id, and never otherwise. Backend behaviour relied on: GET /access gives `request` only to a signed-in user who holds a live link for the diagram (or is a workspace member without a role); a signed-in user with no link and no membership gets `not_found` by design (tenant isolation), so there is no request path for a pure outsider without a link. Tests: `tests/share-token.test.tsx` (link format; header sent with a token on access and diagram load and not sent otherwise or for another diagram; signed-out keeps token through login; link-holding outsider reaches `request` and POSTs `/access-requests`), `share-dialog.test.tsx` updated to the new format. E2E J5 stays `fixme` (needs the archflux-qa stack, not run here).
- 2026-10-25 R1-BUG-07 review: owner-side access-request list (`components/access/AccessRequests.tsx`) is mounted in the Share dialog and covered by `access-requests.test.tsx` (2/2). Still open: the requester path for outsiders (the `request` state is not reached by the deep link), and the Share link carries no `X-Share-Token`. Marked review, not fixed.
- 2026-10-25 Status reconciled (coordinator audit): R1-E07-T02, R1-E07-T03, R1-E07-T04 and R1-E07-T08 done. Backend suite green (`mvn -q test`). T08 production code was already in place; `AccessRoutingTest` was added to cover it.
- 2026-10-25 R1-E07-T06 done: verified against the canvas agent wiring (store `role`, ReadOnlyBanner and request-edit dialog in CanvasScreen, `addServerDoc`, `?next=` in Login/AuthCallback); tsc, lint and full suite green.
- 2026-10-25 R1-E07-T05 done: components/ShareDialog.tsx, `api.sharing`/`api.access`/`api.revisions` blocks in lib/api.ts, AppShell Share button opens it (Save stays on the status button and Cmd+S); appbar.test updated for Share; share-dialog tests (5); analytics share_invited, link_published.
- 2026-10-25 R1-E07-T06 review: route `#/d/:id` (screens/AccessStatesScreen.tsx, components/access/RequestAccess.tsx, ReadOnlyBanner.tsx, lib/access.ts), App.tsx route; tests access-states (5). Missing outside my files: store `role` + hiding edit tools (store.tsx/CanvasScreen), mounting ReadOnlyBanner, LoginScreen/AuthCallback honouring `?next=` (use `safeNext`), store ingesting a server doc not yet in `docs`.
- 2026-10-25 R1-E07-T07 and T08 done; T01-T04 confirmed done. Full backend suite 177/177.
  - Root cause of the failing `AppRoleTest`: the test helper `grantV11Helpers` did not grant
    `diagram_role_at_least` to `app_tester` (product grants to `archflux_app` are in V15; test fix only).
  - Real product bug found after that: V15 INSERT policies on `diagrams` called
    `diagram_role_at_least(diagrams.id, ...)`, which cannot see the row being inserted, so inserts
    not covered by the V3 owner policy were rejected. New `V16__rls_diagram_insert_fix.sql` adds
    `workspace_role_at_least(workspace, uid, role)` and a workspace-id based INSERT policy
    (V15 untouched). DATA_MODEL_R1 §4.6 lists V16.
  - T07 test coverage: `AppRoleTest.v15RlsWritePoliciesEnforceRoleThresholds` covers the three named
    cases in one test (viewer update, viewer member insert, commenter thread insert vs diagram update).
  - T08: `ExportService` (VIEW), `SyncService` (EDIT) and `CollaborationController` (VIEW join, EDIT update)
    already routed through `AccessService`; new `sharing/AccessRoutingTest` (explicitViewerCanExport,
    viewerCannotSyncApply, nonMemberJoinRefused). Note the viewer in that test is a workspace viewer.
- 2026-10-25 R1-E07-T01…T04 implemented by agent E1, with status review. The coordinator read
  V11, ShareTokens and RequestIdentityAspect.
  - **Security:** tokens are hashed only, stored as 64 hex characters (CHECK constraint); links are
    ≤ commenter; anonymous link access is read-only; definer functions use a locked search_path
    with PUBLIC revoked; the token hash goes only into a transaction-local GUC.
  - **As built:**
    - Link POSTs skip idempotency, so tokens are never stored or replayed.
    - The `request` state is reachable only via a link, because every workspace role maps to at
      least viewer. `sameWorkspaceNoMemberGetsRequestState` covers both paths.
    - Branching needs EDIT. Listing links needs SHARE. Approving never demotes an existing role.
    - Error codes: LAST_OWNER, USER_NOT_FOUND, PUBLIC_LINKS_DISABLED, REQUEST_PENDING,
      REQUEST_DECIDED, ALREADY_HAS_ACCESS.
  - Legacy 403→404 assertions were updated in DiagramControllerTest, WorkspaceIsolationTest,
    JwtAuthIsolationTest and DiagramTrashTest.
  - Agent full suite: 168/168. Pending: the coordinator's re-run.
  - Follow-ups: T07 RLS hardening, T08 Sync/Export/Collab, R1-BUG-04 JwtServiceTest flake.
- 1.0.0 (2026-10-24): epic created.
- 2026-10-25 R1-BUG-07(c) owner side built (frontend-implementer): `components/access/AccessRequests.tsx` lists pending requests for one diagram (GET /v1/access-requests, filtered by diagramId) with a role select, Approve (POST /approve, optional role) and Deny; api.access.listRequests/approveRequest/denyRequest added to lib/api.ts. Test: tests/access-requests.test.tsx (2). Not yet reachable: it needs one mount in components/ShareDialog.tsx (not in my file set): `{cloud && <AccessRequests diagramId={diagramId} onDecided={() => void load()} />}` after the General access block. Parts (a) workspace member resolves to `ok` and (b) share link without token are backend/SPA routing issues and are not addressed.
- 2026-10-26 R1-E14-T11 (presence): presence names come from the signed-in account (not "Current User") and avatar colours from a fixed palette so initials stay readable; the Live tab and a canvas presence pill (2+ people, connected) show who is here; Follow, comments and notifications stay R2 (D8). Files: hooks/useCollaboration.ts, components/CollaborationPanel.tsx.
- 2026-10-26 R1-E14-T12 (Live dock footer): the Live tab is a full-height column (flex column, height 100%, min-height 0); the line "Comment threads and the notifications inbox arrive in R2." is pinned to the bottom of the dock under a 1 px hairline, as Live.dc.html draws it. Files: components/CollaborationPanel.tsx.
