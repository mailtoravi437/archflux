# EPIC-05 · Official icon sets, icon picker, shape library

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 1 (T01–T02), 2 (T03–T05) | **Sources:** CAP-S1; UX-A4, UX-A11;
> UI_REVAMP_SPEC §5A ("Provider variants"), §5A.1b "Editing the icon"; DATA_MODEL_R1 §6; FL-19; SC-17
> **Design:** "Components" › DisplayStyles (icon picker); "3 Edit & model" › CanvasPro (Shapes panel)

**Facts (checked 2026-10-24):**
- `frontend/node_modules/aws-icons@3.3.0` contains the official AWS Architecture Icons as SVG:
  - `icons/architecture-service/` (300), e.g. `AmazonRDS.svg`, `AWSLambda.svg`,
    `AmazonSimpleQueueService.svg`;
  - `icons/resource/` (468);
  - `icons/architecture-group/` (15): `AWSCloud`, `Region`, `VirtualprivatecloudVPC`,
    `Publicsubnet`, `Privatesubnet`, `AutoScalinggroup`, …;
  - `icons/category/` (26).
- `public/icons/aws/*.svg` holds 12 official icons copied earlier.
- `public/icons/{gcp,azure,data}` hold **placeholders**. Remove them (UX-A11).

**License rule:** a set ships only with an entry in `manifest.sets` that states its license and
source. AWS icons may be used in architecture diagrams under AWS's terms; they are not to be
modified or used as product logos. Don't recolour official icons.

---

### R1-E05-T01 · Icon manifest generator

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | none |
| **Sources** | DATA_MODEL_R1 §6 |

**Create:**
- `frontend/scripts/build-icon-manifest.mjs` (Node 20, no new dependencies). It:
  1. copies `node_modules/aws-icons/icons/architecture-service/*.svg` and
     `architecture-group/*.svg` to `public/icons/aws/` as kebab-case file names
     (`AmazonRDS.svg` → `amazon-rds.svg`, `AWSLambda.svg` → `aws-lambda.svg`). It doesn't copy
     `resource/` in R1, to keep the bundle small.
  2. adds the generic set from `frontend/src/assets/icons/archflux-system-design-200/`: 200
     project-owned outline SVGs on a 24×24 viewBox using `currentColor`, in 9 categories. Copy them
     to `public/icons/generic/` as `set: "generic"`, with the categories as keywords. These icons
     *may* be tinted with the kind colour.
  3. writes `public/icons/manifest.json` per DATA_MODEL_R1 §6. The `name` is derived from the
     filename: `AmazonRDS` → "Amazon RDS" (split on case boundaries, keeping acronyms). Overrides
     live in `scripts/icon-names.json` (`{ "AmazonSimpleQueueService": "Amazon SQS" }`, …).
  4. sets `keywords` and `kinds` from `scripts/icon-kinds.json`, a hand-written map of about 40 common
     services to `ElementKind`. Examples: RDS, Aurora → database; DynamoDB → document-db;
     ElastiCache → cache; SQS → queue; Kinesis, MSK → stream; S3 → object-storage; CloudFront →
     cdn; Lambda → function; ECS, EKS, Fargate → service; API Gateway, ELB → gateway; CloudWatch →
     observability; EventBridge → scheduler; OpenSearch → search.
  5. exits non-zero when two icons share an `id` or an identical SVG content hash.
- Add `"icons:build": "node scripts/build-icon-manifest.mjs"` to `package.json`.
- Delete `public/icons/gcp/*`, `public/icons/azure/*` and `public/icons/data/*`. Update references in
  `canvas/ShapeRegistry.ts` (GCP_PACK, AZURE_PACK, DATA_PACK) so each uses the generic glyph plus
  its technology name (UI_REVAMP_SPEC §5A.6), with `iconSrc` removed.

**Tests:** `src/tests/icon-manifest.test.ts`, which reads the generated JSON:
- `it('every icon has unique id, name and existing src')`: `fs.existsSync`, resolved against
  `public/`.
- `it('no placeholder gcp/azure/data icons remain')`
- `it('rds maps to kind database')`
- `src/tests/shape-registry.test.ts`: update the expectations for the removed `iconSrc`s, and list
  them in the changelog.

**Acceptance:**
- [ ] `npm run icons:build` runs twice and the git diff is empty (deterministic, sorted output).
- [ ] `npm test` and `npm run build` pass, and the build output stays within +3 MB.

