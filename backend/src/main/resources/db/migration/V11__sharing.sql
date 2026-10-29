-- ArchFlux V11 — diagram sharing and access (R1-E07, DATA_MODEL_R1 §4.3).
-- Apply AFTER V10__folders_trash.sql on the same database.
--
-- What this does:
--   1. Creates public.diagram_members (explicit per-diagram roles).
--   2. Creates public.share_links (token stored ONLY as its SHA-256 hex hash).
--   3. Creates public.access_requests (one pending request per requester).
--   4. Adds workspaces.public_links_allowed (admin policy for audience 'anyone').
--   5. Backfills one 'owner' member row per diagram from diagrams.owner_id.
--   6. SECURITY DEFINER helpers (locked search_path, PUBLIC revoked):
--        can_access_diagram(diagram, uid)   workspace member OR explicit member
--        share_link_role(diagram, hash)     role of a live link, else NULL
--        resolve_share_token(hash)          the link row (also expired/revoked)
--        diagram_request_info(diagram)      title/owner for the 'request' state
--        diagram_owner_contacts(diagram)    owners to notify about a request
--      RLS policies may not subquery tables whose own policies reach back
--      (infinite recursion), and a link-only request has no user identity at
--      all, so these lookups run with the owner's rights by design.
--   7. RLS (V6 pattern). New tables are gated by diagram access; diagrams,
--      threads, replies and checkpoints gain permissive policies so explicit
--      members and diagram collaborators (not just the creator, V3) pass at the
--      DB level, and a valid share link (hash published by the request in the
--      transaction-local GUC app.share_token_hash) can read the diagram and
--      its threads — and, for a commenter link, add threads and replies.
--   8. Grants to archflux_app (role-existence guarded).
--
-- Re-runnable: every statement is guarded (to_regclass / pg_constraint /
-- information_schema checks, DROP POLICY IF EXISTS, CREATE OR REPLACE,
-- ON CONFLICT DO NOTHING). NEVER edit this file after it has been applied
-- anywhere — add V12__...

