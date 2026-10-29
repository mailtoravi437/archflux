# R1 shared contract: types, file format, schema, API

> **Version:** 1.2.1 | **Last Updated:** 2026-10-25 | **Status:** 🟡 Proposed (frozen once R1-E00 starts)
> **Part of:** [Implementation specs](README.md) | **Sources:** PRODUCT_SPEC v4.2.0 §3/§7,
> UI_REVAMP_SPEC v1.2.0 §5A, REVIEW_VERSIONING_SPEC v1.0.0 §6

Every R1 task builds against this file, so parallel agents produce code that fits together. **Change
it only in a spec-update step:** bump the version, add a changelog line, and list the tasks affected.

## 1. Principles

1. **Additive only.** Every new persisted field is optional. Old docs (localStorage `archflux:v2-light`,
   server `graph` jsonb, `.arch` v1) must still load.
2. **One normaliser.** `lib/docModel.ts → normalizeDoc(raw): DiagramDoc` is the only place that fills
   defaults and migrates legacy fields. It runs on every load path: localStorage, server, `.arch`
   import and templates.
3. **The server stores, the client understands.** The backend keeps the whole document in
   `diagrams.graph` and preserves the allow-listed keys (§4.1). It does not interpret elements in R1.
4. **IDs are stable strings.** New IDs use `${prefix}-${Date.now().toString(36)}${rand4}`, with the
   prefixes `n`, `e`, `pg`, `ly`, `fd`.

## 2. Frontend types (`frontend/src/types.ts`)

### 2.1 Element kinds (UI_REVAMP_SPEC §5A.2)

```ts
export type ElementKind =
  | 'person' | 'client' | 'external' | 'gateway' | 'service' | 'function'
  | 'database' | 'document-db' | 'cache' | 'queue' | 'stream' | 'object-storage'
  | 'search' | 'cdn' | 'scheduler' | 'observability'
  | 'boundary'      // containers (§2.3)
  | 'note';         // free annotation, not part of the model

export type DisplayStyle = 'icon' | 'card' | 'shape';
export type ElementSize = 'S' | 'M' | 'L';

export type BoundaryKind =
  | 'cloud' | 'region' | 'vpc' | 'az' | 'subnet-public' | 'subnet-private'
  | 'security-group' | 'k8s-cluster' | 'k8s-namespace' | 'c4-system' | 'trust'
  | 'frame'          // CAP-C3 named area, used by Present mode (R2) as a slide
  | 'swimlane';      // CAP-C3 lane; horizontal lanes stack, label on the left
```

Each `ElementKind` has one constant entry in `canvas/notation.ts` (created in R1-E02-T01) holding
`{ label, color, glyph, baseShape }` (sizes come from `SIZE_BOX`). The colour values come from UI_REVAMP_SPEC §5A.2
exactly.

**Legacy mapping** (in `normalizeDoc`, applied when `kind` is missing):

| Legacy `node.type` / `shape` | → `kind` | → `displayStyle` |
|---|---|---|
| `service` | `service` | `card` |
| `gateway` | `gateway` | `card` |
| `db`, or `shape === 'cylinder'` | `database` | `shape` |
| `stream` | `stream` | `shape` |
| `note` | `note` | `card` |
| `shape === 'logo'` | from type as above | `icon` |
| anything else | `service` | `card` |

### 2.2 `ArchNode` additions

