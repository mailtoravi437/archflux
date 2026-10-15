# ArchFlux — Productization Specification

**Version:** 3.0.0
**Date:** 2026-10-15
**Status:** Proposed product contract
**Purpose:** Turn ArchFlux from a feature-rich architecture editor into
a reliable, sellable, production-ready product.

> **Adoption note (2026-10-15):** Adopted as the governing product contract per owner direction.
> See [Master Spec](SPEC.md) for the documentation index and per-PR maintenance protocol.
> Implementation status is tracked in [SPEC.md](SPEC.md#productization-v300-work-plan) and
> [SPEC_REPORT.md](SPEC_REPORT.md).

---

## 1. Executive decision

ArchFlux should launch as a **Git-first living architecture platform**
for engineering teams. It helps teams create architecture diagrams,
connect them to source-of-truth artifacts, detect meaningful changes,
validate architecture rules, and review changes before they reach
production.

The canvas is the authoring surface. The product's durable value is the
trustworthy link between architecture intent and implementation reality.

### Product promise

> Design your architecture once. Keep it connected to reality. Catch
> risky changes before they become production surprises.

### Product principles

1. **Truth over theater:** never present simulated or stale data as live.
2. **Safe by default:** tenant isolation, least privilege, secrets
   hygiene, and explicit permissions are release blockers.
3. **Git-first and reversible:** architecture changes are reviewable,
   diffable, exportable, and recoverable.
4. **Local-first, cloud-optional:** guest authoring remains useful
   without an account; cloud collaboration and governance require
   authenticated workspace access.
5. **Incremental delivery:** ship a narrow, reliable vertical slice
   before enabling every connector and enterprise feature.
6. **Observable behavior:** every sync, validation, import, export,
   review, and webhook has a traceable outcome.
7. **No silent data loss:** mutations are versioned, recoverable, and
   idempotent where retries can occur.

## 2. Target customer and scope

### Initial ideal customer profile

Small-to-mid-sized software engineering teams (5–100 engineers)
operating cloud-native systems, using GitHub, Kubernetes, and OpenAPI.
They need architecture documentation that remains useful as code and
infrastructure change.

### Primary users

- **Software engineer:** creates and updates diagrams.
- **Staff/principal engineer:** reviews architecture, dependencies,
  and design trade-offs.
- **Platform engineer:** connects repositories and infrastructure sources.
- **Engineering manager / reviewer:** approves changes and checks standards.
- **Workspace admin:** manages membership, access, integrations, and retention.

### Jobs to be done

- Create an architecture diagram quickly without losing precision.
- Import an existing architecture and continue editing it.
- Know which source changes made the diagram stale.
- See a meaningful before/after diff in a pull request.
- Block or warn on architecture policy violations.
- Collaborate with teammates without overwriting one another's work.
- Export architecture artifacts without being locked into ArchFlux.

### Explicit non-goals for the first production release

- Full cloud-resource discovery across every provider.
- Automatic, unrestricted writes back to infrastructure.
- A general-purpose project-management suite.
- Full enterprise SAML/SCIM/compliance certifications before core
  isolation and auditability are proven.
- AI-generated architecture as a core dependency.
- Claims of real-time collaboration until a two-user, multi-instance test passes.
- A visual feature that is only a mock but appears production-backed.

## 3. Product tiers and release boundary

### Release A — Reliable single-user product

Must support:

- Local guest editing and durable local persistence.
- Validated `.arch` import/export.
- Deterministic diagram editing, undo/redo, checkpoints, and local lint.
- Backend persistence for authenticated users.
- Secure login, logout, session expiry, and account isolation.
- Automated migrations and recoverable deployment.
- A clear product status for every feature: Local, Connected, Stale, Failed, or Demo.

### Release B — Team collaboration and GitHub workflow

Only after Release A gates pass:

- Workspace membership and server-enforced roles.
- Authenticated comments, review requests, approvals, and audit events.
- GitHub App integration with least-privilege permissions.
- Idempotent webhook ingestion and pull-request checks.
- Architecture diffs and merge gates based on deterministic validation.

### Release C — Living infrastructure

Only after connector contracts and security reviews:

- Read-only Kubernetes manifest/cluster ingestion.
- OpenAPI contract ingestion.
- Terraform plan/state ingestion with explicit limitations.
- Drift history, source timestamps, confidence, and reconciliation preview.
- Optional polling/webhooks with rate limits and retry controls.

### Release D — Enterprise

- SAML/OIDC policy enforcement, SCIM, configurable retention, data
  residency where supported, advanced audit export, enterprise key
  management, and organization policy packs.
- These features require operational evidence and contractual review,
  not just settings screens.

**Release rule:** do not expose a capability as generally available
until its acceptance criteria and operational evidence are met.
Otherwise mark it Preview, Demo, or Not connected in the UI and docs.

## 4. MVP product requirements

### P0 — Release blockers

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| PROD-001 | Identity is real | Every authenticated API request validates a signed, expiring credential and resolves a real user ID; no shared development identity in production. |
| PROD-002 | Workspace isolation | Automated tests prove User A cannot read, mutate, export, list, or infer User B's private diagrams, checkpoints, threads, or sync logs. |
| PROD-003 | Safe guest mode | Guest mode makes no unexpected network requests and clearly distinguishes local-only data from cloud-saved data. |
| PROD-004 | Reliable persistence | Save failures are visible; retries are bounded; the UI never reports success before persistence is confirmed when cloud persistence is expected. |
| PROD-005 | Schema and migration integrity | Fresh database install and upgrade-from-supported-version pass in CI; migration history is immutable and checksummed. |
| PROD-006 | Import safety | Validate schema, payload size, entity counts, IDs, references, and supported version before mutation; failed imports leave the previous graph unchanged. |
| PROD-007 | Export portability | Export/import round-trip preserves supported nodes, edges, strokes, text, metadata, and stable IDs; unsupported fields are reported. |
| PROD-008 | Honest sync state | Connected, last-success time, source revision, freshness, drift count, and last error are visible and based on actual connector results. |
| PROD-009 | Auditability | Security-sensitive actions and review decisions have actor, workspace, resource, timestamp, outcome, and correlation ID. |
| PROD-010 | Operable deployment | Health and readiness distinguish process health, dependency health, and schema compatibility; backup/restore is tested. |
| PROD-011 | Security baseline | No default production secrets, no provider tokens in browser localStorage, strict CORS, secure cookie/token strategy, rate limits, and security headers. |
| PROD-012 | Testable claims | CI runs unit, integration, migration, API-contract, and critical E2E suites; skipped tests are reported separately. |

### P1 — Core product differentiation

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| PROD-020 | Architecture diff | Compare two saved versions and explain added, removed, and changed entities and properties. |
| PROD-021 | Review workflow | Request review, comment, approve/request changes, and preserve a tamper-evident decision history. |
| PROD-022 | GitHub integration | Installation, webhook verification, retries, deduplication, and pull-request status checks are end-to-end tested. |
| PROD-023 | Validation policy | Rules have stable IDs, severity, explanation, affected entities, and deterministic results. |
| PROD-024 | Team roles | Server enforces Admin, Editor, Reviewer, and Viewer permissions on every relevant endpoint. |
| PROD-025 | Recovery | Users can restore a checkpoint and recover from a failed sync or rejected import without losing the last known-good version. |

## 5. Critical product decisions

Resolve these before building more features.

### 5.1 Collaboration transport

**Recommendation:** choose one transport and remove the unused path.
Since the current client uses Yjs/y-websocket, the smallest path to true
collaborative editing is a compatible Yjs server with authenticated
WebSocket handshake, room-level authorization, persistence, and
multi-instance behavior. If that is too large for the initial release,
defer real-time collaboration and ship explicit single-editor/refresh
semantics rather than pretending it works.

Acceptance:

- Two authenticated users edit the same diagram in separate browsers.
- Concurrent edits converge without data loss.
- Unauthorized users cannot join a room by guessing its ID.
- Reconnect, server restart, and duplicate message tests pass.
- Presence disappears on disconnect and does not leak across workspaces.
- Collaboration works across at least two server instances, or deployment
  explicitly enforces one instance until shared state is implemented.

### 5.2 Source of truth

For each diagram, define one of:

- **Local:** browser is the source of truth.
- **Cloud document:** ArchFlux server is the source of truth.
- **Git-managed:** a versioned `.arch` artifact in a repository is the source of truth.
- **Connected source:** Kubernetes/OpenAPI/Terraform is authoritative for
  selected fields; user-owned layout and annotations remain ArchFlux-owned.

Never merge these models implicitly. Show field ownership, conflict
behavior, and the last successful source revision.

### 5.3 Authentication strategy

Use Spring Security's standard authentication chain. Validate JWT
signature, issuer, audience, expiry, not-before, and key rotation; or
use a secure server-side session strategy. Do not compare user JWTs
against a static API token. Keep service credentials separate from user
identity.

- Production must fail startup if signing keys or required identity
  configuration are missing.
- Prefer short-lived access credentials and a deliberate refresh/revocation design.
- If cookies are used, implement CSRF protection and secure cookie attributes.
- OAuth callback state and nonce must be validated.
- Magic links must be single-use, short-lived, hashed at rest,
  rate-limited, and never logged in production.
- Return generic auth errors that do not reveal whether an email exists.
- Do not store OAuth provider access tokens unless required; encrypt
  them with managed key material and define revocation/deletion behavior.

### 5.4 Database isolation

Choose and document one coherent authorization boundary:

- **Recommended:** every resource query is scoped by workspace and
  authorized membership; PostgreSQL RLS provides defense in depth.
- Set request identity using transaction-scoped `SET LOCAL` values only
  after authentication, on the same connection/transaction used by the query.
- Test with the actual least-privilege application role, never only as a
  database owner/superuser.
- Audit trigger permissions and security-definer functions must be
  carefully reviewed for search path and privilege escalation.
- Soft-deleted rows must be excluded by default and restored only through
  explicit operations.

## 6. Product UX contracts

### 6.1 Status language

Use consistent, truthful status labels:

- **Local only:** saved in this browser; not backed up to the cloud.
- **Saved:** server acknowledged the latest version.
- **Saving:** a save is in progress.
- **Offline:** remote actions are unavailable; local changes may remain.
- **Pending sync:** changes are queued for remote delivery.
- **Stale:** source has changed or the last successful refresh exceeds policy.
- **Sync failed:** last attempt failed; show retry and details.
- **Demo data:** illustrative only; no live provider connection exists.
- **Connected:** credentials and permissions were verified against the actual provider.
- **Needs attention:** conflict, permission failure, expired credentials, or validation failure.

Do not use a green "Healthy" state for a connector that has only passed
local form validation.

### 6.2 Save and conflict behavior

- Local edits are immediately reflected in the canvas but remain visibly
  unsaved until persistence succeeds.
- Cloud saves carry a monotonically increasing version or ETag.
- Updates use optimistic concurrency (`If-Match`/version field); stale
  writes return a conflict instead of silently overwriting newer work.
- Retry only transient errors, with exponential backoff and jitter.
- Permanent validation/auth errors are not retried indefinitely.
- A conflict screen offers compare, keep mine, keep remote, or
  duplicate/branch. "Keep mine" must not silently discard remote changes.
- Idempotency keys are persisted across retries for mutations that support them.

### 6.3 Empty, loading, partial, and failure states

Every major screen must define:

- First-run empty state with a useful next action.
- Loading skeleton or progress state.
- Partial data state when one source fails.
- Offline state and available local actions.
- Permission-denied state.
- Retryable vs non-retryable error.
- Destructive action confirmation and recovery where feasible.
- Keyboard and screen-reader behavior.

### 6.4 Accessibility and interaction

Target WCAG 2.2 AA for core workflows. Keyboard operation must cover
diagram creation, selection, connecting, inspection, review, and
dialogs. Respect reduced-motion settings. Do not rely on color alone to
indicate drift, severity, or selection. Re-enable skipped accessibility
tests or explicitly track them as release blockers.

## 7. Domain model and data ownership

Use a workspace boundary even if the first release supports only one
user per workspace.

### Core entities

- `User`: identity and profile, not provider secrets.
- `Workspace`: tenant boundary, settings, plan, lifecycle.
- `WorkspaceMembership`: user, role, status, invited-by, timestamps.
- `Diagram`: workspace, owner/creator, title, format version, source
  mode, current revision, deletion state.
- `DiagramRevision`: immutable snapshot, parent revision, content hash,
  author, source metadata, timestamp.
- `Checkpoint`: named pointer to an immutable revision, not a mutable
  copy without lineage.
- `Review`: target revision/PR, status, policy result, reviewer decisions.
- `ReviewThread` and `Reply`: scoped to workspace and diagram/revision;
  immutable audit events for resolution and deletion.
- `Connector`: provider, workspace, credential reference, scope, state,
  last successful sync, cursor/revision.
- `SyncRun`: source revision, start/end, status, counts, retryability,
  error code, correlation ID.
- `DriftFinding`: stable rule/finding ID, source entity, expected vs
  observed, severity, first/last seen, disposition.
- `WebhookEvent`: provider event ID, payload hash, received/processed
  timestamps, status, retry count.
- `AuditEvent`: actor, workspace, action, resource, outcome, timestamp,
  correlation ID and carefully minimized metadata.

### Data model rules

- All tenant-owned records carry `workspace_id` directly or are scoped
  through a parent relation with enforced checks.
- Use foreign keys and unique constraints to enforce invariants, not
  only service-layer code.
- Add a unique constraint for provider event IDs and source revisions
  where the semantics require uniqueness.
- Use optimistic versioning for mutable resources.
- Keep immutable revisions separate from the current mutable working graph.
- Define deletion, retention, export, and account closure behavior.
- Do not store provider secrets in diagram JSON, browser storage, logs,
  or audit payloads.
- Index real access patterns; validate with query plans and
  representative data volume.

## 8. API and backend contracts

### API conventions

- Base path: `/api/v1`.
- OpenAPI is generated from the actual API and committed or published
  as a build artifact.
- Standard error envelope: `code`, safe `message`, `correlationId`,
  optional field errors. Never expose stack traces, SQL, tokens, or
  secret-bearing provider responses.
- Pagination is cursor-based for growing collections; enforce maximum page size.
- Every mutating endpoint validates authorization, schema, size, and state transition.
- Use idempotency keys for externally retried create/sync operations where appropriate.
- Use ETags/version fields for diagram updates.
- Set request/body limits and per-user/workspace limits.
- Define API compatibility and deprecation policy.

### Core endpoint families

- `POST /auth/...`, `GET /auth/me`, `POST /auth/logout`, deliberate
  refresh/session endpoint.
- `GET/POST /workspaces`, membership and invitation endpoints.
- `GET/POST /diagrams`, `GET/PATCH/DELETE /diagrams/{id}`.
- `GET/POST /diagrams/{id}/revisions`, `GET /diagrams/{id}/diff`.
- `GET/POST /diagrams/{id}/checkpoints`, restore endpoint.
- `POST /diagrams/{id}/validate`, policy result endpoint.
- Review and thread endpoints scoped to diagram/revision/workspace.
- Connector lifecycle endpoints: create, verify, pause, resume, rotate, disconnect.
- Sync run endpoints: start, inspect, cancel where safe, retry.
- Webhook ingress endpoints with signature validation and durable deduplication.
- `GET /health/live`, `GET /health/ready` with minimal non-sensitive details.
- Admin audit export endpoint with explicit permission and audit event.

### API behavior requirements

- `401` means unauthenticated; `403` means authenticated but
  unauthorized; use `404` for foreign resources where existence
  disclosure is undesirable.
- `409` for version conflicts and duplicate state transitions.
- `413` for payload limit; `422` for semantically invalid diagram
  content; `429` for rate limit with `Retry-After`.
- Never treat malformed UUIDs, invalid JSON, unknown versions, and
  provider errors as generic `500`.
- External provider calls must have connect/read timeouts, bounded
  retries, circuit breaking where justified, and redacted errors.
- No network call or provider write should happen inside a database
  transaction unless the transaction model is explicitly designed for it.

## 9. Sync and drift engine

### Connector rollout order

1. `.arch` import/export and Git-managed artifact.
2. OpenAPI file/URL ingestion.
3. Kubernetes manifests from a repository.
4. Read-only Kubernetes API integration.
5. Terraform plan/state parsing.
6. Broader providers only after the connector contract is stable.

This order delivers useful value while limiting credentials and
infrastructure blast radius.

### Connector contract

Each connector must define:

- Supported source versions and resource types.
- Authentication and least-privilege permissions.
- Full sync and incremental sync behavior.
- Source identity and stable resource IDs.
- Pagination and rate-limit handling.
- Timeout, retry, backoff, and circuit-breaker policy.
- Last-known-good snapshot and rollback behavior.
- Deletion/tombstone semantics.
- Drift rules, false-positive limitations, and unsupported fields.
- Data retention and secret redaction.
- Test fixtures and contract tests.

### Sync algorithm

1. Authenticate and authorize the caller.
2. Create a durable `SyncRun` with an idempotency key.
3. Fetch source data under bounded timeout and least-privilege scope.
4. Validate and normalize to a versioned internal model.
5. Compare source state against the last accepted snapshot.
6. Generate deterministic findings and a preview.
7. Apply only the selected safe reconciliation strategy.
8. Store source cursor/hash, snapshot, findings, and outcome
   transactionally where possible.
9. Publish status and metrics.
10. Retry transient failures without duplicating revisions or findings.

**Default policy:** sync is read-only. Never mutate infrastructure
resources from ArchFlux in the MVP.

### Drift finding requirements

A finding includes:

- Stable identifier and rule version.
- Resource identity and source.
- Expected and observed values.
- Severity and confidence.
- First seen and last seen.
- Source revision and detection timestamp.
- Action: accept, dismiss with reason, or create review item.
- Reappearance behavior and disposition history.

"Accept" must specify whether it updates the diagram, accepts the source
as truth, or merely acknowledges the finding. Avoid ambiguous buttons.

## 10. GitHub and webhook reliability

- Prefer a GitHub App over a user PAT for team integrations.
- Request minimum repository permissions.
- Verify webhook signatures against the raw request body.
- Persist the event before acknowledging success.
- Deduplicate by provider delivery/event ID using a database unique constraint.
- Return success for already-processed duplicate events.
- Process asynchronously through a durable queue/outbox.
- Make handlers idempotent and record terminal failure with a replay mechanism.
- Do not perform long GitHub API work on the webhook request thread.
- Use bounded retries and a dead-letter/replay workflow.
- Store installation credentials securely; rotate and revoke on disconnect.
- Ensure pull-request checks are tied to the exact commit SHA and rule-set version.
- Test repeated, reordered, delayed, malformed, and concurrent webhook deliveries.

## 11. Security and privacy baseline

### Required before any shared production deployment

- Threat model covering account takeover, tenant escape, malicious
  imports, webhook spoofing, SSRF through connector URLs, token
  leakage, and denial of service.
- Secure auth flow with issuer/audience/expiry validation or secure
  server-side sessions.
- Workspace authorization at service and repository boundaries.
- Database least privilege and RLS defense in depth if RLS is retained.
- Secrets manager for provider credentials and signing keys.
- No secrets in localStorage, URL query strings, logs, telemetry,
  screenshots, or exports.
- Strict CORS allow-list; never combine wildcard origins with credentialed requests.
- Explicit CSRF posture for cookie-based authentication.
- CSP, HSTS, `X-Content-Type-Options`, framing protection, and safe referrer policy.
- SSRF defenses: block loopback, link-local, private and metadata IP
  ranges unless an explicitly authorized private connector mode is used;
  validate DNS and redirects to prevent rebinding.
- Import limits: max bytes, entities, nesting, string lengths, and processing time.
- Per-user/workspace and per-IP rate limits with trusted proxy configuration.
- Dependency scanning, secret scanning, container scanning, and SBOM generation.
- Data export and deletion flow; retention policy for diagrams, audit
  events, connector snapshots, and backups.
- Security incident runbook and credential revocation procedure.

### Logging and telemetry privacy

- Use structured logs with correlation IDs and stable error codes.
- Redact authorization headers, cookies, magic-link tokens, provider
  credentials, request bodies that contain secrets, and sensitive source content.
- Collect only product telemetry needed for reliability and adoption.
- Make telemetry opt-out and retention behavior explicit where required.
- Do not send diagram contents to third-party analytics by default.

## 12. Reliability, performance, and scale targets

These are proposed initial targets to validate in a representative
environment, not claims about current performance.

| Area | Initial target | Notes |
|------|----------------|-------|
| API latency | p95 < 300 ms for ordinary DB-backed reads/writes | Excludes external provider calls and large exports |
| Canvas interaction | p95 frame time < 16.7 ms for supported graph | Establish graph target size/device test profile |
| Autosave | Visible save acknowledgement within 1 s under normal conditions | Local render should not block on network |
| Availability | 99.5% monthly for initial hosted beta | Upgrade only after measured operations |
| Recovery point objective | ≤ 15 minutes for cloud-stored data | Depends on backup/WAL strategy |
| Recovery time objective | ≤ 4 hours for hosted beta | Must be demonstrated in restore drill |
| Sync processing | Explicit per-connector timeout and bounded queue age | Report delayed syncs; no indefinite "running" state |
| Data safety | Zero silent overwrite in concurrency tests | Conflicts must be surfaced |
| Security | Zero known critical/high release-blocking findings | Define exception and expiry process |

### Capacity planning and performance tests

- Define supported diagram sizes: nodes, edges, text objects, and revision count.
- Benchmark canvas pan/zoom, selection, lint, import/export, diff, and
  persistence at representative sizes.
- Test database queries with realistic tenant counts and skewed workspace sizes.
- Measure pool saturation, lock waits, queue lag, external provider
  throttling, and memory.
- Set bounded connection pools, queue sizes, payload sizes, and concurrency.
- Use load tests to establish limits before marketing throughput or scale claims.

## 13. Observability and operations

### Required telemetry

- Request count, latency, status, and error rate by endpoint.
- Auth success/failure and authorization-denial counts without sensitive identifiers.
- Database pool usage, query latency, lock waits, migration version, and readiness.
- Sync run duration, result, retries, source age, queue lag, and provider rate limits.
- Webhook receipt, duplicate rate, processing delay, failure count, and dead-letter depth.
- Save conflict rate, autosave failure rate, export/import failures.
- WebSocket connection count, reconnect rate, room authorization failures,
  and persistence failures if collaboration is enabled.

### Alerts

Alert on:

- Elevated 5xx or auth failures.
- Database unavailable, pool exhaustion, or schema mismatch.
- Sync queue age above threshold.
- Webhook backlog or dead-letter growth.
- Repeated connector credential failures.
- Backup failure or missed restore verification.
- Abnormal tenant authorization denials.
- Storage growth approaching quota.

### Operational requirements

- Runbooks for database restore, migration rollback strategy, key
  rotation, provider disconnect, queue replay, and incident response.
- Backups encrypted and stored outside the primary database failure domain.
- Perform periodic restore drills and record evidence.
- Use expand/contract migrations for zero-downtime schema changes.
- Graceful shutdown drains in-flight requests and workers within a bounded period.
- Readiness fails if the database schema is incompatible, not merely
  because V1 tables exist.
- Never use liveness to represent downstream dependency health.

## 14. Architecture recommendation

### Initial deployment topology

- **Web:** static React build served by CDN/nginx with strict security headers.
- **API:** stateless Spring Boot service behind a load balancer.
- **Database:** managed PostgreSQL with migrations applied by a dedicated
  deployment step and a least-privilege runtime role.
- **Queue:** durable managed queue for webhooks and connector jobs when
  asynchronous processing is introduced.
- **Worker:** isolated connector/webhook workers with bounded concurrency
  and outbound network policy.
- **Object storage:** optional for large exports/snapshots/backups;
  never use it as an unversioned source of truth.
- **Secrets manager:** provider credentials, OAuth secrets, JWT/signing
  keys, webhook secrets.
- **Observability:** metrics, structured logs, tracing, error reporting, and dashboards.

Redis should be introduced only for a defined need such as distributed
rate limits, ephemeral session state, or collaboration presence. Durable
idempotency, webhook deduplication, revision history, and sync state
belong in PostgreSQL or a durable queue — not only in process memory.

### Service boundaries

Start with a **modular monolith**:

- Identity and workspace authorization.
- Diagram and revision domain.
- Validation and diff engine.
- Connector orchestration.
- Review and audit.
- Webhook ingress and background jobs.

Split into separate deployable services only when scaling, security
isolation, ownership, or reliability evidence justifies the operational
cost. Avoid premature microservices.

### State placement

| State | Correct home |
|-------|--------------|
| Unsaved local guest edits | Browser storage |
| Authenticated diagram and revision | PostgreSQL |
| Idempotency and webhook event record | PostgreSQL unique constraints |
| Background task delivery | Durable queue/outbox |
| Short-lived cache/presence | Redis or collaboration service |
| Provider credentials | Secrets manager/encrypted server-side storage |
| Audit trail | Durable append-oriented database/storage |
| Backups | Encrypted off-site storage |

## 15. Testing strategy and release gates

### Test pyramid

1. **Unit:** schema validation, lint rules, diff engine, normalization,
   permission policies, idempotency logic.
2. **Integration:** PostgreSQL migrations, repository scoping, RLS under
   the real application role, OAuth/JWT filters, queue/outbox, webhook deduplication.
3. **Contract:** generated OpenAPI, connector fixtures, GitHub webhook
   signature vectors, provider response variations.
4. **E2E:** guest authoring, login, save/reload, import/export, conflict
   handling, team authorization, review, connector failure and recovery.
5. **Security:** tenant isolation matrix, SSRF, malformed imports, token
   leakage checks, rate limits, dependency scans.
6. **Performance:** representative canvas sizes, concurrent edits,
   list/search, revision diffs, sync jobs, webhook bursts.
7. **Recovery:** restore database backup, replay failed job, recover from
   interrupted migration according to documented procedure.

### Mandatory CI gates

- Frontend type-check, lint, unit tests, production build.
- Backend unit and integration tests against PostgreSQL matching production major version.
- Apply all migrations to a fresh database and upgrade from each supported previous release.
- Run tests under the runtime database role — not database owner.
- OpenAPI generation and breaking-change diff.
- Critical Playwright journeys.
- Security and secret scanning.
- Docker image build and compose/deployment configuration validation.
- No unexplained skipped tests; report passed, failed, skipped, and flaky counts separately.
- Visual regression thresholds calibrated per screen and icon-sensitive regions.
- Release artifact includes commit SHA, build metadata, schema version, and SBOM.

### Release acceptance suite

A release candidate is rejected if any of these fail:

1. Two tenants cannot access each other's resources.
2. Authentication works without a shared development token.
3. Fresh install and upgrade migrations pass.
4. A repeated webhook cannot create duplicate resources or revisions.
5. A stale write cannot silently overwrite a newer version.
6. Import failure leaves the previous diagram unchanged.
7. Backup restore passes.
8. UI does not label mocked data as live.
9. Core workflows work on supported desktop and mobile viewport sizes.
10. Logs and errors do not expose secrets or private diagram content.

## 16. Delivery roadmap

### Phase 0 — Freeze and establish truth (1–3 days)

- Commit and tag a reproducible baseline.
- Inventory each feature as Shipped, Partial, Simulated, Broken, or Planned.
- Generate endpoint, migration, test, dependency, and persistence
  inventories from code.
- Decide the first release boundary.
- Add feature flags or remove misleading entry points for incomplete functionality.

**Exit:** clean checkout reproduces the reported build and tests;
product claims match observed behavior.

### Phase 1 — Secure single-user cloud product (1–2 weeks)

- Replace shared static-token identity with real validated identity.
- Fix OAuth route/callback and session lifecycle.
- Remove secrets from browser storage.
- Provision Redis only if still required; otherwise remove accidental runtime dependency.
- Scope every diagram and child resource to user/workspace.
- Fix migration defects, least-privilege grants, RLS context, and readiness.
- Automate migration execution and clean deployment.
- Test save/reload, export/import, and user isolation end to end.

**Exit:** a fresh deployment supports two distinct users safely and reliably.

### Phase 2 — Data integrity and operating quality (1–2 weeks)

- Immutable revisions and optimistic concurrency.
- Durable idempotency and webhook event records.
- Audit events for sensitive actions.
- Backup/restore and migration-upgrade tests.
- Metrics, alerts, runbooks, and production security headers.
- Accurate product states and error recovery.

**Exit:** failures are visible, recoverable, and do not silently corrupt data.

### Phase 3 — GitHub and review workflow (2–4 weeks)

- GitHub App installation and least-privilege permissions.
- Durable webhook inbox/outbox and deduplication.
- Exact-commit validation status.
- Revision diff, review comments, approvals, policy checks.
- End-to-end pull-request tests including duplicate/out-of-order events.

**Exit:** a real repository event produces a repeatable, auditable review result.

### Phase 4 — First real source connector (2–4 weeks)

Start with OpenAPI ingestion or Kubernetes manifests in Git. Choose one
based on design-partner demand. Implement a complete connector contract,
preview, diff, history, errors, retries, and fixture tests before adding
more sources.

**Exit:** users can explain where every finding came from and reproduce a sync result.

### Phase 5 — Collaboration (time-boxed architecture decision)

Either implement Yjs-compatible server persistence, authorization, and
multi-instance behavior, or explicitly defer live collaboration. Do not
ship a half-connected transport.

**Exit:** two-client concurrency, reconnect, restart, authorization, and
multi-instance tests pass — or feature is not marketed as live.

### Phase 6 — Beta and product validation

- Recruit 5–10 engineering teams.
- Observe activation, time-to-first-diagram, successful imports, weekly
  active teams, repeat usage, and review completion.
- Conduct security review and recovery drill.
- Fix top workflow blockers before expanding feature breadth.
- Publish limits, supported connectors, data handling, and known limitations.

The estimates are planning ranges, not commitments. Re-estimate after
repository-level implementation review.

## 17. Product analytics and success metrics

Track product outcomes rather than vanity usage.

### Activation

- Time from first launch to first saved diagram.
- Percentage completing a diagram and returning within seven days.
- Import success rate and time-to-first-useful-diff.

### Reliability

- Save success/failure rate.
- Sync success rate and median/p95 duration by connector.
- Duplicate webhook/revision rate.
- Conflict rate and recovery success.
- Crash-free sessions and critical workflow completion.

### Retention and value

- Weekly active workspaces.
- Repeat diagram edits and reviews per workspace.
- Percentage of connected diagrams with a recent successful sync.
- Architecture findings reviewed/resolved.
- Pull requests with successful architecture checks.

Do not collect diagram content for analytics by default. Establish metric
definitions, retention, opt-out, and ownership before instrumenting.

## 18. Commercial readiness gaps

Before public launch, provide:

- Product landing page with truthful feature availability.
- Onboarding that creates a useful first diagram without requiring integration setup.
- Sample architecture data clearly marked as sample.
- Pricing/plan limits and quota behavior.
- Terms, privacy policy, data deletion/export process, and support contact.
- Supported browser/runtime matrix and known limitations.
- Status page and incident communication process for hosted service.
- Changelog, versioning, migration compatibility, and deprecation policy.
- Customer support triage and security vulnerability reporting.
- Design-partner feedback loop and an owner for product decisions.

## 19. Risks and decisions register

| Decision/risk | Recommendation | Must be resolved by |
|---------------|----------------|---------------------|
| Shared static API token | Remove from user authentication; retain separate service credentials only where justified | Phase 1 |
| RLS session context | Set transaction-scoped identity after authentication and test under app role | Phase 1 |
| V3 migration/check constraint defects | Fix before baseline is called production-ready; test fresh and upgrade paths | Phase 1 |
| PostgreSQL version skew | Align local, CI, and production major versions | Phase 1 |
| In-memory idempotency/rate limit | Durable DB constraints for idempotency; distributed rate limiting where needed | Phase 2 |
| Webhook duplicate creation | Durable event inbox + unique delivery ID + idempotent handler | Phase 2 |
| Collaboration transport mismatch | Implement one transport fully or defer feature | Phase 5 |
| Simulated connectors and approvals | Hide, label Demo, or replace with real end-to-end paths | Phase 0 onward |
| LocalStorage PAT | Move to server-side encrypted credential storage / GitHub App | Phase 1–3 |
| Excessive frontend file size | Refactor only when tests and behavior are stable; avoid broad rewrite during hardening | Phase 2+ |
| Scope too broad | Prioritize secure persistence, reliable diff, and one real integration | All phases |

## 20. Definition of "actual product"

ArchFlux can be called production-ready for its declared release scope only when:

- [ ] The shipped feature set is explicitly bounded and honest.
- [ ] A clean checkout builds reproducibly.
- [ ] Fresh deployment and supported upgrades work automatically.
- [ ] Authentication, workspace authorization, and tenant isolation are tested.
- [ ] Diagram revisions, conflicts, imports, exports, and recovery preserve data.
- [ ] One customer-critical workflow is complete end to end.
- [ ] Integrations are real, scoped, observable, and idempotent.
- [ ] Backups and restores are proven.
- [ ] CI blocks security, migration, contract, and critical E2E regressions.
- [ ] Production dashboards, alerts, and runbooks exist.
- [ ] Privacy, deletion, support, limitations, and pricing are documented.
- [ ] At least several design-partner teams can complete the core workflow without founder intervention.

## Final product recommendation

Do not add another large feature set yet. Freeze scope and fix the trust
boundary first. Then deliver this vertical slice:

**Create/import architecture → save a versioned diagram → connect one
real source → produce a deterministic diff → validate rules → review the
change → preserve an auditable result.**

That sequence creates a product engineering teams can trust, while
preserving ArchFlux's local-first canvas and its longer-term vision of
living architecture.
