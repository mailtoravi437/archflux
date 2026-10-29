-- ArchFlux V5 — diagram versioning (checkpoint restore) + branching.
-- Apply AFTER V4__oauth_fields.sql:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V5__versioning_branching.sql
--
-- Re-runnable: every statement is guarded, so re-applying is a no-op.

-- 1. diagrams: branch support (parent link + branch name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagrams' AND column_name = 'parent_diagram_id'
  ) THEN
    ALTER TABLE public.diagrams ADD COLUMN parent_diagram_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagrams' AND column_name = 'branch_name'
  ) THEN
    ALTER TABLE public.diagrams ADD COLUMN branch_name text NOT NULL DEFAULT 'main';
  END IF;
END $$;

-- FK parent_diagram_id -> diagrams(id), nullable, SET NULL on delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_diagrams_parent'
  ) THEN
    ALTER TABLE public.diagrams
      ADD CONSTRAINT fk_diagrams_parent
      FOREIGN KEY (parent_diagram_id) REFERENCES public.diagrams(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_parent') IS NULL THEN
    CREATE INDEX idx_diagrams_parent ON public.diagrams (parent_diagram_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_branch') IS NULL THEN
    CREATE INDEX idx_diagrams_branch ON public.diagrams (branch_name);
  END IF;
END $$;

-- 2. checkpoints: branch name (which branch the snapshot belongs to)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoints' AND column_name = 'branch'
  ) THEN
    ALTER TABLE public.checkpoints ADD COLUMN branch text NOT NULL DEFAULT 'main';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_checkpoints_branch') IS NULL THEN
    CREATE INDEX idx_checkpoints_branch ON public.checkpoints (diagram_id, branch);
  END IF;
END $$;

-- checkpoints: active marker (which snapshot is currently applied)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoints' AND column_name = 'active'
  ) THEN
    ALTER TABLE public.checkpoints ADD COLUMN active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'checkpoints' AND column_name = 'active')
     AND to_regclass('public.idx_checkpoints_diagram_active') IS NULL THEN
    CREATE INDEX idx_checkpoints_diagram_active
      ON public.checkpoints (diagram_id) WHERE active = true;
  END IF;
END $$;
