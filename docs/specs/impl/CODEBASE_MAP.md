# Codebase map

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Part of:** [Implementation specs](README.md)

This is where things live, written so an agent can find the right file without reading the whole
repo. Line counts are from 2026-10-24. Files over 1,000 lines are **hotspots**: read only the range a
task names.

## 1. Repo layout

```
AGENTS.md                 agent contract (read first)
SPEC.md                   master spec index
docs/specs/               product, design, frontend, backend, services specs
docs/specs/impl/          implementation specs (this folder): backlog, epics, tasks, contracts
docs/agents/              role playbooks for AI agents
frontend/                 React 19 + Vite + TypeScript SPA (archflux-web)
backend/                  Spring Boot 3.5, Java 21, PostgreSQL 17, Redis 7 (archflux-api)
deploy/aws/               CloudFormation + compose + Caddy for AWS
.github/workflows/        frontend-ci, backend-ci, frontend-deploy, backend-deploy
```

## 2. Frontend (`frontend/src`)

### 2.1 Entry and routing
| File | What |
|---|---|
| `main.tsx` | Bootstraps the theme and `DiagramProvider`, then the router |
| `App.tsx` | `routes` (and `createAppRouter()` → `createBrowserRouter`): `/login`, `/onboarding`, `/auth/callback`, and the `/` shell with `dashboard`, `canvas`, `living`, `reviews`, `blueprints`, `settings/*`. Screens are `lazy()` and wrapped in `withFallback` |
| `app/RequireSession.tsx`, `app/IndexRoute.tsx`, `app/RouteErrorBoundary.tsx`, `app/withFallback.tsx` | Route guards and fallbacks |

### 2.2 State
| File | Lines | What |
|---|---|---|
| `state/store.tsx` | 2499 ⚠ | `DiagramProvider`, which owns all diagram state and splits it into 5 contexts: Core (nodes, edges, strokes, texts, selection), Actions (add/update/delete/undo/layout), UI (theme, zoom, pan, tool, freshness, toasts), Docs (library, save/conflict), Collab (threads). Persists to `localStorage['archflux:v2-light']`. Server sync: `serverDiagramToDoc`, `saveActiveDoc`, `rekeyDoc` |
| `state/useDiagram.ts` | 63 | Hooks: `useDiagram()` (all contexts), `useCoreDiagram`, `useDiagramActions`, `useDiagramUI`, `useDiagramDocs`, `useDiagramCollab`. **Prefer the narrow hooks.** |
| `state/session.ts` | 72 | `getSession`, `isSignedIn`, `setSession`, `clearSession` (`archflux:session`) |
| `state/settings.ts` | 54 | User settings in `archflux:settings:v1` |
| `state/conflict.ts`, `state/revisions.ts`, `state/syncState.ts` | <80 each | Save-conflict info, revision helpers, freshness state machine |

### 2.3 Types and libraries
| File | What |
|---|---|
| `types.ts` | `ArchNode`, `ArchEdge`, `FreeStroke`, `FreeText`, `DiagramDoc`, `LibraryShape`, `ShapeCategory`, `ThemeName`, `FreshnessState`. **R1 extends these, see [DATA_MODEL_R1 §2](DATA_MODEL_R1.md).** |
| `lib/api.ts` | `api.*` HTTP client (adds the JWT, correlation ID and idempotency key), `ApiError`, `isVersionConflictError`, `isForbiddenError`, `queueMutation` (offline queue) |
| `lib/archFormat.ts` | `.arch` import/export: `SUPPORTED_ARCH_VERSION = 1`, `ARCH_LIMITS`, `validateArchImport`, `buildArchExport` |
| `lib/canvasGeometry.ts` | Resize handles, `snapNode` guides, `minimapTransform`, `edgePoints` routing |
| `lib/iconRegistry.tsx` | React icon components for UI chrome (not diagram icons) |
| `lib/honesty.ts` | Copy for honest states (`freshnessBadgeLabel`, …) |
| `lib/config.ts`, `lib/contracts.ts`, `lib/clipboard.ts` | Runtime config (`window.__ARCHFLUX_CONFIG__`), API contract types, clipboard |

### 2.4 Canvas
| File | Lines | What |
|---|---|---|
| `canvas/render.ts` | 480 | **Pure** 2D render passes: `drawEdgePass`, `drawNodePass` (+ `drawNodeMeta`, `drawIconImage`, `drawCylinderBody`), `drawInkPass`, `drawFreeTextPass`, `drawThreadPinPass`. No React, no store. All node visuals change here |
| `canvas/CanvasEngine.ts` | 530 | Multi-layer engine (`grid`, `content`, `selection`, `decorations`), viewport transform, awareness cursors, alignment guides |
| `canvas/ShapeRegistry.ts` | 418 | `ShapeDefinition`, packs (`GENERAL_PACK`, `AWS_PACK`, `GCP_PACK`, `AZURE_PACK`, `DATA_PACK`), `getShapeRegistry()`, `toLibraryShape`, `libraryShapes` |
| `canvas/export/ExportPipeline.ts` | — | SVG/PNG/PDF export |

