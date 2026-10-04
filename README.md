# ArchFlux — Design System & Product Specification (v2.4.0-PROD)

Complete screen-by-screen product & UX specification: production UI/UX architecture, interaction state
lifecycle, design token engine, and Living Infrastructure Reconciler specification.

| | |
|---|---|
| **Role** | Senior Principal UI/UX Architect |
| **Platform** | Web / Electron (Chromium 120+) |
| **State engine** | Local-First + Git Remote |
| **Design system** | ArchFlux Obsidian & Paper |
| **Release** | v2.4.0 Production Ready |
| **Resolution** | Responsive 1280px to 4K ultrawide |
| **Rendering** | 2D canvas, orthogonal router (WebGL-ready layer) |
| **Status** | Approved for Implementation |

## 0. Executive Summary & Design System Foundations

ArchFlux is a developer-first cloud topology authoring platform bridging the gap between conceptual
architecture diagrams and live infrastructure state. Unlike static diagramming tools (Lucidchart, Miro) or
declarative code-only visualizers (Terraform graph), ArchFlux is a bidirectional **Living Architecture
Editor**: visual `.arch` JSON artifacts stay synchronized with production telemetry (Kubernetes manifests,
OpenAPI 3.1 contracts, Terraform state files).

**Core UX problem solved in v2.4 — eliminating "Canvas Panel Warfare".** The contextual node/edge
inspector used to collide with the real-time Architecture Linter drawer. v2.4 introduces a **unified right
utility dock** (tabbed Inspector / Linter), a structured two-tier application chrome, and an automated
topology healing engine.

Core architectural principles:

1. **Local-First Determinism / Zero-Barrier Sketching** — land on `#/login`, start diagramming with
   zero authentication overhead via browser storage (`archflux:*`). Cloud pairing and Git hooks attach
   lazily without disrupting flow.
2. **Contextual Rendering / Dual Visual Style Engine** — switch between `Hand-Drawn Sketchy` mode
   (brainstorming, informal RFCs, threat modeling) and `Clean Architectural` mode (exec decks,
   compliance audits).
3. **Self-Healing Schemas / Automated Topology Healing** — an in-memory graph linter continuously
   analyzes diagrams. Dangling wires, isolated microservices, and protocol ambiguities are detected and
   resolved with single-click idempotent auto-bind.
4. **CI/CD Native / GitOps Merge Gating** — diagrams follow the same verification lifecycle as code:
   schema validation, lint gating, drift verification before merging to production branches.

## 1. Screen Directory & Global Routing Matrix

| Category | Route | Screen Name | Core Capabilities | Shortcut |
|---|---|---|---|---|
| Auth | `#/login` | Authentication & Entry | Magic link, GitHub OAuth, SAML SSO, 1-click Local Guest mode | Esc / Tab |
| Auth | `#/onboarding` | Setup & Persona Wizard | Persona customization, cloud provider pills, initial seed | Enter / 1–3 |
| Workspace | `#/dashboard` | Document Library | Global search, multi-doc management, duplicate, tag filters | `/` or `⌘O` |
| Authoring | `#/canvas` | Precision Canvas Editor | 38 cloud shapes, orthogonal auto-router, linter & inspector | V, H, S, C |
| Living Sync | `#/living` | Infrastructure Reconciler | Upstream drift detection (K8s/OpenAPI/TF), 1-click re-sync | `⌘S` / R |
| Review | `#/reviews` | Reviews, Merge & Automation | Version snapshots, visual A/B diff (green/amber/red), pinned RFCs, PR merge gating, REST sandbox | D / Space / `⌘G` |
| Templates | `#/blueprints` | Topology Catalog | 9 curated architectures, collision-safe Insert vs. Replace | B / `⌘B` |
| Settings | `#/settings/general` | Preferences | Sketchy vs. clean mode, grid snapping, custom keyboard rebinding | `⌘,` |
| Settings | `#/settings/connectors` | Integrations | GitHub PAT credentials, K8s cluster endpoints, polling rate | — |
| Settings | `#/settings/team` | Access Control & Roles | RBAC (Admin, Editor, Reviewer, Viewer), SAML SSO enforcement | — |
| Settings | `#/settings/storage` | Storage & Cache Health | LocalStorage quota inspection, schema verification, reset | — |

