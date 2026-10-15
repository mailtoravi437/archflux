-- ArchFlux V1 — initial schema (Agent B / database-expert standards).
--
-- Apply AS OWNER/MIGRATOR on an empty database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V1__init.sql
--
-- Re-runnable: every statement is guarded (to_regclass / pg_trigger / CREATE OR REPLACE),
-- so re-applying on an already-migrated DB is a no-op. NEVER edit this file after it has
-- been applied anywhere — new changes go in V2__..., V3__... (Flyway checksums).
--
-- Extensions note (managed hosts such as RDS/Neon/Supabase): CREATE EXTENSION needs
-- superuser/owner. If this script runs as a least-privilege role the extension blocks
-- degrade to NOTICE (see below); ask the host admin to run manually:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--   CREATE EXTENSION IF NOT EXISTS citext   WITH SCHEMA public;
-- Table defaults depend on pgcrypto (gen_random_uuid()) and the citext type, so V1
-- cannot complete until both extensions exist.

-- ---------------------------------------------------------------- 0. Extensions
-- These extensions are REQUIRED for the schema to function.
-- On managed hosts (RDS/Neon/Supabase), the deploying role must have CREATE EXTENSION privilege
-- or extensions must be pre-installed by an admin before running this migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA public;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext') THEN
    CREATE EXTENSION citext WITH SCHEMA public;
  END IF;
END
$$;

-- Verify extensions are available (fail fast if not)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'REQUIRED EXTENSION MISSING: pgcrypto. On managed hosts, ask admin to run: CREATE EXTENSION pgcrypto WITH SCHEMA public;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext') THEN
    RAISE EXCEPTION 'REQUIRED EXTENSION MISSING: citext. On managed hosts, ask admin to run: CREATE EXTENSION citext WITH SCHEMA public;';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 1. Tables
-- users
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    CREATE TABLE public.users (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      email      citext      NOT NULL UNIQUE,
      name       text        NOT NULL DEFAULT '',
      role       text        NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- diagrams
DO $$
BEGIN
  IF to_regclass('public.diagrams') IS NULL THEN
    CREATE TABLE public.diagrams (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id   uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
      title      text        NOT NULL DEFAULT '',
      tags       text[]      NOT NULL DEFAULT '{}',
      graph      jsonb       NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- checkpoints
DO $$
BEGIN
  IF to_regclass('public.checkpoints') IS NULL THEN
    CREATE TABLE public.checkpoints (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      diagram_id uuid        NOT NULL REFERENCES public.diagrams (id) ON DELETE CASCADE,
      title      text        NOT NULL DEFAULT '',
      meta       text,
      snapshot   jsonb       NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- threads
DO $$
BEGIN
  IF to_regclass('public.threads') IS NULL THEN
    CREATE TABLE public.threads (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      diagram_id uuid        NOT NULL REFERENCES public.diagrams (id) ON DELETE CASCADE,
      author     text        NOT NULL DEFAULT '',
      pinned_to  text,
      text       text        NOT NULL DEFAULT '',
      resolved   boolean     NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- replies
DO $$
BEGIN
  IF to_regclass('public.replies') IS NULL THEN
    CREATE TABLE public.replies (
      id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id  uuid        NOT NULL REFERENCES public.threads (id) ON DELETE CASCADE,
      author     text        NOT NULL DEFAULT '',
      text       text        NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- sync_log
DO $$
BEGIN
  IF to_regclass('public.sync_log') IS NULL THEN
    CREATE TABLE public.sync_log (
      id         bigserial   PRIMARY KEY,
      diagram_id uuid        NOT NULL REFERENCES public.diagrams (id) ON DELETE CASCADE,
      actor      text        NOT NULL DEFAULT '',
      commit_sha text,
      delta      text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$$;

-- ------------------------------------------------- 2. updated_at trigger
-- Function is CREATE OR REPLACE (re-runnable by definition).
CREATE OR REPLACE FUNCTION public.set_diagrams_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$func$;

-- Trigger guard via pg_trigger (no bare DROP/CREATE; safe for non-owners to check).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_diagrams_updated_at'
  ) THEN
    CREATE TRIGGER trg_diagrams_updated_at
      BEFORE UPDATE ON public.diagrams
      FOR EACH ROW EXECUTE FUNCTION public.set_diagrams_updated_at();
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. Indexes
-- One DO block per index, guarded by to_regclass (safe to re-run; no-op when present).
-- Index choice rationale (equality prefix first, then ORDER BY):
--   diagrams(owner_id, updated_at DESC)      <- owner feed: WHERE owner_id=? ORDER BY updated_at DESC
--   checkpoints(diagram_id, created_at DESC) <- doc history: WHERE diagram_id=? ORDER BY created_at DESC
--   threads(diagram_id)                      <- threads-by-doc filter (small fan-out, no sort needed)
--   replies(thread_id)                       <- replies-by-thread filter (created_at order via seqscan-free small set)
--   sync_log(diagram_id, created_at DESC)    <- sync feed: WHERE diagram_id=? ORDER BY created_at DESC
--   GIN(tags) on diagrams                    <- tag containment queries (tags @> ARRAY[...]); built-in GIN opclass,
--                                               no extra extension required (the pg_extension guard rule applies to
--                                               e.g. pg_trgm indexes, not needed here).
DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_owner_updated') IS NULL THEN
    CREATE INDEX idx_diagrams_owner_updated
      ON public.diagrams (owner_id, updated_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_checkpoints_diagram_created') IS NULL THEN
    CREATE INDEX idx_checkpoints_diagram_created
      ON public.checkpoints (diagram_id, created_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_threads_diagram') IS NULL THEN
    CREATE INDEX idx_threads_diagram
      ON public.threads (diagram_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_replies_thread') IS NULL THEN
    CREATE INDEX idx_replies_thread
      ON public.replies (thread_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_sync_log_diagram_created') IS NULL THEN
    CREATE INDEX idx_sync_log_diagram_created
      ON public.sync_log (diagram_id, created_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_tags_gin') IS NULL THEN
    CREATE INDEX idx_diagrams_tags_gin
      ON public.diagrams USING GIN (tags);
  END IF;
END
$$;
