-- ArchFlux V16 — fix diagram INSERT policies from V15 (R1-E07-T07 follow-up).
-- Apply AFTER V15. Never edit V15 (already applied): this migration supersedes parts of it.
--
-- Problem: V15 INSERT policies on public.diagrams called diagram_role_at_least(diagrams.id, ...).
-- That helper reads the diagrams table through a separate (SECURITY DEFINER) query, which cannot
-- see the row being inserted, so it returned false and any insert that was not covered by the V3
-- `diagrams_owner` policy (e.g. a trashed row, or a row created for a workspace by a non-owner
-- editor) was rejected.
--
-- Fix: a new helper `workspace_role_at_least(workspace, uid, role)` keyed on workspace_id (which
-- is a column of the new row, no self-lookup), and INSERT policies that use it.
-- Idempotent: CREATE OR REPLACE, DROP POLICY IF EXISTS, guarded grants.

CREATE OR REPLACE FUNCTION public.workspace_role_at_least(p_workspace uuid, p_uid uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.workspace_id = p_workspace
      AND m.user_id = p_uid
      AND CASE m.role
            WHEN 'admin' THEN 4
            WHEN 'editor' THEN 3
            WHEN 'reviewer' THEN 2
            WHEN 'viewer' THEN 1
          END >= CASE p_min_role
                   WHEN 'owner' THEN 4
                   WHEN 'editor' THEN 3
                   WHEN 'commenter' THEN 2
                   WHEN 'viewer' THEN 1
                 END
  )
$$;

REVOKE ALL ON FUNCTION public.workspace_role_at_least(uuid, uuid, text) FROM PUBLIC;

-- The V15 diagram-id based INSERT policy can never match a new row: remove it.
DROP POLICY IF EXISTS diagrams_diagram_member_write ON public.diagrams;
DROP POLICY IF EXISTS diagrams_workspace_member_write ON public.diagrams;

-- A workspace editor/admin may insert diagrams into the workspace.
CREATE POLICY diagrams_workspace_member_write ON public.diagrams FOR INSERT
  WITH CHECK (public.workspace_role_at_least(diagrams.workspace_id, public.current_user_id(), 'editor'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.workspace_role_at_least(uuid, uuid, text) TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO archflux_app';
  ELSE
    RAISE NOTICE 'V16 grants: role archflux_app missing — run db/roles.sql, then re-run V16 to apply grants.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.workspace_role_at_least(uuid, uuid, text) TO app_tester';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO app_tester';
  END IF;
END
$$;

COMMENT ON FUNCTION public.workspace_role_at_least(uuid, uuid, text) IS
  'True if the user''s workspace role (admin>editor>reviewer>viewer) is >= p_min_role. Row-independent, for INSERT policies (R1-E07-T07).';
