# AGENTS.md: how any AI agent works in this repo

This file is for every coding agent: Claude Code, Codex, Cursor, Gemini, Aider, Copilot, and
small or free models. Read it first, and follow it over anything else you assume.

## 1. The one rule: spec first, then code

ArchFlux uses **spec-driven development**. Do not write code that no spec asks for.

1. **Find the task:** pick it in [`docs/specs/impl/BACKLOG.md`](docs/specs/impl/BACKLOG.md). Every
   task has an ID such as `R1-E02-T03`.
2. **Read the task:** open its section in `docs/specs/impl/r1/EPIC-*.md`. It lists the exact files to
   read, the files to change, the interfaces, the tests and the acceptance commands.
3. **Spec gaps:** if the spec is wrong or silent, **update the spec first** (the task section and the
   shared contract in [`DATA_MODEL_R1.md`](docs/specs/impl/DATA_MODEL_R1.md)), then implement.
   Never decide silently.
4. **Implement:** implement only what the task says. Items marked out of scope stay out.
5. **Test:** write the tests named in the task, then run the acceptance commands. All of them must
   pass.
6. **Finish:** mark the task `done` in `BACKLOG.md` with the date, and add a changelog line to the
   epic file.

## 2. Read order (keep context small)

| Need | Read |
|---|---|
| What the product is | [`SPEC.md`](SPEC.md) (index), then [`docs/specs/PRODUCT_SPEC.md`](docs/specs/PRODUCT_SPEC.md) §1, §7 |
| Where code lives | [`docs/specs/impl/CODEBASE_MAP.md`](docs/specs/impl/CODEBASE_MAP.md) |
| How code is written here | [`docs/specs/impl/CONVENTIONS.md`](docs/specs/impl/CONVENTIONS.md) |
| Shared types, schema, API for R1 | [`docs/specs/impl/DATA_MODEL_R1.md`](docs/specs/impl/DATA_MODEL_R1.md) |
| Your task | `docs/specs/impl/BACKLOG.md` → `docs/specs/impl/r1/EPIC-*.md#<task-id>` |
| Your role | [`docs/agents/`](docs/agents/README.md) (planner, implementers, tester, reviewer, QA) |
| How a screen must look | [`docs/design/artboards/`](docs/design/artboards/README.md): the finalized design as HTML, read the markup for exact values |

Do not read all of `docs/specs/`. Read only the files your task lists. A task never needs more than
about 10 files.

## 3. Hard rules (a violation means the work is rejected)

- **Database migrations:** never edit `backend/src/main/resources/db/migration/V1…V9`. Flyway
  history is immutable. Add `V10__…`, `V11__…`, and take the next free number from
  `DATA_MODEL_R1.md` §4.
- **No mock or fake data in the product.** Empty states must be honest. Test fixtures live only in
  `frontend/src/tests/fixtures/` and `frontend/e2e/fixtures.ts`. `no-mock-data.test.tsx` enforces
  this.
- **No secrets:**
  - Never commit `.env` files or credentials.
  - Templates (`*.env.example`) contain placeholders only.
  - Never print tokens in logs.
- **Tenant isolation:** every backend read and write is scoped to the caller's workspace
  (`WorkspaceService.requireMember` / `isMember`). A cross-workspace read returns 404, not 403.
- **Honest UI:** never show a success, progress or "synced" state that did not happen.
- **Design fidelity (UI tasks):** the finalized artboards in
  [`docs/design/artboards/`](docs/design/artboards/README.md) are the source of truth for how the UI
  looks. Read the named artboard's markup and match its structure, px sizes, colours, type and copy.
  When prose specs disagree, the artboard wins (README precedence rules), and you fix the prose
  first. Run `npm run design:shots` and attach the screenshots. An off-design UI fails review, even
  when every test passes.
- **Accessibility:**
  - Every interactive element has an accessible name.
  - No new axe violations.
  - The keyboard must reach everything.
- **Don't touch the owner's running services.**
  - Leave alone: the compose projects `archflux`, `archflux-phase1` and `archflux-phase1b`; ports
    5173, 3001, 8080 and 18080.
  - For your own stack, use project `archflux-qa` and ports 28080 / 23001. Run Playwright dev
    servers on 5191+.
- **Git:**
  - Do not commit, push or open PRs unless the human asked.
  - Never force-push `main`.
  - Commit messages use Conventional Commits (`feat(canvas): …`) and reference the task ID.
- **Scope:**
  - One task per change.
  - Do no drive-by refactors.
  - Do not reformat files you didn't change.

## 4. Commands

```bash
# Frontend (from frontend/)
npm ci
npx tsc -b              # type check: must be clean
npm run lint            # oxlint: 0 errors, 0 new warnings
npm test                # vitest unit/integration
npx vitest run src/tests/<file>.test.ts   # one file
npm run build
npx playwright test e2e/<file>.spec.ts    # e2e (uses port 5191+, see playwright.config.cjs)

# Backend (from backend/), needs Docker for Testcontainers
mvn -q test
mvn -q -Dtest=DiagramControllerTest test  # one class
```

## 5. Definition of done (every task)

- [ ] The spec was updated first, if anything changed or was unclear.
- [ ] Only the files listed by the task were changed. Any extra file is justified in the epic
      changelog.
- [ ] The tests named in the task exist and pass.
- [ ] `tsc -b`, lint and `npm test` (frontend) / `mvn -q test` (backend) pass.
- [ ] No new `any` and no `// @ts-ignore` without a comment explaining why.
- [ ] UI work:
  - It matches the design artboard named in the task (Claude Design canvas, see PRODUCT_SPEC §6.1).
  - It has keyboard access.
  - It has no axe violations.
- [ ] Backend work:
  - The endpoint is workspace-scoped.
  - Mutations are audited (`AuditService.record`).
  - Error shapes follow `ApiExceptionHandler`.
- [ ] `BACKLOG.md` status is updated and the epic changelog has a line.

## 6. When you are stuck

- Stop after 3 failed attempts at the same thing.
- Write what you tried in the epic file under `### Open questions` for that task, and set the task
  status to `blocked`.
- Do not guess at product decisions. The list of open decisions is in PRODUCT_SPEC §9 and in
  `BACKLOG.md` → "Decisions".

## 7. Reporting format (end of every task)

```
Task: R1-E02-T03 · <title>
Status: done | blocked | partial
Changed: <files>
Tests: <commands run> → <pass/fail counts>
Spec updates: <files + version bumps, or "none">
Notes / follow-ups: <anything the next agent must know>
```