---

### R1-E05-T02 · Icon resolution and suggestions

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T01, R1-E00-T01 |

**Contract:**

```ts
// lib/icons.ts
export interface IconEntry { id: string; set: IconRef['set']; name: string; keywords: string[]; kinds: ElementKind[]; src: string; }
export async function loadIconManifest(): Promise<IconEntry[]>;      // fetch('/icons/manifest.json'), cached in module
export function resolveIcon(ref: IconRef | null | undefined, entries: IconEntry[]): IconEntry | null;
export function searchIcons(entries: IconEntry[], q: string, opts?: { set?: IconRef['set']; kind?: ElementKind; limit?: number }): IconEntry[];
// Ranking, case-insensitive: match quality first (exact > prefix/word-start > substring); within a quality, field order name > keyword > id;
// ties: official sets (aws, gcp, azure, k8s) > tech > uploaded > generic, then shorter name, then alphabetical. An empty q returns the filtered entries in manifest order.
export function parseIconManifest(json: unknown): IconEntry[]; // type-guarded; drops malformed entries
export function suggestIcons(entries: IconEntry[], kind: ElementKind, technology?: string): IconEntry[]; // ≤ 8: technology matches first (any kind; AWS group icons only for kind boundary), then the kind's icons, official before generic
```

**Change** (deferred to R1-E02-T02, which wires it): the renderers use `resolveIcon(node.iconRef)?.src ?? node.iconSrc` before falling
back to the kind glyph.

**Tests:** `src/tests/icons.test.ts`
- `it('search "postgres" ranks Amazon RDS first')`
- `it('resolveIcon returns null for unknown id')`
- `it('suggestIcons for database returns RDS/Aurora')`

---

### R1-E05-T03 · Icon picker dialog

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T02, R1-E01-T06 |
| **Sources** | UI_REVAMP_SPEC §5A.1b "Editing the icon"; UX-P1.5 |
| **Design** | Components › DisplayStyles (picker popover) |

**Change:**
- Create `components/IconPicker.tsx`, a popover dialog that uses `useFocusTrap`. It contains:
  - a search input, autofocused;
  - provider tabs: Recent · AWS · Generic · Uploaded. **Uploaded** shows an honest empty state, "Icon
    uploads arrive with workspace libraries (R2)". GCP, Azure, K8s and Technologies tabs are hidden
    until their sets exist.
  - a grid (`role="listbox"`, 4 columns, 64 px-tall tiles with a 28 px icon and a 10 px label, per DisplayStyles.dc.html; the artboard wins over the earlier "40 px") with a name tooltip. Each option's
    accessible name is the icon name. Arrow keys move through the grid and Enter picks.
  - a "No icon" option, which sets `iconRef: null`.
  - "Suggested for <kind>" as the first row.
- **Recent:** the last 12 picks, stored in `localStorage['archflux:icons:recent:v1']` (try/catch).
- **Opened from:** a click on a selected element's icon slot, "Replace icon" in the context toolbar,
  or the Inspector's Icon section.
- **Picking:** sets `iconRef`. It is one undo step (checkpoint, then `updateNode`).

**Tests:** `src/tests/icon-picker.test.tsx`
- `it('search filters by name')`
- `it('every option has an accessible name and no duplicates')`
- `it('Enter on option sets iconRef and closes')`
- `it('No icon sets null')`
- `it('Esc closes and returns focus')`

**Out of scope:** uploads. They need a workspace asset store; decision D7 in BACKLOG. The artboard's dashed "Upload" tile is omitted for the same reason. The three call sites (icon slot click, context toolbar "Replace icon", Inspector Icon section) are separate wiring in hotspot-locked files; mount `NodeIconPicker` (`components/NodeIconPicker.tsx`) there.

---

### R1-E05-T04 · Shapes panel (SC-17)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T02, R1-E02-T01 |
| **Sources** | FL-19 shape library; SC-17 |

**Read:** `design-system/components/ShapeLibrary.tsx`, `canvas/ShapeRegistry.ts`,
`screens/canvas/recentShapes.ts`.

