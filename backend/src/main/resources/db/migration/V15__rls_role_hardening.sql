-- ArchFlux V15 — RLS role hardening (R1-E07-T07, DATA_MODEL_R1 §4.6).
-- Apply AFTER V11__sharing.sql on the same database.
--
-- What this does:
--   1. Adds a SECURITY DEFINER helper `diagram_role_at_least(diagram, uid, role)`
--      that returns true if the user's effective diagram role is >= the given role.
--   2. Splits each FOR ALL policy on diagrams, diagram_members, threads, replies,
--      and checkpoints into FOR SELECT (any access) and FOR INSERT/UPDATE/DELETE
--      (role-gated). The write policies use diagram_role_at_least.
--   3. Never edits V10 or V11. Uses DROP POLICY IF EXISTS and recreates.
--   4. Updates the migration numbering table in DATA_MODEL_R1.md §4.6 (done in that file).
--
-- Re-runnable: every statement is guarded (DROP POLICY IF EXISTS, CREATE OR REPLACE).
-- NEVER edit this file after it has been applied anywhere — add V16__...

-- ---------------------------------------------------------------- 1. Helper: diagram_role_at_least
-- Returns true when the effective role of p_uid on p_diagram is >= p_min_role.
-- Roles: viewer < commenter < editor < owner.
-- This function is SECURITY DEFINER with locked search_path so it cannot be
-- subverted by search-path tricks. It uses the same logic as AccessService but
-- runs at the DB level for RLS.
CREATE OR REPLACE FUNCTION public.diagram_role_at_least(p_diagram uuid, p_uid uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Explicit diagram_members row
    WHEN EXISTS (
      SELECT 1 FROM public.diagram_members dm
      WHERE dm.diagram_id = p_diagram
        AND dm.user_id = p_uid
        AND CASE dm.role
              WHEN 'owner' THEN 4
              WHEN 'editor' THEN 3
              WHEN 'commenter' THEN 2
              WHEN 'viewer' THEN 1
            END >= CASE p_min_role
                     WHEN 'owner' THEN 4
                     WHEN 'editor' THEN 3
                     WHEN 'commenter' THEN 2
                     WHEN 'viewer' THEN 1
                   END
    ) THEN true
    -- Workspace role mapping: admin→owner, editor→editor, reviewer→commenter, viewer→viewer
    WHEN EXISTS (
      SELECT 1 FROM public.diagrams d
      JOIN public.workspace_memberships m
        ON m.workspace_id = d.workspace_id AND m.user_id = p_uid
      WHERE d.id = p_diagram
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
    ) THEN true
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------- 2. diagrams table: split FOR ALL into SELECT + write
-- Keep the existing V3 diagrams_owner policy (owner-only, deleted_at IS NULL)
-- Keep the V10 diagrams_workspace_member policy (workspace member, FOR ALL)
-- Keep the V11 diagrams_diagram_member policy (explicit member + link read, FOR ALL)
-- Add diagrams_diagram_member_write for INSERT/UPDATE/DELETE requiring EDITOR+
-- Add diagrams_workspace_member_write for INSERT/UPDATE/DELETE requiring EDITOR+ via workspace role

DROP POLICY IF EXISTS diagrams_diagram_member ON public.diagrams;
DROP POLICY IF EXISTS diagrams_workspace_member ON public.diagrams;
-- Drop new policies in case of re-apply (shared test container)
DROP POLICY IF EXISTS diagrams_diagram_member_select ON public.diagrams;
DROP POLICY IF EXISTS diagrams_diagram_member_write ON public.diagrams;
DROP POLICY IF EXISTS diagrams_diagram_member_update ON public.diagrams;
DROP POLICY IF EXISTS diagrams_diagram_member_delete ON public.diagrams;
DROP POLICY IF EXISTS diagrams_workspace_member_write ON public.diagrams;
DROP POLICY IF EXISTS diagrams_workspace_member_update ON public.diagrams;
DROP POLICY IF EXISTS diagrams_workspace_member_delete ON public.diagrams;

-- SELECT: any access (workspace member OR explicit member OR valid link)
CREATE POLICY diagrams_diagram_member_select ON public.diagrams FOR SELECT
  USING (public.can_access_diagram(diagrams.id, public.current_user_id())
         OR public.share_link_role(diagrams.id, public.current_share_token_hash()) IS NOT NULL);

-- INSERT/UPDATE/DELETE: requires EDITOR+ via explicit member or workspace role
CREATE POLICY diagrams_diagram_member_write ON public.diagrams FOR INSERT
  WITH CHECK (public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

CREATE POLICY diagrams_diagram_member_update ON public.diagrams FOR UPDATE
  USING (public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'))
  WITH CHECK (public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

CREATE POLICY diagrams_diagram_member_delete ON public.diagrams FOR DELETE
  USING (public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

-- Workspace member write policy (for backward compat with V10 soft-delete pattern)
-- Only editors/admins in the workspace can write
CREATE POLICY diagrams_workspace_member_write ON public.diagrams FOR INSERT
  WITH CHECK (public.is_workspace_member(diagrams.workspace_id, public.current_user_id())
              AND public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

CREATE POLICY diagrams_workspace_member_update ON public.diagrams FOR UPDATE
  USING (public.is_workspace_member(diagrams.workspace_id, public.current_user_id())
         AND public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'))
  WITH CHECK (public.is_workspace_member(diagrams.workspace_id, public.current_user_id())
              AND public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

CREATE POLICY diagrams_workspace_member_delete ON public.diagrams FOR DELETE
  USING (public.is_workspace_member(diagrams.workspace_id, public.current_user_id())
         AND public.diagram_role_at_least(diagrams.id, public.current_user_id(), 'editor'));

-- ---------------------------------------------------------------- 3. diagram_members table: split FOR ALL
-- SELECT: any diagram access
-- INSERT/UPDATE: owner, or editor for rows with role <= editor
-- DELETE: owner only (last owner protection is in service layer)

DROP POLICY IF EXISTS diagram_members_access ON public.diagram_members;
-- Drop new policies in case of re-apply
DROP POLICY IF EXISTS diagram_members_select ON public.diagram_members;
DROP POLICY IF EXISTS diagram_members_insert ON public.diagram_members;
DROP POLICY IF EXISTS diagram_members_update ON public.diagram_members;
DROP POLICY IF EXISTS diagram_members_delete ON public.diagram_members;

CREATE POLICY diagram_members_select ON public.diagram_members FOR SELECT
  USING (public.can_access_diagram(diagram_members.diagram_id, public.current_user_id()));

-- INSERT: owner can add any role; editor can add/viewer/commenter/editor (not owner)
CREATE POLICY diagram_members_insert ON public.diagram_members FOR INSERT
  WITH CHECK (
    public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'owner')
    OR (
      public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'editor')
      AND diagram_members.role IN ('viewer', 'commenter', 'editor')
    )
  );

-- UPDATE: owner can change any role; editor can change roles <= editor (not owner)
CREATE POLICY diagram_members_update ON public.diagram_members FOR UPDATE
  USING (
    public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'owner')
    OR (
      public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'editor')
      AND diagram_members.role IN ('viewer', 'commenter', 'editor')
    )
  )
  WITH CHECK (
    public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'owner')
    OR (
      public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'editor')
      AND diagram_members.role IN ('viewer', 'commenter', 'editor')
    )
  );

-- DELETE: owner only (last owner protection in service layer)
CREATE POLICY diagram_members_delete ON public.diagram_members FOR DELETE
  USING (public.diagram_role_at_least(diagram_members.diagram_id, public.current_user_id(), 'owner'));

-- ---------------------------------------------------------------- 4. threads table: split FOR ALL
-- SELECT: any diagram access
-- INSERT: COMMENTER+ (explicit member or workspace role or commenter link)
-- UPDATE/DELETE: author or EDITOR+ (service layer enforces author check)

DROP POLICY IF EXISTS threads_diagram_access ON public.threads;
-- Drop new policies in case of re-apply
DROP POLICY IF EXISTS threads_diagram_select ON public.threads;
DROP POLICY IF EXISTS threads_diagram_insert ON public.threads;
DROP POLICY IF EXISTS threads_diagram_update ON public.threads;
DROP POLICY IF EXISTS threads_diagram_delete ON public.threads;

CREATE POLICY threads_diagram_select ON public.threads FOR SELECT
  USING (public.can_access_diagram(threads.diagram_id, public.current_user_id())
         OR public.share_link_role(threads.diagram_id, public.current_share_token_hash()) IS NOT NULL);

CREATE POLICY threads_diagram_insert ON public.threads FOR INSERT
  WITH CHECK (public.diagram_role_at_least(threads.diagram_id, public.current_user_id(), 'commenter')
              OR public.share_link_role(threads.diagram_id, public.current_share_token_hash()) = 'commenter');

CREATE POLICY threads_diagram_update ON public.threads FOR UPDATE
  USING (public.diagram_role_at_least(threads.diagram_id, public.current_user_id(), 'editor'))
  WITH CHECK (public.diagram_role_at_least(threads.diagram_id, public.current_user_id(), 'editor'));

CREATE POLICY threads_diagram_delete ON public.threads FOR DELETE
  USING (public.diagram_role_at_least(threads.diagram_id, public.current_user_id(), 'editor'));

-- Keep the link policies for read and comment (V11)
-- threads_share_link_read and threads_share_link_comment already exist from V11

-- ---------------------------------------------------------------- 5. replies table: split FOR ALL
-- SELECT: any diagram access
-- INSERT: COMMENTER+ (explicit member or workspace role or commenter link)
-- UPDATE/DELETE: author or EDITOR+ (service layer enforces author check)

DROP POLICY IF EXISTS replies_diagram_access ON public.replies;
-- Drop new policies in case of re-apply
DROP POLICY IF EXISTS replies_diagram_select ON public.replies;
DROP POLICY IF EXISTS replies_diagram_insert ON public.replies;
DROP POLICY IF EXISTS replies_diagram_update ON public.replies;
DROP POLICY IF EXISTS replies_diagram_delete ON public.replies;

CREATE POLICY replies_diagram_select ON public.replies FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = replies.thread_id
      AND (public.can_access_diagram(t.diagram_id, public.current_user_id())
           OR public.share_link_role(t.diagram_id, public.current_share_token_hash()) IS NOT NULL)
  ));

