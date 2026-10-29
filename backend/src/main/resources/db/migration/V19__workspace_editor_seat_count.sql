-- ArchFlux V19 — RLS-independent editor seat count (R1-BUG-08, plan enforcement gap).
-- Apply AFTER V18 on the same database.
--
-- Gap: PlanService.requireCanAddEditor counted workspace_memberships under RLS. An invitee
-- is not yet a member, so under archflux_app the count was 0 and the free-plan limit of 3
-- editors was not enforced when an invite was accepted.
--
-- Fix: SECURITY DEFINER workspace_editor_seat_count(ws) returns the number of active
-- admin/editor memberships, but ONLY for a caller who is a member of ws or holds a live
-- invite to it (the same visibility rule as V6/V18). Anyone else gets NULL, so the function
-- cannot be used to probe other workspaces. Everything else keeps reading under RLS.
--
-- Re-runnable: CREATE OR REPLACE, guarded GRANTs (archflux_app, and app_tester when present).

CREATE OR REPLACE FUNCTION public.workspace_editor_seat_count(ws uuid) RETURNS integer
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_user_id() IS NOT NULL
         AND (public.is_workspace_member(ws, public.current_user_id())
              OR public.has_pending_workspace_invite(ws))
    THEN (SELECT COUNT(*)::int FROM public.workspace_memberships m
          WHERE m.workspace_id = ws
            AND m.role IN ('admin', 'editor')
            AND m.status = 'active')
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.workspace_editor_seat_count(uuid) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['archflux_app', 'app_tester'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.workspace_editor_seat_count(uuid) TO %I', r);
    ELSIF r = 'archflux_app' THEN
      RAISE NOTICE 'V19 grants: role archflux_app missing, run db/roles.sql, then re-run V19 to apply grants.';
    END IF;
  END LOOP;
END
$$;
