# ArchFlux Master Specification

> **Version:** 3.9.0 | **Last Updated:** 2026-10-24 | **Status:** ✅ Current

> **Single source of truth for development.** Every feature, code change, or design decision must be reflected here. If it's not in the spec, it doesn't exist.

---

## Document Index

| Spec | Scope | Status |
|------|-------|--------|
| [SPEC.md](SPEC.md) | This master index | ✅ Current |
| [SERVICES_SPEC.md](docs/specs/SERVICES_SPEC.md) | **Service boundaries: `frontend/` (archflux-web) + `backend/` (archflux-api), topologies, CI/CD, gap register** | ✅ Current (v2.1.0) |
| [FRONTEND_SPEC.md](docs/specs/FRONTEND_SPEC.md) | React 19 + TypeScript SPA | ✅ Current |
| [BACKEND_SPEC.md](docs/specs/BACKEND_SPEC.md) | Spring Boot 3.5 REST + WebSocket | ✅ Current |
| [PRODUCT_SPEC.md](docs/specs/PRODUCT_SPEC.md) | **Product v4: "advanced Lucidchart for architecture" — gap map, 28 flows, 56 screens, all but 3 designed, R1–R4 roadmap** | 🟡 Proposed |
| [REVIEW_VERSIONING_SPEC.md](docs/specs/REVIEW_VERSIONING_SPEC.md) | **Versions, proposals (PRs), review, comments: model, merge, permissions, notifications, edge cases** | 🟡 Proposed |
| [AGENTS.md](AGENTS.md) | **Contract for every AI agent (Claude, Codex, Cursor, Gemini, free models): spec-first workflow, hard rules, commands, definition of done** | ✅ Current |
| [docs/specs/impl/](docs/specs/impl/README.md) | **Implementation specs: R1 backlog (84 tasks, 14 epics, parallel waves), shared contract DATA_MODEL_R1 (types, `.arch` v2, V10–V14, API), codebase map, conventions** | 🟡 Proposed (Wave 0 may start) |
| [docs/design/artboards/](docs/design/artboards/README.md) | **Finalized design (47 artboards as HTML): source of truth for how every screen looks** | ✅ Current |
| [docs/agents/](docs/agents/README.md) | **Agent roles: planner, spec writer, frontend/backend implementer, test engineer, reviewer, QA, plus copy-paste prompts** | ✅ Current |
| [UI_REVAMP_SPEC.md](docs/specs/UI_REVAMP_SPEC.md) | **UI revamp: audit, principles, IA, tokens, phased rollout (replaces UI_UX_SPEC; Appendix A keeps its quality bars and status language). Visuals: [docs/design/artboards](docs/design/artboards/README.md) are the source of truth** | 🚧 In progress |
| [docs/deploy/AWS.md](docs/deploy/AWS.md) | **AWS deployment: CloudFormation, ECR, EC2 compose, CI/CD** | ✅ Current |
| [docs/deploy/DEPLOY.md](docs/deploy/DEPLOY.md) | Operate: DB bootstrap, env, health, backup/restore | ✅ Current |

---

## Architecture Overview

Two independently built and deployed services (contract: [SERVICES_SPEC.md](docs/specs/SERVICES_SPEC.md)):

```
┌──────────── frontend/ (archflux-web) ────────────┐        ┌──────────── backend/ (archflux-api) ─────────────┐
│ React 19 + TS + Vite SPA, served by nginx        │        │ Spring Boot 3.5, Java 21                         │
│ Hash router · 5 split contexts · Canvas 2D       │ REST   │ Controllers → Services → JPA                     │
│ src/config.ts: apiUrl/wsUrl from /config.json    │───────►│ /api/v1/**  (CORS + Origin allow-list)           │
│ Optional nginx proxy (API_UPSTREAM) for          │  WS    │ /ws (STOMP)  · Flyway (classpath migrations)     │
│ same-origin (integrated) topology                │───────►│ PostgreSQL 17 + Redis 7                          │
└──────────────────────────────────────────────────┘        └──────────────────────────────────────────────────┘
   Integrated: root compose.yml (web proxies /api)      Separate: frontend/compose.yml + backend/compose.yml
```

> Known open gap SVC-O1: the collaboration client speaks y-websocket while the server speaks STOMP.

---

## Quick Reference: Key Files