```ts
export interface IconRef {
  set: 'aws' | 'gcp' | 'azure' | 'k8s' | 'tech' | 'generic' | 'uploaded';
  id: string;            // key in the icon manifest (§5), e.g. 'aws/amazon-rds'
}

export type PropertyValue = string | number | boolean | null;

export interface ArchNode {
  // …existing fields unchanged (id, type, label, tag, x, y, w, h, stroke, fill, icon, iconSrc, shape…)
  kind?: ElementKind;
  displayStyle?: DisplayStyle;      // default from doc.defaults.displayStyle, else 'card'
  size?: ElementSize;               // 'M' default; S=64×64 tile, M=200×80, L=240×120
  technology?: string;              // second line; legacy `tag` is copied here when `technology` is missing
  iconRef?: IconRef | null;         // null = "No icon"; undefined = kind's generic glyph
  properties?: Record<string, PropertyValue>; // owner, repo, slo, cost, dataClass, tier, … (§2.6)
  parentId?: string | null;         // containing boundary node id
  pageId?: string;                  // missing → first page
  layerId?: string;                 // missing → 'ly-default'
  locked?: boolean;
  z?: number;                       // stacking order within a page; higher = front
  boundaryKind?: BoundaryKind;      // only when kind === 'boundary'
  collapsed?: boolean;              // boundary collapsed to a chip
  customSize?: boolean;             // user resized freely; style switches keep w/h
  linkPageId?: string;              // CAP-C4 link to another page of the same doc
  borderDashed?: boolean;           // R1-E14-T03: Inspector Border → Dashed; the stroke width stays in strokeWidth
}
```

**Rules:**
- A node with `kind === 'boundary'` is a container. Its children are the nodes whose
  `parentId === boundary.id`. Moving a boundary moves its descendants. Nesting depth is ≤ 6.
- The parent must be on the same page. A cycle in `parentId` is invalid; `normalizeDoc` breaks it by
  clearing the child's `parentId`.
- `iconSrc` stays readable for old docs. New code writes `iconRef` and derives `iconSrc` through the
  manifest at render time.

### 2.3 `ArchEdge` additions

```ts
export type RelationshipKind = 'sync' | 'async' | 'replication' | 'bidirectional';

export interface ArchEdge {
  // …existing fields unchanged
  relKind?: RelationshipKind;       // default 'sync'; maps to line style per UI_REVAMP_SPEC §5A.4
  waypoints?: { x: number; y: number }[]; // world coords, user-placed bends
  labelPos?: number;                // 0..1 along the path, default 0.5
  step?: number | null;             // sequence badge number
  fromPort?: 'n' | 'e' | 's' | 'w' | null;
  toPort?: 'n' | 'e' | 's' | 'w' | null;
}
```

**Legacy:**
- `dashed: true` or `lineStyle: 'dashed'` → `relKind: 'async'`.
- `lineStyle: 'dotted'` → `replication`.
- `arrow: 'both'` → `bidirectional`.
- `lineStyle` keeps being written, for one release, for old clients.

### 2.4 Pages, layers and doc defaults on `DiagramDoc`

```ts
export interface Page  { id: string; name: string; order: number; }
export interface Layer { id: string; name: string; order: number; visible: boolean; locked: boolean; }

export interface DiagramDoc {
  // …existing fields unchanged
  pages?: Page[];                   // missing → [{ id: 'pg-1', name: 'Page 1', order: 0 }]
  layers?: Layer[];                 // missing → [{ id: 'ly-default', name: 'Default', order: 0, visible: true, locked: false }]
  defaults?: { displayStyle?: DisplayStyle; size?: ElementSize; propertyLine?: string }; // propertyLine = property key shown on cards
  folderId?: string | null;         // server folders (§4.2)
  starred?: boolean;                // per user; from server list, not persisted in graph
  schemaVersion?: 2;                // set by normalizeDoc
}
```

- Strokes and texts gain optional `pageId?` and `layerId?`, with the same defaults.
- The **active page** is UI state (`activePageId`, held in the UI context), not document data.
- The **undo snapshot** becomes `{nodes, edges, strokes, texts, pages, layers}` (R1-E00-T04).

### 2.5 `normalizeDoc` contract (`frontend/src/lib/docModel.ts`)

```ts
export const DOC_SCHEMA_VERSION = 2;
export function normalizeDoc(raw: unknown): DiagramDoc | null;    // null if not a doc at all
export function normalizeNode(n: ArchNode, doc: DiagramDoc): ArchNode;
export function normalizeEdge(e: ArchEdge): ArchEdge;
export function defaultPage(): Page;
export function defaultLayer(): Layer;
export function newId(prefix: 'n' | 'e' | 'pg' | 'ly' | 'fd'): string;
```

