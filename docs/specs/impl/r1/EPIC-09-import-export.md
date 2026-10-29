# EPIC-09 · Import (draw.io, Mermaid) and the export dialog

> **Version:** 1.0.0 | **Release:** R1 | **Wave:** 2 | **Sources:** CAP-I2 (R1 part), CAP-E1; FL-3; SC-10, SC-39;
> PRODUCT_SPEC Q3
> **Design:** "2 Start & library" › ImportMap; "7 Present, export & AI" › Export

Importers are **pure** functions in `lib/import/*.ts` that return an `ImportResult`. They never touch
the store. The mapping preview (T03) shows the result, and the user confirms it before anything is
created.

```ts
// lib/import/types.ts
export interface ImportWarning { code: string; message: string; sourceRef?: string; }
export interface ImportResult {
  ok: boolean; format: 'drawio' | 'mermaid' | 'arch';
  doc?: Pick<DiagramDoc, 'title' | 'nodes' | 'edges' | 'texts' | 'pages' | 'layers'>;  // already normalised (normalizeDoc)
  stats: { pages: number; nodes: number; edges: number; boundaries: number; skipped: number };  // nodes excludes boundaries
  warnings: ImportWarning[]; error?: string;
}
export const IMPORT_LIMITS = { bytes: 5_000_000, nodes: 5000, edges: 10000, pages: 50 };
```

---

### R1-E09-T01 · draw.io importer

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |

**Contract:**

```ts
export type IconLookup = (manifestId: string) => readonly string[] | undefined;   // kinds if the id is in the manifest
export function importDrawio(xml: string, fileName: string, options?: { iconLookup?: IconLookup; inflateRaw?: (b: Uint8Array) => Uint8Array }): Promise<ImportResult>;
// default lookup = built-in table checked against manifest by test; the ImportDialog (T03) passes createManifestLookup(manifest)
```

**Format facts:**
- The root is `<mxfile><diagram name="…">…</diagram>…</mxfile>`. Each `<diagram>` is one **page**.
- The diagram body is either a plain `<mxGraphModel>` or a **compressed** string: base64, then raw
  DEFLATE (no zlib header), then URI-encoded XML. Decode it with
  `DecompressionStream('deflate-raw')`. That is available in browsers and Node 18+; jsdom tests run
  in Node, so use the `node:zlib` `inflateRawSync` fallback behind a feature check.
- `<mxCell vertex="1" style="…" value="…" parent="…"><mxGeometry x y width height/></mxCell>`
  describes a vertex.
- `edge="1" source="" target=""` describes an edge. Bends are in
  `<mxGeometry><Array as="points"><mxPoint x y/>`.
- `style` is `key=value;` pairs. Use `shape=` and the `mxgraph.aws4.*` resource names.

**Mapping:**

