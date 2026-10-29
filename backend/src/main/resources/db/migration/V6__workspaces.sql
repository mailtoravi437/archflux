-- ArchFlux V6 — workspace isolation (PROD-002) + migration integrity (PROD-005).
-- Apply AFTER V5__versioning_branching.sql on the same database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V6__workspaces.sql
--
-- What this does:
--   1. Creates workspaces + workspace_memberships (tenant boundary).
--   2. Adds diagrams.workspace_id (NULL, FK RESTRICT), backfills one personal
--      workspace per user in a single DO block, then SET NOT NULL (fail-fast
--      when any diagram is still homeless — the migration rolls back).
--   3. Adds the three hot-path indexes.
--   4. Enables RLS on both new tables (reads gated by membership; workspace
--      INSERT stays open because creation is self-scoped bootstrapping —
--      the service layer authorizes it; UPDATE/DELETE stay member-gated).
--   5. Grants DML on both tables to archflux_app (role-existence guarded so
--      upgrade-before-roles.sql and role-less scratch DBs still apply cleanly;
--      GRANT itself is idempotent, hence re-runnable).
--   6. Fixes audit reachability (SPEC_REPORT G4): audit_trigger_fn becomes
--      SECURITY DEFINER with a locked search_path, PUBLIC execution revoked,
--      EXECUTE granted to archflux_app (+ migrator for operator bootstraps);
--      SELECT/INSERT on audit_log + sequence usage granted to archflux_app.
--      (V3's CREATE OR REPLACE does not reset SECURITY DEFINER, so V3
--      re-runs stay safe.)
--   7. Widens chk_users_provider to ('github','google','email','sso','oidc',
--      'saml','mock') — existing rows are a subset, so re-validation passes.
--   8. provision_user() SECURITY DEFINER login-provisioning function: auth
--      paths run outside @Transactional service methods with no RequestUser
--      yet, so the aspect's SET LOCAL cannot authorize them — and
--      users_modify_admin denies user-row INSERT/UPDATE to non-admins. This
--      function (owner's rights, locked search_path) is the ONLY writer for
--      login-time user provisioning: upsert by id-or-email, refresh profile
--      + last_login_at, ensure personal workspace + admin membership.
--      EXECUTE granted to the runtime role only.
--
-- Re-runnable: every statement is guarded (to_regclass / pg_constraint /
-- information_schema / pg_proc / pg_roles checks, DROP POLICY IF EXISTS),
-- so re-applying on an already-migrated DB is a no-op. NEVER edit this file
-- after it has been applied anywhere — new changes go in V7__... (Flyway
-- checksums). This file MUST stay byte-identical between db/migrations/ and
-- server/src/main/resources/db/migration/ (verify with diff).
--
-- Raw-SQL writers note: diagrams.workspace_id is NOT NULL with no database
-- default — every INSERT must supply a workspace_id (application code sets it
-- via WorkspaceService; see db/seed.dev.sql for the manual pattern).

-- ---------------------------------------------------------------- 1. Tables
DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NULL THEN
    CREATE TABLE public.workspaces (
      id         uuid        NOT NULL DEFAULT gen_random_uuid(),
      name       text        NOT NULL,
      plan       text        NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workspaces PRIMARY KEY (id)
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.workspace_memberships') IS NULL THEN
    CREATE TABLE public.workspace_memberships (
      workspace_id uuid        NOT NULL,
      user_id      uuid        NOT NULL,
      role         text        NOT NULL DEFAULT 'member',
      status       text        NOT NULL DEFAULT 'active',
      invited_by   uuid        NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workspace_memberships PRIMARY KEY (workspace_id, user_id),
      CONSTRAINT fk_memberships_workspace FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) ON DELETE CASCADE,
      CONSTRAINT fk_memberships_user FOREIGN KEY (user_id)
        REFERENCES public.users (id) ON DELETE CASCADE,
      CONSTRAINT chk_memberships_role CHECK (role IN ('admin', 'editor', 'reviewer', 'viewer'))
    );
  END IF;
END
$$;

-- ------------------------------------------------- 2. diagrams.workspace_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagrams' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.diagrams ADD COLUMN workspace_id uuid;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_diagrams_workspace') THEN
    ALTER TABLE public.diagrams
      ADD CONSTRAINT fk_diagrams_workspace
      FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. Backfill
