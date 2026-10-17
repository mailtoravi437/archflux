# LLDLens

A practice platform for Low-Level Design (LLD) interviews. Candidates design a
class model and implementation for a problem (e.g. "design a parking lot"),
then get judged primarily by running their code against input → expected-output
test cases — the same mechanic LeetCode uses for algorithms, applied to design.
A smaller secondary layer (design rubric + optional peer review) covers what
pure I/O correctness can't: SOLID adherence, pattern choice, extensibility.

**Scoring weight**: 70% automated tests · 20% design rubric · 10% peer review.

## Stack
- **Frontend**: React + TypeScript (Vite), React Query, react-flow (UML canvas),
  Monaco (code editor), STOMP/SockJS (live test results)
- **Backend**: Java 21, Spring Boot 3 (Web, Security, Data JPA, WebSocket,
  Data Redis), JWT auth, Flyway migrations
- **Database**: PostgreSQL (system of record, JSONB for flexible
  diagram/rubric/test-case shapes) + Redis (leaderboards, pub/sub, caching)
- **Code execution**: dispatched to an external, network-isolated sandbox judge
  service (contract only — see `JudgeDispatchService`; the sandbox itself is
  intentionally NOT implemented here, see note below)

## Running locally

```bash
docker compose up --build
```

This starts Postgres, Redis, the Spring Boot API on `:8080`, and the React
app on `:5173`. Flyway applies the schema automatically on backend startup.

Backend alone (with Postgres/Redis already running):
```bash
cd backend
mvn spring-boot:run
```

Frontend alone:
```bash
cd frontend
npm install
npm run dev
```

## What's fully implemented here
- Auth (signup/login, JWT, BCrypt, Spring Security filter chain, CORS)
- Problem Bank: search/filter API + screen
- Practice Session: draft creation, autosave, UML canvas + code editor +
  live Test Console over WebSocket
- Judge orchestration: `SubmissionService.runTests` dispatches each test case,
  persists `JudgeResult` rows, streams results live, and triggers scoring
- Weighted composite scoring (`ScoringService`, unit-tested)
- Global exception handling with environment-aware error detail exposure
- Flyway-versioned schema, Dockerfiles, docker-compose, GitHub Actions CI

## What you still need to build before this is truly production-ready
1. **The sandbox judge service itself.** `JudgeDispatchService` is a clean
   HTTP client against a `/execute` contract, but does not include an actual
   sandbox implementation — running arbitrary user-submitted code safely
   requires real container/VM isolation (e.g. Judge0, gVisor, Firecracker)
   with strict CPU/memory/network limits. This is a security-critical
   component and deserves its own dedicated build-out and review, not a
   generated stub.
2. **Peer review, battles, and dashboard modules** — schema exists
   (`reviews`, `battles`, `badges` tables) but controllers/services for
   those screens aren't scaffolded yet; follow the same
   controller → service → repository pattern used for `submission`.
3. **Refresh tokens** — access tokens are short-lived; add a refresh-token
   flow before shipping (schema/JJWT setup makes this a small addition).
4. **Rate limiting** on `/api/submissions/*/run` — this is the most
   compute-expensive path once the sandbox is live; put a Redis-backed
   limiter in front of it.
5. **Observability** — Actuator/Prometheus endpoints are exposed but not
   wired to an actual metrics backend (Grafana/Datadog/etc.) yet.
6. **Secrets management** — `.env`/docker-compose defaults are for local dev
   only; use a real secrets manager (AWS Secrets Manager, Vault, etc.) for
   `JWT_SECRET` and DB credentials in any deployed environment.
