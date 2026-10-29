# ArchFlux UI Revamp Specification

> **Version:** 1.4.0 | **Last Updated:** 2026-10-25 | **Status:** 🚧 In progress (Phase 1–2 this release)
> **Part of:** [Master Spec](../../SPEC.md) | **Replaces:** UI_UX_SPEC (deleted 2026-10-25); its quality bars and status-language rules are in Appendix A
> **Implementation:** [FRONTEND_SPEC](FRONTEND_SPEC.md) (gap IDs `UX-*` below).
> **Product scope:** [PRODUCT_SPEC](PRODUCT_SPEC.md) v4 — the screen inventory there (SC-01…SC-49) is what this
> visual system must cover; this revamp's IA (§4) is R1 of that roadmap.
> **Designs (Claude Design):** [ArchFlux UI Revamp canvas](https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu) —
> artboards: Canvas workspace, Library, Review, Sync, Canvas on a phone, Design tokens & controls. The designs are
> the visual source of truth for Phases 1–3; implementation starts after design sign-off.

Written from two seats: **product** (what the UI must achieve, how we measure it) and **design**
(how it looks and behaves). Every change ships against the acceptance criteria in §9.

---

## 1. Product framing

**What ArchFlux is:** a canvas for system-architecture diagrams that live as `.arch` files, are reviewed
like code, and can be checked against what is actually running.

**Primary job (80 % of time):** *draw and edit an architecture diagram quickly and legibly.*
**Secondary jobs:** find/open diagrams (Library), review changes (Review), check drift (Sync), start from a
template (Blueprints), configure (Settings).

| Persona | Needs from the UI |
|---|---|
| Platform / backend engineer | Fast keyboard-driven editing, readable nodes, exact properties |
| Tech lead / reviewer | Clear diff + comments, obvious save/version state |
| Architect presenting | Clean canvas, no chrome noise, export |

**Goals → metrics** (checked by the QA sweep + manual review):

| Goal | Metric | Target |
|---|---|---|
| Canvas first | Share of a 1440×900 viewport used by the canvas on `#/canvas` | ≥ 75 % (today ≈ 62 %) |
| One source of truth for status | Distinct save/sync status indicators in the app bar | 1 (today 3) |
| Legible chrome | UI text set in a proportional face; minimum UI text size | 100 % / ≥ 11 px |
| No truncated controls | Tool rail / tab labels ending in "…" at ≥ 1024 px | 0 |
| Accessible | axe WCAG A/AA violations on all routes | 0 |
| Responsive | Horizontal overflow / clipped controls at 320–1920 px | 0 |

---

## 2. Audit (2026-10-24, screenshots at 1440×900 and 390×844)

| ID | Finding | Severity |
|---|---|---|
| UX-A1 | App bar carries ~20 controls in one row: brand + tagline, `LOCAL` badge, "Local — not synced" pill, lint counter, 6 nav tabs, ⌘K, ?, undo, redo, theme select, Focus, Export, avatar. Avatar clips at 1366 px; three different status indicators say overlapping things; Export is the primary CTA on every screen incl. Settings | High |
| UX-A2 | Monospace (JetBrains Mono) is used for buttons, inputs, tabs, labels and placeholders (~80 places) → reads as a terminal, lowers legibility; type sizes range 9–20 px with no scale | High |
| UX-A3 | Tool rail labels truncate at every width ("Sele…", "Serv…", "Gate…", "Data…", "Conn…"); "Library" means both the diagram library (nav) and the shape library (rail) | Med |
| UX-A4 | Inspector shows every control at once (≈ 14 groups); Provider Icon picker repeats identical glyphs without names; shape picker uses cryptic glyphs; minimap overlaps the inspector's lower controls | High |
| UX-A5 | A single click on a node (select tool) arms "Connecting from …" — selection and wiring are conflated | High |
| UX-A6 | Edge labels are italic serif, drawn straight over lines and nodes; hard to read, truncate into nodes | Med |
| UX-A7 | **Bug:** node label/tag painted outside the node (label x ignored node.x) — *fixed in FE-V2* | Critical |
| UX-A8 | Pages (Library, Review, Sync, Settings) have no page header; actions float; one diagram card sits alone on a wide empty page; storage meter is styled as content | Med |
| UX-A9 | Buttons come in ≥ 5 heights/styles (`btn`, `btn-xs`, chips, tabs, pills); primary colour used for many concurrent actions | Med |
| UX-A10 | Phones: app bar wraps to 3 rows, nav scrolls without affordance (fade added in FE-Q11) | Med |
| UX-A12 | Display styles: icon-only (`logo`) elements draw no name under official icons (details only for emoji); no way to switch an element between icon-only / card / shape while keeping text, or to replace the icon in place | High |
| UX-A11 | Shape icons: only the 12 AWS icons are official artwork; `public/icons/data/*` (Redis, Postgres, Kafka, RabbitMQ, Mongo, Elastic), `gcp/*` and `azure/*` are generic placeholder line drawings presented as those technologies; node notation is one rounded box for every type (a DB, a queue and a service look the same) | High |

