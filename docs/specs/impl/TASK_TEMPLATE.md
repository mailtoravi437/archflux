# Task template

Copy this block into an epic file. Keep every heading, and write "none" when a section is empty.

```markdown
### R1-Exx-Tyy · <imperative title>

| | |
|---|---|
| **Size** | S / M |
| **Role** | frontend-implementer / backend-implementer / test-engineer |
| **Depends on** | R1-… (or none) |
| **Sources** | CAP-…, FL-…, SC-…, UX-…, DATA_MODEL_R1 §… |
| **Design** | Claude Design canvas page › artboard (or none) |

**Goal:** one sentence describing the user-visible outcome.

**Read (only these):**
- `path/to/file.ts` (whole, or lines a–b)

**Change / create:**
- `path/to/new.ts`: what goes in it
- `path/to/existing.ts`: what changes, and where

**Contract:**
```ts
// exact signatures, types and props the task must expose
```

**Steps:**
1. …
2. …

**Tests (must exist and pass):**
- `src/tests/<name>.test.ts`:
  - `it('…')`
  - `it('…')`

**Acceptance:**
- [ ] behaviour 1 (observable)
- [ ] `npx tsc -b && npm run lint && npx vitest run src/tests/<name>.test.ts`

**Out of scope:** …

**Pitfalls:** known traps in this code area.

**Open questions:** none
```

## Writing rules for task authors

- **Name real files.** Check that they exist (`ls`, `grep`). Give line ranges for files over 1,000
  lines.
- **Give exact contracts.** A small model will copy them literally.
- **Make each acceptance item checkable** by a test or a command. Avoid "looks good".
- **Keep tasks to ≤ 6 files changed.** If more are needed, split the task.
- **Use UI copy verbatim** from the design artboard or the product spec.
