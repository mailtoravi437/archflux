-- V17 · Tighten revision label updates to EDITOR+ (R1-E08-T02 follow-up to V14).
--
-- V14 could only gate on workspace membership because public.diagram_role_at_least
-- is created by V15 (applied later). Now that it exists, replace the policy so the
-- database itself rejects label updates from viewers/commenters. Re-runnable.

DROP POLICY IF EXISTS revisions_editor_label ON public.diagram_revisions;
CREATE POLICY revisions_editor_label ON public.diagram_revisions FOR UPDATE
  USING (public.diagram_role_at_least(diagram_revisions.diagram_id, public.current_user_id(), 'editor'))
  WITH CHECK (public.diagram_role_at_least(diagram_revisions.diagram_id, public.current_user_id(), 'editor'));