| draw.io | → ArchFlux |
|---|---|
| `shape=cylinder*` / `mxgraph.flowchart.database` | kind `database`, style `shape` |
| `mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.<svc>` / `shape=mxgraph.aws4.<svc>` | kind from `scripts/icon-kinds.json` lookup, `iconRef` aws/<svc> if in manifest, style `icon` |
| `mxgraph.aws4.group*` / `grIcon=…vpc` (draw.io's real key; `groupIcon` also accepted) / `swimlane` / container=1 | `boundary` with `boundaryKind` (vpc, region, subnet-*, cloud; swimlane → swimlane; else c4-system) |
| `ellipse` with a short label, `actor` / `umlActor` | `person` |
| `text` cells (`text;`) | `FreeText` |
| other vertices | `service` / `card` with `fill` / `stroke` from `fillColor` / `strokeColor` |
| `dashed=1` edge | `relKind: 'async'` (dashed and both arrows: async plus `arrow: 'both'`) |
| `endArrow=none;startArrow=none` | `arrow: 'none'` |
| `startArrow` and `endArrow` set | `bidirectional` |

- `value` may contain HTML. Strip the tags (DOMParser), decode the entities and keep the line
  breaks. A `<br>` splits the name from the technology (the first line becomes the name).
- Child coordinates are relative to the parent in draw.io. Convert them to absolute world
  coordinates and set `parentId`.
- Anything unsupported (images, tables, custom stencils) is skipped and produces a warning with the
  cell id.

**Tests:** `src/tests/import-drawio.test.ts`, with fixtures in `src/tests/fixtures/drawio/`. Write
the fixtures by hand (small) and **commit** them:
- `it('reads an uncompressed two-page file')`
- `it('reads a compressed diagram')`
- `it('maps cylinder to database')`
- `it('maps aws4 rds to iconRef aws/amazon-rds')`
- `it('converts relative child coords and sets parentId')`
- `it('strips HTML labels; <br> splits name/technology')`
- `it('warns on unsupported image cells')`
- `it('rejects files over IMPORT_LIMITS.bytes')`

---

### R1-E09-T02 · Mermaid flowchart importer

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E00-T01 |

**Contract:**

```ts
export function importMermaid(src: string, fileName: string): ImportResult;   // sync, no dependencies
```

**Supported subset** (anything else produces a warning, never a crash):
- The header `flowchart` or `graph` with a direction `TD`/`TB`/`LR`/`RL`/`BT`.
- **Nodes:** `A`, `A[Text]` (service), `A[(Text)]` (database), `A((Text))` (service, round),
  `A>Text]` (note), `A{Text}` (gateway), `A[/Text/]` (queue), `A[[Text]]` (service).
- **Edges:** `-->`, `---`, `-.->` (async), `==>` (sync; ArchEdge has no weight, so bold is not kept), `<-->` (bidirectional), with labels
  `-->|label|` and `-- label -->`. Chains (`A --> B --> C`) and `&` (`A & B --> C`) are supported.
- `subgraph id [Title] … end` becomes a boundary (`c4-system`); nested subgraphs are allowed.
- `%%` comments are ignored silently. `classDef`, `class`, `style`, `linkStyle` and `:::cls` are
  ignored with a single `styles_ignored` warning.
- Also accepted: `A(Text)`, `A([Text])`, `A{{Text}}`, `A(((Text)))`, `A[\Text\]`, `-.-`, `===`,
  `<-.->`, `;` separators and YAML front matter.
- **Layout:** Mermaid has no coordinates, so run the existing layered layout (`applyLayout`, defined in
  `store.tsx` around L1265). Extract its pure part into `lib/layout.ts` as
  `layeredLayout(nodes, edges, dir, options?: { rankGap; nodeGap; originX; originY }): ArchNode[]`, which terminates on cycles (depth capped at n−1), and have the store call the extracted function so
  behaviour is unchanged. Use the direction from the Mermaid header. Boundaries are fitted around their children (`fitBoundary`).

**Tests:** `src/tests/import-mermaid.test.ts`
- `it('parses node shapes to kinds')`
- `it('parses chained and & edges with labels')`
- `it('dotted arrow is async')`
- `it('subgraph becomes boundary with children')`
- `it('LR layout increases x along edges')`
- `it('unknown statement yields warning, not error')`

---

### R1-E09-T03 · Import mapping preview (SC-10)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E09-T01, R1-E09-T02 |
| **Design** | 2 Start & library › ImportMap |

**Change:**
- Create `components/import/ImportDialog.tsx`. It opens from "Import" in the ⋯ menu, from the New
  diagram dialog (E10-T02), or when a file is dropped on the Library or the canvas.
- **Step 1:** pick a file or paste text. Detect the format from the extension (`.drawio`, `.xml`,
  `.mmd`, `.arch`), then from the content (`<mxfile`, `flowchart`/`graph`, JSON `app: 'archflux'`).
- **Step 2:** the preview. It shows:
  - the stats ("2 pages · 34 elements · 41 connections · 3 boundaries · 2 skipped");
  - a mini canvas preview of page 1 using the real renderer at fit zoom;
  - a mapping table of source shape → kind (editable per source style group: "All cylinder
    shapes → Database ▾");
  - the warnings, expandable, with counts.
- **Step 3:** "Import as new diagram" or "Add to this diagram" (as a new page). This creates the
  doc through store actions and is one undo step for "add to this".
- **Source style groups (clarified 2026-10-25):** importers do not keep the raw source style, so the mapping
  table groups elements by (importer kind, display style), e.g. "All cylinder shapes" (database, shape).
  Remapping a group sets `kind` (and legacy `type`) on all its elements. The artboard's per-shape rows,
  Confidence and Include columns are not built (no per-element source data); the table shows an element
  count instead. The preview is an SVG of the real imported nodes of page 1 at fit zoom.
- **Store:** `importDocument(doc, 'new' | 'page')` in the docs context; 'page' uses
  `pageOps.appendImported` (ids regenerated, one undo step).
- **Entry points (clarified 2026-10-25):** the app bar ⋯ overflow was removed by R1-E14-T01, so the dialog
  opens from the command palette ("Import a diagram…", `AppShell`), the Library "Import .arch" button and
  its empty state, and a file dropped on the Library (`.arch .json .drawio .xml .mmd`). The New diagram
  dialog (E10-T02) and drop on the canvas are wired by their own tasks (`CanvasScreen` has a different owner).
- **Errors:** "We couldn't read this file — <error>". The dialog stays open with "Choose another
  file". No partial import happens.

**Tests:** `src/tests/import-dialog.test.tsx`
- `it('detects mermaid from pasted text')`
- `it('shows stats and warnings')`
- `it('remapping cylinder group to cache changes kinds')`
- `it('import as new creates doc and opens it')`
- `it('invalid file shows error and creates nothing')`

---

### R1-E09-T04 · Export dialog (SC-39)

| | |
|---|---|
| **Size** | M |
| **Role** | frontend-implementer |
| **Depends on** | R1-E03-T04 |
| **Design** | 7 Present, export & AI › Export |

**Read:** `canvas/export/ExportPipeline.ts`, `src/tests/export-pipeline.test.ts`, and the current
export menu items in `AppShell.tsx` / `store.tsx` (grep `exportResolution`, `embedMetadata`).

**Change:**
- Create `components/export/ExportDialog.tsx` with these controls:
  - **Format:** PNG · SVG · PDF (print) · .arch · CSV.
  - **Scope:** Current page · All pages (PDF and .arch only) · Selection.
  - **Scale:** 1× · 2× · 3× (PNG).
  - **Background:** Theme · White · Transparent (PNG/SVG).
  - **Include:** Hidden layers, Comments pins, Metadata (the existing `embedMetadata` setting).
  - A live size estimate ("≈ 2400×1350 px").
- `ExportPipeline` gains `scope` and `includeHiddenLayers` options and filters by page and layer. Its `.arch` path must pass `pages`, `layers` and `defaults` to `buildArchExport` (it currently omits them; found in the R1-E00-T05 review).
- "All pages" for PDF builds one print page per page.
- The ⋯ menu "Export…" opens the dialog. The old individual items remain as shortcuts for one
  release.

**Tests:** `src/tests/export-dialog.test.tsx`
- `it('selection scope exports only selected nodes')`
- `it('hidden layers excluded unless opted in')`
- `it('all pages PDF produces one section per page')`
- `it('transparent background omits bg rect in SVG')`

---

### R1-E09-T05 · Store layout uses `lib/layout.ts` (fixes R1-BUG-03)

| | |
|---|---|
| **Size** | S |
| **Role** | frontend-implementer |
| **Depends on** | R1-E09-T02 |

**Goal:** remove the duplicate layout code, and stop `applyLayout('dag')` from hanging on cyclic
graphs. A→B→A currently never terminates.

**Change:** in `state/store.tsx`, the `applyLayout` dag branch calls
`layeredLayout(nodes, edgesRef.current, 'LR')` and deletes its inline copy. Output for acyclic graphs
stays identical; `import-mermaid.test.ts` already asserts the equivalence.

**Tests:** `src/tests/layout-store.test.tsx`
- `it('dag layout on a cycle terminates')`
- `it('dag layout output unchanged for acyclic sample')`

---

## Changelog
- 2026-10-25 R1-E09-T04 review: components/export/ExportDialog.tsx (format PNG/SVG/PDF print/.arch/CSV, scope selection/page/all, PNG scale 1-3x, background, hidden layers, metadata, size estimate, real SVG preview), lib/exportScope.ts, ExportPipeline gains `scope`/`pageId`/`selectedIds`/`includeHiddenLayers`/`embedMetadata`, `.arch` now passes pages/layers/defaults, `buildPrintSections` (one print section per page). Tests export-dialog.test.tsx (7). Not mounted: AppShell ⋯ "Export…" must render `<ExportDialog doc selectedIds activePageId isDark embedMetadata onClose />` (selection and active page come from the canvas). Deviations from the artboard, on purpose: no Publish and embed tab, no "Live image for READMEs", and no Mermaid/draw.io/Visio/Markdown tiles (not implemented); Comments pins option omitted (no pin data on the doc). R1-E03-T04 (page bar) is still todo, so "This page" uses the first page unless the caller passes `activePageId`.
- 2026-10-25 R1-E09-T03 done (mounted): ImportDialog mounted in AppShell (palette `file.import`) and DashboardScreen (Import button, empty-state button, file drop); the old .arch-only hidden inputs and inline ImportWarnings path were replaced; new test `import-entry-points.test.tsx` (2). Not wired: New diagram dialog tab (E10-T02), canvas drop.
- 2026-10-25 R1-E09-T05 done: Store layout uses lib/layout.ts (fixes R1-BUG-03). `applyLayout('dag')` now delegates to `layeredLayout(nodes, edges, 'LR')` with cycle cap (maxDepth = n-1), removing the inline duplicate that hung on A→B→A. Output for acyclic graphs unchanged; `import-mermaid.test.ts` asserts equivalence. New test: `layout-store.test.tsx`. Reviewed by coordinator.
- 2026-10-28 R1-BUG-03 fixed (frontend-implementer): the T05 cap (maxDepth = n-1) stopped the hang but mis-ranked cyclic graphs (a source then a cycle A⇄B placed A and B at depth 5 in the new test). `layerDepths` in lib/layout.ts now breaks cycles by dropping DFS back edges (roots: sources in node order, then unvisited nodes; edges in input order) and relaxes longest paths on the remaining DAG; acyclic output unchanged. New tests: src/tests/layout-cycles.test.ts (3); layout-store and import-mermaid still pass.
- 2026-10-25 R1-E09-T01 done: lib/import/{types,shared,drawio,drawioIcons}.ts, 2 fixtures, 11 tests. Reviewed by coordinator.
- 2026-10-25 R1-E09-T02 done: lib/import/mermaid.ts and lib/layout.ts (a copy of the store dag layout with a cycle cap), 9 tests. The store switch and cycle-hang fix are in T05. Reviewed by coordinator.
- 2026-10-25 R1-E09-T03 done: ImportDialog (3 steps), lib/import/mapping.ts (detect, runImport, groups, applyKindMap), store `importDocument`, `pageOps.appendImported`; 6 tests in import-dialog.test.tsx. Extra files: state/ops/pages.ts, state/store.tsx (listed for the store action). Not wired to menus yet; design:shots could not run (canvas broken by in-flight render edits, dialog not mounted).
- 1.0.0 (2026-10-24): epic created.