Hash routing (`createHashRouter`) keeps deep links working on plain static hosts. Authenticated and guest
sessions share one `AppShell`; `/login` and `/onboarding` render chrome-less. A `⌘K` command palette with
focus-trap is reachable from every authenticated screen (navigation, quick-insert of all 38 shapes, canvas
actions, diagram switcher; Up/Down + Enter + Esc).

## 2. Authentication & Onboarding Lifecycle

### 2.1 `#/login` — Authentication & Frictionless Guest Entry

Solves the enterprise drop-off hurdle of mandatory registration before an architect can evaluate the canvas.

- **Layout split** — Brand Column (left / 45%): live animated vector diagram demonstrating real-time
  drift healing, plus engineering testimonials from Fortune 500 infrastructure teams. Auth Stage (right /
  55%): elevated card with GitHub OAuth (scoped repo read/write for `.arch` files), Email Magic Link
  with RFC 5322 regex validation, and SAML 2.0 SSO toggle for enterprise directories.
- **Zero-Barrier Escape Hatch** — full-width secondary button: "Continue as Local Guest (No account
  needed — data saved in browser)". Instantly initializes an in-memory graph, sets
  `archflux:auth_mode = 'guest'`, and transitions directly to `#/canvas` (no network requests).
- **Interactive states** — loading button spinner (`aria-busy="true"`); OTP 6-digit input transition
  with auto-advance and clipboard paste support; inline error banners (e.g. "OAuth scope denied",
  "Invalid email format"). Enter submits; email field autofocuses on mount.

### 2.2 `#/onboarding` — Persona & Workspace Wizard

Activates on first authentication or via "Upgrade Workspace". Configures shortcuts, shape palettes, and
telemetry defaults by engineering domain.

- **Progress stepper** — 3-step tracker: 1. Role Profile → 2. Cloud Stack → 3. Seed Topology
  (keys `1–3` jump steps, Enter continues).
- **Persona cards** — (a) Platform/Backend Engineer (K8s, gRPC, Redis, Kafka), (b) Solutions Architect
  (multi-region VPCs, compliance boundaries, IAM), (c) Systems/Product Designer (API gateways, client
  apps, relational schemas).
- **Provider ecosystem** — multi-select badges for AWS, GCP, Azure, Kubernetes, Kafka, Snowflake.
  Selecting pills immediately filters the canvas left-rail shape library (`archflux:providers`).
- **Seed selection** — "Start Blank" or a persona-recommended pre-configured architecture. Completing
  writes `archflux:onboarded = true` and navigates to the chosen topology.

## 3. Workspace & Library Hub (`#/dashboard`)

Central management hub for local and Git-synced topologies (browser storage, Git bindings, metadata index).

- **Top action bar** — global search with instantaneous filtering (`/` shortcut); sort dropdown (Last
  Modified, Creation Date, Node Count, Alphabetical); layout toggle (Card Grid vs. Compact Data Table);
  "+ New Diagram" split button (Blank Canvas / From Template / Import `.arch` JSON).
- **Diagram card** — vector preview, title, Git tracking branch chip (`[git:main]`), node/edge count
  badges, sync status pill (● Synced / ⚠️ Drift), relative timestamp ("Edited 12m ago"), tag chips.
- **Tag filters** — pill row filters the library by document tag.
- **Contextual menu** — three-dot trigger: Duplicate, Rename, Export `.arch`, Export High-Res PNG,
  Two-Click Safe Delete.
- **Two-Click Safe Delete** — first click arms a red countdown ("Click again to permanently delete")
  with a progress bar draining over 4 seconds before rolling back to default.
- **UUID remapping** — duplicating re-keys every element ID with fresh UUIDs, re-maps connector
  references, preserves coordinates, and appends `(Copy)` to the document title.

## 4. Core Authoring — Precision Canvas Editor (`#/canvas`)

Primary authoring environment: infinite 2D panning grid, orthogonal connector pathfinding, real-time
topology linter with auto-healing.

- **Top app chrome (global bar)** — brand logo, inline click-to-edit document title, Git branch chip
  (`[git:main]`), upstream sync pill (● Synced / ⚠️ Drift Detected, jumps to `#/living`), utility cluster
  (⌘K palette, Undo/Redo with stack-depth tooltips, theme switcher, Focus mode, Export). The linter
  count chip pulses amber whenever a new lint error appears.
