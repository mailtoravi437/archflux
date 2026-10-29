# ArchFlux Product Specification — "Advanced Lucidchart for architecture"

> **Version:** 4.3.0 | **Last Updated:** 2026-10-25 | **Status:** 🟡 Proposed (awaiting sign-off)
> **Part of:** [Master Spec](../../SPEC.md) | **Platform contracts:** Appendix A (moved from the deleted PRODUCTIZATION_SPEC v3.0.0; still binding). **Visual design:** [UI_REVAMP_SPEC](UI_REVAMP_SPEC.md) + the
> [Claude Design canvas](https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu).

Written as product manager: what we build, for whom, why, in what order, and how we know it worked.
Every capability carries an ID (`CAP-*`), every flow `FL-*`, every screen `SC-*`, so implementation
specs and tests can trace back here.

---

## 1. Vision and positioning

**Vision:** the diagramming tool engineering teams *trust* for architecture — as fluid as Lucidchart to draw
in, but every box is a real, typed element of a living model that is reviewed like code and checked
against what is actually running.

**One-liner:** *Lucidchart's canvas, Git's workflow, and your infrastructure's truth — in one place.*

| | Lucidchart / draw.io / Miro | Structurizr / IcePanel | Cloudcraft / Eraser | **ArchFlux (target)** |
|---|---|---|---|---|
| Fast free-form canvas | ✅ | ◐ (model-first, rigid) | ◐ | ✅ |
| Typed architecture model, many views of one model | ❌ (pictures) | ✅ | ❌ | ✅ |
| Diagrams-as-code in Git, PR-style review + visual diff | ❌ | ◐ (DSL in git, no visual review) | ◐ | ✅ |
| Live drift vs Kubernetes / Terraform / OpenAPI | ❌ | ❌ | ◐ (AWS import only) | ✅ |
| Architecture rules / policy checks in CI | ❌ | ❌ | ❌ | ✅ |
| Real-time multiplayer + comments | ✅ | ◐ | ✅ | ✅ |
| AI: generate, explain, review risks | ◐ (generate) | ❌ | ◐ | ✅ |

**Positioning rule:** win on *trust and workflow* (model + git + drift + rules), and reach *parity* on the
canvas so nobody has to give up a Lucidchart habit to switch.

---

## 2. Personas and jobs

| Persona | Top jobs | Today's pain | ArchFlux answer |
|---|---|---|---|
| **Engineer (author)** | Draw/update a system diagram in minutes | Generic tools: no types, no reuse, diagram rots | Typed shapes, templates, AI draft, import from repo/IaC |
| **Staff engineer / architect (reviewer)** | Review architecture changes; keep consistency across diagrams | Screenshots in PRs, no diff, copies drift apart | Visual diff, review/approve, model shared across views |
| **Platform engineer** | Keep diagrams true to infra | Manual updates after every change | Connectors + drift inbox + scheduled sync |
| **Engineering manager / security** | Know risk, ownership, compliance | Tribal knowledge | Rules/policies, owners, threat & dependency overlays |
| **Presenter / stakeholder (viewer)** | Understand the system, present it | Cluttered, outdated diagrams | Present mode, levels of detail, share links, embeds |
| **Workspace admin** | Govern access and data | No audit | Roles, SSO/SCIM, audit, retention |

**North-star metric:** *Trusted diagrams per active team per week.* A trusted diagram is one that was viewed,
has no unacknowledged drift older than 7 days, and has no failing rules.

**Input metrics:**
- Activation: a first diagram with ≥ 5 elements within 10 minutes of sign-up.
- Weekly active editors.
- Review cycle time.
- Share and embed views.
- Connector-backed diagrams as a share of all diagrams.

---

## 3. Capability map — gap analysis (2026-10-24)

Legend: ✅ shipped · ◐ partial/unreliable · ❌ missing · **R1–R4** = target release (§7).

### 3.1 Canvas fundamentals (Lucidchart parity)

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-C1 | Shapes, connectors (straight/orthogonal/curved), snapping, guides, undo/redo, zoom/pan, minimap | ✅ | — |
| CAP-C2 | **Containers & groups**: VPC / region / cluster / namespace boxes that own children (move together, auto-resize, collapse) | ❌ | R1 |
| CAP-C3 | **Swimlanes & frames** (named areas used for layout and presentation) | ❌ | R1 |
| CAP-C4 | **Multiple pages** per document, page tabs, links between pages | ❌ | R1 |
| CAP-C5 | **Layers** (show/hide/lock: e.g. "network", "data flows", "security") | ❌ (engine layers are internal) | R1 |
| CAP-C6 | **Align & distribute**, match size, arrange (front/back), lock position | ❌ | R1 |
| CAP-C7 | **Connector power**: waypoints/bends, line jumps, label positions, auto re-route around shapes | ◐ (fixed elbow) | R1 |
| CAP-C8 | **Style tools**: format painter, multi-select styling, saved styles/themes | ◐ (per-node only) | R1 |
| CAP-C9 | **Find & replace**, select similar, quick-add (type to create & connect) | ◐ (⌘K actions) | R1 |
| CAP-C10 | **Auto-layout** (layered, left-to-right, tree), tidy selection | ◐ (basic) | R2 |
| CAP-C11 | Rich text in shapes, tables, notes, legends | ◐ | R2 |
| CAP-C12 | Performance: 10k elements at 60 fps; open < 1 s for 2k elements | ◐ (2k ok, 10k rejected) | R2 |

### 3.2 Shapes, libraries, templates

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-S1 | AWS / GCP / Azure / K8s / data shape packs, search, recents — in standard notation (UI_REVAMP_SPEC §5A) | ◐ (12 official AWS icons; data/GCP/Azure icons are placeholders, UX-A11; one box shape for every kind) | R1: full official sets + C4 notation |
| CAP-S2 | Custom shape libraries per team (upload SVG, set default properties) | ❌ | R2 |
| CAP-S3 | Templates gallery (blueprints) + "save as template" | ✅ local only | R1: team-shared |

### 3.3 Architecture model (differentiator)

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-M1 | Every node is a **typed element** (person, system, service, data store, queue, external, deployment node) with **properties** (owner, tech, repo, SLO, cost, data class, tier) | ◐ (type + tag + 3 metadata fields) | R1 |
| CAP-M2 | **Relationships** with protocol, sync/async, data carried, auth | ◐ (label/protocol) | R1 |
| CAP-M3 | **One model, many views** — context / container / deployment views of the same elements; rename once, updates everywhere; zoom in/out between levels (C4) | ❌ | R3 |
| CAP-M4 | **Element catalog** across the workspace: search "who owns payments-db?", "what calls Order Service?" | ❌ | R3 |
| CAP-M5 | **Data linking & conditional formatting**: colour/badge shapes by property or live data (health, cost, owner) + legends | ❌ | R2 |
| CAP-M6 | **Impact analysis**: select an element → upstream/downstream highlight, blast radius | ❌ | R3 |

### 3.4 Collaboration and sharing

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-K1 | Cloud save, versioned, cross-device library | ✅ (FE-Q1, v1.6.0) | — |
| CAP-K2 | **Share dialog**: invite people/teams, roles (owner/editor/commenter/viewer), link sharing, expiry | ❌ | R1 |
| CAP-K3 | **Real-time multiplayer**: presence avatars, live cursors, selection highlights, follow mode | ◐ (client/server protocol mismatch, SVC-O1) | R2 |
| CAP-K4 | **Comments**: pinned to shapes, threads, @mentions, assign, resolve, reactions | ◐ (local threads, no mentions/notify) | R2 |
| CAP-K5 | **Notifications**: in-app inbox, email digest, Slack | ❌ | R2 |
| CAP-K6 | Folders, starred, shared-with-me, trash/restore, ownership transfer | ◐ (flat library) | R1 |