**Normalisation rules** (as built in R1-E00-T01):
- **Kinds:** an invalid `kind` is treated as missing and re-derived from the legacy table.
  `shape === 'logo'` forces `displayStyle: 'icon'`, and it wins over any other legacy hint.
- **Sizes:** an invalid `size` becomes `'M'`; a missing `size` stays missing.
- **`relKind` precedence:** dotted → `replication`, then dashed → `async`, then `arrow: 'both'` →
  `bidirectional`, else `sync`. An invalid `relKind` is re-derived the same way.
- **Pages and layers:** a `pages` or `layers` array with no valid entries falls back to the
  default.
- **Doc fields:** a missing `id` becomes `''`, a missing `title` becomes `'untitled.arch'`, and
  missing timestamps become `0`.
- **Parents:** self-parenting is dropped. In a cycle, the link that closes the loop is cleared.
- **`.arch` import** keeps a type-checked allow-list of node and edge fields: the R1 fields plus the
  legacy `shape`, `fill`, `strokeWidth`, `dashed`, `lineStyle` and `arrow`. Every other key is
  dropped.

The function must be **idempotent**: `normalizeDoc(normalizeDoc(x))` deep-equals `normalizeDoc(x)`.
The tests in `src/tests/doc-model.test.ts` include a v1 fixture for each legacy row in §2.1/§2.3.

### 2.6 Standard properties (CAP-M1)

| Key | Type | Label | Shown in card property line |
|---|---|---|---|
| `owner` | string | Owner | yes (default choice) |
| `repo` | string (URL) | Repository | no |
| `slo` | string | SLO | yes |
| `cost` | number (USD/month) | Cost | yes |
| `dataClass` | `'public' \| 'internal' \| 'confidential' \| 'restricted'` | Data class | yes |
| `tier` | `'1' \| '2' \| '3'` | Tier | yes |
| `runtime` | string | Runtime | no |

- Custom keys are allowed: lowercase camelCase, ≤ 32 characters, ≤ 30 per element, values ≤ 500
  characters.
- Legacy `port`, `repo` and `source` fields stay where they are and also appear in the inspector.

## 3. `.arch` file format v2 (`lib/archFormat.ts`)

- `SUPPORTED_ARCH_VERSION` becomes `2`. Export writes
  `{ app: 'ArchFlux', version: 2, spec, nodes, edges, strokes, texts, pages, layers, defaults, metadata }`.
- Import accepts versions 1 and 2. A v1 import is run through `normalizeDoc`. A version above 2 is
  still a warning, as it is today.
- `ARCH_LIMITS` are unchanged. Add `pages ≤ 50` and `layers ≤ 20`.

## 4. Backend

### 4.1 Graph key allow-list (R1-E00-T06)

`JsonCanonicals.canonicalGraph` currently keeps only `nodes`, `edges`, `strokes` and `texts`, and
**drops everything else**. R1 widens it:

- **Arrays:** `nodes`, `edges`, `strokes`, `texts`, `pages`, `layers`.
- **Objects:** `defaults`.
- **Scalars:** `schemaVersion`.
- Any other key is still dropped, so unbounded data can't be stored.

Validation adds two checks: `pages` and `layers` must be arrays (422 otherwise), and the
`PayloadLimitFilter` size limit is unchanged.

`DiagramService.toJson` also returns `pages`, `layers`, `defaults` and `schemaVersion` at the top
level, alongside `nodes` and `edges`.

### 4.2 Folders, stars, trash: `V10__folders_trash.sql` (R1-E06)

```sql
folders(id uuid pk, workspace_id uuid not null fk→workspaces on delete cascade,
        parent_id uuid null fk→folders on delete cascade, name text not null check (length(name) between 1 and 120),
        created_by uuid fk→users, created_at timestamptz default now(), deleted_at timestamptz null)
  unique (workspace_id, COALESCE(parent_id, nil-uuid), lower(name)) where deleted_at is null   -- COALESCE so same-named root folders collide
diagrams.folder_id uuid null fk→folders on delete set null               -- new column
diagram_stars(user_id uuid fk→users on delete cascade, diagram_id uuid fk→diagrams on delete cascade,
              created_at timestamptz default now(), primary key (user_id, diagram_id))
indexes: folders(workspace_id, parent_id), diagrams(workspace_id, folder_id) where deleted_at is null
```