**Change:**
- Rework `ShapeLibrary.tsx` into the "Shapes" left-dock panel, which contains:
  - a search across element kinds **and** the icon manifest;
  - sections: Recent, Elements (the 16 kinds, as generic notation), Boundaries (§5A.3), AWS
    (grouped by manifest `kinds`), Generic;
  - tiles you can drag onto the canvas or click to insert at the viewport centre;
  - a hover card with the name, provider and "Drag or press Enter to add".
- **Placing an AWS icon** creates the element with `kind` taken from the icon's first `kinds` entry
  (else `service`), `iconRef` set, `technology` = icon name, and the `displayStyle` from
  `docDefaults`.
- **Keyboard:** Tab into the grid, use the arrows, and Enter inserts.

**Panel contract (as built):** `ShapeLibrary({ entries?, viewportCenter, pageId?, docDefaults?, onInsert(node) })` is presentational; the host adds the node (the store needs an `insertNode`-style action that keeps the exact position, since `mergeGraph` shifts x and `placeShape` takes the legacy `LibraryShape`). Drag payload: MIME `text/archflux-tile`, JSON of the ArchNode to create. Provider chips show only existing sets (All, Elements, Boundaries, AWS, Generic); GCP, Azure, K8s and Team stay hidden until they exist.

**Drawer and tile layout (2026-10-26, Palette.dc.html):** the drawer is a layer above the canvas chrome
(z-index 46; minimap, View toolbar and pages bar are 44), so none of them overlaps its rows; header and search are
fixed and the body scrolls inside the drawer, so Recent, Elements, Boundaries, AWS, Kubernetes and Generic are all
reachable. Tiles are 68 px high, four per row, label 11 px / 13 px, wrapping to 2 lines then an ellipsis; each tile
has `title` = full name and keeps `aria-label` = full label.

**Tests:** `src/tests/shapes-panel.test.tsx`
- `it('search "queue" shows Queue element and Amazon SQS')`
- `it('Enter inserts element at viewport centre with iconRef')`
- `it('boundary tiles create boundary nodes')`

---

### R1-E05-T05 · Kubernetes icon set (behind decision D6)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T01; **decision D6** |

**Change:**
- Add the official Kubernetes community icons (kubernetes/community, Apache-2.0, `icons/svg/`) by
  vendoring them into `frontend/vendor/k8s-icons/` with their LICENSE.
- Extend the script to emit `set: "k8s"`, plus kinds such as pod → service, svc → gateway, ing →
  gateway and pv → object-storage.
- Show the K8s tab in the picker and the Shapes panel.

**Tests:** extend `icon-manifest.test.ts` with `it('k8s set has license entry')`.

---

### R1-E05-T06 · Remove the placeholder gcp/azure/data icons

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E05-T01, R1-E00-T03 |
| **Sources** | UX-A11; split out of R1-E05-T01 because other owners' files referenced the icons |

**Change:** remove the remaining references, then delete the folders.
- `src/data/blueprints.ts`: L14 and L74 use `/icons/data/kafka.svg`, L34 `/icons/data/redis.svg` and
  L64 `/icons/data/postgres.svg`. Drop `iconSrc`, keeping the glyph and the technology name.
- `src/screens/CanvasScreen.tsx`, or wherever E00-T03 moved it: drop the preload entries for
  `/icons/gcp/*`, `/icons/azure/*` and `/icons/data/*` (they were at L308–L313).
- `src/lib/iconRegistry.tsx` L19–L43: drop the `gcp-*`, `azure-*` and data entries that point at
  those paths.
- Run `rm -r frontend/public/icons/{gcp,azure,data}`.

**Tests:** in `src/tests/icon-manifest.test.ts`, extend
`it('no placeholder gcp/azure/data icons remain')` to also assert that the folders don't exist and
that `grep` finds no `/icons/(gcp|azure|data)/` in `src/`.

---

## Changelog