---

## 3. Design principles

1. **Canvas first.** Chrome is thin, quiet and contextual; the diagram is the brightest thing on screen.
2. **One status, one place.** Save/sync/lint state is a single status control in the app bar.
3. **Progressive disclosure.** Show the 20 % of controls used 80 % of the time; the rest are one click away
   (collapsible sections, overflow menus, command palette).
4. **Proportional type for UI, mono for code.** Inter for everything people read; JetBrains Mono only for
   code, ids, keyboard keys and diffs.
5. **Predictable interactions.** Click selects. Connecting is an explicit mode (Connect tool / `C` / drag
   from a port). `Esc` always backs out.
6. **Honest states** (unchanged contract, [FRONTEND_SPEC — No mock data](FRONTEND_SPEC.md)).

---

## 4. Information architecture

> **Source of truth:** the finalized shared app bar artboard
> [`docs/design/artboards/AppBar.dc.html`](../design/artboards/AppBar.dc.html). v1.3.0 synced this
> section to it; the earlier prose had ⋯, ⚙ and a Blueprints tab. Exact values are in R1-E14-T01.

```
┌ App bar (48 px) ─────────────────────────────────────────────────────────────────────────────┐
│ ⬡ ArchFlux │ checkout-mesh.arch ▾ │ Home  Library  Canvas  Review(2)  Sync │ [🔍 Search  ⌘K] [● Saved v12] [Share] (R) │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Left:** logo (→ Home) and, on the canvas only, the **document switcher** (title ▾; menu: rename,
  duplicate, new, recent).
- **Navigation:** five text links: Home, Library, Canvas, Review (with an open-review count), and
  Sync.
  - Blueprints is no longer a tab. Templates are reached from Home, Library, the New diagram
    dialog and the palette.
  - Settings moves into the avatar menu.
- **Right:**
  - **Search** field, which opens the ⌘K command palette.
  - On the canvas only: the **status button** (dot plus "Local · 3 issues", "Saved v3",
    "Unsaved changes", "Offline"), then the primary **Share** action. Until sharing ships, the
    primary action is **Save**.
  - The notifications bell arrives with notifications (R2).
  - The account avatar, whose menu holds theme, settings, profile and team, and sign in/out.
- **Moved out of the app bar:** undo/redo, Focus, theme, ⋯ and ⚙.
  - Undo/redo and Focus go to the canvas view toolbar.
  - Export and Import go to the palette, the doc switcher menu and the Library.

**Canvas workspace**

```
┌ App bar ─────────────────────────────────────────────────────────────────────┐
│┌Rail┐                                                     ┌ Inspector 320 ┐ │
││ ↖  │                    CANVAS                           │ Node · Service │ │
││ ✋ │                                                     │ ▸ Content      │ │
││ ── │                                                     │ ▸ Appearance   │ │
││ ▢  │                                                     │ ▸ Icon         │ │
││ ⬡  │                                                     │ ▸ Metadata     │ │
││ ⛁  │                                                     │                │ │
││ ≡  │                                                     │ Inspector Lint │ │
││ ── │                                                     └────────────────┘ │
││ ✎ T│  ┌ zoom − 100% + ⤢ │ ↶ ↷ │ ▣ map │ ⛶ focus ┐                          │
││ ↗ 💬│  └────────────────────────────────────────┘                          │
│└────┘                                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Tool rail, 56 px:** icon-only buttons with a tooltip that names the tool and its shortcut. Group
  dividers replace the uppercase group captions. "Library" becomes **Shapes**.
- **Canvas toolbar, bottom-left floating:** zoom −/%/+ and fit, undo/redo, minimap toggle, Focus. The
  minimap opens **above the toolbar** and never overlaps the inspector.
