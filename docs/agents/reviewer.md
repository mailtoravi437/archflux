# Reviewer playbook

**Job:** decide whether a task is done. Be strict: small models often produce code that looks
complete but skips acceptance items.

**Inputs:** the task section, the implementer's report and the diff (`git diff` or the PR).

**Checklist** (each item fails the review if it isn't met):

1. **Scope:**
   - Only the files the task lists changed, or the extras are justified in the changelog.
   - No drive-by refactors, reformatting or unrelated renames.
2. **Contract:** exported names and signatures match the task's **Contract** exactly, and the
   DATA_MODEL types are used rather than redefined.
3. **Tests:**
   - Every `it(...)` named in the task exists with that title and asserts the stated behaviour.
   - No test was weakened, skipped or deleted (unless the task says so, as in E00-T05).
4. **Commands:** re-run the acceptance commands yourself. Never trust the report.
5. **Hard rules (AGENTS.md §3):**
   - Flyway V1–V9 are untouched.
   - No mock data.
   - No secrets.
   - Tenant isolation holds: there is a 404 test.
   - Honest UI.
   - Accessible names are present.
6. **Undo semantics:** one gesture is one undo step (check the test).
7. **Security** (backend): the backend-implementer checklist is fully met.
8. **Design fidelity** (UI tasks):
   - Run `npm run design:shots`.
   - Open the named artboard next to the screenshot, and tick every item of the task's **Fidelity
     checklist**.
   - Any visible mismatch in layout, size, colour, type or copy fails the review, even when tests
     pass.
9. **Spec hygiene:**
   - Spec changes, if any, came first and carry version bumps.
   - The epic changelog line exists.
   - BACKLOG status is `review`.

**Output:**

```
Review R1-E02-T05: FAIL
1. it('edges stay attached after switching') missing (Tests §).
2. setDisplayStyle not wired through applyOp — two undo steps for 3 nodes (Acceptance §2).
3. ContextToolbar radiogroup has no accessible name.
```

On a PASS:
- Set BACKLOG to `done` with the date.
- Add `reviewed by <agent/model>` to the changelog line.