### 3.5 Versions, review, Git

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-V1 | Revision history timeline, named versions, restore | ◐ (server revisions + local checkpoints, two concepts) | R1: one timeline |
| CAP-V2 | **Visual diff**: overlay added/removed/changed on canvas, side-by-side | ◐ (text diff) | R1 |
| CAP-V3 | Review requests: reviewers, approve / request changes, merge with checks | ◐ (simulated, local) | R2 |
| CAP-V4 | GitHub: `.arch` in repo, PR check + diff comment, sync on merge | ◐ (webhook inbox only) | R2 |
| CAP-V5 | Branches of a diagram ("proposal") and merge back | ◐ (server branches API) | R2 |

### 3.6 Living sync, rules, intelligence

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-L1 | Connectors: Kubernetes, Terraform state, OpenAPI, AWS account | ❌ (honest Not connected) | R3 (K8s + OpenAPI first) |
| CAP-L2 | Mapping: link elements ↔ real resources; reconcile wizard | ❌ | R3 |
| CAP-L3 | Drift inbox: accept into diagram / ignore / open issue; schedules; alerts | ◐ (canvas-derived lint only) | R3 |
| CAP-R1 | Rules: built-in (orphans, dangling, untagged protocol) | ✅ | — |
| CAP-R2 | **Policy packs & custom rules** ("no public DB", "every service has an owner"), severity, CI gate | ❌ | R3 |
| CAP-R3 | Overlays: cost, SLO/latency, data classification, STRIDE threat model | ❌ | R3 |

### 3.7 AI assistant

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-A1 | **Generate** a diagram from a prompt, a repo, IaC or an OpenAPI file — as a reviewable draft | ❌ | R2 |
| CAP-A2 | **Edit by instruction** ("add a Redis cache in front of Order Service") with preview + accept | ❌ | R3 |
| CAP-A3 | **Explain / document** (generate ADR, onboarding summary, alt-text) | ❌ | R2 |
| CAP-A4 | **Review risks** (single points of failure, missing auth, chatty calls) → rule suggestions | ❌ | R3 |

Rule (Appendix A): AI output is always a *proposal* the user accepts; never a silent edit.

### 3.8 Import, export, present, integrate

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-I1 | Import: `.arch` | ✅ | — |
| CAP-I2 | Import: draw.io (`.drawio`), Lucidchart (CSV/`.vsdx`), Mermaid, PlantUML, Structurizr DSL | ❌ | R1 (draw.io, Mermaid), R2 (rest) |
| CAP-I3 | Import from source: Terraform, K8s manifests, OpenAPI, docker-compose | ❌ | R2 |
| CAP-E1 | Export: `.arch`, SVG, PNG, CSV, print/PDF | ✅ | — |
| CAP-E2 | Export: Mermaid, draw.io, Visio, high-res PDF (multi-page) | ❌ | R2 |
| CAP-P1 | **Present mode**: frames as slides, laser pointer, step-through layers | ◐ (focus mode) | R2 |
| CAP-P2 | **Publish**: view link, embed (Confluence, Notion, GitHub README image that auto-updates) | ❌ | R2 |
| CAP-N1 | Integrations: GitHub, Slack, Jira, Confluence | ◐ (GitHub webhook) | R2–R3 |

### 3.9 Workspace, admin, platform

| ID | Capability | Today | Target |
|---|---|---|---|
| CAP-W1 | Workspaces, teams, roles | ◐ (DB tenancy, UI team list is local) | R1 |
| CAP-W2 | SSO (SAML/OIDC), SCIM, domain capture | ◐ (endpoints, no admin UI) | R4 |
| CAP-W3 | Audit log UI, retention, export | ◐ (API only) | R4 |
| CAP-W4 | Plans & billing, usage limits | ❌ | R4 |
| CAP-X1 | Accessibility WCAG 2.2 AA incl. keyboard-only diagram editing | ◐ | every release |
| CAP-X2 | Offline editing with conflict-safe sync | ◐ | R2 |
| CAP-X3 | Tablet/phone: view, comment, light edit | ◐ | R2 |

---

## 4. Concept: model-backed diagramming (how "advanced" is delivered without losing Lucidchart fluidity)

- **Two kinds of objects on the canvas.** *Elements* (typed, live in the workspace model, have
  identity, properties, owners, links to real resources) and *annotations* (free shapes, text, ink,
  frames). Drawing from the architecture shape packs creates elements; general shapes create annotations.
  A user can convert either way.
- **Views.** A diagram page is a *view* of the model at a level (Context, Container, Component, Deployment)
  or a free view. The same element can appear on many pages and diagrams. Editing its name or properties
  updates every view. Layout stays per view.
- **Zoom-in.** Double-clicking a system opens (or creates) its Container view, and a breadcrumb leads back.
- **Containers** are elements too: a VPC, region, cluster or namespace contains other elements, so nesting
  also carries meaning ("this DB is in the private subnet") that rules can check.
- **Everything stays diffable and exportable.** The `.arch` format v2 stores the model plus views. Export
  to Mermaid, draw.io or PNG is lossy but never locked in.

---

## 5. Flows (every flow, every state)

Each flow lists entry points, the happy path, the screens (§6), the required states and the success
metric. **States legend:** E = empty, L = loading, X = error, O = offline, P = permission-denied,
C = conflict.

### FL-1 Sign up, sign in, onboarding
- **Entry:** marketing site, an invite email, or a shared link.
- **Path:**
  1. Sign in with Google, GitHub, magic link or SSO.
  2. Create or join a workspace: auto-suggest by email domain, or accept the invite.
  3. Pick a role and stack, which personalises templates and shape packs.
  4. Choose a start: template, import, AI or blank.
  5. Take a 60-second interactive tour (a coach mark per core action).
- **Screens:** SC-01 Sign in, SC-02 Workspace setup, SC-03 Onboarding (role + stack), SC-04 First-diagram chooser.
- **States:** an expired invite, an SSO-enforced domain, magic-link errors (rate-limited, expired), a guest who
  continues without an account.
- **Metric:** activation, meaning a first diagram with ≥ 5 elements within 10 minutes. Target ≥ 45 %.

### FL-2 Home and library
- **Entry:** the logo or the Library nav item.
- **Path:** Home shows, in this order:
  1. Continue where you left off.
  2. Assigned to you (reviews, mentions).
  3. Recent.
  4. Folders and team spaces.
  5. Templates.
- **Actions:** search (by name, element, owner or tag), filter (owner, source, drift, review state), sort,
  grid or list view, star, move, rename, duplicate, delete to trash (restorable for 30 days) and bulk actions.
- **Screens:** SC-05 Home, SC-06 Library/folder view, SC-07 Search results (diagrams and elements), SC-08 Trash.
- **States:** E (a first-run hero with 3 start options), L (skeleton cards), O (local docs only, with a banner),
  P (a folder shared without access).
- **Metric:** time to open the intended diagram < 5 s (p50).

### FL-3 Create a diagram
- **Paths:**
  - **Blank.** Choose a view type (Context / Container / Deployment / Free).
  - **Template.** Gallery with a preview, then "Use template".
  - **Import file.** draw.io, Mermaid, Lucid CSV, `.arch` or Structurizr, then a mapping preview, then create.
  - **From source.** Repo, Terraform, K8s manifests or OpenAPI, then discovered elements, then select, then
    auto-layout.
  - **AI prompt.** Prompt, then a draft with a confidence note, then "Accept into canvas" or "Refine".
- **Screens:** SC-09 New diagram dialog (tabs: Blank · Templates · Import · From source · AI), SC-10 Import
  mapping preview, SC-11 AI draft review.
- **States:** an unsupported file, a partial import (the warnings list), a draft generation that failed or timed
  out, a draft that is too large (the limit stated up front).