- **Trash** uses the existing `diagrams.deleted_at` column, plus `folders.deleted_at`.
- `DiagramService.delete` becomes a **soft delete**: it sets `deleted_at` and audits `diagram.trash`.
  List and get exclude trashed rows. Getting a trashed diagram returns 404, except through the trash
  endpoints.
- **Purge:** a scheduled job hard-deletes rows with `deleted_at < now() - retention`. Retention is 30
  days, or 90 when `workspaces.plan = 'team'`. It audits `diagram.purge` / `folder.purge`.
  - The job calls the `SECURITY DEFINER` function `purge_expired_trash(now, limit)`. Under RLS, a
    scheduler with no request identity sees no rows.
  - The function deletes only rows that are expired and trashed.
- **RLS:** V10 adds the permissive `diagrams_workspace_member` policy
  (`is_workspace_member(workspace_id, current_user_id())`). It is needed because V3's `diagrams_owner`
  requires `deleted_at IS NULL`, which would block soft delete under the app role. As a result,
  workspace members can read and write their workspace's diagrams at the DB level, which matches the
  service layer. The service layer hides trashed rows.
- **Audit names:** trash-restore is `diagram.untrash`, because `diagram.restore` is already used for
  checkpoint restore.

**Error codes** use UPPER_SNAKE, like the existing `VERSION_CONFLICT`: `FOLDER_NAME_TAKEN`,
`TITLE_MISMATCH`, and later `LIMIT_REACHED`, `LAST_OWNER`, `LAST_ADMIN`, `PUBLIC_LINKS_DISABLED`,
`USER_NOT_FOUND`. Lower-case codes elsewhere in this file mean the same UPPER_SNAKE values.

### 4.3 Sharing and access: `V11__sharing.sql` (R1-E07)

```sql
diagram_members(diagram_id uuid fk→diagrams on delete cascade, user_id uuid fk→users on delete cascade,
                role text not null check (role in ('owner','editor','commenter','viewer')),
                added_by uuid fk→users, created_at timestamptz default now(), primary key (diagram_id, user_id))
share_links(id uuid pk, diagram_id uuid fk→diagrams on delete cascade, workspace_id uuid not null,
            token_hash text not null unique,        -- SHA-256 of the random token; token shown once
            role text not null check (role in ('viewer','commenter')),
            audience text not null check (audience in ('workspace','anyone')),
            expires_at timestamptz null, revoked_at timestamptz null,
            created_by uuid fk→users, created_at timestamptz default now())
access_requests(id uuid pk, diagram_id uuid fk→diagrams on delete cascade, requester_id uuid fk→users,
                role text not null check (role in ('editor','commenter','viewer')), note text null check (length(note) <= 500),
                status text not null default 'pending' check (status in ('pending','approved','denied')),
                decided_by uuid null, decided_at timestamptz null, created_at timestamptz default now())
  unique (diagram_id, requester_id) where status = 'pending'
workspaces.public_links_allowed boolean not null default true   -- admin policy for audience 'anyone'
```

**Effective role** is the highest of the following:
1. The creator is the `owner`. On first V11 run, backfill `diagram_members(owner)` from
   `diagrams.owner_id`.
2. The explicit `diagram_members` row.
3. The workspace role mapped as `admin` → `owner`, `editor` → `editor`, `reviewer` → `commenter`,
   `viewer` → `viewer`.
4. A valid share link presented in the `X-Share-Token` header. It grants only the link's role.

**Permission matrix:**

| Action | owner | editor | commenter | viewer |
|---|---|---|---|---|
| View, export | ✓ | ✓ | ✓ | ✓ |
| Comment | ✓ | ✓ | ✓ | — |
| Edit content, rename | ✓ | ✓ | — | — |
| Share, change roles, links | ✓ | editors may invite ≤ editor | — | — |
| Trash, restore | ✓ | ✓ | — | — |
| Delete forever | ✓ (and workspace admin) | — | — | — |