- **Inspector, 320 px:**
  - Header: type chip and title.
  - Sections Content, Appearance, Icon and Metadata collapse; Content starts open.
  - Pickers are labelled: the icon picker shows a name in each tooltip and has no duplicates, and the
    shape picker is a labelled segmented control.
  - Tabs are text ("Inspector", "Linter 4", "Live"), with no emoji or mono.

---

## 5. Design system (tokens)

**Typography** (Inter; JetBrains Mono = `--code-font` only)

| Token | Size / line / weight | Use |
|---|---|---|
| `--text-xs` | 11 / 16 / 500 | captions, badges |
| `--text-sm` | 12 / 18 / 400–500 | controls, table cells |
| `--text-md` | 13 / 20 / 400 | body, inputs |
| `--text-lg` | 15 / 22 / 600 | card titles |
| `--text-xl` | 20 / 28 / 700 | page titles |

**Spacing:** 4-pt scale (4, 8, 12, 16, 24, 32). **Radius:** 6 (controls) · 10 (cards/panels) · 999 (pills).
**Elevation:** `--shadow-1` panels, `--shadow-2` popovers/floating toolbars.

**Colour** (light; dark/blueprint mirror the same roles)

| Role | Token | Value |
|---|---|---|
| App background | `--bg-app` (`--bg-workspace` aliases it) | `#F6F7F9` |
| Surface | `--bg-panel` | `#FFFFFF` |
| Border | `--border-panel` | `#E3E6EB` |
| Text / muted | `--text-main` / `--text-muted` | `#1B1F27` / `#5B6474` (≥ 4.5:1 on surface) |
| Text dim (hints) | `--text-dim` | `#5F6878` (5.6:1; was #707989, which failed AA) |
| Code font | `--code-font` | alias of `--mono-font`; only for code, IDs, kbd and diffs |
| Accent | `--accent-cyan` (kept name) | `#4F46E5` |
| Success / warning / danger text | `--status-*-text` | AA-compliant (FE-Q9) |

**Controls:** one button component in three sizes: sm 28 px, md 32 px, lg 40 px. Variants are primary
(at most one per view), secondary (bordered), ghost and danger. Inputs are 32 px with a 13 px proportional
font. Focus ring: 2 px accent at 35 % plus a 1 px accent border.

**Canvas nodes:**
- **Card:** 8 px radius, 1.5 px border in the node colour and a white surface.
- **Content:** icon at 24 px top-left. Label is 13 px/600 and tag 11 px muted, both inside the card
  (FE-V2).
- **Selection:** 2 px accent ring plus handles.
- **Edge labels:** 11 px Inter on a surface-coloured pill placed at the midpoint, with no italic or serif.

---

## 5A. Diagram components — element notation standard

The shapes people draw with. They follow established notation so any engineer can read a diagram without
a legend. The authority for each part:

| Part | Standard followed |
|---|---|
| Element kinds and base shapes | **C4 model** (person, software system, container, component, database cylinder, queue) + UML component/deployment where C4 is silent |
| Provider variants | Official icon sets only: **AWS Architecture Icons**, **Google Cloud icons**, **Azure architecture icons**, **Kubernetes/CNCF icons**. Technology marks (Redis, PostgreSQL, Kafka …) only from the vendor's published assets, used per its trademark guidelines to identify the technology — never redrawn or invented |
| Group boundaries | **AWS Architecture Icons group guidelines** (AWS Cloud, Region, VPC, AZ, public/private subnet, security group, Auto Scaling) + C4 system boundary + a trust boundary for threat models |
| Relationships | C4 relationship rules: every line has a direction and a label "verb · protocol"; sync vs async distinguished by line style, not colour alone |

### 5A.1 Element anatomy (card, size M = 200×80, the default)

```
┌───────────────────────────────────────┐   1.5 px border in the kind's colour, radius per kind
│ [icon 32]  Order Service           ⚠ │   name 13/600 · status slot (drift, lint, comment count)
│            Container · Spring Boot    │   kind + technology 11/500 muted  ("[kind: tech]" in C4)
│            Owner: Payments            │   optional property line 11 (owner / SLO / data class)
└───────────────────────────────────────┘   4 ports (N/E/S/W) appear on hover
```
- **Sizes:** S = icon tile 64×64 with the label below (AWS diagram style), M = card 200×80, L = 240×120
  with a description line.
- **Icon slot:** the official provider icon when the element has a provider variant, otherwise the kind's
  generic glyph. The icon never replaces the name.

### 5A.1b Display styles and editing (UX-A12)

Every element has a **display style**, chosen per element (or for a whole selection) and defaulting per diagram:

| Style | Looks like | Use |
|---|---|---|
| **Icon** | The icon tile alone (48 / 64 / 96 px) with the **name below** (13/600). An optional technology line goes under the name, also centred | AWS-style infrastructure diagrams, dense overviews |
| **Card** | Rounded card with an icon slot, name, technology and an optional property line (§5A.1) | Default; C4 container/component views |
| **Shape** | Notation geometry from §5A.2 (cylinder, pipe, bucket, person) with the icon and text inside | Data and messaging heavy views, C4 purists |

**Switching style:**
- Ways to switch: the context toolbar ("Display: Icon · Card · Shape"), the inspector's Appearance section, or a shortcut (`Alt+1/2/3`).
- Switching keeps the element's identity, text, icon, connections and properties. Only the geometry changes, and ports move to the new bounds.
- A multi-selection switches together, in one undo step.

**Editing text, the same in every style:**
- Double-click or `Enter` on a selected element opens the **name** for inline editing.
- `Tab` moves to the **technology** line; `Shift+Tab` goes back.
- `Enter` commits and `Esc` cancels. The edit is one undo step, and an empty name restores the previous one.
- **Card style:** the name wraps to 2 lines and then ends in "…"; the full text is in the tooltip and the outline.
- **Icon style:** the label wraps to 2 lines under the icon and never overlaps it.
- Text is also editable in the inspector Content section, kept in sync live.

**Editing the icon:**
- Click the icon slot of a selected element (or "Replace icon" in the context toolbar) to open the **icon picker**:
  - a search box across all sets
  - provider tabs: Recent · AWS · Google Cloud · Azure · Kubernetes · Technologies · Generic · Uploaded
  - a grid of named icons, with the name in a tooltip and as the accessible name
  - "Upload SVG/PNG" to the workspace icon library (with a per-file size limit; SVG is sanitised)
  - "No icon"
- Official icons keep their own colours. Generic glyphs take the element kind's colour.

**Card options:** show/hide the icon, the technology line, the property line (pick which property) and the
status slot. Resize handles snap to S/M/L, or allow free sizing with `Alt`.

**Today (2026-10-24):**
- An icon-only shape (`logo`) exists, but it draws **no name** under an official icon. Its details text
  appears only for emoji icons, so icon-only elements are unnamed on the canvas (**bug, UX-A12**).
- Double-click rename exists.
- The provider icon picker lives in the inspector with duplicates and no names (UX-A4).

**Acceptance (R1):**
1. Each element renders correctly in all three styles; in Icon style the name is always drawn under the icon,
   inside the element's hit area (renderer test).
2. Switching style on a multi-selection is one undo step and keeps connections attached.
3. Inline editing of name and technology works with keyboard alone (`Enter`, `Tab`, `Esc`), and screen
   readers announce "Editing name of Order Service".
4. The icon picker searches by name across sets, every icon has an accessible name, it has no duplicate
   entries, and uploads land in the workspace library.

### 5A.2 Element catalogue

| Kind | Notation (base shape) | Colour family | Generic glyph | Provider variants (official icons) |
|---|---|---|---|---|
| Person / actor | C4 person (head + rounded body) | Navy `#1E3A8A` | person | — |
| Client app (web, mobile) | Browser window / phone frame | Slate `#334155` | window / phone | — |
| External system | Card, **dashed** border, grey fill | Grey `#6B7280` | globe | SaaS marks per vendor policy |
| API gateway / load balancer | Card with gateway chevron | Violet `#7C3AED` | chevron | API Gateway, ALB/NLB, Cloud Load Balancing, Front Door |
| Service / microservice | Rounded card (radius 8) | Blue `#2563EB` | hexagon | ECS/Fargate, EKS service, Cloud Run, App Service |
| Serverless function | Rounded card + λ | Orange `#C2410C` | λ | Lambda, Cloud Functions, Azure Functions |
| Relational database | **Cylinder** | Amber `#B45309` | cylinder | RDS/Aurora, Cloud SQL, Azure SQL (+ PostgreSQL/MySQL marks) |
| Document / key-value DB | Cylinder + braces | Amber `#B45309` | cylinder{} | DynamoDB, Firestore, Cosmos DB (+ MongoDB mark) |
| Cache / in-memory store | Cylinder + lightning | Red `#B91C1C` | bolt | ElastiCache, Memorystore, Azure Cache (+ Redis mark) |
| Message queue | **Horizontal pipe** (queue) | Pink `#BE185D` | pipe with messages | SQS, Pub/Sub, Service Bus (+ RabbitMQ mark) |
| Event stream / topic | Horizontal pipe + segmented log | Purple `#6D28D9` | log | MSK/Kinesis, Pub/Sub, Event Hubs (+ Kafka mark) |
| Object storage | Bucket | Green `#15803D` | bucket | S3, Cloud Storage, Blob Storage |
| Search index | Cylinder + magnifier | Teal `#0F766E` | magnifier | OpenSearch (+ Elasticsearch mark) |
| CDN / DNS | Globe card | Cyan `#0E7490` | globe | CloudFront, Route 53, Cloud CDN, Front Door |
| Scheduler / batch job | Card + clock | Slate `#475569` | clock | EventBridge Scheduler, Cloud Scheduler |
| Observability | Card + pulse | Slate `#475569` | pulse | CloudWatch, Cloud Monitoring, Azure Monitor |

Colours are the border and icon tint; card fill stays the surface colour (`#FFFFFF`), with the tinted fill
`*-50` used only for conditional formatting, so meaning never depends on colour alone (the shape carries it).

### 5A.3 Boundaries (containers)

| Boundary | Style | Label |
|---|---|---|
| Cloud account | 1.5 px solid `#232F3E`, square corners, provider logo top-left | "AWS Cloud · prod" |
| Region | 1.5 px **dashed** `#00A4A6` | "Region · eu-west-1" |
| VPC | 1.5 px solid `#8C4FFF` | "VPC · 10.0.0.0/16" |
| Availability zone | 1.5 px dashed `#00A4A6` | "AZ a" |
| Public subnet | 1.5 px solid `#7AA116`, fill `#F2F8E6` | "Public subnet" |
| Private subnet | 1.5 px solid `#00A4A6`, fill `#E6F6F7` | "Private subnet" |
| Security group | 1.5 px solid `#DD344C` | "SG · orders" |
| Kubernetes cluster / namespace | 1.5 px solid / dashed `#326CE5` | "Cluster · eks-prod" / "ns · checkout" |
| C4 system boundary | 1.5 px dashed `#6B7280`, radius 12 | "Checkout system" |
| Trust boundary (threat model) | 2 px dashed `#DC2626` | "Trust boundary · internet" |

The label sits inside the top-left (AWS style) and the boundary can collapse to a chip ("VPC · prod · 12").

### 5A.4 Relationships

| Kind | Line | Arrowhead | Label |
|---|---|---|---|
| Synchronous request | solid 1.5 px `#5B6474` | filled triangle at target | "Calls · HTTPS/gRPC" |
| Asynchronous message / event | **dashed** 6-4 | open arrow at target | "Publishes · order-created" |
| Data replication / backup | **dotted** 2-4 | filled at target | "Replicates · CDC" |
| Bidirectional | solid | both ends | "Syncs · WebSocket" |
| Sequence step | any of the above + numbered badge | — | "1 · Charge card" |

Labels are pills (11 px, surface fill, border) at the midpoint; line jumps where lines cross.

### 5A.5 States (every kind)

Default · hover (ports + subtle shadow) · selected (2 px accent ring + handles) · multi-selected ·
focus-visible (keyboard ring) · locked (lock glyph) · drift (amber status dot + "Drift") · lint error (red
status dot) · comment count (pin) · proposed/AI draft (green dashed border, "Proposed") · removed in diff
(red dashed, 60 % opacity, name struck through) · changed in diff (amber fill) · external (dashed grey) ·
collapsed boundary (chip with child count).

### 5A.6 Acceptance (R1)

- Each kind in §5A.2 renders with its notation shape, so a database, a queue and a service are
  distinguishable in grayscale.
- Provider variants use only official icons. `public/icons/data|gcp|azure` placeholders are replaced or
  removed; a variant without an official asset falls back to the generic glyph plus the technology name.
- Boundaries in §5A.3 exist as containers (CAP-C2), and relationships render per §5A.4.
- All states in §5A.5 are covered by renderer tests.
- Design reference: the Claude Design canvas, page "Components" (artboards Elements, States, Boundaries,
  Example).

---

## 6. Screen specs

| Screen | Revamp |
|---|---|
| Canvas | §4 layout; click = select; connect = Connect tool / `C` / port drag; edge-label pills |
| Library (dashboard) | Page header "Library" + count + primary "New diagram"; toolbar (search, sort, view); responsive card grid `auto-fill, minmax(240px, 1fr)`; storage meter moves to a slim footer line |
| Review | Page header "Review" with PR title, reviewers, decision buttons on the right; tabs as an underline tab bar |
| Sync | Page header "Sync"; status summary row; connectors and drift as cards; file transfer as a secondary card |
| Blueprints | Page header + filter row; cards in the same grid as Library |
| Settings | Page header; left section nav (General, Connectors, Team, Storage) on ≥ 768 px, tabs on phones |
| Login / onboarding | Proportional type, same controls; no behavioural change |

**Page header pattern:** title (`--text-xl`), optional subtitle (muted, `--text-sm`), right-aligned actions
(one primary). 24 px top padding, max content width 1200 px, centred.

---

## 7. Responsive rules

| Width | Behaviour |
|---|---|
| ≥ 1280 | Full app bar; inspector docked 320 px |
| 1024–1279 | Nav labels shortened; inspector 288 px |
| 768–1023 | Full nav (as built in R1-E14-T01); search is icon-only below 1280; inspector overlays the canvas (closable) |
| < 768 | App bar: logo, doc switcher, status button, "Menu ▾" (brand name, search and Save hidden; Save stays in the status menu). Inspector is a bottom sheet. Tool rail is icons only at 48 px |

---

## 8. Accessibility

- WCAG 2.2 AA, with 0 axe violations on all routes.
- Visible focus on every control.
- Each tool has a name and a tooltip that matches its accessible name (Label in Name).
- Targets are ≥ 24 px, and ≥ 32 px on touch layouts.
- Motion respects `prefers-reduced-motion`.

---

## 9. Rollout and acceptance

### Phase 1: Foundation and canvas workspace (this release)

| ID | Change | Acceptance |
|---|---|---|
| UX-P1.1 | Tokens: proportional UI font everywhere; `--code-font` for code/ids/kbd/diffs; type scale; refreshed light palette with AA text | Computed `font-family` of buttons/inputs/tabs is Inter; axe colour-contrast 0 |
| UX-P1.2 | App bar per §4: doc switcher, 5-item nav, single status button, ⌘K, overflow, settings, avatar; theme/undo/redo/Focus moved | ≤ 9 interactive controls in the app bar at 1440 px; 1 status indicator; no clipping at 1024 px |
| UX-P1.3 | Tool rail: icon-only with tooltips (name + shortcut), "Shapes" naming, no truncation | No visible text ending in "…" in the rail; every rail button has `aria-label` = tooltip text |
| UX-P1.4 | Canvas toolbar (zoom, undo/redo, minimap, Focus) bottom-left; minimap above it | Minimap bounding box never intersects the inspector |
| UX-P1.5 | Inspector: collapsible sections, labelled icon/shape pickers, text tabs | Icon picker has no duplicate icons; every picker option has an accessible name |
| UX-P1.6 | Click selects only; connect via Connect tool / `C` / port drag | Single click on a node with the select tool shows no "Connecting from" hint; e2e/unit updated |
| UX-P1.7 | Edge labels: sans, 11 px, surface pill | Renderer test: edge label drawn with a non-italic sans font and a background rect |
| UX-A7 / FE-V2 | Node label/tag inside the node | `canvas.test` "paints every node label and tag inside its own box" |

### Phase 2: Pages (this release)

| ID | Change | Acceptance |
|---|---|---|
| UX-P2.1 | Shared `PageHeader` component; applied to Library, Review, Sync, Blueprints, Settings | Each page has exactly one `h1` and at most one primary button in its header |
| UX-P2.2 | Library grid + slim storage footer | Cards fill the row at 1440 px (≥ 4 columns) |
| UX-P2.3 | Consistent buttons/inputs (sm/md/lg) across pages | No `btn-xs` with mono font remains |

### Phase 3: Mobile shell and polish (next release)

| ID | Change |
|---|---|
| UX-P3.1 | < 768 px app bar + menu; inspector bottom sheet |
| UX-P3.2 | Dark/blueprint theme pass against the new tokens |
| UX-P3.3 | Visual-regression baselines regenerated after review (FE-V1) |

**Verification for every phase:**
- `tsc -b`, lint, unit tests and the e2e matrix all pass.
- The QA sweep (13 routes × 5 viewports × 3 engines) shows no overflow, no clipped controls and 0 axe
  violations.
- Before/after screenshots are reviewed at 1440 px and 390 px.

---

## 10. Changelog

- **1.4.0 (2026-10-25):** UI_UX_SPEC deleted; §11 Quality Bars and §16 Status language moved verbatim to Appendix A.
- **1.3.0 (2026-10-25):** §4 synced to the finalized AppBar artboard. Artboards in docs/design/artboards are now the source of truth for visuals (EPIC-14).
- **1.2.1 (2026-10-25):** §5 tokens add `--text-dim` #5F6878 (AA), `--code-font`, and `--bg-app` aliased by `--bg-workspace` (found while building R1-E01-T01).
- **1.2.0 (2026-10-24):** §5A.1b display styles (Icon · Card · Shape), inline text editing, in-place icon picker; UX-A12.
- **1.1.0 (2026-10-24):** §5A diagram components standard (C4 + official provider icons + AWS group boundaries); audit UX-A11 (placeholder icons).
- **1.0.1 (2026-10-24):** designs produced in Claude Design (link in header); implementation gated on sign-off.
- **1.0.0 (2026-10-24):** initial revamp plan: audit UX-A1…A10, principles, IA, tokens, screen specs, and
  phased acceptance criteria.

---

## Appendix A. Carried from UI_UX_SPEC v2.4.0 (deleted 2026-10-25)

The per-screen sections of UI_UX_SPEC (§0–§10) are replaced by the artboards in `docs/design/artboards/` and by this spec.
The rules that still bind are kept here verbatim. A comment that cites `UI_UX_SPEC §16` or `§11` now means this appendix.

### A§11. Quality Bars

#### 11.1 Accessibility (target: WCAG 2.2 AA) 🆕

- Text contrast ≥ 4.5:1; UI component and focus indicators ≥ 3:1 in both themes.
- Full keyboard operability; visible focus; no keyboard traps; logical tab order.
- Status never by color alone (add icon/text/pattern).
- Pointer targets ≥ 24×24 CSS px (matching WCAG 2.2 target size minimum).
- Live regions for toasts, sync progress, and gating-check results.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

#### 11.2 Performance budgets 🆕 (validate before enforcing)

| Metric                              | Budget                                 |
| ----------------------------------- | -------------------------------------- |
| Drag/resize frame time at 200 nodes | ≤ 16ms (60fps) on a mid-range laptop   |
| Minimap redraw                      | ≤ one frame; throttle during pan       |
| Blueprint thumbnail render          | ≤ 5ms each; memoize by blueprint id    |
| Tab switch                          | ≤ 100ms to first paint                 |
| Persisted writes                    | Debounced; never on every pointer move |

#### 11.3 Resilience

- All `localStorage` access guarded (quota, disabled storage, corrupt JSON).
- Versioned keys; unknown versions are ignored, not crashed on.
- No partial writes: multi-step operations (import, restore, save-as-blueprint) are atomic or fully rolled back.

#### 11.4 Privacy and security posture

- Local-first: diagram data stays in the browser unless the user syncs.
- Secrets (tokens, webhook secrets) are never rendered in plain text by default, never logged, and redacted in copied cURL.
- Imported `.arch` content is treated as untrusted: schema-validated, size-capped, and all labels rendered as text (never as HTML).

---

### A§16. Productization v3.0.0 — Status Language & Honest Labeling

Contract: [PRODUCT_SPEC Appendix A](PRODUCT_SPEC.md#appendix-a-platform-contracts-moved-from-productization_spec-v300-2026-10-25) §6.1 (status language) + Release rule
(nothing ships as GA without acceptance criteria + operational evidence — otherwise Preview, Demo, or Not connected).
New requirement area: `HON` (honesty). Carries the same weight as all other requirement IDs.

#### 16.1 Authoritative status vocabulary

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

#### 16.2 Requirements

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