-- One DO block: for every users row, reuse the oldest membership workspace
-- when one exists, else create a personal workspace + admin membership, then
-- attach that user's homeless diagrams. Second run is a no-op (memberships
-- exist, no NULL workspace_id rows remain).
DO $$
DECLARE
  u       RECORD;
  ws_id   uuid;
  ws_name text;
BEGIN
  IF to_regclass('public.workspaces') IS NULL
     OR to_regclass('public.workspace_memberships') IS NULL THEN
    RAISE NOTICE 'V6 backfill: workspace tables missing — skipping backfill.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagrams' AND column_name = 'workspace_id'
  ) THEN
    RAISE NOTICE 'V6 backfill: diagrams.workspace_id missing — skipping backfill.';
    RETURN;
  END IF;

  FOR u IN SELECT id, name FROM public.users LOOP
    SELECT m.workspace_id INTO ws_id
    FROM public.workspace_memberships m
    WHERE m.user_id = u.id
    ORDER BY m.created_at
    LIMIT 1;

    IF ws_id IS NULL THEN
      IF u.name IS NULL OR btrim(u.name) = '' THEN
        ws_name := 'Personal';
      ELSE
        ws_name := u.name || '''s workspace';
      END IF;
      INSERT INTO public.workspaces (name, plan)
      VALUES (ws_name, 'member')
      RETURNING id INTO ws_id;

      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
      VALUES (ws_id, u.id, 'admin', 'active')
      ON CONFLICT DO NOTHING;

      SELECT m.workspace_id INTO ws_id
      FROM public.workspace_memberships m
      WHERE m.user_id = u.id
      ORDER BY m.created_at
      LIMIT 1;
    END IF;

    UPDATE public.diagrams
    SET workspace_id = ws_id
    WHERE owner_id = u.id AND workspace_id IS NULL;

    ws_id := NULL;
  END LOOP;
END
$$;

-- Fail fast (rolls the migration back) when any diagram is still homeless;
-- SET NOT NULL on an already-NOT NULL column is a silent no-op (re-runnable).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagrams' AND column_name = 'workspace_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.diagrams WHERE workspace_id IS NULL) THEN
      RAISE EXCEPTION 'V6: diagrams.workspace_id still NULL for some rows — backfill incomplete, aborting.';
    END IF;
    EXECUTE 'ALTER TABLE public.diagrams ALTER COLUMN workspace_id SET NOT NULL';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 4. Indexes
--   idx_diagrams_workspace  <- workspace feed: WHERE workspace_id=? ORDER BY updated_at DESC
--   idx_memberships_user    <- user's workspaces: WHERE user_id=?
--   idx_memberships_workspace <- workspace roster: WHERE workspace_id=?
DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_workspace') IS NULL THEN
    CREATE INDEX idx_diagrams_workspace
      ON public.diagrams (workspace_id, updated_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_memberships_user') IS NULL THEN
    CREATE INDEX idx_memberships_user
      ON public.workspace_memberships (user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_memberships_workspace') IS NULL THEN
    CREATE INDEX idx_memberships_workspace
      ON public.workspace_memberships (workspace_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 5. RLS
-- Defense in depth: the service layer (WorkspaceService membership checks) is
-- the primary gate; these policies confine a leaked/ mis-scoped connection.
-- current_user_id() reads the transaction-scoped app.current_user_id GUC
-- (NULL when unset → predicates are false → fail-closed, never an error).
--
-- Membership lookups go through is_workspace_member(), a SECURITY DEFINER
-- helper with a locked search_path: RLS policies may NOT subquery their own
-- table (PostgreSQL raises "infinite recursion detected in policy"), so the
-- check runs with the owner's rights and bypasses RLS by design. EXECUTE is
-- revoked from PUBLIC and granted to the runtime roles (§6) alongside the
-- audit trigger fix.
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

-- Harden the V3 identity helper (CREATE OR REPLACE is a forward change, not
-- a V3 edit): after SET-then-RESET, current_setting() yields '' rather than
-- NULL, and ''::uuid raises instead of failing closed. NULLIF restores the
-- fail-closed contract on pooled/reused connections.
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid, uid uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_id = ws AND user_id = uid
  )
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_workspace_member' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC';
  END IF;
END
$$;

-- A workspace row is visible iff the requester holds a membership in it.
-- Companion INSERT policy stays open: workspace creation is self-scoped
-- bootstrapping (personal workspace auto-provision); UPDATE/DELETE stay
-- member-gated, and there is deliberately no blanket DELETE path beyond
-- membership (diagrams RESTRICT workspace deletion while referenced).
DROP POLICY IF EXISTS workspaces_member ON public.workspaces;
CREATE POLICY workspaces_member ON public.workspaces FOR ALL
  USING (public.is_workspace_member(workspaces.id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(workspaces.id, public.current_user_id()));

DROP POLICY IF EXISTS workspaces_insert_bootstrap ON public.workspaces;
CREATE POLICY workspaces_insert_bootstrap ON public.workspaces FOR INSERT
  WITH CHECK (true);

-- A membership row is visible iff the requester is a member of that
-- workspace. Companion self-join INSERT lets a user accept/create their own
-- membership without a pre-existing row (invites for others remain
-- member-gated via the main policy).
DROP POLICY IF EXISTS memberships_member ON public.workspace_memberships;
CREATE POLICY memberships_member ON public.workspace_memberships FOR ALL
  USING (public.is_workspace_member(
    workspace_memberships.workspace_id, public.current_user_id()))
  WITH CHECK (public.is_workspace_member(
    workspace_memberships.workspace_id, public.current_user_id()));

DROP POLICY IF EXISTS memberships_self_join ON public.workspace_memberships;
CREATE POLICY memberships_self_join ON public.workspace_memberships FOR INSERT
  WITH CHECK (user_id = public.current_user_id());

-- ---------------------------------------------------------------- 6. Grants
-- Fresh-install path runs as owner so plain GRANTs would suffice, but the
-- role-existence guard keeps upgrade-before-roles.sql and role-less scratch
-- DBs applying cleanly. GRANT is idempotent → re-runnable either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_memberships TO archflux_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO archflux_app';
  ELSE
    RAISE NOTICE 'V6 grants: role archflux_app missing — run db/roles.sql, then re-run V6 (or roles.sql) to apply table grants.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO archflux_migrator';
  END IF;
END
$$;

-- ---------------------------------------------------------------- 7. Audit reachability (G4)
-- The trigger function must run with the owner's rights (it writes audit_log,
-- which the app role cannot write directly) and a locked search_path (no
-- search_path hijack escalation). Callers need EXECUTE; nobody else does.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'audit_trigger_fn' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'ALTER FUNCTION public.audit_trigger_fn() SECURITY DEFINER';
    EXECUTE 'ALTER FUNCTION public.audit_trigger_fn() SET search_path = public';
    EXECUTE 'REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO archflux_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO archflux_migrator';
    END IF;
  ELSE
    RAISE NOTICE 'V6 audit fix: public.audit_trigger_fn() missing — skipping (apply V3 first).';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    IF to_regclass('public.audit_log') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT ON public.audit_log TO archflux_app';
    END IF;
    IF to_regclass('public.audit_log_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO archflux_app';
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 8. Provider allow-list
-- V4's list omits the sso/oidc/saml provider values the product supports
-- (SPEC_REPORT G11). Existing rows are a subset of the new list, so the
-- re-added CHECK re-validates cleanly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_provider') THEN
    ALTER TABLE public.users DROP CONSTRAINT chk_users_provider;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_provider') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_provider
      CHECK (provider IN ('github', 'google', 'email', 'sso', 'oidc', 'saml', 'mock'));
  END IF;
END
$$;

-- ---------------------------------------------------------------- 9. Comments
COMMENT ON TABLE public.workspaces IS 'Tenant boundary: every tenant-owned record is scoped through a workspace + authorized membership (PRODUCTIZATION_SPEC 5.4).';
COMMENT ON TABLE public.workspace_memberships IS 'Workspace roster: (workspace_id, user_id) with role admin|editor|reviewer|viewer and status.';
COMMENT ON COLUMN public.diagrams.workspace_id IS 'Owning workspace (NOT NULL since V6 backfill); ON DELETE RESTRICT while referenced.';

-- ---------------------------------------------------------------- 10. Login provisioning
-- See header item 8. Re-runnable: CREATE OR REPLACE + guarded grants.
CREATE OR REPLACE FUNCTION public.provision_user(
  p_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_provider text,
  p_provider_id text,
  p_avatar text,
  p_access_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email citext := lower(NULLIF(p_email, ''))::citext;
  v_name text := NULLIF(p_name, '');
  v_id uuid;
  v_ws uuid;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'provision_user: email is required';
  END IF;
  IF v_name IS NULL THEN
    v_name := split_part(v_email::text, '@', 1);
  END IF;
  -- Identity: prefer the presented id (JWT sub), else adopt the email row
  -- (same human returning via another provider), else insert fresh.
  SELECT id INTO v_id FROM public.users WHERE id = p_id;
  IF NOT FOUND THEN
    SELECT id INTO v_id FROM public.users WHERE email = v_email;
  END IF;
  IF NOT FOUND THEN
    v_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO public.users(id, email, name, role, provider, provider_id,
        avatar_url, access_token, last_login_at)
    VALUES (v_id, v_email, v_name, COALESCE(NULLIF(p_role, ''), 'member'),
      NULLIF(p_provider, ''), NULLIF(p_provider_id, ''), NULLIF(p_avatar, ''),
      NULLIF(p_access_token, ''), now());
  ELSE
    -- Profile refresh on login; the stored role is authoritative (never
    -- demoted/promoted by a login claim — role changes go through membership).
    UPDATE public.users SET
      name = v_name,
      provider = COALESCE(NULLIF(p_provider, ''), provider),
      provider_id = COALESCE(NULLIF(p_provider_id, ''), provider_id),
      avatar_url = COALESCE(NULLIF(p_avatar, ''), avatar_url),
      access_token = COALESCE(NULLIF(p_access_token, ''), access_token),
      last_login_at = now()
    WHERE id = v_id;
  END IF;
  -- Personal workspace backstop (mirrors §2 backfill naming).
  SELECT workspace_id INTO v_ws
  FROM public.workspace_memberships WHERE user_id = v_id LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.workspaces(name) VALUES (v_name || '''s workspace')
    RETURNING id INTO v_ws;
    INSERT INTO public.workspace_memberships(workspace_id, user_id, role, status)
    VALUES (v_ws, v_id, 'admin', 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  -- Lost a race (same email inserted concurrently): adopt the winner.
  SELECT id INTO v_id FROM public.users WHERE email = v_email;
  IF NOT FOUND THEN
    RAISE;
  END IF;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION
  public.provision_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_user(uuid, text, text, text, text, text, text, text) TO archflux_app';
  ELSE
    RAISE NOTICE 'V6 provision_user: role archflux_app missing — run db/roles.sql, then re-run V6 (or roles.sql) to apply the grant.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_user(uuid, text, text, text, text, text, text, text) TO archflux_migrator';
  END IF;
END
$$;
