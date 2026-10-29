-- ArchFlux V10 — library folders, per-user stars, trash (R1-E06, DATA_MODEL_R1 §4.2).
-- Apply AFTER V9__reconcile_migration_copies.sql on the same database.
--
-- What this does:
--   1. Creates public.folders (workspace-scoped tree, soft-deletable).
--   2. Partial unique index: sibling names are unique case-insensitively
--      among non-trashed folders. Root folders (parent_id NULL) are folded to
--      the nil UUID so they collide too (a plain NULL would be distinct).
--   3. Adds diagrams.folder_id (FK → folders, ON DELETE SET NULL).
--   4. Creates public.diagram_stars (per-user favourites).
--   5. Indexes: folders(workspace_id, parent_id); diagrams(workspace_id,
--      folder_id) for live rows; diagrams(deleted_at) for trash/purge scans;
--      diagram_stars(diagram_id) for cascades.
--   6. RLS (V6 pattern): folders gated by workspace membership,
--      diagram_stars by the starring user. Diagrams gain a workspace-member
--      policy so members can soft-delete (set deleted_at) and read/restore
--      trashed rows — V3's diagrams_owner policy rejects any row with
--      deleted_at set, which would make the app role unable to trash at all.
--      The service layer hides trashed rows from normal reads.
--   7. purge_expired_trash(): SECURITY DEFINER purge used by the scheduled
--      TrashPurgeJob, which runs with no request identity (RLS would
--      fail-close every row for the app role). Retention: 30 days, 90 when
--      workspaces.plan = 'team'.
--   8. Grants to archflux_app (role-existence guarded).
--
-- Re-runnable: every statement is guarded (to_regclass / pg_constraint /
-- information_schema checks, DROP POLICY IF EXISTS, CREATE OR REPLACE).
-- NEVER edit this file after it has been applied anywhere — add V11__...

-- ---------------------------------------------------------------- 1. folders
DO $$
BEGIN
  IF to_regclass('public.folders') IS NULL THEN
    CREATE TABLE public.folders (
      id           uuid        NOT NULL DEFAULT gen_random_uuid(),
      workspace_id uuid        NOT NULL,
      parent_id    uuid        NULL,
      name         text        NOT NULL,
      created_by   uuid        NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      deleted_at   timestamptz NULL,
      CONSTRAINT pk_folders PRIMARY KEY (id),
      CONSTRAINT fk_folders_workspace FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) ON DELETE CASCADE,
      CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id)
        REFERENCES public.folders (id) ON DELETE CASCADE,
      CONSTRAINT fk_folders_created_by FOREIGN KEY (created_by)
        REFERENCES public.users (id) ON DELETE SET NULL,
      CONSTRAINT chk_folders_name_length CHECK (length(name) BETWEEN 1 AND 120),
      CONSTRAINT chk_folders_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------- 2. sibling-name uniqueness