-- ---------------------------------------------------------------- 1. diagram_members
DO $$
BEGIN
  IF to_regclass('public.diagram_members') IS NULL THEN
    CREATE TABLE public.diagram_members (
      diagram_id uuid        NOT NULL,
      user_id    uuid        NOT NULL,
      role       text        NOT NULL,
      added_by   uuid        NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_diagram_members PRIMARY KEY (diagram_id, user_id),
      CONSTRAINT fk_diagram_members_diagram FOREIGN KEY (diagram_id)
        REFERENCES public.diagrams (id) ON DELETE CASCADE,
      CONSTRAINT fk_diagram_members_user FOREIGN KEY (user_id)
        REFERENCES public.users (id) ON DELETE CASCADE,
      CONSTRAINT fk_diagram_members_added_by FOREIGN KEY (added_by)
        REFERENCES public.users (id) ON DELETE SET NULL,
      CONSTRAINT chk_diagram_members_role
        CHECK (role IN ('owner', 'editor', 'commenter', 'viewer'))
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------- 2. share_links
DO $$
BEGIN
  IF to_regclass('public.share_links') IS NULL THEN
    CREATE TABLE public.share_links (
      id           uuid        NOT NULL DEFAULT gen_random_uuid(),
      diagram_id   uuid        NOT NULL,
      workspace_id uuid        NOT NULL,
      token_hash   text        NOT NULL,
      role         text        NOT NULL,
      audience     text        NOT NULL,
      expires_at   timestamptz NULL,
      revoked_at   timestamptz NULL,
      created_by   uuid        NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_share_links PRIMARY KEY (id),
      CONSTRAINT uq_share_links_token_hash UNIQUE (token_hash),
      CONSTRAINT fk_share_links_diagram FOREIGN KEY (diagram_id)
        REFERENCES public.diagrams (id) ON DELETE CASCADE,
      CONSTRAINT fk_share_links_workspace FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) ON DELETE CASCADE,
      CONSTRAINT fk_share_links_created_by FOREIGN KEY (created_by)
        REFERENCES public.users (id) ON DELETE SET NULL,
      -- SHA-256 hex digest: never a raw token.
      CONSTRAINT chk_share_links_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      -- Links never grant editing.
      CONSTRAINT chk_share_links_role CHECK (role IN ('viewer', 'commenter')),
      CONSTRAINT chk_share_links_audience CHECK (audience IN ('workspace', 'anyone'))
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. access_requests
DO $$
BEGIN
  IF to_regclass('public.access_requests') IS NULL THEN
    CREATE TABLE public.access_requests (
      id           uuid        NOT NULL DEFAULT gen_random_uuid(),
      diagram_id   uuid        NOT NULL,
      requester_id uuid        NOT NULL,
      role         text        NOT NULL,
      note         text        NULL,
      status       text        NOT NULL DEFAULT 'pending',
      decided_by   uuid        NULL,
      decided_at   timestamptz NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_access_requests PRIMARY KEY (id),
      CONSTRAINT fk_access_requests_diagram FOREIGN KEY (diagram_id)
        REFERENCES public.diagrams (id) ON DELETE CASCADE,
      CONSTRAINT fk_access_requests_requester FOREIGN KEY (requester_id)
        REFERENCES public.users (id) ON DELETE CASCADE,
      CONSTRAINT fk_access_requests_decided_by FOREIGN KEY (decided_by)
        REFERENCES public.users (id) ON DELETE SET NULL,
      CONSTRAINT chk_access_requests_role CHECK (role IN ('editor', 'commenter', 'viewer')),
      CONSTRAINT chk_access_requests_note CHECK (note IS NULL OR length(note) <= 500),
      CONSTRAINT chk_access_requests_status CHECK (status IN ('pending', 'approved', 'denied'))
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------- 4. workspaces.public_links_allowed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces'
      AND column_name = 'public_links_allowed'
  ) THEN
    ALTER TABLE public.workspaces
      ADD COLUMN public_links_allowed boolean NOT NULL DEFAULT true;
  END IF;
END
$$;

-- ---------------------------------------------------------------- Indexes
DO $$
BEGIN
  IF to_regclass('public.idx_diagram_members_user') IS NULL THEN
    CREATE INDEX idx_diagram_members_user ON public.diagram_members (user_id);
  END IF;
  IF to_regclass('public.idx_share_links_diagram') IS NULL THEN
    CREATE INDEX idx_share_links_diagram ON public.share_links (diagram_id);
  END IF;
  IF to_regclass('public.idx_share_links_workspace') IS NULL THEN
    CREATE INDEX idx_share_links_workspace ON public.share_links (workspace_id);
  END IF;
  IF to_regclass('public.uq_access_requests_pending') IS NULL THEN
    CREATE UNIQUE INDEX uq_access_requests_pending
      ON public.access_requests (diagram_id, requester_id)
      WHERE status = 'pending';
  END IF;
  IF to_regclass('public.idx_access_requests_diagram_status') IS NULL THEN
    CREATE INDEX idx_access_requests_diagram_status
      ON public.access_requests (diagram_id, status);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 5. Owner backfill
INSERT INTO public.diagram_members (diagram_id, user_id, role)
SELECT id, owner_id, 'owner' FROM public.diagrams
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- 6. Helpers
CREATE OR REPLACE FUNCTION public.can_access_diagram(p_diagram uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_uid IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.diagrams d
      JOIN public.workspace_memberships m
        ON m.workspace_id = d.workspace_id AND m.user_id = p_uid
      WHERE d.id = p_diagram)
    OR EXISTS (
      SELECT 1 FROM public.diagram_members dm
      WHERE dm.diagram_id = p_diagram AND dm.user_id = p_uid))
$$;

-- Role of a live (not revoked, not expired) link for this diagram, else NULL.
-- A 'workspace' link counts only for a member of the link's workspace.
CREATE OR REPLACE FUNCTION public.share_link_role(p_diagram uuid, p_hash text)
RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.role FROM public.share_links l
  WHERE p_hash IS NOT NULL AND p_hash <> ''
    AND l.token_hash = p_hash
    AND l.diagram_id = p_diagram
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > now())
    AND (l.audience = 'anyone'
         OR public.is_workspace_member(l.workspace_id, public.current_user_id()))
  LIMIT 1