### 2.5 Screens and components
| File | Lines | What |
|---|---|---|
| `screens/CanvasScreen.tsx` | 2672 ⚠ | The editor: canvas element, pointer and keyboard handling (keydown ≈ L1410–1560), left dock (tools/shapes), right dock (Inspector ≈ L2020–2300, Linter ≈ L2320+), comments. **R1-E00 splits this file before feature work.** |
| `screens/DashboardScreen.tsx` | 708 | Library grid and list (`StorageCard`, `FreshnessBadge`) |
| `screens/ReviewsScreen.tsx`, `GitScreen.tsx` | 454 / 398 | Review / merge views |
| `screens/LivingScreen.tsx` | 576 | Sync / drift view |
| `screens/BlueprintsScreen.tsx` | 358 | Templates |
| `screens/Settings*.tsx` | — | Settings pages |
| `components/AppShell.tsx` | 766 | App bar, nav, toasts, auth probe |
| `components/ToolPalette.tsx`, `ConflictDialog.tsx`, `RevisionsSection.tsx`, `CollaborationPanel.tsx`, `HonestyBadge.tsx`, `ImportWarnings.tsx`, `ThemeSwitch.tsx`, `ErrorBoundary.tsx` | — | Shared components |
| `design-system/components/*` | — | `Button`, `Card`, `Dialog`, `Input`, `Tabs`, `Tooltip`, `Badge`, `StatusIndicator`, `ShapeLibrary`, `ShapeIcon`, `ThemeProvider` |
| `design-system/tokens/*` | — | `colors`, `spacing`, `typography`, `radii`, `shadows`, `motion` (TS tokens). CSS variables live in `styles.css` |
| `data/blueprints.ts` | — | Built-in templates |
| `hooks/useCollaboration.ts`, `hooks/useFocusTrap.ts` | — | Yjs collaboration hook; focus trap for dialogs |

### 2.6 Assets
- `public/icons/aws/*.svg`: 12 official AWS icons (alb, apigw, cfront, cw, dynamo, ec2, ecs, lambda,
  rds, s3, sns, sqs).
- `public/icons/{gcp,azure,data}`: **placeholders, not official** (UX-A11). They will be replaced in
  R1-E05.
- The npm dependency `aws-icons` (^3.3.0) is installed and holds the full official AWS set. R1-E05
  uses it.

### 2.7 Tests
- **Unit and integration:** `src/tests/*.test.ts(x)` (vitest + jsdom + Testing Library), setup in
  `src/tests/setup.ts`, fixture in `src/tests/fixtures/sampleDiagram.ts`.
  - Key suites: `canvas.test.tsx` (renderer), `store.test.tsx`, `store.integration.test.tsx`,
    `cloud-save.test.tsx`, `archFormat.test.ts`, `shape-registry.test.ts`,
    `canvas.accessibility.test.tsx`, `no-mock-data.test.tsx`.
- **E2E:** `e2e/*.spec.ts` (Playwright), fixtures in `e2e/fixtures.ts`.

## 3. Backend (`backend/src/main/java/com/archflux`)

| Package | What |
|---|---|
| `web/` | REST controllers. `DiagramController` handles `/api/v1/diagrams` (list/create/get/put/delete, revisions, diff, checkpoints, branches, threads, replies). Also `AuthController` (`/api/v1/auth/*`), `SyncController`, `LintController`, `ExportController`, `AuditController`, `HealthController`, and `CollaborationController` (STOMP). `ApiExceptionHandler` builds error JSON; `IdempotencyFilter`; `web/dto/*` request bodies |
| `service/` | `DiagramService` (CRUD; `requireOwnedForRead` returns 404, `requireOwnedForWrite` returns 404/403), `WorkspaceService` (`isMember`, `requireMember`, `roleOf`, `resolvePersonalWorkspace`), `RevisionService`, `CheckpointService`, `ThreadService`, `AuditService.record(...)`, `IdempotencyService`, `SyncService`, `LintService`, `ExportService`, and `ApiException` (factory methods `notFound`, `forbidden`, `unprocessable`, …) |
| `domain/` | JPA entities: `Diagram` (has an unused `deletedAt`), `DiagramRevision`, `Checkpoint`, `ReviewThread`, `Reply`, `User`, `Workspace`, `WorkspaceMembership` (roles `admin`/`editor`/`reviewer`/`viewer`), `AuditEvent`, `WebhookEvent`, `IdempotencyKey`, `SyncLog` |
| `repo/` | Spring Data repositories |
| `security/` | `AuthFilter` (JWT and session revocation), `RateLimitFilter`, `OriginCheckFilter`, `PayloadLimitFilter`, `RequestLoggingFilter`, `RequestUser.get(request)` gives the caller's user UUID |
| `auth/` | `JwtService`, `MagicLinkService`, `UserSessionService`, email senders |
| `config/` | `SecurityConfig`, `CorsConfig`, `AppProperties`, `ProdSecretGuard`, `WebSocketConfig`, … |

- **Migrations:** `backend/src/main/resources/db/migration/V1…V9`. These are **immutable**; the next
  one is V10.
  - Tables: `users`, `diagrams` (graph jsonb, tags text[], workspace_id NOT NULL, deleted_at),
    `checkpoints`, `threads`, `replies`, `sync_log`, `audit_log`, `diagram_revisions`,
    `webhook_events`, `idempotency_keys`, `audit_events`, `workspaces`, `workspace_memberships`.
- **Note:** `DiagramService.delete` is a **hard delete** today; R1-E06 changes it to soft delete
  using `deleted_at`.
- **Tests** (`backend/src/test/java/com/archflux`):
  - They extend `PostgresIT` (Testcontainers Postgres) and use `@SpringBootTest @AutoConfigureMockMvc
    @Import(TestInfraMocks.class) @Transactional`.
  - Tokens come from `JwtService`.
  - Patterns to copy: `DiagramControllerTest`, `WorkspaceIsolationTest`.

## 4. Data flow (save path)

```
Canvas edit → store action (Actions ctx) → nodes/edges state → autosave to localStorage
  → saveActiveDoc(): signed in && UUID id ? PUT /api/v1/diagrams/{id}?version=n
                     signed in && local id ? POST /api/v1/diagrams → rekeyDoc(local → uuid)
  → 409 → saveConflict → ConflictDialog (reload / force / keep local)
Server: DiagramController → DiagramService.update (optimistic version, revision row, audit) → JSON
```