- **Viewport sub-nav** — Canvas | Living Sync | Reviews & Merge | Blueprints.
- **Left floating tool rail** — Select (V), Pan (H), Freehand Pencil (P), Service Box (S), Gateway (G), Database Cylinder (D), Queue/Stream (Q), Note (N), Smart Connector (C), Shape Library (L). Single-use placement by default; re-click or double-click locks repeat placement (🔒 badge); Q toggles the lock. The pencil stays active for continuous sketching — Esc exits.
- **Infinite viewport** — pan + zoom from 10% to 400%, hardware-accelerated 2D canvas, orthogonal
  routing around shape obstacles, snap-to-grid, minimap radar with click-to-pan, zoom readout with
  Fit-to-Bounds (Shift+1 / F).
- **Magnetic anchor ports** — four ports per node (Top, Bottom, Left, Right). A connector endpoint
  within the 16px magnetic radius expands the port by 150% with an indigo halo (`#6366F1`),
  spring curve `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- **Freehand ink (Excalidraw-style)** — the pencil tool captures raw pointer strokes as undoable
  `FreeStroke` records (one undo step per finished stroke). Strokes render above shapes with
  round caps, can be selected (blue highlight), dragged to reposition, restyled (6 colors × 3
  widths via the bottom ink toolbar), and deleted (Del). Ink is persisted per document, included
  in checkpoints/restores, `.arch` export/import, and fit-to-bounds.
- **Free text labels (Excalidraw-style)** — the text tool (`T`) places free-standing text anywhere
  on the canvas: click and type immediately in the inline "Type anything" editor (Enter or Esc
  finishes, Shift+Enter for new lines; clicking elsewhere also commits). A typed draft is never
  lost: route switches rescue-commit it, reloads stash and restore it. Committing selects the new text and returns to Select. Double-click existing text (or the toolbar Edit button) to re-edit.
  The bottom text toolbar floats adjacent to the selection (Excalidraw-style, never stacked
  at bottom-center) and offers 4 fonts (Caveat, Patrick Hand, Plus Jakarta Sans, Fira Code),
  bold/italic toggles, 6 text colors, 4 sizes, background fills, and an optional border around the fill.
  The same controls live permanently in the Inspector dock under Text Style whenever a text
  label is selected, so formatting is always one glance away.
  The inline editor inherits the edited text's style. Text is persisted
  per document, included in checkpoints/restores, `.arch` export/import, and fit-to-bounds.
- **Overlap-free bottom bars** — the zoom HUD stays bottom-left while comment/ink/text editors
  float centered above the HUD line (`bottom: 76px`) with wrapping, so bars never collide at any width.
- **Real AWS service icons** — 12 official AWS Architecture Icons (EC2, Lambda, API Gateway, ALB,
  S3, RDS, DynamoDB, SQS, SNS, CloudFront, ECS, CloudWatch) vendored as SVGs in
  `public/icons/aws/` and rendered on nodes via `iconSrc` (async image cache, repaints on load).
  The Shape Library shows the real icons for AWS shapes; non-AWS shapes keep emoji glyphs.
- **Unified right utility dock** (no more panel warfare) —
  - *Tab A — Contextual Inspector*: node label, cloud provider icon picker, fill swatches, border
    stroke width, metadata tags (port, repo link, source spec); edge protocol tag
    (REST/gRPC/WebSocket/Async), line style (solid/dashed/dotted), arrow-head config, delete.
  - *Tab B — Architecture Linter*: three failure classes — (1) Isolated/Orphan nodes (degree = 0),
    (2) Dangling connectors (unterminated wire), (3) Protocol ambiguity (unlabeled inter-service
    connection). Per-card Inspect / Auto-bind (or Highlight / protocol quick-tag) plus global
    "Heal All Safe Issues" in a single undo step.

## 5. Living Sync & Infrastructure Reconciler (`#/living`)

Monitors external infrastructure descriptors and highlights drift; deterministic idempotent re-sync keeps
canvas models aligned with reality.