DO $$
BEGIN
  IF to_regclass('public.uq_folders_sibling_name') IS NULL THEN
    CREATE UNIQUE INDEX uq_folders_sibling_name
      ON public.folders (workspace_id,
        COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(name))
      WHERE deleted_at IS NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. diagrams.folder_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagrams' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE public.diagrams ADD COLUMN folder_id uuid NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_diagrams_folder') THEN
    ALTER TABLE public.diagrams
      ADD CONSTRAINT fk_diagrams_folder
      FOREIGN KEY (folder_id) REFERENCES public.folders (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 4. diagram_stars
DO $$
BEGIN
  IF to_regclass('public.diagram_stars') IS NULL THEN
    CREATE TABLE public.diagram_stars (
      user_id    uuid        NOT NULL,
      diagram_id uuid        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_diagram_stars PRIMARY KEY (user_id, diagram_id),
      CONSTRAINT fk_diagram_stars_user FOREIGN KEY (user_id)
        REFERENCES public.users (id) ON DELETE CASCADE,
      CONSTRAINT fk_diagram_stars_diagram FOREIGN KEY (diagram_id)
        REFERENCES public.diagrams (id) ON DELETE CASCADE
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------- 5. Indexes
DO $$
BEGIN
  IF to_regclass('public.idx_folders_workspace_parent') IS NULL THEN
    CREATE INDEX idx_folders_workspace_parent
      ON public.folders (workspace_id, parent_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_workspace_folder') IS NULL THEN
    CREATE INDEX idx_diagrams_workspace_folder
      ON public.diagrams (workspace_id, folder_id)
      WHERE deleted_at IS NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_trashed') IS NULL THEN
    CREATE INDEX idx_diagrams_trashed
      ON public.diagrams (deleted_at)
      WHERE deleted_at IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_diagram_stars_diagram') IS NULL THEN
    CREATE INDEX idx_diagram_stars_diagram
      ON public.diagram_stars (diagram_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 6. RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagram_stars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folders_member ON public.folders;
CREATE POLICY folders_member ON public.folders FOR ALL
  USING (public.is_workspace_member(folders.workspace_id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(folders.workspace_id, public.current_user_id()));

DROP POLICY IF EXISTS diagram_stars_self ON public.diagram_stars;
CREATE POLICY diagram_stars_self ON public.diagram_stars FOR ALL
  USING (diagram_stars.user_id = public.current_user_id())
  WITH CHECK (diagram_stars.user_id = public.current_user_id());

-- Permissive (OR'd with V3's diagrams_owner / diagrams_shared_read): a
-- workspace member may read and write the workspace's diagrams, trashed or
-- not. Trash visibility is enforced by the service layer.
DROP POLICY IF EXISTS diagrams_workspace_member ON public.diagrams;
CREATE POLICY diagrams_workspace_member ON public.diagrams FOR ALL
  USING (public.is_workspace_member(diagrams.workspace_id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(diagrams.workspace_id, public.current_user_id()));

-- ---------------------------------------------------------------- 7. Trash purge
-- Hard-deletes up to p_limit expired trashed diagrams, then up to p_limit
-- expired trashed folders (child folders cascade; contained diagrams that
-- survive get folder_id SET NULL). Returns what it removed so the caller can
-- audit each row. Runs with the owner's rights: the scheduler has no request
-- identity, and RLS would otherwise hide every row from the app role.
CREATE OR REPLACE FUNCTION public.purge_expired_trash(p_now timestamptz, p_limit integer)
RETURNS TABLE (r_kind text, r_id uuid, r_workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH doomed AS (
    SELECT d.id AS doomed_id
    FROM public.diagrams d
    JOIN public.workspaces w ON w.id = d.workspace_id
    WHERE d.deleted_at IS NOT NULL
      AND d.deleted_at < p_now - CASE WHEN w.plan = 'team'
                                      THEN interval '90 days'
                                      ELSE interval '30 days' END
    ORDER BY d.deleted_at
    LIMIT p_limit
  ), gone AS (
    DELETE FROM public.diagrams d
    USING doomed
    WHERE d.id = doomed.doomed_id
    RETURNING d.id AS gone_id, d.workspace_id AS gone_ws
  )
  SELECT 'diagram'::text, gone.gone_id, gone.gone_ws FROM gone;

  RETURN QUERY
  WITH doomed AS (
    SELECT f.id AS doomed_id
    FROM public.folders f
    JOIN public.workspaces w ON w.id = f.workspace_id
    WHERE f.deleted_at IS NOT NULL
      AND f.deleted_at < p_now - CASE WHEN w.plan = 'team'
                                      THEN interval '90 days'
                                      ELSE interval '30 days' END
    ORDER BY f.deleted_at
    LIMIT p_limit
  ), gone AS (
    DELETE FROM public.folders f
    USING doomed
    WHERE f.id = doomed.doomed_id
    RETURNING f.id AS gone_id, f.workspace_id AS gone_ws
  )
  SELECT 'folder'::text, gone.gone_id, gone.gone_ws FROM gone;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'purge_expired_trash' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.purge_expired_trash(timestamptz, integer) FROM PUBLIC';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 8. Grants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_stars TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.purge_expired_trash(timestamptz, integer) TO archflux_app';
  ELSE
    RAISE NOTICE 'V10 grants: role archflux_app missing — run db/roles.sql, then re-run V10 to apply grants.';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 9. Comments
COMMENT ON TABLE public.folders IS 'Library folders: workspace-scoped tree (max depth 5, enforced in FolderService); deleted_at = in trash.';
COMMENT ON TABLE public.diagram_stars IS 'Per-user starred diagrams (R1-E06).';
COMMENT ON COLUMN public.diagrams.folder_id IS 'Containing library folder; NULL = root. SET NULL when the folder is purged.';