CREATE POLICY replies_diagram_insert ON public.replies FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = replies.thread_id
      AND (public.diagram_role_at_least(t.diagram_id, public.current_user_id(), 'commenter')
           OR public.share_link_role(t.diagram_id, public.current_share_token_hash()) = 'commenter')
  ));

CREATE POLICY replies_diagram_update ON public.replies FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = replies.thread_id
      AND public.diagram_role_at_least(t.diagram_id, public.current_user_id(), 'editor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = replies.thread_id
      AND public.diagram_role_at_least(t.diagram_id, public.current_user_id(), 'editor')
  ));

CREATE POLICY replies_diagram_delete ON public.replies FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = replies.thread_id
      AND public.diagram_role_at_least(t.diagram_id, public.current_user_id(), 'editor')
  ));

-- Keep the link policies for read and comment (V11)
-- replies_share_link_read and replies_share_link_comment already exist from V11

-- ---------------------------------------------------------------- 6. checkpoints table: split FOR ALL
-- SELECT: any diagram access
-- INSERT/UPDATE/DELETE: EDITOR+

DROP POLICY IF EXISTS checkpoints_diagram_access ON public.checkpoints;
-- Drop new policies in case of re-apply
DROP POLICY IF EXISTS checkpoints_diagram_select ON public.checkpoints;
DROP POLICY IF EXISTS checkpoints_diagram_insert ON public.checkpoints;
DROP POLICY IF EXISTS checkpoints_diagram_update ON public.checkpoints;
DROP POLICY IF EXISTS checkpoints_diagram_delete ON public.checkpoints;

