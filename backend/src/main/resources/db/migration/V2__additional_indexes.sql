-- ArchFlux V2 — additional indexes for query performance.
-- Apply AFTER V1__init.sql on the same database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V2__additional_indexes.sql
--
-- These indexes support common query patterns not covered by V1.

-- ---------------------------------------------------------------- 1. threads: diagram + created_at (for pagination/sorting)
DO $$
BEGIN
  IF to_regclass('public.idx_threads_diagram_created') IS NULL THEN
    CREATE INDEX idx_threads_diagram_created
      ON public.threads (diagram_id, created_at ASC);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 2. replies: thread + created_at (for pagination/sorting)
DO $$
BEGIN
  IF to_regclass('public.idx_replies_thread_created') IS NULL THEN
    CREATE INDEX idx_replies_thread_created
      ON public.replies (thread_id, created_at ASC);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. sync_log: commit_sha (for idempotency lookup)
DO $$
BEGIN
  IF to_regclass('public.idx_sync_log_commit_sha') IS NULL THEN
    CREATE UNIQUE INDEX idx_sync_log_commit_sha
      ON public.sync_log (commit_sha) WHERE commit_sha IS NOT NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 4. users: email (already unique, but explicit index for clarity)
-- The unique constraint on email already creates an index. No action needed.

-- ---------------------------------------------------------------- 5. checkpoints: diagram + id (for lookup by id within diagram)
-- The primary key on id + FK on diagram_id is sufficient for most lookups.
-- Adding composite index for diagram + created_at desc is already in V1.