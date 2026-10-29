# Versioning, Proposals, Review and Comments Specification

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Status:** 🟡 Proposed
> **Part of:** [Master Spec](../../SPEC.md) · deepens [PRODUCT_SPEC](PRODUCT_SPEC.md) FL-6 (collaborate) and FL-7
> (versions & review), capabilities CAP-V1…V5, CAP-K4/K5. **Designs:** [Claude Design canvas](https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu),
> pages "5 · Versions & review" and "4 · Share & collaborate".

This is the part of ArchFlux that makes it "Git for architecture". It has to feel as natural as a Google
Docs comment and be as trustworthy as a GitHub pull request. Product rules:

1. **Nothing is ever lost.** Every state of a diagram is a version. Restore, revert and merge create *new*
   versions; history is never rewritten (except by retention policy, §2.6, and a workspace admin's
   explicit purge).
2. **Review the meaning, not the pixels.** Diffs are computed on the model (elements, relationships,
   properties). Layout moves are a separate, collapsible category.
3. **Every comment knows where and when it was said:** an anchor (element / relationship / region /
   page) *and* the version it was written against.
4. **Identity is real.** Authors, reviewers and resolvers are user references, never free text.
5. **Proposals are cheap; main is protected.** Anyone with edit access can propose. Protected diagrams
   merge only through review.

---

## 1. Baseline and gaps (2026-10-24, verified in code and schema)

| ID | Gap | Impact |
|---|---|---|
| RV-G1 | Three version concepts: server `checkpoints` (snapshot + free-text `branch`), server `diagram_revisions` (hash chain, `source`), browser-local checkpoints | Users can't tell what "history" means; restore paths differ |
| RV-G2 | A "branch" is a duplicated diagram (`parent_diagram_id`, `branch_name`) with **no base revision** | No 3-way merge possible; merge back is impossible or lossy |
| RV-G3 | `threads.author` / `replies.author` are **free text** | Spoofable identity; no notifications or permissions per author |
| RV-G4 | `threads.pinned_to` is a raw node id, no version, no region/relationship/page anchors | Comments vanish or point at the wrong thing after edits |
| RV-G5 | `resolved` is a boolean — no resolver, time, or reopen history; replies cannot be edited/deleted | No audit trail for decisions |
| RV-G6 | No mentions, assignees, reactions, visibility, notifications | Comments don't drive work |
| RV-G7 | Review/approve/merge is simulated in the browser (honestly labelled) | No real review workflow |
| RV-G8 | Revision diff is a text line diff; no semantic change list, no layout/semantic split | Reviews are noisy and hard |
| RV-G9 | No protection rules (who can change main, required reviewers, required checks) | Governance impossible |

---

## 2. Version model

### 2.1 Objects

| Object | What it is | Mutability |
|---|---|---|
| **Diagram** | The document: an id, a title, a workspace, its **main line** and its proposals | Metadata only |
| **Version** | An immutable snapshot of the model + views (pages, layout, styles) with `parent` (1) or `parents` (2 for a merge), `author`, `source`, `created_at`, `content_hash` | Immutable |
| **Named version** | A version with a `name` + optional description (tag) — "v12 · Saga orchestration" | Name editable; content immutable |
| **Session** | Autosaves by one author coalesced: a new session starts after 10 min idle, a page reload, or another author's edit | Derived (not stored separately) |
| **Proposal** | A line of versions forked from a **base version** of main, with a title, description, author, status | Head moves forward |
| **Review** | The review of one proposal (or of a main-line range on unprotected diagrams): reviewers, decisions, checks, threads | Lifecycle §3 |

`source ∈ {edit, import, sync, ai, restore, revert, merge, webhook}`. Every version records it, and the UI
shows it (an icon and a label in history).

### 2.2 How versions are created

- **Editing** autosaves continuously. The server stores a version at most every 30 s per session, plus one
  at session end. Real-time collaborators share one session stream and each change keeps its author
  attribution (§5.6).
- **Name this version** (`⌘⇧S`, or from history) turns the latest version into a named version.
- **Restore** a version creates a new version on top whose content equals the old one (`source=restore`).
  It never moves history backwards.