CREATE POLICY checkpoints_diagram_select ON public.checkpoints FOR SELECT
  USING (public.can_access_diagram(checkpoints.diagram_id, public.current_user_id()));

CREATE POLICY checkpoints_diagram_insert ON public.checkpoints FOR INSERT
  WITH CHECK (public.diagram_role_at_least(checkpoints.diagram_id, public.current_user_id(), 'editor'));

CREATE POLICY checkpoints_diagram_update ON public.checkpoints FOR UPDATE
  USING (public.diagram_role_at_least(checkpoints.diagram_id, public.current_user_id(), 'editor'))
  WITH CHECK (public.diagram_role_at_least(checkpoints.diagram_id, public.current_user_id(), 'editor'));

CREATE POLICY checkpoints_diagram_delete ON public.checkpoints FOR DELETE
  USING (public.diagram_role_at_least(checkpoints.diagram_id, public.current_user_id(), 'editor'));

-- ---------------------------------------------------------------- 7. Grants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO archflux_app';
  ELSE
    RAISE NOTICE 'V15 grants: role archflux_app missing — run db/roles.sql, then re-run V15 to apply grants.';
  END IF;
  -- Also grant to any role that has been granted the V11 helpers (for test roles like app_tester)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO app_tester';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 8. Comments
COMMENT ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) IS
  'Returns true if the user''s effective diagram role (explicit member, workspace role) is >= p_min_role. For RLS write policies (R1-E07-T07).';