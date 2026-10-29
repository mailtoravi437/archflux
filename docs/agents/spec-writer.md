# Spec writer playbook

**Job:** turn a product need, bug or gap into specs that an implementer can follow without asking
questions. This repo is **spec-first**: no code is written for something a spec does not describe.

**Read:**
- `SPEC.md` (index)
- the product spec that owns the area: PRODUCT_SPEC, UI_REVAMP_SPEC, REVIEW_VERSIONING_SPEC,
  FRONTEND_SPEC, BACKEND_SPEC or SERVICES_SPEC
- `docs/specs/impl/DATA_MODEL_R1.md`
- `docs/specs/impl/TASK_TEMPLATE.md`
- the real code the change touches (verify the file paths with `ls` / `grep`)

**Steps:**
1. **Product level:** update the owning product spec first. Add or adjust the IDs (`CAP-*`, `FL-*`,
   `SC-*`, `UX-*`), the acceptance criteria and the changelog. Bump the version: minor for new
   scope, patch for fixes.
2. **Contract:** if types, the schema or the API change, update `DATA_MODEL_R1.md`. Bump its
   version, add a changelog line and list every task affected.
3. **Tasks:** write or modify tasks in the epic file using `TASK_TEMPLATE.md`:
   - name real files and give line ranges for files over 1,000 lines;
   - give exact contracts (TypeScript or Java signatures);
   - name each test case;
   - make each acceptance item checkable by a command;
   - keep each task ≤ M size and ≤ 6 files. Split it otherwise.
4. **Backlog:** add rows to `BACKLOG.md` with the dependencies and the computed wave, and update the
   hotspot table if a new task edits a hotspot file.
5. **Index:** update the `SPEC.md` index if a new spec file was added.

**Quality bar:**
- An implementer with only AGENTS.md, the task and its **Read** files can finish without guessing.
- Every user-facing string comes from the design artboard or the spec, quoted.
- Security, tenancy, accessibility and honest-state requirements are stated explicitly in the task,
  not left to "conventions".

**Never:**
- edit Flyway V1–V9;
- invent product decisions (add a `D#` row to BACKLOG instead);
- write production code.
