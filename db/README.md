# ArchFlux database (`db/`)

Owner: Agent B. Everything database-related lives here; nothing outside `db/` is touched.

## Layout

| Path | Purpose |
|---|---|
| `migrations/V1__init.sql` | Initial schema: 6 tables, FKs (`ON DELETE CASCADE`), `updated_at` trigger, 6 indexes. **Never edit after apply** — new changes go in `V2__...`. |
| `roles.sql` | `archflux_app` (DML-only) + `archflux_migrator` (DDL path) roles, grants, password wiring. Run **after** V1, as owner/superuser. |
| `seed.dev.sql` | Local-dev seed (demo user/diagram/checkpoint/thread/reply). Idempotent. **Never apply to staging/prod.** |

## How to run

Fresh database from empty (order matters: schema → roles → seed):

```sh
BASE="host=localhost port=5432 dbname=archflux user=postgres"

# 1. Schema (re-runnable; safe to re-apply)
psql "$BASE" -v ON_ERROR_STOP=1 -f db/migrations/V1__init.sql

# 2. Roles. Passwords are psql variables — never stored in this repo.
#    Shown values are LOCAL-DEV-ONLY defaults; prod must pass strong unique
#    passwords per role from a secret manager.
psql "$BASE" -v ON_ERROR_STOP=1 \
  -v APP_PASSWORD='dev-app-only' \
  -v MIGRATOR_PASSWORD='dev-migrator-only' \
  -f db/roles.sql

# 3. Dev seed (optional, local only; re-runnable — 2nd run inserts 0 rows)
psql "$BASE" -v ON_ERROR_STOP=1 -f db/seed.dev.sql
```

Managed hosts (RDS/Neon/Supabase): `CREATE EXTENSION` needs superuser/owner. If V1
emits a `MANAGED-HOST FALLBACK` NOTICE, have an admin run
`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;` and
`CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;`, then re-run V1.

## Hot queries & EXPLAIN (verified 2026-10-03, Postgres 17.11, scratch DB + ~2k diagrams)

All `EXPLAIN`s below were run **as `archflux_app`** (proving SELECT privilege too),
after bulk-loading 20 owners × 100 diagrams (3 checkpoints, 2 threads, 4 sync rows
each) + `ANALYZE`.

**Q1 — diagrams-by-owner feed** (used by `GET /api/v1/diagrams`)
```sql
SELECT id,title,updated_at FROM diagrams
 WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 20;
```
```
Limit  (cost=0.28..26.23 rows=20 width=31)
  ->  Index Scan using idx_diagrams_owner_updated on diagrams
        Index Cond: (owner_id = '...'::uuid)
```
No `Sort` node — the composite index delivers the order. ✅

**Q2 — checkpoints-by-doc** (`GET /:id/checkpoints`)
```sql
SELECT id,title,created_at FROM checkpoints
 WHERE diagram_id=$1 ORDER BY created_at DESC LIMIT 20;
```
```
Limit
  ->  Sort  (Sort Key: created_at DESC)            -- 3-row in-memory sort
        ->  Bitmap Heap Scan on checkpoints
              ->  Bitmap Index Scan on idx_checkpoints_diagram_created
                    Index Cond: (diagram_id = '...'::uuid)
```
Index drives access; residual sort is over the per-doc fan-out only. ✅

**Q3 — threads-by-doc** (`GET /:id/threads`)
```sql
SELECT id,author,resolved FROM threads WHERE diagram_id=$1;
```
```
Bitmap Heap Scan on threads
  ->  Bitmap Index Scan on idx_threads_diagram
        Index Cond: (diagram_id = '...'::uuid)
```
✅

**Q4 — replies-by-thread** (`GET /:id/threads/:tid/replies`)
```sql
SELECT id,author,created_at FROM replies WHERE thread_id=$1 ORDER BY created_at;
```
```
Sort  (Sort Key: created_at)                        -- 3-row in-memory sort
  ->  Bitmap Heap Scan on replies
        ->  Bitmap Index Scan on idx_replies_thread
              Index Cond: (thread_id = '...'::uuid)
```
✅

**Q5 — sync-log-by-doc** (sync feed)
```sql
SELECT id,actor,commit_sha,created_at FROM sync_log
 WHERE diagram_id=$1 ORDER BY created_at DESC LIMIT 20;
```
```
Limit
  ->  Sort  (Sort Key: created_at DESC)             -- 4-row in-memory sort
        ->  Bitmap Heap Scan on sync_log
              ->  Bitmap Index Scan on idx_sync_log_diagram_created
                    Index Cond: (diagram_id = '...'::uuid)
```
✅

**Q6 (bonus) — tag containment, GIN**
```sql
SELECT id,title FROM diagrams WHERE tags @> ARRAY['t1'];
```
Default plan is a `Seq Scan` at this scale (2001 rows, ~20% match — correctly cheaper).
With `SET enable_seqscan=off` the index path is confirmed usable:
```
Bitmap Heap Scan on diagrams
  Recheck Cond: (tags @> '{t1}'::text[])
  ->  Bitmap Index Scan on idx_diagrams_tags_gin
```
✅ GIN index works; planner will pick it once the table outgrows seqscan breakeven.

No unexpected `Seq Scan` on any hot path at production-like row counts.

## Privileges

| Capability | `archflux_app` (runtime API) | `archflux_migrator` (deploys) |
|---|---|---|
| `CONNECT` / `USAGE` on db + `public` schema | ✅ | ✅ |
| `SELECT, INSERT, UPDATE, DELETE` on all 6 tables | ✅ | ✅ (via `ALL`) |
| `USAGE, SELECT` on `sync_log_id_seq` (bigserial) | ✅ | ✅ (via `ALL`) |
| `CREATE` on schema / `CREATE TABLE` / `CREATE INDEX` / `ALTER` | ❌ denied (verified: `permission denied for schema public`, `must be owner of table diagrams`) | ✅ |
| Future tables by migrator → app gets DML | via `ALTER DEFAULT PRIVILEGES` | — |

Passwords: separate per role, supplied as psql variables
`-v APP_PASSWORD=... -v MIGRATOR_PASSWORD=...`. Missing variable aborts the script
(fail-closed — never creates a passwordless login). Dev defaults above are for
local Docker only.

## Verification transcript (scratch Docker `postgres:17-alpine`)

1. `V1__init.sql` on empty DB with `ON_ERROR_STOP=1` → 16 statements, no errors.
2. Re-run V1 → same output, no errors (idempotent); `\dt` = 6 tables, 13 indexes total (6 custom + PKs/unique).
3. `roles.sql` → grants applied; `seed.dev.sql` run 1 → `INSERT 0 1` ×5; run 2 → `INSERT 0 0` ×5 (no duplicate-key errors); counts = 1/1/1/1/1.
4. EXPLAIN Q1–Q5 as `archflux_app` → index usage confirmed (above); Q6 GIN confirmed with `enable_seqscan=off`.
5. As `archflux_app`: `INSERT/UPDATE/DELETE` on diagrams ✅, `updated_at` trigger fired (`updated_at > created_at` = t) ✅, `INSERT` into `sync_log` (sequence) ✅ and `checkpoints` ✅.
6. As `archflux_app`: `CREATE TABLE` → `ERROR: permission denied for schema public` ✅; `CREATE INDEX` → `ERROR: must be owner of table diagrams` ✅.
7. Cascade: delete user → diagrams/threads/replies rows gone (0/0/0) ✅.
