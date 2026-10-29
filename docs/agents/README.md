# Agent roles

> **Version:** 1.0.0 | **Last Updated:** 2026-10-24 | **Contract:** [AGENTS.md](../../AGENTS.md)

These playbooks are written for any LLM coding agent, not only Claude. Each role has a narrow job,
fixed inputs and a fixed output, so cheap or small models can do the work and stronger models (or
humans) review it.

| Role | Playbook | Input | Output | Model tier |
|---|---|---|---|---|
| Planner | [planner.md](planner.md) | Backlog plus a goal | An ordered list of claimable tasks; it detects blocked tasks and conflicts | Any |
| Spec writer | [spec-writer.md](spec-writer.md) | A gap, bug or product change | Updated spec sections and new task sections in template format | Strong |
| Frontend implementer | [frontend-implementer.md](frontend-implementer.md) | One `R1-Exx-Tyy` frontend task | Code plus tests that pass the task's acceptance | Any (S), mid+ (M) |
| Backend implementer | [backend-implementer.md](backend-implementer.md) | One backend task | Migration, code and tests | Mid+ (security-sensitive) |
| Test engineer | [test-engineer.md](test-engineer.md) | One test or gate task, or "add missing tests for Tyy" | Tests only, never product code | Any |
| Reviewer | [reviewer.md](reviewer.md) | A finished task (diff + report) | PASS, or a numbered list of required fixes | Strong |
| QA | [qa.md](qa.md) | A wave or epic marked done | A bug list with repro steps, as `R1-BUG-nn` rows | Mid+ |

**Pipelines:**
- **One task:** planner → implementer → test engineer (optional, if tests are thin) → reviewer →
  done.
- **One wave:** the planner picks N tasks that hold no shared hotspot lock. N implementers run in
  parallel, each in its own git worktree or branch, and merge in task-ID order. QA runs after the
  wave.

Copy-paste prompts for each role, including for tools without a subagent system (ChatGPT, Gemini,
local models), are in [PROMPTS.md](PROMPTS.md).

**Claude Code:** these roles are installed as subagents in `.claude/agents/`. Run them with "use the
frontend-implementer agent on R1-E02-T01", or through the Agent tool.
