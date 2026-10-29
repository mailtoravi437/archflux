# EPIC-11 · Workspace setup, members, activation checklist, limits

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2 (backend), 3 (frontend) | **Sources:** CAP-W1, CAP-W4 (limits
> only); FL-1, FL-12, FL-16, FL-22; SC-02, SC-04, SC-41, SC-54; DATA_MODEL_R1 §4.4, §5
> **Design:** "9 Onboarding & access" › Welcome, FirstRun; "8 Workspace admin" › Members; "12 Account &
> governance" › Limits

**Billing is R4.** R1 ships only the **limits** and honest upgrade moments. A checkout or a fake
"Upgrade" that pretends to charge must not exist. The "Start trial" button is shown only when
decision D3 (pricing) is made. Until then it reads "Contact us to upgrade" and opens a mailto to the
runtime config key `supportEmail`. R1-E11-T06 adds `supportEmail?: string` to `RuntimeConfig` in
`lib/config.ts` and to `/config.json`. When it isn't set, the button is hidden.

---

### R1-E11-T01 · V12, workspace endpoints, invites, `PlanService`

| | |
|---|---|
| **Size** | M |
| **Role** | backend-implementer |
| **Depends on** | none (V12 must merge after V10 and V11; if they aren't merged yet, rebase onto them before merging) |

**Read:**
- `service/WorkspaceService.java`
- `domain/Workspace.java`, `domain/WorkspaceMembership.java`
- `V6__workspaces.sql`
- `auth/EmailService.java`
- `web/AuthController.java` L240–L310 (the magic-link pattern for token emails)

**Create:**
- `V12__workspace_invites.sql`, per §4.4.
- `service/PlanService.java`:

```java
public record PlanLimits(int cloudDiagrams, int editors, int historyDays, boolean proposals, int connectors) {}
public PlanLimits limitsFor(String plan);           // free | team | enterprise; unknown → free; ∞ = Integer.MAX_VALUE
public Usage usage(UUID workspaceId);               // cloudDiagrams (non-trashed), editors (members with role admin|editor)
public void requireCanCreateDiagram(UUID workspaceId);   // throws ApiException.limitReached("cloudDiagrams", current, max) → 402
public void requireCanAddEditor(UUID workspaceId);
```

- `ApiException.limitReached(limit, current, max)` returns 402 with the body from DATA_MODEL_R1
  §4.4. Update `ApiExceptionHandler` to emit its fields.
- `web/WorkspaceController.java` handles:
  - `GET` / `PATCH /workspaces/current` (the current workspace is the user's personal or
    last-selected one; add the header `X-Workspace-ID` validated by membership; the default is
    personal);
  - the invites CRUD;
  - `POST /invites/{token}/accept`, which requires sign-in and an email that matches the invite
    (case-insensitive).
- **Hook points:** `DiagramService.create` calls `requireCanCreateDiagram`. Accepting an invite as
  editor or admin, and promoting to editor, call `requireCanAddEditor`.
- **Invite email:** the subject is "<inviter> invited you to <workspace> on ArchFlux" and the link is
  `#/invite/<token>`. Tokens follow the E07 rules (hashed at rest, shown once) and expire after 7
  days.
- Audit `workspace.update`, `invite.create`, `invite.revoke`, `invite.accept`.

**Tests:** `WorkspaceInvitesTest.java`, `PlanLimitsTest.java`
- `fourthCloudDiagramOnFreeIs402WithBody()`
- `updateExistingDiagramNeverLimited()`
- `inviteAcceptRequiresMatchingEmail()`
- `inviteTokenHashedAndExpires()`
- `slugTakenIs409()`
- `nonAdminPatchIs403()`
- `xWorkspaceIdOfNonMemberIs404()`

---

### R1-E11-T02 · Members management API

| | |
|---|---|
| **Size** | S |
| **Role** | backend-implementer |
| **Depends on** | R1-E11-T01 |

**Change:**
- `GET /workspaces/current/members` returns `[{userId, email, name, role, status, joinedAt}]` and
  the pending invites.
- `PATCH …/members/{userId}` takes `{role}`.
- `DELETE …/members/{userId}` is admin only. It returns **409** `LAST_ADMIN` when it would remove or demote the last active admin (workspace roles are admin|editor|reviewer|viewer, so there is no workspace `LAST_OWNER`; `LAST_OWNER` is the diagram-level code in E07). Any member may read the roster; pending invites are included for admins only. An admin cannot remove themselves (400) unless that trips the last-admin guard first. Promotion to admin or editor calls `requireCanAddEditor` (402 `LIMIT_REACHED`). Removing a member does
  **not** delete their diagrams: ownership moves to the remover (`diagrams.owner_id` plus an owner `diagram_members` row), audited as `diagram.transfer` per diagram; the removed user's explicit diagram grants in the workspace are dropped. Audit actions: `member.update`, `member.remove`.

**Tests:** `WorkspaceMembersTest.java`
- `lastAdminProtected()`
- `removingMemberTransfersDiagrams()`
- `promoteToEditorChecksSeatLimit()`

---

### R1-E11-T03 · Workspace setup and join (SC-02)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E11-T01 |
| **Design** | 9 Onboarding & access › Welcome (copy verbatim) |

**Change:**
- Extend `screens/OnboardingScreen.tsx`. After the first sign-in, when `GET /workspaces/current`
  shows the personal workspace and the user has no other workspace:
  - **Create:** a workspace name, then a slug (auto from the name, validated live, with a
    "taken" check on blur), then "Invite teammates" (skippable, comma-separated emails with a role).
  - **Join:** if invites are pending for the user's email, show "Join <workspace>" cards first.
- Add the route `#/invite/:token` to accept invites. Signed out, it goes to login and back.
- A workspace switcher goes in the account menu, setting `X-Workspace-ID` through `lib/api.ts` and
  persisting the choice.

**Tests:** `src/tests/workspace-setup.test.tsx`
- `it('creates workspace with slug and skips invites')`
- `it('pending invite shows join card')`
- `it('invite route accepts and switches workspace')`

---

### R1-E11-T04 · Members screen backed by the server (SC-41)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E11-T02 |
| **Design** | 8 Workspace admin › Members |

**Change:**
- Replace the local team list in `screens/SettingsTeamScreen.tsx` with the server's members and
  invites: role selects, Remove (with the confirm text "Their diagrams move to you"), "Invite
  people", and a resend or revoke for each invite.
- Show a seat meter ("Editors 3 / 3 on Free") from `limits` and `usage`.
- Signed out: "Sign in to manage your team". The local fake list is removed.

**Tests:** `src/tests/settings-team.test.tsx`
- `it('lists server members and invites')`
- `it('role change calls PATCH')`
- `it('seat meter reads usage/limit')`
- `it('signed-out state has no fake members')`

---

### R1-E11-T05 · Getting-started checklist (SC-04, FL-16)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E10-T01 |
| **Design** | 9 Onboarding & access › FirstRun |

**Contract:**

```ts
// lib/checklist.ts
export type ChecklistStep = 'create_diagram' | 'add_5_elements' | 'connect_two' | 'invite_teammate' | 'share_or_publish' | 'connect_github';
export function computeChecklist(input: { docs: DiagramDoc[]; invitesSent: number; sharesMade: number; githubConnected: boolean; plan: string }): Record<ChecklistStep, boolean>;
```

**Change:**
- Create `components/GettingStarted.tsx` on Home: a progress bar plus the steps, each with an action
  link. "Connect GitHub" is hidden on Free.
- "Dismiss" persists per user in `archflux:checklist:v1`.
- The steps are **derived** from real state, never ticked manually.

**Tests:** `src/tests/checklist.test.ts`
- `it('add_5_elements true when any doc has ≥5 nodes')`
- `it('github step hidden on free')`
- `it('dismiss persists')`

---

### R1-E11-T06 · Limit reached UI and 402 handling (SC-54)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E11-T01 |
| **Design** | 12 Account & governance › Limits (copy verbatim, except the trial button per decision D3) |

**Change:**
- `lib/api.ts`: an `ApiError` with status 402 parses `{code, limit, current, max}` into
  `err.limit`.
- `saveActiveDoc`: a 402 on create keeps the doc **local** and returns `'limit'`. Add `'limit'` to
  the result union.
- Create `components/LimitDialog.tsx` per the design:
  - **Admin:** "Save a 4th diagram to the cloud with Team" plus the "Nothing is blocked…" copy, with
    the actions [Contact us to upgrade | Start trial (D3)] and [Keep on this device].
  - **Non-admin:** "Ask an admin", which emails or notifies the workspace admins. It uses
    `POST /workspaces/current/upgrade-requests`. Until that endpoint exists, the button copies a
    pre-written message to the clipboard and says so honestly.
- The status button shows "Local · Free plan limit" for such docs.

**Tests:** `src/tests/limit-dialog.test.tsx`
- `it('402 on create keeps doc local and opens dialog')`
- `it('non-admin sees Ask an admin')`
- `it('existing cloud docs still save while at limit')`

---

## Changelog
- 2026-10-25 R1-E11-T05 done: lib/checklist.ts (`computeChecklist`, `visibleChecklistSteps`, per-user dismiss in `archflux:checklist:v1`), components/checklist/GettingStarted.tsx mounted on HomeScreen (fixed bottom-right, per FirstRun artboard); tests checklist.test.ts (6), getting-started.test.tsx (2). Honest limits: no frontend source exists for shares or GitHub state, so those two steps stay open until E07-T05 / the GitHub connector expose it (`sharesMade` 0, `githubConnected` false); invite step comes from the server roster. Extra files: screens/HomeScreen.tsx (2-line mount). Component path is components/checklist/GettingStarted.tsx (not components/GettingStarted.tsx).
- 2026-10-25 R1-E11-T04 done: screens/SettingsTeamScreen.tsx now reads GET /workspaces/current + /members (members and invites), role selects (PATCH), Remove with "Their diagrams move to you." confirm (DELETE), Invite people, per-invite Resend (revoke + re-invite, since no resend endpoint exists) and Revoke, seat meter "Editors 3 / 3 on Free", signed-out "Sign in to manage your team". Local team list removed; Governance card untouched. Teams and Last active columns omitted (no data); Joined shown instead. Tests settings-team.test.tsx (6).
- 2026-10-25 R1-E11-T03 review: components/onboarding/WorkspaceSetup.tsx (name, slug auto from name, optional invites with role, join card), screens/InviteScreen.tsx + route `#/invite/:token` (signed out stores the token, goes to login, AuthCallbackScreen returns to the invite), components/WorkspaceSwitcher.tsx, lib/workspaceSetup.ts, `api.workspaces` block and `X-Workspace-ID` (sent on /v1/workspaces/* only, persisted in `archflux:workspace:v1`). Tests workspace-setup.test.tsx (8). Missing mount: `<WorkspaceSwitcher />` in the AppShell account menu. Spec gaps found: no create-workspace endpoint (setup renames the personal workspace via PATCH), no slug-availability endpoint (taken is reported from 409 SLUG_TAKEN on create, not on blur), no "my pending invites" endpoint (join card appears only for an invite token this browser holds), no "my workspaces" endpoint (switcher lists workspaces joined on this browser). Extra files: screens/AuthCallbackScreen.tsx (3 lines: return to a pending invite).
- 2026-10-25 R1-E11-T02 review: WorkspaceMemberService + WorkspaceController GET/PATCH/DELETE /workspaces/current/members[/{userId}], MemberRoleRequest, WorkspaceMembershipRepository (findRoster, countActiveAdmins). GET returns `{members, invites}`. Tests: workspace/WorkspaceMembersTest (10). Waiting on a green full backend suite (ShareMembersTest.editorCannotGrantOwner fails from the in-progress, untracked E07-T02 ShareService, not this task).
- 2026-10-25 R1-E11-T06 review (partial wiring): 402 LIMIT_REACHED (uppercase, decided by owner) parsed into `ApiError.limit` and raised as window event `archflux:limit-reached`; `components/LimitDialog.tsx` (`LimitDialog`, `LimitDialogHost`; admin vs non-admin per artboard, clipboard-only Ask an admin, no trial button per D3, 2147483647 shown as ∞); `api.getCurrentWorkspace`; `supportEmail` in RuntimeConfig; tests/limit-dialog.test.tsx (4). Remaining: AppShell mounts `<LimitDialogHost />`; store `saveActiveDoc` returns `'limit'` on `isLimitReachedError(e)` and keeps the doc local; status button 'Local · Free plan limit'. Files beyond list: lib/config.ts (supportEmail, spec'd).
- 2026-10-25 Coordinator: removed the debug log of the email body in `MockEmailService`, which printed invite links and so tokens (AGENTS §3: never print tokens in logs). OPEN DECISION: the 402 code is `limit_reached` in code but `LIMIT_REACHED` in DATA_MODEL_R1 §4.1; pick one in the spec before E11-T06 keys on it. Legacy plan value `member` counts as free, so existing workspaces on it hit the 3-diagram limit.
- 2026-10-25 R1-E11-T01 done: V12__workspace_invites.sql (workspaces.slug/join_policy/domain, workspace_invites with hashed token, pending-unique index, RLS incl. invitee policies via current_user_email()); PlanService (limits, usage, 402 hooks); ApiException.limitReached plus ApiExceptionHandler emitting extra error fields; WorkspaceController (GET/PATCH /workspaces/current, invites list/create/revoke, POST /invites/{token}/accept), WorkspaceAdminService, WorkspaceInviteService, WorkspaceInvite entity/repo, DTOs; WorkspaceService.current() (X-Workspace-ID, 404 for non-member); DiagramService.create calls requireCanCreateDiagram. Tests: workspace/WorkspaceInvitesTest (9), workspace/PlanLimitsTest (3), plus workspace/WorkspaceTestBase. Decisions: error code is lower-case `limit_reached` per DATA_MODEL_R1 §4.4; invalid/expired/used/revoked token is 404, email mismatch is 403 INVITE_EMAIL_MISMATCH; create returns the token once with `emailSent`; X-Workspace-ID is honoured only by the workspace endpoints (diagrams/folders still use the personal workspace until a later task); legacy plan `member` is treated as free; unlimited values serialise as 2147483647.
- 1.0.0 (2026-10-24): epic created.

- 2026-10-25 R1-BUG-06 fixed: under `archflux_app` the invite accept returned 404 because the invitee could not read the `workspaces` row (V6 `workspaces_member` is member-only). Added V18__invitee_workspace_read.sql (SECURITY DEFINER `has_pending_workspace_invite`, SELECT-only policy `workspaces_invitee_read`, idempotent EXECUTE grants) and `db/roles.sql` section 5 (V10-V17 table and helper-function grants, which migrations only apply if the role pre-exists; also re-asserts V14 column-level UPDATE on diagram_revisions). Test `InviteAcceptAppRoleTest` (runs roles.sql after migrations, connects as archflux_app). `AppRoleTest` grant mirror extended with the two new helpers. Follow-up: `PlanService.requireCanAddEditor` counts memberships under RLS, so for a non-member invitee the editor count is 0 and the seat limit is not enforced on accept; needs a SECURITY DEFINER count.
- 2026-10-25 R1-BUG-13 fixed (follow-up of R1-BUG-06, status: done; was mislabelled R1-BUG-08): the editor seat limit is now enforced on invite accept under `archflux_app`. Added V19__workspace_editor_seat_count.sql (SECURITY DEFINER `workspace_editor_seat_count(ws)`: counts active admin/editor memberships only for a member or live invitee, NULL otherwise; idempotent EXECUTE grants to `archflux_app` and `app_tester`), `db/roles.sql` section 5 grant, `PlanService.requireCanAddEditorForInvitee` used by `WorkspaceInviteService.accept`. Invite create and member-role changes keep the RLS-respecting `requireCanAddEditor`. New test `InviteAcceptPlanLimitAppRoleTest` (SpringBootTest as `archflux_app`, full free workspace: accept returns 402 LIMIT_REACHED, no membership added); it failed with 200 before the fix. Run: `InviteAcceptPlanLimitAppRoleTest` 1, `WorkspaceInvitesTest` 9, `PlanLimitsTest` 3, `InviteAcceptAppRoleTest` 1 all pass; full `mvn test` 206 pass, 0 fail.