- 2026-10-26 R1-E14-T09 (owner-reported): Shapes drawer z-order and inner scrolling, and 2-line tile labels with a full-name tooltip; artboard Palette.dc.html updated first; files: `design-system/components/ShapeLibrary.tsx`, `styles.css`, `tests/shapes-panel-layout.test.tsx`.
- 2026-10-25 R1-E05-T06 re-verified: the placeholder `public/icons/gcp`, `azure` and `data` folders had reappeared on disk (tracked files restored during a session stash), which failed `icon-manifest.test.ts`. They are deleted again. No `/icons/gcp/`, `/icons/azure/` or `/icons/data/` reference remains in src, e2e or public. Test passes 3/3.
- 2026-10-25 Status reconciled (coordinator audit): R1-E05-T06 done. No gcp, azure or data icon folders remain under `public/icons/`, and no `/icons/` references point to them. `icon-manifest.test.ts` passes. The `gcp` and `azure` entries in `ShapeRegistry.ts` are emoji shape definitions, not icon files.
- 2026-10-25 R1-E05-T03 done: `components/IconPicker.tsx` (search, Recent/AWS/Generic/Uploaded tabs, suggested row, listbox with arrow keys, No icon, Esc restores focus), `lib/recentIcons.ts` (12 recents, guarded localStorage), `components/NodeIconPicker.tsx` (one undo step: checkpoint then updateNode). Tests `icon-picker.test.tsx` (8). Not yet mounted anywhere: the call sites are in Inspector/CanvasScreen/SelectionToolbars (locked).
- 2026-10-25 R1-E05-T04 done: `design-system/components/ShapeLibrary.tsx` reworked into the Shapes panel (search over 16 kinds + 13 boundaries + manifest, Recent/Elements/Boundaries/AWS-by-kind/Generic sections, click/Enter/drag insert, hover card, arrow keys), tile model in `lib/shapeTiles.ts`. Tests `shapes-panel.test.tsx` (5). Not yet mounted: needs the host wiring and a position-preserving insert action in the store (see Panel contract). The legacy `ShapeLibraryDrawer` is untouched.
- 2026-10-25 R1-E05-T02 done: lib/icons.ts (plus parseIconManifest), 7 tests; ranking rule written into the contract. Reviewed by coordinator.
- 2026-10-25 R1-E05-T01 done: 515 icons (aws 315, generic 200); deterministic generator with duplicate checks; iconSrc removed from the 22 GCP/Azure/Data pack entries; build +0.66 MB. Deleting the placeholder files moved to T06. Reviewed by coordinator.
- 2026-10-25 R1-E05-T03 done: NodeIconPicker mounted at the canvas icon slot (click on the selected icon tile), context toolbar "Replace icon" and the Inspector Icon section; files: CanvasScreen.tsx, canvas/ContextToolbar.tsx, canvas/Inspector.tsx.
- 2026-10-25 R1-E05-T04 done: ShapeLibrary mounted in the library drawer; store `insertNode(node, pos)` (one undo step); `text/archflux-tile` drop handled; files: CanvasScreen.tsx, state/store.tsx.
- 2026-10-25 R1-E05-T05 done: vendored 39 official Kubernetes icons (resources and infrastructure `unlabeled`, control-plane `labeled`; kubernetes/community@a434040a, Apache-2.0) in `frontend/vendor/k8s-icons/` with LICENSE and ATTRIBUTION.md; `build-icon-manifest.mjs` emits `set: "k8s"` (`public/icons/k8s/`, 554 icons total, manifest sets entry with licence and source); kinds pod/deploy/sts/ds/rs/kubelet → service, svc/ing/api → gateway, pv/pvc/sc/vol → object-storage, job → function, cronjob/sched → scheduler, etcd → database; Kubernetes tab in `IconPicker.tsx` and filter and section in `ShapeLibrary.tsx`, provider label in `shapeTiles.ts`. Tests: `icon-manifest.test.ts` (+2), `icons.test.ts` counts updated (515 → 554, set list).
- 2026-10-31 R1-E05-FIX-ICON-REFLECT fixed: the Inspector provider-icon grid wrote the image path into `icon` (emoji field), which the card/icon/shape renderers drew as text, and the legacy renderer read only `iconSrc`. One resolution order now everywhere (`cardIconSrc` in `canvas/render/nodes.ts`): `iconRef` (canonical, registry) then `iconSrc` then a legacy `icon` that is an image path; `icon` stays the emoji fallback for old docs, nothing is migrated. The grid writes `iconSrc` and clears `iconRef` and `icon` (its 12 curated SVGs are not in the manifest). The Inspector Icon summary names the shown icon (`iconRef` id, `iconSrc`, legacy path, or None for `iconRef: null`). Files: `canvas/render/nodes.ts`, `screens/canvas/Inspector.tsx`, test `tests/node-icon-reflect.test.tsx` (13).
- 1.0.0 (2026-10-24): epic created.