### 4.4 Workspace invites and limits: `V12__workspace_invites.sql` (R1-E11)

```sql
workspace_invites(id uuid pk, workspace_id uuid fk→workspaces on delete cascade, email text not null,
                  role text not null check (role in ('admin','editor','reviewer','viewer')),
                  token_hash text not null unique, invited_by uuid fk→users,
                  expires_at timestamptz not null, accepted_at timestamptz null, revoked_at timestamptz null,
                  created_at timestamptz default now())
  unique (workspace_id, lower(email)) where accepted_at is null and revoked_at is null
workspaces.slug text null unique                                 -- URL name, ^[a-z0-9-]{3,40}$
workspaces.join_policy text not null default 'invite' check (join_policy in ('invite','request','auto'))
workspaces.domain text null                                      -- verified email domain (auto-join)
```

**Limits** are computed, not stored, and live in a `PlanLimits` record in `service/PlanService.java`.
`workspaces.plan` already exists.

| Limit | free | team | enterprise |
|---|---|---|---|
| `cloudDiagrams` | 3 | ∞ | ∞ |
| `editors` | 3 | ∞ (paid seats) | ∞ |
| `historyDays` | 30 | 365 | ∞ |
| `proposals` | false | true | true |
| `connectors` | 0 | 2 | ∞ |

- An over-limit **create** returns **402** with the body
  `{"error":{"code":"LIMIT_REACHED","limit":"cloudDiagrams","current":3,"max":3}}`.
- Reads, updates of existing diagrams, exports and deletes are **never** limited.
- The client keeps the 4th diagram local and shows SC-54.

### 4.5 Product events: `V13__product_events.sql` (R1-E12)

```sql
product_events(id bigserial pk, workspace_id uuid null, user_id uuid null, name text not null
               check (name ~ '^[a-z]+(_[a-z]+)+$'), props jsonb not null default '{}',
               created_at timestamptz default now())
  index (name, created_at)
```

- The allowed event names are the `EventName` union in `frontend/src/lib/analytics.ts`
  (R1-E12-T03), a subset of PRODUCT_SPEC §7A "Instrumentation plan". The server mirrors it in one
  `Set`.
- `props` values must be enums or numbers. The server rejects strings longer than 40 characters, so
  diagram content can't leak.
- Events are **opt-out** per workspace (`workspaces.analytics_enabled boolean default true`, also
  added in V13).

### 4.5b Named versions: `V14__named_versions.sql` (R1-E08)

```sql
diagram_revisions.name text null check (length(name) <= 80)
diagram_revisions.description text null check (length(description) <= 2000)
-- widen the source check (V7 chk_revisions_source) to add 'revert':
ALTER TABLE diagram_revisions DROP CONSTRAINT IF EXISTS chk_revisions_source;
ALTER TABLE diagram_revisions ADD CONSTRAINT chk_revisions_source
  CHECK (source IN ('manual','import','sync','webhook','backfill','restore','revert'));
index diagram_revisions(diagram_id) where name is not null
```

- In R1, legacy `checkpoints` are listed in the timeline as named versions (read-only, with the
  label "Checkpoint"). New names go on revisions.
- The full checkpoint → version migration is R2 (REVIEW_VERSIONING_SPEC §6).

### 4.6 Migration numbering