| Source Type | Supported Descriptors | Polling Cadence | Drift Detection Trigger |
|---|---|---|---|
| Kubernetes | Deployments, Services, Ingress, CRDs | Real-time webhook / 30s poll | Pod replicas, port changes, new namespace services |
| OpenAPI 3.1 | `openapi.json`, `swagger.yaml` | Git commit webhook / 5m poll | Endpoint addition/removal, schema contract modifications |
| Terraform | `terraform.tfstate`, `plan.json` | CI/CD pipeline trigger | Resource provisioning, VPC subnet shifts, security group edits |

- **Header summary** — connected repos, mapped services, last webhook ping timestamp.
- **Diff action table** — Change Type (ADDED / MODIFIED / DELETED), Service Name, Live Spec Value,
  Current Canvas Value, Proposed Action, per-item Accept (stages for merge) / Reject (marks ignored).
- **Layout preservation toggle** (default on) — keeps shape coordinates, notes, and grouping while
  applying upstream metadata updates.
- **Idempotent re-sync** — staged diffs apply in an atomic single-undo transaction with progress bar;
  the append-only sync log records timestamp, identity, commit SHA, and net shape delta.

## 6. Architecture Reviews, Merge & Automation (`#/reviews`)

Async PR reviews with visual A/B diffing, pinned discussions, merge gating, and the REST sandbox —
two sub-tabs: **Discussion & Diff** and **Merge & Automation** (the former `#/git`, which now
redirects here; `⌘G` jumps straight to Merge & Automation).

- **Version checkpoints (left rail)** — timeline of immutable named snapshots (e.g. `v2.4-head`,
  `v2.3-prod-base`). Tagging captures the live graph; rollback restores with a safe auto-snapshot stash
  and two-click delete protection.
- **Review status bar** — session title (e.g. "PR #104: Auth OIDC Migration"), reviewer avatars with
  approval checkmarks, Request Changes / Approve Architecture decisions.
- **Visual diff legend** — 🟩 green outline = added node/edge · 🟨 amber dashed = modified metadata,
  port, or redirected route · 🟥 red strikethrough = deleted component.
- **Pinned discussions (right rail)** — threads anchored to node UUIDs or canvas coordinates;
  markdown (`**bold**`, ``code``), @mention autocomplete, reply threads, resolve/reopen lifecycle,
  "Jump to Node on Canvas", detached-node detection.

## 7. Merge Gating & REST Sandbox (`#/reviews` → Merge & Automation tab)

Enforces architectural discipline in enterprise CI/CD pipelines by treating .arch diagrams as build artifacts.

- **Automated gating checks** — (1) Schema Validation (`.arch` JSON integrity), (2) Architecture
  Linter (zero orphans/dangling), (3) Drift Verification (no unacknowledged upstream drift). The
  "Merge Diagram PR" button stays disabled with an explanatory tooltip until all three pass; merging
  tags a checkpoint.
- **REST automation console** — endpoint dropdown (`POST /api/v1/sync`, `GET /api/v1/export`,
  `POST /api/v1/lint`), JSON body editor with syntax validation, "Send Simulated Request" with status
  + latency pill, one-click cURL copy, recent-call history.

## 8. Topology Catalog & Blueprints (`#/blueprints`)

9 curated reference architectures, vetted for scalability, security, and resilience:

1. Event-Driven Microservices with Apache Kafka & CQRS
2. Multi-Region AWS VPC with Global Accelerator & Route 53 Failover
3. Modern Enterprise RAG Pipeline (Vector DB + Semantic LLM Cache + Redis)
4. Kubernetes Production Service Mesh (Istio Envoy + Ingress Gateway)
5. Zero-Trust API Gateway & OIDC Authentication Flow
6. Real-Time Financial Ledger with Immutable Event Sourcing
7. Global IoT Telemetry Ingestion Engine with MQTT & TimeSeries DB
8. GraphQL Federation with Distributed Subgraphs & Apollo Router
9. Serverless Edge Compute & Dynamic CDN Routing

Category pills (All | Cloud Native | Microservices | Data & Streaming | AI / RAG | Security & Auth) +
pattern search with live node/edge counts. **Blast-radius control**: "Insert into Current Canvas"
appends beside existing content with collision-safe UUID remapping; "Replace Canvas" clears the graph
after explicit confirmation when unsaved changes exist (Load itself remains a single undo step).

## 9. Settings & Workspace Governance

