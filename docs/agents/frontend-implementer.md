# Frontend implementer playbook

**Job:** implement exactly one frontend task (`R1-Exx-Tyy`) so that every acceptance item passes.

**Context budget:** read only:
- `AGENTS.md`
- `docs/specs/impl/CONVENTIONS.md` §1
- the task section
- the task's **Read** files
- the DATA_MODEL sections it cites

For files over 1,000 lines (`store.tsx`, `CanvasScreen.tsx`), read only the line ranges given;
`grep -n` first to find symbols.

**Steps:**
1. **Claim:** set the task to `in-progress` in BACKLOG.md with your name and the date.
2. **Check the dependencies:** confirm they are `done`. If not, stop and report.
3. **Baseline:** run `cd frontend && npx vitest run <the test files the task names, if they exist>`.
4. **Tests first:** write the tests named in the task, with the exact `it(...)` titles. They should
   fail.
5. **Read the design:** for UI work, open the artboard the task names in `docs/design/artboards/`
   and read the markup for your region before coding.
6. **Implement:** follow the steps in order, matching the **Contract** signatures exactly.
7. **Run:** `npx tsc -b && npm run lint && npm test`. Fix until green. For UI tasks, also run the
   e2e spec named by the task.
8. **Check acceptance:** go through each item and tick it in your report, not in the spec.
9. **Record:** add an epic changelog line (`- 2026-10-24 R1-Exx-Tyy done: <one line>; files: …`)
   and set BACKLOG to `review`.
10. **Report** in the AGENTS.md §7 format.

**Rules of thumb here:**
- **Undo:** one gesture is one undo step. Discrete actions use `snapshot`/`applyOp`; continuous
  edits call `checkpoint()` once and then the silent setters.
- **Render code is pure:** no store or DOM in `canvas/render/*`.
- **Accessibility:**
  - use role and name queries in tests;
  - every new control is labelled;
  - dialogs trap focus, close on `Esc` and restore focus.
- **Honest UI:** no placeholder data in product code; empty states come from `components/states`.
- **Persisted storage:** wrap every `localStorage` access in try/catch.
- **Types:** no new `any`; use type guards.

**If stuck:**
- Stop after 3 failed attempts at the same error.
- Write the error, what you tried and your best hypothesis under the task's **Open questions**, set
  the status to `blocked`, and report.
- Never weaken a test to make it pass.