| Number | Epic | Owner task |
|---|---|---|
| V10 | Folders, stars, trash | R1-E06-T01 |
| V11 | Sharing and access | R1-E07-T01 |
| V12 | Workspace invites, slug, join policy | R1-E11-T01 |
| V13 | Product events, analytics flag | R1-E12-T04 |
| V14 | Named versions, revert source | R1-E08-T02 |
| V15 | RLS role hardening | R1-E07-T07 |
| V16 | Fix V15 diagram INSERT policies (`workspace_role_at_least`) | R1-E07-T07 |
| V17 | Revision label UPDATE policy tightened to EDITOR+ (V14 runs before `diagram_role_at_least` exists) | R1-E08-T02 |
| V18 | Invitee can read the invited workspace (`has_pending_workspace_invite`, policy `workspaces_invitee_read`) plus EXECUTE grants (R1-BUG-06) | R1-BUG-06 |
| V19 | `workspace_editor_seat_count(ws)` SECURITY DEFINER: editor seat count for members and live invitees only (NULL otherwise), so the plan limit holds on invite accept under `archflux_app`; EXECUTE granted to `archflux_app` and `app_tester` when present (R1-BUG-08) | R1-BUG-08 |

If two tasks need a migration at the same time, they take the numbers above in order. Never renumber
a migration once it is merged.

## 5. API contract (R1 additions, all under `/api/v1`, all `{"data": …}` responses)

**Workspace context:**
- Requests may send `X-Workspace-ID: <uuid>`. The server validates membership: not a member returns
  404.
- Without the header, the server uses the caller's personal workspace, which is today's behaviour.
- The frontend stores the selected workspace in `archflux:workspace:v1`, and `lib/api.ts` adds the
  header (R1-E11-T03).

| Method and path | Body / query | Response | Errors | Task |
|---|---|---|---|---|
| `GET /diagrams` | add `folderId`, `starred=true`, `trashed=true`, `sort=updated\|title` | adds `folderId`, `starred`, `deletedAt`, `role` per item | — | E06-T02 |
| `DELETE /diagrams/{id}` | — | 204 (moves to trash) | 404, 403 | E06-T02 |
| `POST /diagrams/{id}/restore` | — | diagram plus `restoredTo: 'root'\|'folder'` | 404 (not in trash) | E06-T02 |
| `DELETE /diagrams/{id}/purge` | `{"confirmTitle": "…"}` | 204 | 404 (not trashed), 403 (not owner/admin), 422 `TITLE_MISMATCH` | E06-T02 |
| `PUT /diagrams/{id}/star` / `DELETE …/star` | — | 204 | 404 | E06-T02 |
| `PATCH /diagrams/{id}` | `{"folderId": uuid\|null}` | diagram | 404, 422 (folder in another workspace) | E06-T02 |
| `GET/POST /folders` (`?trashed=true` lists trashed), `PATCH/DELETE /folders/{id}`, `POST /folders/{id}/restore` | `{name, parentId}`; PATCH takes either (explicit `parentId: null` = root) | folder `{id,name,parentId,createdAt,deletedAt}` | 409 `FOLDER_NAME_TAKEN`, 422 (depth > 5, move into own subtree, parent in another workspace / trashed / missing, all with the same message) | E06-T01 |
| `GET /diagrams/{id}/members` | — | `[{userId,email,name,role}]` | 404 | E07-T02 |
| `PUT /diagrams/{id}/members/{userId}` | `{"role": …}` / by email `POST /diagrams/{id}/members {"email","role"}` | member | 403, 422 | E07-T02 |
| `DELETE /diagrams/{id}/members/{userId}` | — | 204 | 403, 409 (last owner) | E07-T02 |
| `POST /diagrams/{id}/links` | `{role, audience, expiresAt}` | `{id, url, token}` (token **only here**) | 403 | E07-T03 |
| `GET /diagrams/{id}/links`, `DELETE /diagrams/{id}/links/{linkId}` | — | links without token | 403 | E07-T03 |
| `POST /diagrams/{id}/access-requests` | `{role, note}` | request | 409 (pending exists) | E07-T04 |
| `GET /access-requests?status=pending`, `POST /access-requests/{id}/approve\|deny` | — | request | 403 | E07-T04 |
| `GET /diagrams/{id}/access` | — | `{state: 'ok'\|'request'\|'expired'\|'trashed'\|'not_found', role?, title?, ownerName?}` | never 404 (state carries it) | E07-T04 |
| `GET/POST /workspaces/current/invites`, `DELETE …/invites/{id}`, `POST /invites/{token}/accept` | `{email, role}` | invite | 402 (seat limit), 409 | E11-T01 |
| `GET /workspaces/current` / `PATCH` | `{name, slug, joinPolicy}` | `{id,name,slug,plan,joinPolicy,limits,usage}` | 403 (non-admin), 409 (slug taken) | E11-T01 |
| `GET /workspaces/current/members`, `PATCH …/members/{userId}`, `DELETE` | `{role}` | member | 403, 409 (last admin) | E11-T02 |
| `GET /diagrams/{id}/revisions` | add `named=true` | items add `name`, `description`, `authorName` | — | E08-T02 |
| `PATCH /diagrams/{id}/revisions/{revId}` | `{name, description}` (name null = unname) | revision | 403 (< editor), 422 | E08-T02 |
| `POST /diagrams/{id}/revisions/{revId}/restore` | — | diagram (new revision `source=restore`, `message="Restored <name or short id>"`) | 403, 404 | E08-T02 |
| `PUT /diagrams/{id}` | add optional `source: 'manual'\|'revert'\|'import'` (default manual) | unchanged | 422 (other values) | E08-T02 |
| `POST /events` | `{name, props}` (batch: `{events:[…]}` ≤ 50) | 202 | 422 (unknown name / bad props) | E12-T04 |

