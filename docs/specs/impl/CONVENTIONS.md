# Coding conventions

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Part of:** [Implementation specs](README.md)

Match the code around you. When this file and the existing code disagree, the existing code in the
same file wins. Note the conflict in the task's changelog.

## 1. Frontend (TypeScript + React 19)

### 1.1 Language
- TypeScript is strict. **No new `any`.** Use `unknown` plus a type guard, the way `isValidNode` /
  `isValidText` in `state/store.tsx` do.
- Domain types live in `src/types.ts`. Add fields as **optional** (`field?: T`) so old saved docs
  still load. Never rename or remove a persisted field; add a new one and migrate on load (see
  [DATA_MODEL_R1 §3](DATA_MODEL_R1.md)).
- Write pure logic as plain functions in `src/lib/*.ts` or `src/canvas/*.ts`, with no React imports.
  Test it directly.
- Naming:
  - Components are `PascalCase.tsx` with a default export for screens and a named export for small
    shared components.
  - Hooks are `useX`.
  - Constants are `UPPER_SNAKE`.

### 1.2 State
- All diagram mutations go through store actions in `state/store.tsx`. **One user gesture is one undo
  step.**
  - **Discrete actions** (delete, connect, place, align) call `snapshot(nodesRef.current,
    edgesRef.current)` first, then update state immutably, then `schedulePersist()`. Copy
    `deleteEdge`.
  - **Continuous edits** (drag, typing in the inspector) work differently. The *caller* calls
    `checkpoint()` once, on grab or focus. After that it uses the history-silent `moveNode` /
    `updateNode` / `updateEdge`.
  - The undo stack (`pastRef`/`futureRef`, 30 deep) stores `{nodes, edges, strokes, texts}`.
    R1-E00-T04 adds `pages`/`layers` (DATA_MODEL_R1 §2.4). New document-level state that should be
    undoable must be added there.
  - Actions never call the network directly. Saving is handled by `saveActiveDoc`.
- New actions are added to the right context interface (`DiagramActionsContextValue`, …) and exposed
  through `state/useDiagram.ts`.
- Components read state with the narrowest hook (`useCoreDiagram`, `useDiagramActions`, …), not
  `useDiagram()`.
- When `store.tsx` grows past its R1-E00 split, put new feature logic in a new
  `state/<feature>.ts` module. That module exports pure reducers (`(doc, args) => doc`), which the
  store calls.

### 1.3 Canvas rendering
- Everything that draws lives in `canvas/render.ts` (or a new `canvas/render/<part>.ts` after
  R1-E00). Passes are pure: `(ctx, data, flags) => void`.
- Never read the DOM or the store inside a pass.
- Hit testing and geometry go in `lib/canvasGeometry.ts` (or `canvas/geometry/*.ts`).
- World coordinates are canvas units; screen = world × zoom + pan. Every new geometry helper
  documents which space it takes.

### 1.4 UI and styling
- **Match the artboard first** (`docs/design/artboards/<Name>.dc.html`). Copy sizes, radius, borders,
  shadows, type and copy from its inline styles, and map hex colours to the tokens in `styles.css`. If no
  token exists for a design colour, add one to every theme instead of hard-coding it.
- Use the CSS variables in `styles.css` (`--bg-panel`, `--border-panel`, `--text-main`,
  `--text-muted`, `--accent-cyan`, …) and the design-system components (`design-system/components/*`).
  Don't hard-code colours in new components; canvas notation colours from UI_REVAMP_SPEC §5A are the
  exception, kept in one constant map.
- Use the fonts `--ui-font` (Inter) for all UI and `--mono-font` only for code, IDs, kbd and diffs.
- Buttons come in sm 28 / md 32 / lg 40, with variants primary (≤ 1 per view), secondary, ghost and
  danger.
- Accessibility:
  - Every control has an accessible name.
  - Icon-only buttons need `aria-label` plus a tooltip with the same text.
  - Dialogs use `useFocusTrap`, close on `Esc` and restore focus.
  - Lists use roles (`listbox`/`option`, `tablist`/`tab`, `menu`/`menuitem`) with arrow-key
    navigation.
