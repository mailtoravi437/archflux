# ArchFlux Master Specification

> **Single source of truth for development.** Every feature, code change, or design decision must be reflected here. If it's not in the spec, it doesn't exist.

---

## Document Index

| Spec | Scope | Status |
|------|-------|--------|
| [SPEC.md](SPEC.md) | This master index | ✅ Current |
| [PRODUCTIZATION_SPEC.md](PRODUCTIZATION_SPEC.md) | **v3.0.0 product contract: tiers, P0/P1 requirements, roadmap** | ✅ Current |
| [SPEC_REPORT.md](SPEC_REPORT.md) | Verified as-built inventory (features, flows, FE/BE/DB) | ✅ Current |
| [FRONTEND_SPEC.md](FRONTEND_SPEC.md) | React 19 + TypeScript SPA | ✅ Current |
| [BACKEND_SPEC.md](BACKEND_SPEC.md) | Spring Boot 3.5 REST + WebSocket | ✅ Current |
| [UI_UX_SPEC.md](UI_UX_SPEC.md) | Design system & interactions | ✅ Current |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArchFlux System                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + TS + Vite)          Backend (Spring 3.5) │
│  ┌─────────────────────────┐            ┌────────────────────┐  │
│  │ Hash Router (SPA)       │◄──REST──►  │ Controllers        │  │
│  │ 5 Split Contexts        │            │ Services           │  │
│  │ Yjs Collaboration       │◄──WS──────►│ STOMP Broker       │  │
│  │ Canvas 2D Rendering     │            │ JPA + PostgreSQL   │  │
│  │ Local Contract Derivation           │ Flyway Migrations  │  │
│  └─────────────────────────┘            └────────────────────┘  │
│         ▲                                         ▲               │
│         │              Docker Compose              │               │
│         └──────────────────┬──────────────────────┘               │
│                            ▼                                       │
│                    PostgreSQL 17 + Redis                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Key Files

| Area | Frontend | Backend |
|------|----------|---------|
| **Entry** | `src/main.tsx` | `server/src/main/java/com/archflux/ArchfluxApplication.java` |
| **Routes** | `src/App.tsx` | `server/src/main/java/com/archflux/web/*Controller.java` |
| **State** | `src/store.tsx` (5 contexts) | `server/src/main/java/com/archflux/service/*Service.java` |
| **Types** | `src/types.ts` | `server/src/main/java/com/archflux/domain/*.java` |
| **API** | `src/api.ts` | `server/src/main/resources/application.yml` |
| **Schema** | — | `db/migrations/V*__*.sql` |
| **Config** | `vite.config.ts`, `tsconfig.json` | `server/pom.xml` |

---

## Spec Maintenance Protocol

> **Non-negotiable:** Every PR must update the relevant spec(s). No exceptions.

### When to Update

| Trigger | Required Update |
|---------|-----------------|
| New REST endpoint | `BACKEND_SPEC.md` (REST API table) + `FRONTEND_SPEC.md` (API section) |
| New WebSocket message | `BACKEND_SPEC.md` (WebSocket table) + `FRONTEND_SPEC.md` (Collaboration) |
| New DB column/table | `BACKEND_SPEC.md` (Database Schema) + migration file |
| New React component | `FRONTEND_SPEC.md` (Project Structure) |
| New React Context / hook | `FRONTEND_SPEC.md` (State Management / Hooks) |
| New Yjs message type | `FRONTEND_SPEC.md` (Collaboration) + `BACKEND_SPEC.md` (WebSocket) |
| New lint rule | `BACKEND_SPEC.md` (Linting Rules) + `UI_UX_SPEC.md` (Linter UI) |
| New UI pattern / component | `UI_UX_SPEC.md` (relevant section) + `FRONTEND_SPEC.md` |
| Config change | Both specs (Config sections) |
| New migration | `BACKEND_SPEC.md` (Database Schema) |

### Update Checklist (per PR)

- [ ] Spec(s) updated to reflect changes
- [ ] Cross-references updated (links between specs)
- [ ] Version/date bumped in spec header
- [ ] No "TODO" or "FIXME" left in spec without issue link
- [ ] Breaking changes called out in **Bold** with migration notes

### Spec Versioning

Each spec header includes:
```markdown
> **Version:** 1.2.0 | **Last Updated:** 2026-10-13 | **Author:** [name]
> **Status:** ✅ Current | 🔄 In Progress | ⚠️ Stale
```

---

## Cross-Spec Dependencies