| Area | Frontend (`frontend/`) | Backend (`backend/`) |
|------|----------|---------|
| **Entry** | `src/main.tsx` | `src/main/java/com/archflux/ArchfluxApplication.java` |
| **Routes** | `src/App.tsx` (+ `src/app/`) | `src/main/java/com/archflux/web/*Controller.java` |
| **State** | `src/state/store.tsx` (5 contexts) | `src/main/java/com/archflux/service/*Service.java` |
| **Types** | `src/types.ts` | `src/main/java/com/archflux/domain/*.java` |
| **API / config** | `src/lib/api.ts`, `src/lib/config.ts` | `src/main/resources/application.yml` |
| **Schema** | — | `src/main/resources/db/migration/V*__*.sql` (single source) |
| **Build** | `package.json`, `vite.config.ts`, `Dockerfile` | `pom.xml`, `Dockerfile` |
| **Compose** | `compose.yml` (web only) | `compose.yml` (db + redis + server) |

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
| New lint rule | `BACKEND_SPEC.md` (Linting Rules) + `UI_REVAMP_SPEC.md` + the artboard (Linter UI) |
| New UI pattern / component | the artboard in `docs/design/artboards/` + `UI_REVAMP_SPEC.md` + `FRONTEND_SPEC.md` |
| Config change | Both specs (Config sections) + `SERVICES_SPEC.md` if it crosses the service boundary |
| New service-level file (Dockerfile, compose, workflow, env var) | `SERVICES_SPEC.md` |
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

## Product v4 Plan (2026-10-24, v3.5.0)

> Contract: [PRODUCT_SPEC.md](docs/specs/PRODUCT_SPEC.md) v4.2.0. Order: product spec (this change) → designs
> for every flow in the Claude Design canvas (one page per flow) → sign-off → R1 implementation, each R1
> capability getting its own FRONTEND/BACKEND spec section with acceptance criteria before code.

---

## UI Revamp Plan (2026-10-24, v3.4.0)

> Contract: [UI_REVAMP_SPEC.md](docs/specs/UI_REVAMP_SPEC.md) v1.0.0 §9. Spec-driven order: plan (this
> change) → Phase 1 (foundation + canvas workspace, incl. FE-V2 label fix) → Phase 2 (pages) → verify
> (tests, QA sweep, axe, before/after screenshots) → Phase 3 next release.

---

## QA Fix Plan (2026-10-24, v3.3.0)

> Source: full-stack QA pass. Gaps: [SERVICES_SPEC](docs/specs/SERVICES_SPEC.md) SVC-G25…G34,
> [FRONTEND_SPEC](docs/specs/FRONTEND_SPEC.md) FE-Q1…Q12. Order: critical/high first, then medium, low.

| # | Item | Gap IDs |
|---|------|---------|
| Q1 | Cloud save + cross-device library + server delete | SVC-G34, FE-Q1 |
| Q2 | GitHub webhook HMAC-only delivery | SVC-G25 |
| Q3 | Session revocation on logout/refresh | SVC-G26 |
| Q4 | Rate limiting on real client IP + per-address magic-link cap | SVC-G27 |
| Q5 | Redact secrets in request logs | SVC-G28 |
| Q6 | 404 for unknown routes, springdoc upgrade + prod disable, mail health off, 401 entry point, env template | SVC-G29…G33 |
| Q7 | UI fixes: a11y label, phone layouts, dev-only note, status labels, honest ping, contrast, ARIA, nav hint, SSO tab | FE-Q2…Q12 |

---

## Restructure · No Mock Data · AWS Work Plan (2026-10-24, v3.2.0)

> Contracts: [SERVICES_SPEC.md](docs/specs/SERVICES_SPEC.md) v2.1.0 §2/§6/§10 (SVC-G19…G23) and
> [FRONTEND_SPEC.md](docs/specs/FRONTEND_SPEC.md) v1.5.0 "No mock data" (FE-M1…M8).

**Spec-driven order:** (1) specs updated (this change) → (2) move docs/files → (3) frontend `src/` regroup +
mock removal with tests → (4) AWS infra + overlay + workflows → (5) gates green, links verified.

| # | Item | Gap IDs | Acceptance |
|---|------|---------|------------|
| R1 | Root = entry points; docs under `docs/{specs,deploy,ops,design,qa,archive}`; delete stray/GCP/DO files | SVC-G19 | SERVICES_SPEC §8 acc. 7, 10 |
| R2 | Regroup `frontend/src` into `app/ state/ lib/ data/` | FE-M8 | `tsc -b`, tests, lint green |
| R3 | Remove all mock/demo data; empty-state first run; honest resync | FE-M1…M7 | FRONTEND_SPEC "No mock data" acc. 1–6 |
| R4 | CloudFormation (EC2, SG, EIP, ECR, OIDC role) | SVC-G20 | template parses; acc. 9 |
| R5 | `compose.aws.yml` (ECR images, required secrets, no host ports, Caddy TLS) | SVC-G21, G22 | acc. 8 |
| R6 | Deploy workflows: build → ECR → SSH `remote-deploy.sh` with health-gated rollback | SVC-G20 | acc. 9 |
| R7 | Remove systemd/pm2/host-nginx VM deploy files; archive PRODUCTION_SPEC | SVC-G20 | no tracked GCP/DO/systemd deploy path |

---

## Service Split Work Plan (2026-10-24)

> Contract: [SERVICES_SPEC.md](docs/specs/SERVICES_SPEC.md) v2.0.0 — layout §2, gap register §8, acceptance §8.