- **9.1 `#/settings/general`** — default rendering style (`Hand-Drawn Sketchy` vs `Clean
  Architectural`), grid display (Dots / Lines / None), snap thresholds (5px / 10px / 20px / Disabled),
  connector algorithm (Orthogonal / Straight / Bezier), export resolution (1x / 2x Retina / 4x Print),
  SVG metadata embedding, keyboard shortcut rebinding table.
- **9.2 `#/settings/connectors`** — GitHub / GitLab PAT with scope validation, target repository +
  file path bindings, webhook listener URL with signing-key generation/verification, polling cadences
  (Real-time / 5m / 1h / Manual).
- **9.3 `#/settings/team`** — member table with roles (Admin: config+billing+invites; Editor:
  canvas+sync+blueprints; Reviewer: read-only + comments/approvals; Viewer: read-only + export),
  SAML/OIDC provider setup (Okta, Azure AD, Google Workspace), required-approval policy, audit-trail
  export.
- **9.4 `#/settings/storage`** — `archflux:*` key inspector with sizes, complete workspace backup
  download (`.tar.gz`), schema integrity scanner, cache clear (retains diagrams), `RESET`-gated
  factory reset.

## 10. Design Token System (Obsidian & Paper)

Dual-theme tokens for contrast, WCAG AAA-grade text, and zero eye fatigue. Implemented as CSS custom
properties in `src/styles.css` (`:root`/light, `[data-theme="dark"]`, `[data-theme="blueprint"]`).

| Token | Dark (Midnight Slate) | Light (Precision Paper) | Role |
|---|---|---|---|
| `--surface-canvas` | `#0B0F19` Deep Obsidian | `#F8FAFC` Clean Off-White | Infinite canvas background |
| `--surface-grid-dot` | `#1E293B` Slate 800, 15% op | `#CBD5E1` Slate 300, 40% op | Grid points / lines |
| `--surface-card` | `#111827` Midnight Gray | `#FFFFFF` Pure White | Dashboard & modal cards |
| `--surface-drawer` | `#1F2937` Elevated Gray | `#F1F5F9` Light Surface | Right utility dock & inspector |
| `--border-subtle` | `#374151` Border Divider | `#CBD5E1` Slate 300 | Card & panel boundaries |
| `--border-focus` | `#6366F1` Indigo Glow | `#4F46E5` Indigo 600 | Focused inputs, selected nodes |
| `--text-primary` | `#F9FAFB` High-Contrast | `#0F172A` Slate 900 | Titles, labels, metrics |
| `--text-secondary` | `#9CA3AF` Muted Slate | `#475569` Slate 600 | Metadata, timestamps, helpers |
| `--status-success` | `#10B981` Emerald 500 | `#059669` Emerald 600 | Synced state, valid linter |
| `--status-warning` | `#F59E0B` Amber 500 | `#D97706` Amber 600 | Drift, isolated-node warning |
| `--status-error` | `#EF4444` Rose 500 | `#DC2626` Rose 600 | Dangling wires, failing gates |
| `--brand-primary` | `#6366F1` Indigo 500 | `#4F46E5` Indigo 600 | Primary CTAs, active highlights |

## 11. Micro-Interactions, Animation Curves & State Transitions

- **Magnetic port snapping** — connector endpoint inside the 16px radius scales the port 8px → 12px
  with `cubic-bezier(0.34, 1.56, 0.64, 1)` spring plus indigo (`#6366F1`) halo pulse.
- **Linter count notification** — a new lint error scales the top-bar linter chip to 1.1x with an amber
  pulse over 350ms.
- **Auto-heal pathfinding morph** — "Auto-bind" draws the wire via orthogonal routing, morphing from
  start to target anchor over 220ms.
- **Destructive action countdown** — delete requires a second confirming click inside a 4-second window
  rendered as a draining progress bar; clicking elsewhere or timeout rolls state back to default.

## 12. Global Overlays

- **Command palette (`⌘K`)** — focus-trapped modal: navigation, quick-insert of all 38 cloud shapes at
  canvas center, canvas actions (auto-layout, heal-all, exports), diagram switcher. Up/Down + Enter +
  Esc, `aria-activedescendant` listbox semantics.
- **Crash & error boundary** — friendly non-blocking modal: "Reload Canvas" (safe re-mount),
  "Load Safe Default Graph" (stashes corruption to `archflux:corrupt-backup`, loads sample mesh),
  "Copy Debug Trace" (stack + payload for reports).