- Copy is sentence case, with no exclamation marks, and honest about state (see `lib/honesty.ts`).

### 1.5 Tests
- Name tests after the behaviour, for example `it('switching display style on 3 nodes is one undo step')`.
- Store tests render `DiagramProvider` and call actions through hooks. Copy the setup from
  `store.test.tsx`.
- Renderer tests use a recording mock context. Copy from `canvas.test.tsx`.
- Use Testing Library queries by role and name (`getByRole('button', { name: 'Align left' })`), not
  by class.
- One new test file per task, named in the task (for example
  `src/tests/display-style.test.tsx`).

## 2. Backend (Java 21 + Spring Boot 3.5)

### 2.1 Layers
- Requests flow controller (`web/`) → service (`service/`) → repository (`repo/`) → entity
  (`domain/`).
- Controllers are thin: they parse input, call one service method and wrap the result as
  `{"data": …}`, matching `DiagramController`.
- Services own transactions (`@Transactional`), authorisation and auditing.
- Request DTOs live in `web/dto/` and use Bean Validation (`@NotBlank`, `@Size`).

### 2.2 Authorisation and tenancy
- The caller is `RequestUser.get(request)` (a UUID).
- Reads use a `requireOwnedForRead`-style check (not a member gets **404**). Writes check membership
  and role (`WorkspaceService.roleOf`). The wrong role gets **403**; not a member gets **404**.
- Roles: `admin`, `editor`, `reviewer`, `viewer` (workspace). Diagram-level roles are added in R1-E07
  (DATA_MODEL_R1 §4.3).

### 2.3 Errors, audit, idempotency
- Throw `ApiException.notFound / forbidden / validation / conflict / versionConflict /
  unprocessable`. `ApiExceptionHandler` turns them into the JSON error shape. Never return ad-hoc
  error maps.
- Every mutation calls `audit.record(actorId, workspaceId, "<resource>.<verb>", "<type>", id, "ok")`.
  Use action names in the form `diagram.trash`, `folder.create`, `share.invite`.
- Mutating endpoints accept an `Idempotency-Key` header; `IdempotencyFilter` handles it, so nothing
  extra is needed for new POSTs under `/api/v1`.

### 2.4 Persistence
- New tables arrive in a new Flyway file `V<n>__<snake_name>.sql`. Make each one idempotent, using
  the `DO $$ … to_regclass(...) IS NULL` pattern from V1/V6.
- Every tenant table has `workspace_id uuid NOT NULL` plus an FK and an index.
- Tenant tables have **row-level security**:
  - `ENABLE ROW LEVEL SECURITY` and a policy using
    `public.is_workspace_member(<table>.workspace_id, public.current_user_id())`;
  - grants to `archflux_app` inside the `pg_roles` guard;
  - copy the V6 sections on policies and grants.
- Use `timestamptz` and `uuid` (`gen_random_uuid()`).
- Map JSON columns with `OtherStringUserType` (see `Diagram.graph`).
- Never edit an applied migration. `MigrationFiles` / the V6 and V7 upgrade tests guard this.

### 2.5 Tests
- Integration tests extend `PostgresIT` with `@SpringBootTest @AutoConfigureMockMvc
  @Import(TestInfraMocks.class) @Transactional`. Copy `DiagramControllerTest`.
- Every new endpoint has at least these tests:
  1. the happy path;
  2. 401 without a token;
  3. **404 for another workspace's resource**;
  4. 403 for an insufficient role;
  5. 400/422 for invalid input.

## 3. Commits (only when asked)

- Messages use the form `feat(canvas): display styles for elements (R1-E02-T04)`, with the types
  `feat`, `fix`, `refactor`, `test`, `docs` and `chore`.
- The body says what changed and why, plus the spec version bumps.
- End with the attribution line your tool requires, if any.