**Spec-driven order:** (1) spec updated (this change) → (2) restructure into `frontend/` + `backend/` →
(3) close SVC-G1…G15 with tests → (4) gates green per service → (5) update deploy docs.

| # | Item | Gap IDs | Acceptance |
|---|------|---------|------------|
| S1 | Untrack secrets + vendored SDK, add `.example` templates, scrub docs | G1, G2 | `git ls-files` clean of secrets/SDK |
| S2 | Move frontend → `frontend/`, `server/` → `backend/`, `db/` → `backend/db` | G3, G11 | each service builds alone |
| S3 | `src/config.ts` runtime config; login URLs `/v1` | G4, G5 | unit tests |
| S4 | Backend public URLs, hash redirects, magic link via API | G6, G7 | `AuthControllerTest` |
| S5 | Unified origin allow-list (CORS, Origin check, WS) | G8, G9 | `OriginCheckFilterTest` |
| S6 | nginx `API_UPSTREAM` proxy include + CSP from `API_URL` | G10 | `docker build frontend`, compose config |
| S7 | Classpath migrations in tests | G11, G12 | `mvn test` green |
| S8 | Path-scoped CI + deploy workflows; PG17 everywhere | G13, G14 | workflow lint |

---

## Current Release Work Plan (2026-10-14) — ✅ Shipped

Derived from UI_UX_SPEC (deleted 2026-10-25; historical). Backend change: checkpoint branch filter. All 19 items implemented; gates green (see Verification below).

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

> Governing contract: PRODUCTIZATION_SPEC (deleted 2026-10-25; binding parts are now [PRODUCT_SPEC Appendix A](docs/specs/PRODUCT_SPEC.md)).
> As-built baseline: SPEC_REPORT (deleted 2026-10-25; superseded by [CODEBASE_MAP](docs/specs/impl/CODEBASE_MAP.md)).

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

### Phase 1 — Secure single-user cloud product (✅ implemented + proven live 2026-10-15)

Real JWT identity + HttpOnly cookie session (PROD-001); OAuth callback/session fix; secrets out of browser
storage (PROD-011); Redis provisioned; user/workspace scoping with RLS defense-in-depth (PROD-002);
V3–V6 migration defects fixed, least-privilege grants, `provision_user()` login provisioning, schema-version
readiness (PROD-005); Flyway-as-owner automation + db-init roles + compose verification.
Proof: backend 77/77 (two-user isolation, app-role, V6 upgrade), frontend 90 + 126 E2E, AND a fresh
compose stack booting clean (SAML/OAuth2 offline-safe defaults, JWT fail-fast) with a live two-user
magic-link → cookie → CRUD + isolation + logout run under the `archflux_app` role (exit met).

### Phase 2+ — superseded by PRODUCT_SPEC §7 (R1–R4); PRODUCTIZATION_SPEC deleted 2026-10-25
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

### Spec-driven, agent-ready (v3.8.0)

1. **Spec first:** change the owning spec, then `docs/specs/impl/DATA_MODEL_R1.md` if the contract
   changes.
2. **Task:** write the task section in the epic.
3. **Implement and test:** do the work, then test against the task's acceptance.
4. **Review:** a reviewer checks it, then BACKLOG is set to done.

Any AI agent, including free or small models, starts at [AGENTS.md](AGENTS.md) and picks work from
[docs/specs/impl/BACKLOG.md](docs/specs/impl/BACKLOG.md). Roles and prompts are in
[docs/agents/](docs/agents/README.md).

### Local Setup
```bash
# Backend service (needs Docker for PostgreSQL + Redis)
docker compose -f backend/compose.yml up -d db redis
cd backend && mvn spring-boot:run            # http://localhost:3001

# Frontend service (dev server proxies /api → :3001)
cd frontend && npm install && npm run dev    # http://localhost:5173

# Integrated stack (same-origin, nginx proxies /api)
docker compose up -d --build                 # http://localhost:8080

# Separate stacks (cross-origin)
docker compose -f backend/compose.yml up -d --build    # API  :3001
docker compose -f frontend/compose.yml up -d --build   # web  :8080
```

### Testing Gates
| Layer | Command | Must Pass |
|-------|---------|-----------|
| Frontend TypeScript | `cd frontend && npx tsc -b` | 0 errors |
| Frontend Lint | `cd frontend && npm run lint` | 0 errors |
| Frontend Unit | `cd frontend && npm test` | all passed (163+ at 2026-10-24) |
| Frontend E2E | `cd frontend && npm run test:e2e` | critical journeys green |
| Visual Regression | `cd frontend && npm run test:visual` | baselines green |
| Backend Tests | `cd backend && mvn test` | all passed (92+ at 2026-10-24) |
| Compose | `docker compose config --quiet` (root + each service file) | valid |
| Images | `docker build frontend` · `docker build backend` | success |

### Before Merge
```bash
(cd frontend && npx tsc -b && npm run lint && npm test && npm run build)
(cd backend && mvn test)
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