- **Revert one change**, from the diff list, creates a new version that undoes only that element- or
  property-level change (`source=revert`).
- **Sync accept, AI accept and import** each create one version with that source.

### 2.3 Identity and semantic diff

Elements and relationships have stable ids (UUIDs), so diffs are **by id**, not by position:

| Change class | Detected when | Shown as |
|---|---|---|
| Added / removed | id present in one side only | green / red ghost |
| Renamed | same id, `name` differs | "Renamed A → B" |
| Property changed | same id, any property differs | amber + property table (old → new) |
| Retyped | `kind` differs | amber, called out (rules may react) |
| Re-parented | container differs ("moved into Private subnet") | amber, semantic |
| Relationship changed | endpoints, protocol, sync/async, label | amber |
| **Layout only** | only x/y/size/waypoints/style differ | grey, **collapsed by default** ("14 layout changes") |
| Page/view changes | page added/removed/renamed, element added to a view | listed under Views |

Diffs are computed for any two versions, a proposal vs its base, or a proposal vs current main.

### 2.4 Proposals (branches)

- **Create:** "Propose changes" on any diagram (or any edit on a *protected* diagram prompts "Start a
  proposal?"). It records `base = main head`.
- **Work:** edits go to the proposal's line. Collaborators can co-edit in real time.
- **Stay current:** when main moves, the proposal shows "main is 3 versions ahead". **Update from main** does
  a 3-way merge of main into the proposal (§2.5) and creates a merge version on the proposal.
- **Close:** close without merging, kept and reopenable. **Delete** only by the author or an admin (soft
  delete, 30 days).

### 2.5 Merge (3-way, element-level)

Merging takes three inputs: the base version, main's head ("ours") and the proposal's head ("theirs"). Each
changed id is classified:
- **Changed on one side only:** take that side.
- **Changed on both sides, different properties:** combine them (no conflict).
- **Same property changed on both sides to different values:** **conflict**.
- **Deleted on one side, modified on the other:** **conflict**.
- **Layout:** both changed. Take theirs by default, and list it as auto-resolved so you can review it.

A clean merge creates a merge version on main with parents (main head, proposal head) and closes the
proposal as *merged*. If there is any conflict, the **conflict resolver** opens (SC-31b). For each conflict it
shows base | main | proposal and offers keep main / keep proposal / edit manually. Merge is blocked until
every conflict is resolved.

### 2.6 Retention

| Version type | Free | Team | Enterprise |
|---|---|---|---|
| Autosave versions | 30 days, then coalesced to 1 per day | 1 year | Configurable / forever |
| Named, merge, sync and restore versions | Forever | Forever | Forever |
| Closed proposals | 90 days | 1 year | Configurable |

Coalescing keeps the last version of each day; diffs stay valid because named versions are never removed.

---

## 3. Review (the "pull request")

### 3.1 Lifecycle

```
Draft ──(Ready for review)──► Open ──(all required approvals + checks + threads resolved)──► Mergeable ──(Merge)──► Merged
  ▲                             │  ▲                                                                  │
  └──(Convert to draft)─────────┘  └──(new commits: approvals marked stale if "dismiss stale")◄─────────┘
Open/Draft ──(Close)──► Closed ──(Reopen)──► Open
```

### 3.2 Who reviews

- **Requested reviewers** are people or teams, chosen by the author.
- **Owner reviewers** are added automatically. Each element has an `owner` (team); when a proposal changes
  elements owned by a team, that team is requested automatically. This is the CODEOWNERS idea applied to
  architecture.
- **Protection rules** apply per diagram or folder (admin): required approvals (0–5), require owner review,
  dismiss stale approvals on new changes, require all threads resolved, required checks (policy rules,
  §PRODUCT_SPEC FL-9), and who may bypass (admins, logged in audit).

### 3.3 Reviewing

- **Tabs:** Overview (description, summary of changes, reviewers, checks, merge box), **Changes** (visual
  diff canvas plus the change list), Checks, Activity.
- **Changes tab:** a canvas with a diff overlay and a side-by-side toggle. The left list groups changes by
  kind: Added, Removed, Changed, Relationships, Views, then Layout (collapsed). Each item has a per-change
  "Viewed" checkbox (a progress bar shows "6 / 9 reviewed") and jumps to the element.
- **Review comments:** comment on a changed element, relationship, property row, or a region of the diff
  canvas. Comments are **pending** until the reviewer submits the review (batched, like GitHub), and
  "Add single comment" posts immediately.
- **Suggestions:** a reviewer can attach a *suggested change* to a comment (e.g. "technology:
  Redis 6 → Redis 7", or "add relationship Order → Outbox"). The author can **Apply suggestion**, which
  creates a version on the proposal crediting the reviewer, or apply several as one batch.
- **Submit review:** Comment / Approve / Request changes, with a summary. Request changes blocks merge until
  that reviewer approves or is dismissed (with a reason, logged).

### 3.4 Checks

Each check is run on the proposal head: schema valid, policy rules (block/warn), drift vs connected
sources ("this proposal reintroduces a removed service"), and optional CI status from GitHub. Each check
shows pass, warn or fail, with a link to the element.

### 3.5 Merge box (Overview, bottom)

The merge box lists, in order:
1. Approvals (n of m).
2. Requested changes outstanding.
3. Unresolved threads.
4. Checks.
5. Conflicts with main.

Each line has a reason and a fix link. The merge options are **Merge** (a merge version) or **Squash**
(a single version with the proposal's description). An optional "Name this version" field names the result.
When the diagram is linked to Git, merging also opens or updates a commit and pull request on the linked
repo, and a status check on GitHub mirrors the review state.

### 3.6 GitHub mirroring (R2)

| ArchFlux | GitHub |
|---|---|
| Proposal | Branch `archflux/<slug>` + PR (opened on "Ready for review") |
| Review decision | PR review |
| Thread on element | PR comment with the element name + deep link |
| Merge | Merge of the PR (or blocked until the PR merges, per setting) |

A PR opened in GitHub that changes a `.arch` file appears as a proposal, with the visual diff rendered in
ArchFlux and a link-back comment posted on the PR.

---

## 4. Comments

### 4.1 Anchors

| Anchor | Pinned to | When the target changes |
|---|---|---|
| Element | element id (+ the version it was written on) | Follows the element across moves, renames, pages |
| Relationship | relationship id | Follows; if endpoints change, shows "relationship changed since comment" |
| Property | element id + property key (review comments) | Shows old → new if the value changed since |
| Region | rectangle in a page's coordinates (+ version) | Stays in place; shows "area changed" if contents changed |
| Page | page id | — |
| Diagram | the whole document | — |
| Version / review | a version or review (general review comments) | — |

**Detached comments:** if the anchor is deleted, the thread becomes *detached*. It stays in the Comments
panel under "Detached", shows its last known location as a ghost on the version it was written on, and can
be re-attached or resolved. It is never deleted silently.

**Outdated comments** (written on an older version where the anchor has since changed) get an
"Outdated" badge and a "Show original" link that opens the diff at that version.

### 4.2 Thread model

- **Thread:** id, anchor, `created_on_version`, author, status (open / resolved), resolved_by,
  resolved_at, assignee, due date, visibility (all with access / internal — hidden from guests), labels
  (question, decision, risk, todo), and an optional link to a review.
- **Comment:** id, thread, author (user ref), body (Markdown subset: bold, italic, code, links, lists),
  mentions (users / teams), an optional **suggestion** (structured change), attachments (images),
  edited_at + an edit history visible to all, deleted (a tombstone "comment deleted" keeps the thread
  readable), reactions.
- **Decision:** a thread can be **marked as decision**, which records the resolution text in an
  auto-generated *Decisions* log (ADR-lite) linked to the element.

### 4.3 Actions and permissions

| Action | Viewer | Commenter | Editor | Owner/Admin |
|---|---|---|---|---|
| Read threads (non-internal) | ✅ | ✅ | ✅ | ✅ |
| Start thread, reply, react, @mention | — | ✅ | ✅ | ✅ |
| Resolve / reopen | — | own threads | ✅ | ✅ |
| Assign, set due date, label | — | — | ✅ | ✅ |
| Edit own comment | — | ✅ | ✅ | ✅ |
| Delete own comment | — | ✅ (tombstone) | ✅ | ✅ |
| Delete others' comments | — | — | — | ✅ (audited) |
| Apply suggestion | — | — | ✅ (author of proposal or editor) | ✅ |

Guests (external commenters) never see "internal" threads; a mention of someone without access asks "Share
with [name] as commenter?".

### 4.4 Mentions, notifications, inbox

- `@person`, `@team` (notifies every member) and `@owner` (resolves to the anchor element's owner team).
- **Notification events:**
  - mentioned
  - reply in a thread you're in
  - thread assigned to you
  - review requested
  - review submitted on your proposal
  - proposal merged or closed
  - your comment resolved
  - due date tomorrow
- **Delivery:** in-app inbox, which is grouped per diagram and supports "Mark done" and "Snooze". Each
  person picks email (immediate or daily digest) and Slack per event type.
- **Follow:** you follow a diagram automatically after editing or commenting; you can follow or unfollow
  any diagram or thread.

### 4.5 Comments UI

- **Canvas pins:** a small speech-bubble with a count at the anchor's top-right. Region comments draw a
  dashed rectangle while the thread is open. Pins hide in Present mode and when the "Comments" layer is off.
- **Comments panel:**
  - Filters: Open, Mine, Assigned to me, Mentions, Resolved, Detached, plus search.
  - Sort: by position, newest, or due date.
  - Each thread card shows its anchor chip, labels, and assignee with due date.
- **Composer:** `@` autocomplete, `/` commands (/suggest, /assign, /decision, /due), paste images, ⌘↵ to send.
- **Keyboard:** `C` starts a comment at the selection, `N` / `P` move to the next / previous thread, and `R`
  resolves.

---

## 5. Edge cases (must be handled)

| # | Case | Behaviour |
|---|---|---|
| E1 | Element with open threads is deleted | Threads detach (§4.1); deletion dialog warns "2 open threads will be detached" |
| E2 | Element renamed / moved to another page | Threads follow by id |
| E3 | Review comment on a proposal whose element is later changed | Outdated badge + "show original" |
| E4 | New commits after approval | If "dismiss stale" → approvals reset with notice; else approvals kept but marked "approved older version" |
| E5 | Reviewer loses access mid-review | Their pending review is discarded; decision kept in history but no longer counts |
| E6 | Main changes while reviewing | "Main is n ahead"; conflicts listed in merge box before merge |
| E7 | Two people resolve/reopen at once | Last write wins on status, both events in activity log |
| E8 | Huge diff (> 500 changes) | Change list virtualised; canvas overlay shows clusters; layout changes always collapsed |
| E9 | Restore to a version that predates a merged proposal | Allowed; creates restore version; activity notes "reverts merge of Proposal #14" |
| E10 | Offline edits on a proposal | Queue locally; on reconnect, rebase onto proposal head (element-level), conflicts use the resolver |
| E11 | Suggestion no longer applies (target changed) | "Suggestion outdated" — show diff, allow manual apply |
| E12 | Mention of a non-member | Offer share as commenter; no notification until shared |
| E13 | Comment contains secrets (keys, tokens) | Pre-send detector warns; admins can redact (tombstone + audit) |

---

## 6. Data model and API (backend contract — informs BACKEND_SPEC before implementation)

```
versions(id, diagram_id, line_id, parent_id, merge_parent_id NULL, author_id → users,
         source, name NULL, description NULL, content_hash, snapshot jsonb (model+views), created_at)
lines(id, diagram_id, kind 'main'|'proposal', title, description, author_id, base_version_id,
      head_version_id, status 'draft'|'open'|'merged'|'closed', merged_version_id NULL, created_at, updated_at)
reviews(id, line_id, created_at)   -- one per proposal
review_requests(review_id, reviewer_user_id NULL, reviewer_team_id NULL, reason 'requested'|'owner')
review_decisions(id, review_id, reviewer_id, state 'commented'|'approved'|'changes_requested'|'dismissed',
                 on_version_id, body, created_at, dismissed_by NULL, dismiss_reason NULL)
threads(id, diagram_id, line_id NULL, review_id NULL, anchor jsonb, created_on_version_id, author_id → users,
        status, resolved_by NULL, resolved_at NULL, assignee_id NULL, due_on NULL, visibility, labels text[],
        is_decision bool, created_at)
comments(id, thread_id, author_id → users, body, suggestion jsonb NULL, pending bool, created_at,
         edited_at NULL, deleted_at NULL)
comment_edits(comment_id, body, edited_at)
mentions(comment_id, user_id NULL, team_id NULL)
reactions(comment_id, user_id, emoji)
protection_rules(scope_kind 'diagram'|'folder', scope_id, required_approvals, require_owner_review,
                 dismiss_stale, require_threads_resolved, required_checks text[], bypass_roles text[])
notifications(id, user_id, event, subject_ref jsonb, created_at, read_at NULL, done_at NULL, snoozed_until NULL)
```

The migration path is **V10+**; existing migrations are never edited:
- `checkpoints` become named versions on main.
- `diagram_revisions` become versions on main.
- Branch diagrams become proposals, with base = the nearest common snapshot, or flagged "unknown base —
  merge as copy".
- Free-text authors map to users by name/email when unambiguous; otherwise they become a "Legacy author"
  label.

**Endpoint families:**

| Resource | Endpoints |
|---|---|
| Versions | `/diagrams/{id}/versions` (list/get/name/restore/revert-change), `/diagrams/{id}/compare?from&to` (semantic diff) |
| Proposals | `/diagrams/{id}/proposals` (create/list/update/close/reopen/update-from-main/merge) |
| Reviews | `/proposals/{id}/review` (request, decisions, dismiss), `/proposals/{id}/checks` |
| Threads | `/threads` (create with anchor, resolve/reopen, assign, label, decision) |
| Comments | `/threads/{id}/comments` (create/edit/delete), `/comments/{id}/reactions`, `/comments/{id}/apply-suggestion` |
| Notifications | `/notifications` (list, mark read/done, snooze) |

Every mutating endpoint is idempotent (idempotency key) and audited.

---

## 7. Screens (designs on the canvas)

| ID | Screen | Artboard |
|---|---|---|
| SC-27 | History panel (sessions, named versions, proposals lane, sources) | History (updated) |
| SC-28 | Compare / visual diff | History |
| SC-29 | Create proposal / request review dialog | Proposals |
| SC-30 | Review — Overview tab with merge box | Review (updated) |
| SC-30b | Review — Changes tab: grouped change list, viewed progress, inline comment with suggestion, pending review submit | ReviewChanges |
| SC-31b | Merge conflict resolver (base / main / proposal) | MergeConflict |
| SC-24 | Comments panel + thread anatomy (anchors, detached, outdated, decision, suggestion, reactions) | CommentsDetail |
| — | Lifecycle & version model diagram (for the team) | ReviewLifecycle |

---

## 8. Acceptance (by release)

| Release | Must pass |
|---|---|
| **R1** | One history (RV-G1 closed); named versions, restore, revert-change; semantic diff with layout split (RV-G8); element/relationship/region anchors with version (RV-G4); authors are user refs (RV-G3); resolve with who/when (RV-G5); detached + outdated threads; mentions + in-app inbox (RV-G6 partial) |
| **R2** | Proposals with base + update-from-main + 3-way merge + conflict resolver (RV-G2); reviews with requested/owner reviewers, batched review, suggestions, checks, merge box, protection rules (RV-G7, RV-G9); email/Slack notifications; GitHub mirroring |
| **R3** | Decisions log, policy checks as required checks, AI review summary attached to reviews |

Each item carries tests at the level it lives:
- Diff, merge and conflict classification: **unit tests**.
- Lifecycle transitions and permissions: **API integration tests**.
- Review submit, apply suggestion and conflict resolve: **e2e journeys**.

---

## 9. Changelog
- **1.0.0 (2026-10-24):** first version — gaps RV-G1…G9, version/proposal/review/comment model, merge
  semantics, retention, permissions, notifications, edge cases E1–E13, data model + API families, screens,
  acceptance by release.