- **Metric:** share of new diagrams that are not blank ≥ 50 %, and import success ≥ 95 %.

### FL-4 Edit on the canvas (core loop)
- **Create:**
  - Tool rail, or press a key and click.
  - Quick-add: drag from a port onto empty space opens a type picker that creates and connects in one step.
  - Paste an image or text.
- **Arrange:**
  - Snapping, guides, align/distribute, auto-layout of a selection.
  - Containers: drop into one, it auto-grows; collapse or expand.
- **Connect:**
  - Port drag, or the Connect tool `C`.
  - Waypoints, line jumps, label drag, protocol picker.
- **Style:** Style panel, format painter, saved styles, themes.
- **Structure:** pages (tabs at the bottom), layers panel (show/lock), frames.
- **Navigate:** minimap, outline panel (tree of pages, containers and elements), find & replace, zoom to
  selection, breadcrumbs for zoom-in levels.
- **Screens:**
  - SC-12 Canvas workspace.
  - SC-13 Context toolbar (floating over the selection).
  - SC-14 Right panel tabs: Properties · Style · Data · Comments · Rules.
  - SC-15 Pages bar + layers popover.
  - SC-16 Outline panel.
  - SC-17 Shape library panel.
  - SC-18 Context menu.
  - SC-19 Command palette.
- **States:** an empty canvas (start options), a large-diagram mode (degraded effects), read-only (viewer
  role, with an "Edit access" request), C (another user edited the same element, shown on the element).
- **Metric:** median time to create and connect two elements < 6 s; undo usage error-free.

### FL-5 Properties, data and overlays
- **Path:** select an element. Properties (type, name, technology, owner, repo, SLO, cost, data class, custom
  fields) and Relationships (in/out with protocols). The Data tab links a CSV or live source to fields.
  Conditional formatting rules (e.g. "colour by owner", "badge if SLO < 99.9") generate a legend.
- **Screens:** SC-14 Properties, SC-20 Data linking & conditional formatting dialog, SC-21 Legend.
- **Metric:** share of elements with an owner ≥ 70 % on team diagrams.

