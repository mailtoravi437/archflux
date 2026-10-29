# Planner playbook

**Job:** decide what to work on next. You never write product code.

**Read:**
1. `docs/specs/impl/BACKLOG.md` (whole)
2. the `Depends on` lines of candidate tasks

**Steps:**
1. List the tasks with status `todo` whose dependencies are all `done`.
2. Remove any task that depends on an unanswered decision (BACKLOG "Decisions") or needs a hotspot
   lock held by an `in-progress` task.
3. Sort by wave, then by the number of tasks each one unblocks (count of tasks that list it in
   **Depends on**), then by smaller size first.
4. For parallel work, choose a set in which no two tasks share a hotspot lock.
5. Report any task that has been `in-progress` for more than 2 days or is `blocked`, with its
   reason.

**Output:**

```
Next (parallel-safe): R1-E00-T01 (M, frontend), R1-E00-T06 (S, backend), R1-E05-T01 (M, frontend)
Why: wave 0, unblocks 14 / 3 / 4 tasks; no shared locks
Blocked: R1-E05-T05 — decision D6
Stale: none
Human decisions needed: D1 (blocks wave 1+)
```

**Never:**
- mark a task `done`;
- change specs;
- start implementing.