| Frontend Feature | Backend Dependency | Spec Links |
|------------------|-------------------|------------|
| OAuth2/SAML login | `AuthController`, `SecurityConfig` | [FE Auth](#authentication) \| [BE Auth](#authentication) |
| Magic Link | `MagicLinkService`, `EmailService` | [FE Magic Link](#magic-link) \| [BE Auth](#authentication) |
| GitHub Webhook | `SyncController` HMAC | [FE Sync](#sync--webhooks) \| [BE Webhook](#github-webhook) |
| Yjs Collaboration | STOMP `/ws`, `CollaborationController` | [FE Collab](#real-time-collaboration-yjs) \| [BE WS](#websocket-stomp) |
| Checkpoint Restore | `CheckpointService.restore()` | [FE Versioning](#diagram-versioningbranching) \| [BE Checkpoints](#diagrams) |
| Diagram Branching | `DiagramService.createBranch()` | [FE Versioning](#diagram-versioningbranching) \| [BE Branching](#diagrams) |
| Linting | `LintService` + `/lint` endpoint | [FE Linter](#linter) \| [BE Lint](#lint) |
| Contract Derivation | Local-only (frontend) | [FE Contracts](#api-contract-derivation-local-first) |

---

## Current Release Work Plan (2026-10-14) — ✅ Shipped

Derived from [UI_UX_SPEC.md](UI_UX_SPEC.md#implementation-plan-this-release). Backend change: checkpoint branch filter. All 19 items implemented; gates green (see Verification below).

### Follow-through (UI_UX_SPEC v2.3.0)
Spec v2.2.0 review surfaced conformance gaps; all closed this release:
- **Canvas:** 24px grip hit areas, Alt snap-bypass, phone-docked toolbar, dock scroll preservation, persisted minimap toggle, dock-reachable diagram outline, F/M/? keys, fuzzy palette, 1/10px nudge.
- **Reviews/Git:** sample-reviewers label, auto-approved tag, A=B compare guard, resolved-thread collapse, branch failure + Retry, cURL secret redaction, branch-filter UI (§7.3).
- **Living:** drift source labels + severity ordering, progress cancel, modal focus trap + Esc, no-credentials note, session-scoped acks.
- **Dashboard/Settings/Shell:** storage thresholds + free-up, persisted view/sort, sortable headers, 5s toasts with hover-pause, replay-tour, associated descriptions, recents aria, onboarding pluralization, merged→sessionStorage.
- **Specs:** persistence registry completed (19 keys), OQ-1/OQ-2/OQ-5 resolved.
- **Deferred with rationale:** R10 sync-pan (static thumbs), connector credentials, Redis broker, contract registry, OQ-3/OQ-4/OQ-6/OQ-7 (product decisions).

### Frontend
| # | Item | Files | Acceptance |
|---|------|-------|------------|
| 1 | Blueprint SVG thumbnails | `BlueprintsScreen.tsx` (+ unit test) | Each card renders a deterministic mini-map; no emoji-only tiles |
| 2 | Preview edge list | `BlueprintsScreen.tsx` | Preview modal lists routes alongside nodes |
| 3 | Save as blueprint | `BlueprintsScreen.tsx` (+ unit test) | Current canvas persists to `archflux:blueprints:custom:v1`; custom section with delete; survives reload |
| 4 | Checkpoint PRs + merge | `GitScreen.tsx` (+ unit test) | PR list starts with checkpoint-derived entries; merge flips status, persists per session |
| 5 | Team reviewers | `ReviewsScreen.tsx` (+ unit test) | Reviewer slots from `archflux:team:v1`, Admins pre-approved; static fallback when empty |
| 6 | Setting descriptions | `SettingsGeneralScreen.tsx` | Every control has a `title` tooltip |

### Backend
No changes this release. The work plan uses existing endpoints only (`GET/POST checkpoints`, `POST branches`).

### Verification gates (must stay green)
`tsc` clean · vitest 47+ passed · `npm run test:e2e` 13/13 · visual 29/29 · `mvn test` 46/46.

---

## Productization v3.0.0 Work Plan

> Governing contract: [PRODUCTIZATION_SPEC.md](PRODUCTIZATION_SPEC.md) (tiers, P0/P1, roadmap).
> As-built baseline: [SPEC_REPORT.md](SPEC_REPORT.md) (verified inventory + §12 gaps).

**Release boundary:** Release A (reliable single-user) first. No capability ships as GA until its
acceptance criteria + operational evidence are met — otherwise it is labeled Preview, Demo, or Not connected.

### Phase 0 — Freeze and establish truth (in progress)

| # | Item | Owner | Acceptance |
|---|------|-------|------------|
| P0-1 | Commit + tag reproducible baseline (`v3.0.0-phase0-baseline`) | repo | clean checkout builds + tests green |
| P0-2 | Feature status inventory (Shipped / Partial / Simulated / Broken / Planned) | docs | matrix published in SPEC_REPORT follow-up |
| P0-3 | Endpoint, migration, test, dependency, persistence inventories | docs | generated from code, committed |
| P0-4 | Honest-labeling: Demo/Preview/Not-connected badges on simulated surfaces | frontend | resync, connectors, approvals, sandbox labeled; no green "Healthy" for form-validated connectors |
| P0-5 | Feature flags / remove misleading entry points | frontend | incomplete paths gated or removed |

### Phase 1 — Secure single-user cloud product (planned)

Real validated identity (PROD-001); OAuth callback/session fix; secrets out of browser storage (PROD-011);
Redis decision; user/workspace scoping (PROD-002); migration/RLS/readiness fixes (PROD-005);
two-user save/reload + export/import + isolation E2E.

### Phase 2+ — tracked in PRODUCTIZATION_SPEC.md §§16–19
Data integrity → GitHub/review → first real connector → collaboration decision → beta.

### P0/P1 → spec traceability

| Requirement | Primary spec | Implementation hook |
|-------------|--------------|---------------------|
| PROD-001/002/011 (identity, isolation, secrets) | BACKEND_SPEC (Auth, Security) | `AuthFilter`, `SecurityConfig`, session/token storage |
| PROD-003/004/008 (guest, persistence, honest sync) | FRONTEND_SPEC (Persistence, Living) | `session.ts`, store persist, `LivingScreen` states |
| PROD-005/010 (migrations, operability) | BACKEND_SPEC (DB, Health) | Flyway chain, `/ready`, roles, DEPLOY |
| PROD-006/007/025 (import/export/recovery) | FRONTEND_SPEC (Canvas, Blueprints) | `importArch`/`exportArch`, checkpoints |
| PROD-009 (audit) | BACKEND_SPEC (audit_log, sync_log) | triggers, grants, correlation IDs |
| PROD-012 (testable claims) | SPEC (gates) + test matrix | CI suites, skipped-test reporting |
| PROD-020–025 (diff, review, GitHub, policy, roles) | UI_UX_SPEC + FRONTEND_SPEC | Reviews/GitScreen, lint rule IDs |

---

## Development Workflow

### Local Setup
```bash
# Frontend
npm install && npm run dev        # http://localhost:5173

# Backend (requires Docker: PostgreSQL + Redis)
cd server && mvn spring-boot:run  # http://localhost:3001

# Or full stack
docker compose up -d
```

### Testing Gates
| Layer | Command | Must Pass |
|-------|---------|-----------|
| Frontend TypeScript | `npx tsc --build --force` | 0 errors |
| Frontend Unit | `npm test` | 47 passed |
| Frontend E2E | `npm run test:e2e` | 13/13 critical journeys |
| Visual Regression | `npm run test:visual` | 29/29 baselines |
| Backend Compile | `cd server && mvn compile` | SUCCESS |
| Backend Tests | `cd server && mvn test` | 46/46 passed |

### Before Merge
```bash
# Run all gates locally
npm run build && npm test && npm run test:e2e && npm run test:visual
cd server && mvn test
```

---

## Feature Flags (Future)

| Flag | Default | Purpose |
|------|---------|---------|
| `contractRegistry` | false | Enable backend contract registry |
| `redisBroker` | false | Multi-node STOMP via Redis |
| `aiAssistant` | false | AI diagram generation |
| `pluginSystem` | false | Third-party extensions |

---

## Glossary

| Term | Definition |
|------|------------|
| `.arch` | Deterministic JSON export format (nodes, edges, strokes, texts) |
| Canonical JSON | Deterministic key ordering + type normalization |
| CRDT | Conflict-free Replicated Data Type (Yjs) |
| Drift | Difference between canvas state and upstream source |
| Idempotency Key | `commit_sha` in `sync_log` (prevents duplicate processing) |
| `.arch` | File extension for architecture diagram exports |
| Linter Chip | Top-header badge showing issue count (click → canvas) |
| Precision Canvas | The main diagram editor route (`/canvas`) |
| Living Sync | Continuous drift detection from upstream sources |

---

## Contact / Ownership

| Area | Owner | Contact |
|------|-------|---------|
| Frontend Architecture | @frontend-lead | #archflux-frontend |
| Backend Architecture | @backend-lead | #archflux-backend |
| UI/UX Design | @design-lead | #archflux-design |
| DevOps / Infra | @devops-lead | #archflux-infra |

---

> **Remember:** The spec is the contract. If code and spec disagree, the spec wins — update the code.