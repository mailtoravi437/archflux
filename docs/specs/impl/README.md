# Implementation specs

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Status:** ✅ Current
> **Part of:** [Master Spec](../../../SPEC.md) | **Agent contract:** [AGENTS.md](../../../AGENTS.md)

Product specs say **what** and **why**: PRODUCT_SPEC, UI_REVAMP_SPEC, REVIEW_VERSIONING_SPEC. The specs
in this folder say **exactly how**. They are cut into tasks small enough for one agent session,
including small or free models with a 32k-token context.

## Files

| File | Purpose |
|---|---|
| [BACKLOG.md](BACKLOG.md) | Every R1 task: ID, size, dependencies, role, status, plus the waves that can run in parallel and the open decisions |
| [DATA_MODEL_R1.md](DATA_MODEL_R1.md) | **The shared contract**: TypeScript types, `.arch` v2, migrations V10–V13, REST API, icon manifest. Every task builds against it |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Where code lives, the hotspot files and the save data flow |
| [CONVENTIONS.md](CONVENTIONS.md) | How code is written and tested here |
| [TASK_TEMPLATE.md](TASK_TEMPLATE.md) | The format every task uses; copy it for new tasks |
| `r1/EPIC-00…13-*.md` | Epics. Each holds its tasks in the template format |

## How a task is specified

Each task is self-contained. An agent should need **only**:
1. `AGENTS.md`
2. the task section
3. the files listed under **Read**
4. the relevant section of `DATA_MODEL_R1.md`

If a task needs more than that, the task is under-specified. Fix the spec before coding.

**Sizes:**

| Size | Changed lines (code and tests) | Typical scope |
|---|---|---|
| **S** | ≤ 150 | One function or component |
| **M** | ≤ 400 | One feature slice |
| **L** | ≤ 800 | Not allowed for small models; split it first |

## Task lifecycle

```
todo → in-progress (agent writes its name/model + date in BACKLOG) → review → done
                     ↘ blocked (reason written under the task's "Open questions")
```

- **Starting a task:** check that every task in **Depends on** is `done`.
- **Spec updates:** a task may update its own section or `DATA_MODEL_R1.md`. Any contract change
  bumps DATA_MODEL's version and lists the affected tasks.
- **Review:** a reviewer agent ([docs/agents/reviewer.md](../../agents/reviewer.md)) checks the work
  against the task's acceptance before it moves to `done`.

## Traceability

Each task points to its source IDs. Tests mention task IDs in a comment at the top of the file.

```
PRODUCT_SPEC CAP-*/FL-*/SC-*  →  UI_REVAMP_SPEC UX-*/§5A  →  DATA_MODEL_R1 §n  →  R1-Exx-Tyy  →  test file
```

## Changelog

- **1.0.0 (2026-10-24):** Implementation spec system created: agent contract, codebase map,
  conventions, R1 shared contract, backlog and 14 epics.