Security notes for `GET /diagrams/{id}/access`:
- For `request`, it reveals the title and owner only when the caller presents a valid link or is in
  the same workspace.
- Otherwise it returns `not_found`. FL-15 requires this, so a 404 never confirms that a diagram
  exists.

## 6. Icon manifest (R1-E05)

`frontend/public/icons/manifest.json` is generated by `frontend/scripts/build-icon-manifest.mjs` and
committed.

```json
{
  "version": 1,
  "sets": {
    "aws":     { "label": "AWS",          "license": "AWS Architecture Icons terms", "source": "npm:aws-icons@3" },
    "k8s":     { "label": "Kubernetes",   "license": "Apache-2.0 (kubernetes/community icons)", "source": "…" },
    "generic": { "label": "Generic",      "license": "project", "source": "repo" }
  },
  "icons": [
    { "id": "aws/amazon-rds", "set": "aws", "name": "Amazon RDS", "keywords": ["database","postgres","mysql"],
      "kinds": ["database"], "src": "/icons/aws/amazon-rds.svg" }
  ]
}
```

- **Ids** are `<set>/<kebab-case of the source file name>`, for example `aws/amazon-rds`. Ids can be
  awkward for glued source names (`aws/privatesubnet`), but they are stable, and the display `name`
  comes from `frontend/scripts/icon-names.json`.
- The mapping files are `frontend/scripts/icon-names.json` and `icon-kinds.json`. `icon-kinds.json`
  may key both AWS (`<SourceName>`) and generic (`generic/<file>`) icons. The script fails when a
  key in either file matches no icon.
- The generic set has **9** categories: compute, storage, database, network, messaging, security,
  observability, architecture and data-flow.
- Every icon has a unique `id`, a human `name` (used as the accessible name and tooltip) and an `src`
  under `public/icons/`.
- No duplicates by `src` hash. The script fails on duplicates.
- A set may ship only with a license entry. **GCP and Azure stay out until their official assets are
  added** (decision D6 in BACKLOG).

## 7. Changelog

- **1.2.0 (2026-10-25):** §4.2 as built (COALESCE unique index, purge function, `diagrams_workspace_member` RLS, `diagram.untrash`); UPPER_SNAKE error codes; §5 folder and trash rows updated. Affected: E06-T03…T05, E07, E11.
- **1.1.0 (2026-10-25):** fixed the `.arch` app id (`'ArchFlux'`), the tag→technology rule and the normalisation precedence (§2.5); added icon id and mapping-file rules (§6). Affected: E00-T01, T05, E05-T01, E05-T02.
- **1.0.0 (2026-10-24):** First version. Element kinds, display styles, containers, pages/layers,
  relationships, `.arch` v2, V10–V13, R1 API, icon manifest.
