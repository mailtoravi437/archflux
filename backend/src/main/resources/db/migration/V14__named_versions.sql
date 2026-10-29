-- V14 · Named versions and the 'revert' revision source (R1-E08-T02, DATA_MODEL_R1 §4.5b).
--
-- Re-runnable: every statement is guarded. NEVER edit after it has been applied.
--
-- diagram_revisions stays immutable apart from the two label columns: the app
-- role may UPDATE only (name, description) (column-level grant) and only when it
-- is a workspace member (RLS UPDATE policy; V17 tightens it to EDITOR+ once
-- diagram_role_at_least exists, which V15 defines after this file). Snapshot, hash, author,
-- source and message can never be rewritten by the application.

DO $$
BEGIN
  IF to_regclass('public.diagram_revisions') IS NULL THEN
    RAISE EXCEPTION 'V14 requires public.diagram_revisions (V7)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'diagram_revisions' AND column_name = 'name') THEN
    ALTER TABLE public.diagram_revisions ADD COLUMN name text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'diagram_revisions' AND column_name = 'description') THEN
    ALTER TABLE public.diagram_revisions ADD COLUMN description text NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_revisions_name_len'
      AND conrelid = 'public.diagram_revisions'::regclass) THEN
    ALTER TABLE public.diagram_revisions
      ADD CONSTRAINT chk_revisions_name_len CHECK (name IS NULL OR length(name) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_revisions_description_len'
      AND conrelid = 'public.diagram_revisions'::regclass) THEN
    ALTER TABLE public.diagram_revisions
      ADD CONSTRAINT chk_revisions_description_len CHECK (description IS NULL OR length(description) <= 2000);
  END IF;
END
$$;

-- Widen the source check to allow 'revert' (the client undo-to-version path).
ALTER TABLE public.diagram_revisions DROP CONSTRAINT IF EXISTS chk_revisions_source;
ALTER TABLE public.diagram_revisions ADD CONSTRAINT chk_revisions_source
  CHECK (source IN ('manual', 'import', 'sync', 'webhook', 'backfill', 'restore', 'revert'));

CREATE INDEX IF NOT EXISTS idx_revisions_named
  ON public.diagram_revisions (diagram_id) WHERE name IS NOT NULL;

-- Label updates need workspace membership here; the EDITOR+ gate is added by V17
-- (and always enforced by AccessService in the service layer).
DROP POLICY IF EXISTS revisions_editor_label ON public.diagram_revisions;
CREATE POLICY revisions_editor_label ON public.diagram_revisions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.diagrams d
    WHERE d.id = diagram_revisions.diagram_id
      AND public.is_workspace_member(d.workspace_id, public.current_user_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diagrams d
    WHERE d.id = diagram_revisions.diagram_id
      AND public.is_workspace_member(d.workspace_id, public.current_user_id())));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'REVOKE UPDATE ON public.diagram_revisions FROM archflux_app';
    EXECUTE 'GRANT UPDATE (name, description) ON public.diagram_revisions TO archflux_app';
  END IF;
END
$$;

COMMENT ON COLUMN public.diagram_revisions.name IS 'Optional version name (<= 80 chars); null = unnamed revision. R1-E08.';
COMMENT ON COLUMN public.diagram_revisions.description IS 'Optional version description (<= 2000 chars). R1-E08.';