$$;

-- The link row for a hash, including expired/revoked ones (GET /access reports
-- 'expired'). Knowing the hash requires knowing the 256-bit token.
CREATE OR REPLACE FUNCTION public.resolve_share_token(p_hash text)
RETURNS TABLE (r_id uuid, r_diagram_id uuid, r_workspace_id uuid, r_role text,
               r_audience text, r_expires_at timestamptz, r_revoked_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.diagram_id, l.workspace_id, l.role, l.audience, l.expires_at, l.revoked_at
  FROM public.share_links l
  WHERE p_hash IS NOT NULL AND l.token_hash = p_hash
$$;

CREATE OR REPLACE FUNCTION public.current_share_token_hash() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.share_token_hash', true), '')
$$;

-- GET /access 'request' state and POST /access-requests (R1-E07-T04): the
-- caller has no access yet, so RLS hides the diagram. Title and owner name are
-- returned only to a signed-in caller who is in the diagram's workspace, holds
-- a live link for it (hash in app.share_token_hash), or already filed a
-- request on it. Never for trashed diagrams.
CREATE OR REPLACE FUNCTION public.diagram_request_info(p_diagram uuid)
RETURNS TABLE (r_title text, r_owner_name text, r_workspace_id uuid)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.title, u.name, d.workspace_id
  FROM public.diagrams d
  JOIN public.users u ON u.id = d.owner_id
  WHERE d.id = p_diagram
    AND d.deleted_at IS NULL
    AND public.current_user_id() IS NOT NULL
    AND (public.is_workspace_member(d.workspace_id, public.current_user_id())
         OR EXISTS (SELECT 1 FROM public.share_links l
                    WHERE l.diagram_id = d.id
                      AND l.token_hash = public.current_share_token_hash()
                      AND l.revoked_at IS NULL
                      AND (l.expires_at IS NULL OR l.expires_at > now()))
         OR EXISTS (SELECT 1 FROM public.access_requests r
                    WHERE r.diagram_id = d.id AND r.requester_id = public.current_user_id()))
$$;

-- Owners to notify about a request: only for collaborators on the diagram or
-- a caller who has filed a request on it.
CREATE OR REPLACE FUNCTION public.diagram_owner_contacts(p_diagram uuid)
RETURNS TABLE (r_user_id uuid, r_email text, r_name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text, u.name
  FROM public.diagram_members m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.diagram_id = p_diagram
    AND m.role = 'owner'
    AND public.current_user_id() IS NOT NULL
    AND (public.can_access_diagram(p_diagram, public.current_user_id())
         OR EXISTS (SELECT 1 FROM public.access_requests r
                    WHERE r.diagram_id = p_diagram
                      AND r.requester_id = public.current_user_id()))
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.diagram_request_info(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.diagram_owner_contacts(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.can_access_diagram(uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.share_link_role(uuid, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.resolve_share_token(text) FROM PUBLIC';
END
$$;

-- ---------------------------------------------------------------- 7. RLS
ALTER TABLE public.diagram_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagram_members_access ON public.diagram_members;
CREATE POLICY diagram_members_access ON public.diagram_members FOR ALL
  USING (public.can_access_diagram(diagram_members.diagram_id, public.current_user_id()))
  WITH CHECK (public.can_access_diagram(diagram_members.diagram_id, public.current_user_id()));

DROP POLICY IF EXISTS share_links_member ON public.share_links;
CREATE POLICY share_links_member ON public.share_links FOR ALL
  USING (public.is_workspace_member(share_links.workspace_id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(share_links.workspace_id, public.current_user_id()));

-- The requester sees and files their own requests; collaborators on the
-- diagram see and decide them (the service layer requires SHARE).
DROP POLICY IF EXISTS access_requests_self ON public.access_requests;
CREATE POLICY access_requests_self ON public.access_requests FOR ALL
  USING (access_requests.requester_id = public.current_user_id())
  WITH CHECK (access_requests.requester_id = public.current_user_id());

DROP POLICY IF EXISTS access_requests_diagram ON public.access_requests;
CREATE POLICY access_requests_diagram ON public.access_requests FOR ALL
  USING (public.can_access_diagram(access_requests.diagram_id, public.current_user_id()))
  WITH CHECK (public.can_access_diagram(access_requests.diagram_id, public.current_user_id()));

-- Permissive additions (OR'd with V3 / V10 policies).
DROP POLICY IF EXISTS diagrams_diagram_member ON public.diagrams;
CREATE POLICY diagrams_diagram_member ON public.diagrams FOR ALL
  USING (public.can_access_diagram(diagrams.id, public.current_user_id()))
  WITH CHECK (public.can_access_diagram(diagrams.id, public.current_user_id()));

DROP POLICY IF EXISTS diagrams_share_link_read ON public.diagrams;
CREATE POLICY diagrams_share_link_read ON public.diagrams FOR SELECT
  USING (diagrams.deleted_at IS NULL
         AND public.share_link_role(diagrams.id, public.current_share_token_hash()) IS NOT NULL);

DROP POLICY IF EXISTS threads_diagram_access ON public.threads;
CREATE POLICY threads_diagram_access ON public.threads FOR ALL
  USING (public.can_access_diagram(threads.diagram_id, public.current_user_id()))
  WITH CHECK (public.can_access_diagram(threads.diagram_id, public.current_user_id()));

DROP POLICY IF EXISTS threads_share_link_read ON public.threads;
CREATE POLICY threads_share_link_read ON public.threads FOR SELECT
  USING (public.share_link_role(threads.diagram_id, public.current_share_token_hash()) IS NOT NULL);

DROP POLICY IF EXISTS threads_share_link_comment ON public.threads;
CREATE POLICY threads_share_link_comment ON public.threads FOR INSERT
  WITH CHECK (public.share_link_role(threads.diagram_id, public.current_share_token_hash()) = 'commenter');

DROP POLICY IF EXISTS replies_diagram_access ON public.replies;
CREATE POLICY replies_diagram_access ON public.replies FOR ALL
  USING (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = replies.thread_id
                 AND public.can_access_diagram(t.diagram_id, public.current_user_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = replies.thread_id
                 AND public.can_access_diagram(t.diagram_id, public.current_user_id())));

DROP POLICY IF EXISTS replies_share_link_read ON public.replies;
CREATE POLICY replies_share_link_read ON public.replies FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = replies.thread_id
                 AND public.share_link_role(t.diagram_id, public.current_share_token_hash()) IS NOT NULL));

DROP POLICY IF EXISTS replies_share_link_comment ON public.replies;
CREATE POLICY replies_share_link_comment ON public.replies FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = replies.thread_id
                 AND public.share_link_role(t.diagram_id, public.current_share_token_hash()) = 'commenter'));

DROP POLICY IF EXISTS checkpoints_diagram_access ON public.checkpoints;
CREATE POLICY checkpoints_diagram_access ON public.checkpoints FOR ALL
  USING (public.can_access_diagram(checkpoints.diagram_id, public.current_user_id()))
  WITH CHECK (public.can_access_diagram(checkpoints.diagram_id, public.current_user_id()));

-- ---------------------------------------------------------------- 8. Grants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_members TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_access_diagram(uuid, uuid) TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.share_link_role(uuid, text) TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_share_token(text) TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_request_info(uuid) TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.diagram_owner_contacts(uuid) TO archflux_app';
  ELSE
    RAISE NOTICE 'V11 grants: role archflux_app missing — run db/roles.sql, then re-run V11 to apply grants.';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 9. Comments
COMMENT ON TABLE public.diagram_members IS 'Explicit per-diagram roles (owner|editor|commenter|viewer), R1-E07.';
COMMENT ON TABLE public.share_links IS 'Share links: token_hash = SHA-256 hex of a 32-byte random token shown once; role <= commenter.';
COMMENT ON TABLE public.access_requests IS 'Requests for diagram access; one pending per (diagram, requester).';
COMMENT ON COLUMN public.workspaces.public_links_allowed IS 'Admin policy: may links use audience ''anyone''.';
