-- ArchFlux V18 — invitee can read the workspace they were invited to (R1-BUG-06).
-- Apply AFTER V17 on the same database.
--
-- Bug: POST /api/v1/invites/{token}/accept returned 404 "Workspace not found" under the
-- production role archflux_app. The invitee is not a member yet, so the V6 policy
-- workspaces_member hid the workspaces row (V12 added invitee policies on
-- workspace_invites only). The DB owner bypasses RLS, so backend tests missed it.
--
-- Fix:
--   1. SECURITY DEFINER helper has_pending_workspace_invite(ws): true iff the caller's
--      email matches an unaccepted, unrevoked, unexpired invite to that workspace.
--   2. SELECT-only policy workspaces_invitee_read using it. The invitee sees exactly the
--      workspaces they hold a live invite to, nothing else, and no write access.
--   3. Idempotent EXECUTE grants to archflux_app for the helpers that policies call
--      (the earlier migrations grant only when the role existed at migration time).
--
-- Re-runnable: CREATE OR REPLACE, DROP POLICY IF EXISTS, guarded GRANTs.

CREATE OR REPLACE FUNCTION public.has_pending_workspace_invite(ws uuid) RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_invites i
    WHERE i.workspace_id = ws
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
      AND public.current_user_email() IS NOT NULL
      AND lower(i.email) = lower(public.current_user_email())
  )
$$;

REVOKE ALL ON FUNCTION public.has_pending_workspace_invite(uuid) FROM PUBLIC;

DROP POLICY IF EXISTS workspaces_invitee_read ON public.workspaces;
CREATE POLICY workspaces_invitee_read ON public.workspaces FOR SELECT
  USING (public.has_pending_workspace_invite(workspaces.id));

DO $$
DECLARE
  fn text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    FOREACH fn IN ARRAY ARRAY[
      'public.has_pending_workspace_invite(uuid)',
      'public.current_user_email()',
      'public.workspace_role_at_least(uuid, uuid, text)',
      'public.diagram_role_at_least(uuid, uuid, text)',
      'public.is_workspace_member(uuid, uuid)'
    ] LOOP
      IF to_regprocedure(fn) IS NOT NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO archflux_app', fn);
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'V18 grants: role archflux_app missing, run db/roles.sql, then re-run V18 to apply grants.';
  END IF;
END
$$;