### FL-6 Share and collaborate
> Comment system detail: [REVIEW_VERSIONING_SPEC §4](REVIEW_VERSIONING_SPEC.md#4-comments).
- **Path:**
  1. Share opens a dialog: invite people or teams with a role, set general access (restricted / workspace /
     anyone with the link) and expiry, copy the link, or open embed options.
  2. Live session: presence avatars, cursors with names, selection outlines, "follow" a user.
  3. Comments: pin to an element, @mention (which notifies), assign, resolve or reopen, filter (open / mine /
     resolved).
  4. Notifications: in-app inbox and email/Slack per preference.
- **Screens:** SC-22 Share dialog, SC-23 Presence + follow, SC-24 Comments panel, SC-25 Notifications inbox,
  SC-26 Embed/publish dialog.
- **States:** inviting an external domain (warning), a role downgrade, link access revoked, a recipient
  without an account.
- **Metric:** share rate of diagrams ≥ 30 %; comment-to-resolve time.

### FL-7 Versions and review
> Detailed contract: [REVIEW_VERSIONING_SPEC](REVIEW_VERSIONING_SPEC.md) (versions, proposals, 3-way merge, review, protection rules).
- **Path:**
  1. **History panel:** a timeline of autosaves, grouped by session, plus named versions.
  2. **Compare:** pick any two versions to see a visual diff on the canvas (added green, removed red ghost,
     changed amber with a property diff) and an element-level change list.
  3. **Restore,** or "Copy to new diagram".
  4. **Request review:** reviewers plus a description, then a review page (changes, comments, checks), then
     approve or request changes, then merge (which creates a named version and, when linked, commits `.arch`
     to Git).
- **Screens:** SC-27 History panel, SC-28 Compare / visual diff, SC-29 Review request dialog, SC-30 Review page,
  SC-31 Merge result.
- **States:** a merge blocked by a failing rule (with the reason), a stale base (rebase needed), a reviewer who
  lost access.
- **Metric:** review cycle time p50 < 1 day.

### FL-8 Living sync
- **Path:**
  1. Connect a source (a wizard per type: credentials stay in the server vault, scope, schedule).
  2. Mapping (auto-match by name/labels, then confirm).
  3. Drift inbox (added / removed / changed in reality versus the diagram), where each item can be accepted
     into the diagram, ignored with a reason, or turned into an issue.
  4. Freshness badge on the diagram and in the Library, plus alerts on new drift.
- **Screens:** SC-32 Sources, SC-33 Connect wizard, SC-34 Mapping, SC-35 Drift inbox.
- **States:** auth failure, partial sync, source unreachable (stale with time), first sync running.
- **Metric:** share of connected diagrams with drift acknowledged within 7 days ≥ 80 %.

### FL-9 Rules and policies
- **Path:**
  - The Rules tab shows violations on the current diagram, each with a fix action.
  - The workspace Policies page enables packs (Reliability, Security, Ownership) or custom rules (a
    condition builder over element properties and relationships), sets severity (info, warn, block) and
    turns on the CI gate.
- **Screens:** SC-14 Rules tab, SC-36 Policies page, SC-37 Rule builder.
- **Metric:** blocking violations reaching main = 0 for teams with the CI gate on.

### FL-10 Present and publish
- **Path:**
  - **Present** turns frames (or pages) into slides with step-through layers, a laser pointer and
    presenter notes.
  - **Publish** offers a view-only link, an embed snippet (iframe, Confluence, Notion) or an auto-updating
    image URL for READMEs.
  - **Export** offers PNG/SVG/PDF (selection, page or all pages), `.arch`, Mermaid or draw.io.
- **Screens:** SC-38 Present mode, SC-26 Embed/publish, SC-39 Export dialog.
- **Metric:** published views per week.

### FL-11 AI assistant
- **Path:** an assistant panel in the canvas offers:
  - **Generate:** prompt or source, producing a draft.
  - **Edit:** an instruction, producing a preview diff, then Accept or Discard.
  - **Explain:** a summary, ADR or alt-text.
  - **Review:** risks with links to elements and suggested rules.

  Every change arrives as a diff, so nothing is applied silently.
- **Screens:** SC-11 AI draft review, SC-40 Assistant panel.
- **R1 scope (2026-10-26, owner decision):** the assistant is R2. In R1 the canvas dock has an "AI assistant" tab that shows only an honest notice ("Assistant arrives in R2", what it will do). It has no input, no sample output and no control that acts. See Assistant.dc.html "R1 state" and R1-E14-T10.
- **States:** no AI access (plan or admin disabled), refused prompt, partial result, cost/limit reached.
- **Metric:** acceptance rate of AI proposals ≥ 40 %.

### FL-12 Workspace administration
- **Path:**
  - Members & teams: invite, roles, deactivate.
  - Security: SSO, SCIM, domain capture, session policy.
  - Integrations: GitHub, Slack, Jira, connectors.
  - Policies (FL-9), audit log (filter, export), data (retention, export all, delete workspace).
  - Plan & billing.
- **Screens:** SC-41 Members & teams, SC-42 Security, SC-43 Integrations, SC-44 Audit log, SC-45 Plan & billing.
- **States:** last owner protection, seat limit reached, SSO misconfiguration (test before enforce).

### FL-13 Account and personal settings
- Profile, notification preferences, theme, keyboard shortcuts, accessibility (reduced motion, high
  contrast, larger UI), connected accounts. **Screen:** SC-46 Account settings.

### FL-14 Mobile and tablet
- **Library and viewer:** pan, zoom, pages, layers.
- **Comments:** read, reply, resolve.
- **Light edit:** rename, move, connect, properties sheet.
- **Notifications.**
- **Screens:** SC-47 Mobile library, SC-48 Mobile viewer/editor, SC-49 Mobile comments.

---

## 6. Screen inventory

| ID | Screen | Flow | Release | Exists today |
|---|---|---|---|---|
| SC-01 | Sign in | FL-1 | R1 | ✅ (revamp) |
| SC-02 | Workspace setup / join | FL-1 | R1 | ❌ |
| SC-03 | Onboarding (role + stack) | FL-1 | R1 | ✅ (revamp) |
| SC-04 | First-diagram chooser | FL-1/3 | R1 | ◐ |
| SC-05 | Home | FL-2 | R1 | ❌ |
| SC-06 | Library / folders | FL-2 | R1 | ◐ (flat) |
| SC-07 | Search (diagrams + elements) | FL-2 | R1/R3 | ❌ |
| SC-08 | Trash | FL-2 | R1 | ❌ |
| SC-09 | New diagram dialog | FL-3 | R1 | ❌ |
| SC-10 | Import mapping preview | FL-3 | R1 | ◐ (warnings only) |
| SC-11 | AI draft review | FL-3/11 | R2 | ❌ |
| SC-12 | Canvas workspace | FL-4 | R1 | ✅ (revamp) |
| SC-13 | Context toolbar | FL-4 | R1 | ◐ (text only) |
| SC-14 | Right panel: Properties · Style · Data · Comments · Rules | FL-4/5/6/9 | R1 | ◐ |
| SC-15 | Pages bar + layers | FL-4 | R1 | ❌ |
| SC-16 | Outline panel | FL-4 | R1 | ◐ (list in inspector) |
| SC-17 | Shape library panel | FL-4 | R1 | ✅ (revamp) |
| SC-18 | Context menu | FL-4 | R1 | ❌ |
| SC-19 | Command palette | FL-4 | R1 | ✅ |
| SC-20 | Data linking & conditional formatting | FL-5 | R2 | ❌ |
| SC-21 | Legend | FL-5 | R2 | ❌ |
| SC-22 | Share dialog | FL-6 | R1 | ❌ |
| SC-23 | Presence + follow | FL-6 | R2 | ◐ |
| SC-24 | Comments panel | FL-6 | R2 | ◐ |
| SC-25 | Notifications inbox | FL-6 | R2 | ❌ |
| SC-26 | Embed / publish | FL-10 | R2 | ❌ |
| SC-27 | History panel | FL-7 | R1 | ◐ |
| SC-28 | Compare / visual diff | FL-7 | R1 | ◐ (text) |
| SC-29 | Review request dialog | FL-7 | R2 | ❌ |
| SC-30 | Review page | FL-7 | R2 | ◐ (simulated) |
| SC-31 | Merge result | FL-7 | R2 | ❌ |
| SC-32 | Sources | FL-8 | R3 | ◐ (form-only) |
| SC-33 | Connect wizard | FL-8 | R3 | ❌ |
| SC-34 | Mapping | FL-8 | R3 | ❌ |
| SC-35 | Drift inbox | FL-8 | R3 | ◐ (lint-derived) |
| SC-36 | Policies | FL-9 | R3 | ❌ |
| SC-37 | Rule builder | FL-9 | R3 | ❌ |
| SC-38 | Present mode | FL-10 | R2 | ◐ (focus mode) |
| SC-39 | Export dialog | FL-10 | R1 | ◐ (menu items) |
| SC-40 | AI assistant panel | FL-11 | R2 | ❌ |
| SC-41 | Members & teams | FL-12 | R1 | ◐ (local) |
| SC-42 | Security (SSO/SCIM) | FL-12 | R4 | ❌ |
| SC-43 | Integrations | FL-12 | R2 | ◐ |
| SC-44 | Audit log | FL-12 | R4 | ❌ |
| SC-45 | Plan & billing | FL-12 | R4 | ❌ |
| SC-46 | Account settings | FL-13 | R1 | ◐ |
| SC-47–49 | Mobile library / viewer / comments | FL-14 | R2 | ◐ |

---

### 6.1 Designed in Claude Design (v4.2.0)

[Canvas](https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu), one page per flow group:

| Page | Artboard | Screens |
|---|---|---|
| 1 Core | Main, Library, Review, Sync, Phone, Tokens | SC-12, SC-06, SC-30 (Overview, see page 5), SC-32, SC-48, design tokens |
| 2 Start & library | Home, NewDiagram, ImportMap | SC-05, SC-09 (AI tab), SC-10 |
| 3 Edit & model | CanvasPro, DataFormat | SC-12/13/15/16 (containers, context toolbar, layers, pages, outline, level breadcrumb), SC-14/20/21 |
| 4 Share & collaborate | Share, Live, CommentsDetail | SC-22, SC-23/24/25, SC-24 thread anatomy (anchors, outdated/detached, suggestion, decision) |
| 5 Versions & review | History, Review (Overview), ReviewChanges, MergeConflict, Proposals, ReviewLifecycle | SC-27/28, SC-30, SC-30b, SC-31b, SC-29 + lifecycle/version model (REVIEW_VERSIONING_SPEC) |
| 6 Sync & rules | Drift, Policies | SC-33/35, SC-36/37 |
| 7 Present, export & AI | Present, Assistant, Export | SC-38, SC-40/11, SC-39/26 |
| 8 Workspace admin | Members | SC-41 |
| 9 Onboarding & access | Welcome, FirstRun, AccessStates, PublicView | SC-01–04 (FL-1, FL-16), SC-50 access states (FL-15), SC-55 public viewer (FL-23) |
| 10 Find & understand | Search, Impact, Palette, Mapping | SC-07/51 (FL-17), SC-52 impact (FL-18), SC-19 command palette (FL-19), SC-34 mapping (FL-25) |
| 11 Connect & notify | GitHub, Notifications | SC-53 GitHub (FL-20), SC-46 notifications (FL-21) |
| 12 Account & governance | Limits, Trash, Audit | SC-54/45 limits & billing (FL-22), SC-08 trash (FL-24), SC-42–44 audit & SSO (FL-26) |
| 13 Mobile | MobileLibrary, MobileReview | SC-49 mobile inbox and review/approve (FL-27) |
| Components | AppBar, Elements, States, Boundaries, Example, DisplayStyles, SystemStates | shared app bar; diagram components in standard notation (UI_REVAMP_SPEC §5A), display styles, SC-56 system states — offline, save failed, newer version, access changed, session expired, rate limited, loading, empty, not found (FL-28) |

Not yet designed (designed with their release, before implementation):
- **Canvas:** SC-17 shape library, SC-18 context menu.
- **Account:** SC-47 profile & preferences.

## 7. Prioritisation and releases

Scored with RICE (reach × impact × confidence / effort), cut into four releases. Each release is
shippable on its own and keeps the Appendix A rules (no mock data, honest states, tenant isolation).

| Release | Theme | Scope (capabilities) | Exit criteria |
|---|---|---|---|
| **R1 — Parity core** (6–8 wk) | "I can leave Lucidchart for architecture diagrams" | UI revamp (UI_REVAMP_SPEC P1–P2); C2 containers, C3 frames/swimlanes, C4 pages, C5 layers, C6 align/distribute, C7 connector power, C8 style tools, C9 find/quick-add; S1 full icon sets, S3 team templates; M1–M2 typed properties; K2 share dialog, K6 folders/trash; V1 one timeline, V2 visual diff; I2 draw.io + Mermaid import; SC-05 Home, SC-09 New diagram, SC-39 Export dialog; W1 workspaces/teams in UI | Activation ≥ 45 %; import success ≥ 95 %; 0 axe violations; 5k elements at 60 fps |
| **R2 — Team workflow** (6–8 wk) | "We design and review together" | K3 real-time (fix SVC-O1: one CRDT transport), K4 comments + mentions, K5 notifications; V3 reviews, V4 GitHub PR checks, V5 proposals; C10 auto-layout, C11 rich text/tables, C12 10k perf; M5 data linking + conditional formatting; A1 generate, A3 explain; I3 source import; E2 exports; P1 present, P2 publish/embed; X2 offline, X3 mobile | Review cycle p50 < 1 day; share rate ≥ 30 %; 2-user multi-instance collab test green |
| **R3 — Architecture intelligence** (8–10 wk) | "Our diagrams are true and safe" | M3 one model/many views, M4 element catalog, M6 impact analysis; L1–L3 connectors (K8s, OpenAPI first), mapping, drift inbox; R2 policies + CI gate; R3 overlays (cost, SLO, threat); A2 edit-by-instruction, A4 risk review | ≥ 80 % drift acknowledged in 7 days; blocking violations to main = 0 |
| **R4 — Enterprise** (6 wk) | "IT can approve us" | W2 SSO/SCIM, W3 audit UI + retention, W4 plans & billing, data residency, SOC2 controls | Security review passed; first enterprise pilot |

**Not doing (now):** general whiteboarding/sticky-note workshops, project management, slide authoring
beyond present mode, unrestricted write-back to infrastructure.

---

## 7A. Cross-cutting flows (v4.1 — senior-PM gap review)

The core loops (FL-1…FL-14) are designed. The flows below are where users activate, come back, invite
others, pay and trust the product. Each lists entry points, path, states, the metric it moves and its release.

### FL-15 Access and permission states (R1)
- **Entry:** a shared link or a mention email, opened by someone who lacks access, whose link has expired,
  or who is following a link to a deleted diagram.
- **States:**
  - **Request access:** the page shows the diagram name and owner only; the person picks a role and adds a
    note. The owner is notified, can approve or deny from the inbox in one click, and the requester is told
    the outcome.
  - **Read-only (viewer):** a banner reads "View only · Request edit access"; comments are allowed only for
    commenters. All editing affordances are hidden, not just disabled.
  - **Link expired or revoked:** "Ask [owner] for a new link".
  - **Not found / deleted:** owners see "In trash — Restore"; everyone else sees a neutral 404 that doesn't
    leak the title.
  - **Signed out:** sign in, then return to the same place.
- **Metric:** requests approved within 24 h; shares that are opened.
- **Screen:** SC-50 Access states.

### FL-16 Workspace setup and activation (R1, extends FL-1)
- **Workspace:** a new user whose email domain matches an existing workspace is offered "Join [Company]"
  (by request or auto-join, as the admin chooses). Otherwise they create one (name, URL) and invite
  teammates (skippable).
- **Getting-started checklist** (dismissible, progress saved):
  1. Create a diagram.
  2. Add 5 elements.
  3. Connect two elements.
  4. Invite a teammate.
  5. Share or publish.
  6. Connect GitHub (Team plan).
- **Metric:** activation, meaning a first diagram with ≥ 5 elements within 10 minutes. Target ≥ 45 %.
  Second metric: invite within the first week.
- **Screens:** SC-02 Workspace setup, SC-04 First-run checklist.

### FL-17 Global search and element catalog (R1 search, R3 catalog)
- `⌘K`, or `/` on Home, searches diagrams, **elements** (across diagrams, by name, technology, owner or
  property), comments, people and templates, with keyboard navigation.
- **Element page** (R3, model-backed):
  - the element's properties and owner;
  - "Appears in" — every diagram and view;
  - relationships in and out;
  - open threads and the latest changes;
  - linked real resources and their drift.
- **Metric:** search success (a result opened) ≥ 70 %.
- **Screen:** SC-07 Search + SC-51 Element page.

### FL-18 Impact analysis (R3)
- **Path:**
  1. Select an element and choose "Impact" (or press `I`).
  2. The canvas dims everything except **upstream** and **downstream** elements (depth 1–3, sync vs async
     shown separately).
  3. A side panel lists the blast radius: affected services, owners, data stores, and other diagrams the
     change touches.
  4. "Notify owners" opens a pre-filled comment.
- **Metric:** impact runs per review; reviews that cite impact.
- **Screen:** SC-52 Impact mode.

### FL-19 Editing efficiency surfaces (R1)
- **Command palette:** every action by name, with its shortcut shown, plus recent actions and contextual
  actions for the current selection.
- **Context menu** (right-click): the actions for this selection, grouped as Edit / Arrange / Display /
  Review / Advanced.
- **Shape library panel:** search across official sets, then categories, recents and team shapes; drag to
  place or click to insert; a hover card shows the shape's name and provider.
- **Keyboard shortcuts sheet:** searchable and rebindable.
- **Metric:** the share of actions done by keyboard or palette among power users.
- **Screens:** SC-17, SC-18, SC-19.

### FL-20 GitHub integration (R2)
- **Path:**
  1. Install the ArchFlux GitHub App on the organisation or chosen repos.
  2. Link a diagram to a repo, branch and path (`docs/architecture/checkout.arch`).
  3. Choose a sync direction: ArchFlux → Git (commit on merge), Git → ArchFlux (proposal on PR), or both.
  4. Choose PR checks: post the visual diff, require approval, run policies.
  5. Test the connection.
- **States:** the app isn't installed, the repo isn't visible, branch protection blocks commits, or the path
  already exists (offer import).
- **Metric:** share of Team workspaces with GitHub linked.
- **Screen:** SC-43 Integrations › GitHub.

### FL-21 Notifications inbox and preferences (R2)
- **Inbox page:** grouped by diagram, with tabs Inbox / Done / Snoozed, filters (mentions, reviews,
  assigned, drift), bulk mark done, and keyboard triage (`E` done, `S` snooze).
- **Preferences:** a matrix of events × channels (in-app, email immediately, email digest, Slack), with
  quiet hours and a per-diagram mute or follow.
- **Metric:** median time from mention to reply.
- **Screens:** SC-25 (full page), SC-53 Notification preferences.

### FL-22 Plans, limits and upgrade moments (limits R1, billing R4)
- **Limits:**
  - **Free:** 3 cloud diagrams, 3 editors, 30-day autosave history, no proposals or connectors.
  - **Team:** unlimited diagrams, proposals and reviews, GitHub, 2 connectors.
  - **Enterprise:** SSO, SCIM, audit, data residency, and unlimited connectors.
- **Rule:** limits block only *new* creation and are never a hostile wall. Hitting one shows what you get by
  upgrading, an admin-request option for non-admins, and never blocks viewing, exporting or deleting.
- **Seats:** only editors are paid seats. Viewers and commenters are free and unlimited on every plan.
- **Downgrade / cancel:** every diagram stays readable and exportable; over-limit cloud diagrams become
  read-only (not deleted) until a slot is freed or the plan is upgraded.
- **Billing page:** plan, seats used, invoices, payment method, and cancel (with data-export reassurance).
- **Metric:** Free → Team conversion; upgrade-prompt-to-checkout rate.
- **Screens:** SC-54 Limit reached, SC-45 Plan & billing.

### FL-23 Public viewer and embeds (R2)
- A published link or embed opens a **lightweight viewer**: pan and zoom, pages, layers, element details on
  click, and Present mode.
- No account is needed to view. Commenting requires sign-in (or is disabled by the owner).
- The footer reads "Made with ArchFlux · Create your own" — the acquisition loop.
- **States:** the owner unpublished it; password-protected; workspace policy forbids public links.
- **Metric:** viewers → sign-ups.
- **Screen:** SC-55 Public viewer.

### FL-24 Trash and recovery (R1)
- Deleted diagrams, folders and proposals go to the trash for 30 days (Team: 90; Enterprise: configurable).
- Restore puts them back in their original folder, or the library if that folder is gone. "Delete forever"
  is limited to owners and admins, requires typing the name, and is audited.
- **Screen:** SC-08.

### FL-25 Sync mapping (R3, completes FL-8)
- After connecting a source, ArchFlux **auto-matches** resources to elements by name, labels and annotations
  (`archflux.io/element: <id>`). Each match carries a confidence level.
- You can confirm, change or ignore each match. Unmatched resources can be added as elements; unmatched
  elements can be marked "not deployed here".
- The mapping is saved; drift is computed only on mapped items.
- **Screen:** SC-34.

### FL-26 Audit log and security setup (R4)
- **Audit log:** who did what, when, from where, covering sign-ins, shares, exports, permission changes,
  deletes, merges and policy changes. Filter, search and export (CSV, or SIEM webhook). Read-only.
- **SSO setup:**
  1. Configure the identity provider (SAML or OIDC metadata).
  2. **Test with your own account first.**
  3. Turn on enforcement for the domain. Enforcement can't be enabled until the test passes.
  4. A break-glass owner account stays available.
- **Screens:** SC-44, SC-42.

### FL-27 Mobile library and comments (R2)
- **Library:** a recents / starred / for-you inbox.
- **Viewer:** pan, zoom, pages; tap an element for details.
- **Comments:** threads, reply with @mentions, resolve.
- **Review:** approve or request changes with a summary; the diff is shown as a change list plus the canvas.
- **Screens:** SC-47, SC-49.

### FL-28 System states library (R1)
One pattern for every screen:
- **Skeleton loading:** never a spinner longer than 300 ms.
- **Empty states:** what this is, one primary action, a template or import shortcut.
- **Inline errors:** what happened, what was kept, a retry.
- **Offline:** a banner plus queued changes, with "Offline · 3 changes will sync".
- **Conflict.**
- **Limit reached.**
- **Permission denied.**
- **Feature unavailable on this plan.**

No mock data (FRONTEND_SPEC).

### Instrumentation plan (R1, required before launch)

Every metric above needs events. Event names are `object_action`, and properties never carry diagram
content.

| Metric | Events |
|---|---|
| Activation | `workspace_created`, `diagram_created{source}`, `element_added{kind}`, `relationship_added` |
| Sharing / access | `share_invited{role}`, `link_published`, `access_requested`, `access_granted` |
| Review | `proposal_opened`, `review_submitted{state}`, `suggestion_applied`, `proposal_merged{conflicts}` |
| Comments | `thread_created{anchor}`, `comment_mentioned`, `thread_resolved{decision}` |
| Search / impact | `search_performed{scope}`, `search_result_opened{type}`, `impact_opened{depth}` |
| Sync | `source_connected{type}`, `drift_accepted`, `drift_ignored` |
| Monetisation | `limit_reached{limit}`, `upgrade_viewed`, `checkout_started`, `plan_changed` |
| Growth loop | `public_view_opened`, `public_view_signup_clicked` |
| Import / export / history (v4.2) | `import_completed{format,nodes}`, `export_completed{format,scope}`, `version_restored`, `compare_opened` |

Privacy: analytics are opt-out per workspace and processed in the workspace's region (R4); no diagram
content, names, or comment text is ever sent.

### Screen additions

| ID | Screen | Flow | Release |
|---|---|---|---|
| SC-50 | Access states (request access, read-only, expired, not found) | FL-15 | R1 |
| SC-51 | Element page (catalog) | FL-17 | R3 |
| SC-52 | Impact mode | FL-18 | R3 |
| SC-53 | Notification preferences | FL-21 | R2 |
| SC-54 | Limit reached / upgrade | FL-22 | R1 |
| SC-55 | Public viewer | FL-23 | R2 |
| SC-56 | System states library | FL-28 | R1 |

## 8. Non-functional requirements (all releases)

| Area | Requirement |
|---|---|
| Performance | Open 2k elements < 1 s; interact at 60 fps with 5k (R1) / 10k (R2); autosave < 300 ms debounce |
| Reliability | No silent data loss; every save versioned; conflict UI never discards (Appendix A §6.2) |
| Accessibility | WCAG 2.2 AA; full keyboard editing (create, connect, move, properties); screen-reader outline |
| Security | Tenant isolation, least privilege, connector secrets server-side only, audit of shares and exports |
| Privacy | AI features opt-in per workspace; no customer diagrams used for training; data region selectable (R4) |
| Honesty | Simulated/unavailable features are labelled or hidden, never faked (FRONTEND_SPEC "No mock data") |

---

## 9. Risks and open questions

| # | Risk / question | Mitigation / owner decision needed |
|---|---|---|
| Q1 | Model-backed elements could feel heavier than free drawing | Annotations stay free; elements are created implicitly from architecture shapes; convert either way |
| Q2 | Real-time transport choice (Yjs vs STOMP) | Decide in R2 kickoff; one transport only (SVC-O1) |
| Q3 | Import fidelity (Visio/Lucid) | Start with draw.io + Mermaid (open formats); show a mapping preview + warnings |
| Q4 | AI cost and trust | Proposals only, explicit accept, per-workspace limits, provenance stored on elements |
| Q5 | Scope creep vs quality | Releases gated on exit criteria; parity before intelligence |
| Q6 | Pricing/packaging | Free (local + 3 cloud diagrams), Team (collab, review, connectors), Enterprise (SSO/SCIM/audit) — needs validation |

---

## 10. Changelog

- **4.3.0 (2026-10-25):** Appendix A gains the still-binding contracts from the deleted PRODUCTIZATION_SPEC (§5–§8, §10–§13, §15), verbatim.

- **4.1.0 (2026-10-24):** §7A cross-cutting flows FL-15…FL-28 (access states, activation, search/catalog, impact, editing surfaces, GitHub, notifications, plans/limits, public viewer, trash, mapping, audit/SSO, mobile, system states), instrumentation plan, SC-50…SC-56.
- **4.0.0 (2026-10-24):** first full product spec: positioning, gap analysis (CAP-*), model-backed concept,
  14 flows (FL-*) with states and metrics, 49-screen inventory (SC-*), RICE-based R1–R4 roadmap,
  non-functional requirements, risks.

---

## Appendix A. Platform contracts (moved from PRODUCTIZATION_SPEC v3.0.0, 2026-10-25)

PRODUCTIZATION_SPEC was deleted on 2026-10-25. Its still-binding sections are kept here **verbatim**, with their original numbers.
A code comment that cites `PRODUCTIZATION_SPEC §N` now means **PRODUCT_SPEC Appendix A, §N**. The dropped sections were tiers,
ICP, roadmap, analytics, commercial gaps and the recommendation; PRODUCT_SPEC §1–§9 replaces them.

### A§5. Critical product decisions

Resolve these before building more features.

#### 5.1 Collaboration transport

**Recommendation:** choose one transport and remove the unused path.
Since the current client uses Yjs/y-websocket, the smallest path to true
collaborative editing is a compatible Yjs server with authenticated
WebSocket handshake, room-level authorization, persistence, and
multi-instance behavior. If that is too large for the initial release,
defer real-time collaboration and ship explicit single-editor/refresh
semantics rather than pretending it works.

Acceptance:

- Two authenticated users edit the same diagram in separate browsers.
- Concurrent edits converge without data loss.
- Unauthorized users cannot join a room by guessing its ID.
- Reconnect, server restart, and duplicate message tests pass.
- Presence disappears on disconnect and does not leak across workspaces.
- Collaboration works across at least two server instances, or deployment
  explicitly enforces one instance until shared state is implemented.

#### 5.2 Source of truth

For each diagram, define one of:

- **Local:** browser is the source of truth.
- **Cloud document:** ArchFlux server is the source of truth.
- **Git-managed:** a versioned `.arch` artifact in a repository is the source of truth.
- **Connected source:** Kubernetes/OpenAPI/Terraform is authoritative for
  selected fields; user-owned layout and annotations remain ArchFlux-owned.

Never merge these models implicitly. Show field ownership, conflict
behavior, and the last successful source revision.

#### 5.3 Authentication strategy

Use Spring Security's standard authentication chain. Validate JWT
signature, issuer, audience, expiry, not-before, and key rotation; or
use a secure server-side session strategy. Do not compare user JWTs
against a static API token. Keep service credentials separate from user
identity.

- Production must fail startup if signing keys or required identity
  configuration are missing.
- Prefer short-lived access credentials and a deliberate refresh/revocation design.
- If cookies are used, implement CSRF protection and secure cookie attributes.
- OAuth callback state and nonce must be validated.
- Magic links must be single-use, short-lived, hashed at rest,
  rate-limited, and never logged in production.
- Return generic auth errors that do not reveal whether an email exists.
- Do not store OAuth provider access tokens unless required; encrypt
  them with managed key material and define revocation/deletion behavior.

#### 5.4 Database isolation

Choose and document one coherent authorization boundary:

- **Recommended:** every resource query is scoped by workspace and
  authorized membership; PostgreSQL RLS provides defense in depth.
- Set request identity using transaction-scoped `SET LOCAL` values only
  after authentication, on the same connection/transaction used by the query.
- Test with the actual least-privilege application role, never only as a
  database owner/superuser.
- Audit trigger permissions and security-definer functions must be
  carefully reviewed for search path and privilege escalation.
- Soft-deleted rows must be excluded by default and restored only through
  explicit operations.

### A§6. Product UX contracts

#### 6.1 Status language

Use consistent, truthful status labels:

- **Local only:** saved in this browser; not backed up to the cloud.
- **Saved:** server acknowledged the latest version.
- **Saving:** a save is in progress.
- **Offline:** remote actions are unavailable; local changes may remain.
- **Pending sync:** changes are queued for remote delivery.
- **Stale:** source has changed or the last successful refresh exceeds policy.
- **Sync failed:** last attempt failed; show retry and details.
- **Demo data:** illustrative only; no live provider connection exists.
- **Connected:** credentials and permissions were verified against the actual provider.
- **Needs attention:** conflict, permission failure, expired credentials, or validation failure.

Do not use a green "Healthy" state for a connector that has only passed
local form validation.

#### 6.2 Save and conflict behavior

- Local edits are immediately reflected in the canvas but remain visibly
  unsaved until persistence succeeds.
- Cloud saves carry a monotonically increasing version or ETag.
- Updates use optimistic concurrency (`If-Match`/version field); stale
  writes return a conflict instead of silently overwriting newer work.
- Retry only transient errors, with exponential backoff and jitter.
- Permanent validation/auth errors are not retried indefinitely.
- A conflict screen offers compare, keep mine, keep remote, or
  duplicate/branch. "Keep mine" must not silently discard remote changes.
- Idempotency keys are persisted across retries for mutations that support them.

#### 6.3 Empty, loading, partial, and failure states

Every major screen must define:

- First-run empty state with a useful next action.
- Loading skeleton or progress state.
- Partial data state when one source fails.
- Offline state and available local actions.
- Permission-denied state.
- Retryable vs non-retryable error.
- Destructive action confirmation and recovery where feasible.
- Keyboard and screen-reader behavior.

#### 6.4 Accessibility and interaction

Target WCAG 2.2 AA for core workflows. Keyboard operation must cover
diagram creation, selection, connecting, inspection, review, and
dialogs. Respect reduced-motion settings. Do not rely on color alone to
indicate drift, severity, or selection. Re-enable skipped accessibility
tests or explicitly track them as release blockers.

### A§7. Domain model and data ownership

Use a workspace boundary even if the first release supports only one
user per workspace.

#### Core entities

- `User`: identity and profile, not provider secrets.
- `Workspace`: tenant boundary, settings, plan, lifecycle.
- `WorkspaceMembership`: user, role, status, invited-by, timestamps.
- `Diagram`: workspace, owner/creator, title, format version, source
  mode, current revision, deletion state.
- `DiagramRevision`: immutable snapshot, parent revision, content hash,
  author, source metadata, timestamp.
- `Checkpoint`: named pointer to an immutable revision, not a mutable
  copy without lineage.
- `Review`: target revision/PR, status, policy result, reviewer decisions.
- `ReviewThread` and `Reply`: scoped to workspace and diagram/revision;
  immutable audit events for resolution and deletion.
- `Connector`: provider, workspace, credential reference, scope, state,
  last successful sync, cursor/revision.
- `SyncRun`: source revision, start/end, status, counts, retryability,
  error code, correlation ID.
- `DriftFinding`: stable rule/finding ID, source entity, expected vs
  observed, severity, first/last seen, disposition.
- `WebhookEvent`: provider event ID, payload hash, received/processed
  timestamps, status, retry count.
- `AuditEvent`: actor, workspace, action, resource, outcome, timestamp,
  correlation ID and carefully minimized metadata.

#### Data model rules

- All tenant-owned records carry `workspace_id` directly or are scoped
  through a parent relation with enforced checks.
- Use foreign keys and unique constraints to enforce invariants, not
  only service-layer code.
- Add a unique constraint for provider event IDs and source revisions
  where the semantics require uniqueness.
- Use optimistic versioning for mutable resources.
- Keep immutable revisions separate from the current mutable working graph.
- Define deletion, retention, export, and account closure behavior.
- Do not store provider secrets in diagram JSON, browser storage, logs,
  or audit payloads.
- Index real access patterns; validate with query plans and
  representative data volume.

### A§8. API and backend contracts

#### API conventions

- Base path: `/api/v1`.
- OpenAPI is generated from the actual API and committed or published
  as a build artifact.
- Standard error envelope: `code`, safe `message`, `correlationId`,
  optional field errors. Never expose stack traces, SQL, tokens, or
  secret-bearing provider responses.
- Pagination is cursor-based for growing collections; enforce maximum page size.
- Every mutating endpoint validates authorization, schema, size, and state transition.
- Use idempotency keys for externally retried create/sync operations where appropriate.
- Use ETags/version fields for diagram updates.
- Set request/body limits and per-user/workspace limits.
- Define API compatibility and deprecation policy.

#### Core endpoint families

- `POST /auth/...`, `GET /auth/me`, `POST /auth/logout`, deliberate
  refresh/session endpoint.
- `GET/POST /workspaces`, membership and invitation endpoints.
- `GET/POST /diagrams`, `GET/PATCH/DELETE /diagrams/{id}`.
- `GET/POST /diagrams/{id}/revisions`, `GET /diagrams/{id}/diff`.
- `GET/POST /diagrams/{id}/checkpoints`, restore endpoint.
- `POST /diagrams/{id}/validate`, policy result endpoint.
- Review and thread endpoints scoped to diagram/revision/workspace.
- Connector lifecycle endpoints: create, verify, pause, resume, rotate, disconnect.
- Sync run endpoints: start, inspect, cancel where safe, retry.
- Webhook ingress endpoints with signature validation and durable deduplication.
- `GET /health/live`, `GET /health/ready` with minimal non-sensitive details.
- Admin audit export endpoint with explicit permission and audit event.

#### API behavior requirements

- `401` means unauthenticated; `403` means authenticated but
  unauthorized; use `404` for foreign resources where existence
  disclosure is undesirable.
- `409` for version conflicts and duplicate state transitions.
- `413` for payload limit; `422` for semantically invalid diagram
  content; `429` for rate limit with `Retry-After`.
- Never treat malformed UUIDs, invalid JSON, unknown versions, and
  provider errors as generic `500`.
- External provider calls must have connect/read timeouts, bounded
  retries, circuit breaking where justified, and redacted errors.
- No network call or provider write should happen inside a database
  transaction unless the transaction model is explicitly designed for it.

### A§10. GitHub and webhook reliability

- Prefer a GitHub App over a user PAT for team integrations.
- Request minimum repository permissions.
- Verify webhook signatures against the raw request body.
- Persist the event before acknowledging success.
- Deduplicate by provider delivery/event ID using a database unique constraint.
- Return success for already-processed duplicate events.
- Process asynchronously through a durable queue/outbox.
- Make handlers idempotent and record terminal failure with a replay mechanism.
- Do not perform long GitHub API work on the webhook request thread.
- Use bounded retries and a dead-letter/replay workflow.
- Store installation credentials securely; rotate and revoke on disconnect.
- Ensure pull-request checks are tied to the exact commit SHA and rule-set version.
- Test repeated, reordered, delayed, malformed, and concurrent webhook deliveries.

### A§11. Security and privacy baseline

#### Required before any shared production deployment

- Threat model covering account takeover, tenant escape, malicious
  imports, webhook spoofing, SSRF through connector URLs, token
  leakage, and denial of service.
- Secure auth flow with issuer/audience/expiry validation or secure
  server-side sessions.
- Workspace authorization at service and repository boundaries.
- Database least privilege and RLS defense in depth if RLS is retained.
- Secrets manager for provider credentials and signing keys.
- No secrets in localStorage, URL query strings, logs, telemetry,
  screenshots, or exports.
- Strict CORS allow-list; never combine wildcard origins with credentialed requests.
- Explicit CSRF posture for cookie-based authentication.
- CSP, HSTS, `X-Content-Type-Options`, framing protection, and safe referrer policy.
- SSRF defenses: block loopback, link-local, private and metadata IP
  ranges unless an explicitly authorized private connector mode is used;
  validate DNS and redirects to prevent rebinding.
- Import limits: max bytes, entities, nesting, string lengths, and processing time.
- Per-user/workspace and per-IP rate limits with trusted proxy configuration.
- Dependency scanning, secret scanning, container scanning, and SBOM generation.
- Data export and deletion flow; retention policy for diagrams, audit
  events, connector snapshots, and backups.
- Security incident runbook and credential revocation procedure.

#### Logging and telemetry privacy

- Use structured logs with correlation IDs and stable error codes.
- Redact authorization headers, cookies, magic-link tokens, provider
  credentials, request bodies that contain secrets, and sensitive source content.
- Collect only product telemetry needed for reliability and adoption.
- Make telemetry opt-out and retention behavior explicit where required.
- Do not send diagram contents to third-party analytics by default.

### A§12. Reliability, performance, and scale targets

These are proposed initial targets to validate in a representative
environment, not claims about current performance.

| Area | Initial target | Notes |
|------|----------------|-------|
| API latency | p95 < 300 ms for ordinary DB-backed reads/writes | Excludes external provider calls and large exports |
| Canvas interaction | p95 frame time < 16.7 ms for supported graph | Establish graph target size/device test profile |
| Autosave | Visible save acknowledgement within 1 s under normal conditions | Local render should not block on network |
| Availability | 99.5% monthly for initial hosted beta | Upgrade only after measured operations |
| Recovery point objective | ≤ 15 minutes for cloud-stored data | Depends on backup/WAL strategy |
| Recovery time objective | ≤ 4 hours for hosted beta | Must be demonstrated in restore drill |
| Sync processing | Explicit per-connector timeout and bounded queue age | Report delayed syncs; no indefinite "running" state |
| Data safety | Zero silent overwrite in concurrency tests | Conflicts must be surfaced |
| Security | Zero known critical/high release-blocking findings | Define exception and expiry process |

#### Capacity planning and performance tests

- Define supported diagram sizes: nodes, edges, text objects, and revision count.
- Benchmark canvas pan/zoom, selection, lint, import/export, diff, and
  persistence at representative sizes.
- Test database queries with realistic tenant counts and skewed workspace sizes.
- Measure pool saturation, lock waits, queue lag, external provider
  throttling, and memory.
- Set bounded connection pools, queue sizes, payload sizes, and concurrency.
- Use load tests to establish limits before marketing throughput or scale claims.

### A§13. Observability and operations

#### Required telemetry

- Request count, latency, status, and error rate by endpoint.
- Auth success/failure and authorization-denial counts without sensitive identifiers.
- Database pool usage, query latency, lock waits, migration version, and readiness.
- Sync run duration, result, retries, source age, queue lag, and provider rate limits.
- Webhook receipt, duplicate rate, processing delay, failure count, and dead-letter depth.
- Save conflict rate, autosave failure rate, export/import failures.
- WebSocket connection count, reconnect rate, room authorization failures,
  and persistence failures if collaboration is enabled.

#### Alerts

Alert on:

- Elevated 5xx or auth failures.
- Database unavailable, pool exhaustion, or schema mismatch.
- Sync queue age above threshold.
- Webhook backlog or dead-letter growth.
- Repeated connector credential failures.
- Backup failure or missed restore verification.
- Abnormal tenant authorization denials.
- Storage growth approaching quota.

#### Operational requirements

- Runbooks for database restore, migration rollback strategy, key
  rotation, provider disconnect, queue replay, and incident response.
- Backups encrypted and stored outside the primary database failure domain.
- Perform periodic restore drills and record evidence.
- Use expand/contract migrations for zero-downtime schema changes.
- Graceful shutdown drains in-flight requests and workers within a bounded period.
- Readiness fails if the database schema is incompatible, not merely
  because V1 tables exist.
- Never use liveness to represent downstream dependency health.

### A§15. Testing strategy and release gates

#### Test pyramid

1. **Unit:** schema validation, lint rules, diff engine, normalization,
   permission policies, idempotency logic.
2. **Integration:** PostgreSQL migrations, repository scoping, RLS under
   the real application role, OAuth/JWT filters, queue/outbox, webhook deduplication.
3. **Contract:** generated OpenAPI, connector fixtures, GitHub webhook
   signature vectors, provider response variations.
4. **E2E:** guest authoring, login, save/reload, import/export, conflict
   handling, team authorization, review, connector failure and recovery.
5. **Security:** tenant isolation matrix, SSRF, malformed imports, token
   leakage checks, rate limits, dependency scans.
6. **Performance:** representative canvas sizes, concurrent edits,
   list/search, revision diffs, sync jobs, webhook bursts.
7. **Recovery:** restore database backup, replay failed job, recover from
   interrupted migration according to documented procedure.

#### Mandatory CI gates

- Frontend type-check, lint, unit tests, production build.
- Backend unit and integration tests against PostgreSQL matching production major version.
- Apply all migrations to a fresh database and upgrade from each supported previous release.
- Run tests under the runtime database role — not database owner.
- OpenAPI generation and breaking-change diff.
- Critical Playwright journeys.
- Security and secret scanning.
- Docker image build and compose/deployment configuration validation.
- No unexplained skipped tests; report passed, failed, skipped, and flaky counts separately.
- Visual regression thresholds calibrated per screen and icon-sensitive regions.
- Release artifact includes commit SHA, build metadata, schema version, and SBOM.

#### Release acceptance suite

A release candidate is rejected if any of these fail:

1. Two tenants cannot access each other's resources.
2. Authentication works without a shared development token.
3. Fresh install and upgrade migrations pass.
4. A repeated webhook cannot create duplicate resources or revisions.
5. A stale write cannot silently overwrite a newer version.
6. Import failure leaves the previous diagram unchanged.
7. Backup restore passes.
8. UI does not label mocked data as live.
9. Core workflows work on supported desktop and mobile viewport sizes.
10. Logs and errors do not expose secrets or private diagram content.

