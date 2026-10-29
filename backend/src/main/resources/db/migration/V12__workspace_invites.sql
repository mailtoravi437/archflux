-- ArchFlux V12 — workspace invites, slug, join policy (R1-E11-T01, DATA_MODEL_R1 §4.4).
-- Apply AFTER V11__sharing.sql on the same database.
--
-- What this does:
--   1. Adds workspaces.slug (unique, ^[a-z0-9-]{3,40}$), join_policy
--      (invite|request|auto, default invite) and domain (auto-join domain).
--   2. Creates public.workspace_invites. Only the SHA-256 hex of the token is
--      stored. A partial unique index allows one pending invite per
--      (workspace, lower(email)).
--   3. RLS: workspace members read/write their workspace's invites; an invitee
--      (matching email) can read and mark their own invite accepted, via the
--      SECURITY DEFINER helper current_user_email().
--   4. Grants to archflux_app (role-existence guarded).
--
-- Re-runnable: every statement is guarded.
-- NEVER edit this file after it has been applied anywhere — add V16__...

-- ---------------------------------------------------------------- 1. workspaces columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'slug') THEN
    ALTER TABLE public.workspaces ADD COLUMN slug text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'join_policy') THEN
    ALTER TABLE public.workspaces ADD COLUMN join_policy text NOT NULL DEFAULT 'invite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'domain') THEN
    ALTER TABLE public.workspaces ADD COLUMN domain text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_workspaces_slug') THEN
    ALTER TABLE public.workspaces ADD CONSTRAINT chk_workspaces_slug
      CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]{3,40}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_workspaces_join_policy') THEN
    ALTER TABLE public.workspaces ADD CONSTRAINT chk_workspaces_join_policy
      CHECK (join_policy IN ('invite', 'request', 'auto'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_slug ON public.workspaces (slug) WHERE slug IS NOT NULL;

-- ---------------------------------------------------------------- 2. workspace_invites
DO $$
BEGIN
  IF to_regclass('public.workspace_invites') IS NULL THEN
    CREATE TABLE public.workspace_invites (
      id           uuid        NOT NULL DEFAULT gen_random_uuid(),
      workspace_id uuid        NOT NULL,
      email        text        NOT NULL,
      role         text        NOT NULL,
      token_hash   text        NOT NULL,
      invited_by   uuid        NULL,
      expires_at   timestamptz NOT NULL,
      accepted_at  timestamptz NULL,
      revoked_at   timestamptz NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workspace_invites PRIMARY KEY (id),
      CONSTRAINT fk_invites_workspace FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) ON DELETE CASCADE,
      CONSTRAINT fk_invites_invited_by FOREIGN KEY (invited_by)
        REFERENCES public.users (id) ON DELETE SET NULL,
      CONSTRAINT uq_invites_token_hash UNIQUE (token_hash),
      CONSTRAINT chk_invites_role CHECK (role IN ('admin', 'editor', 'reviewer', 'viewer')),
      CONSTRAINT chk_invites_email_length CHECK (length(email) BETWEEN 3 AND 254)
    );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invites_pending_email
  ON public.workspace_invites (workspace_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invites_workspace ON public.workspace_invites (workspace_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.workspace_invites (lower(email));

-- ---------------------------------------------------------------- 3. RLS
CREATE OR REPLACE FUNCTION public.current_user_email() RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email::text FROM public.users u WHERE u.id = public.current_user_id()
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_email() TO archflux_app';
  END IF;
END
$$;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_invites_member ON public.workspace_invites;
CREATE POLICY workspace_invites_member ON public.workspace_invites FOR ALL
  USING (public.is_workspace_member(workspace_invites.workspace_id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(workspace_invites.workspace_id, public.current_user_id()));

-- The invitee is not a member yet: they may see and accept an invite addressed to them.
DROP POLICY IF EXISTS workspace_invites_invitee_read ON public.workspace_invites;
CREATE POLICY workspace_invites_invitee_read ON public.workspace_invites FOR SELECT
  USING (lower(workspace_invites.email) = lower(public.current_user_email()));

DROP POLICY IF EXISTS workspace_invites_invitee_accept ON public.workspace_invites;
CREATE POLICY workspace_invites_invitee_accept ON public.workspace_invites FOR UPDATE
  USING (lower(workspace_invites.email) = lower(public.current_user_email()))
  WITH CHECK (lower(workspace_invites.email) = lower(public.current_user_email()));

-- ---------------------------------------------------------------- 4. Grants
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO archflux_app';
  END IF;
END
$$;
