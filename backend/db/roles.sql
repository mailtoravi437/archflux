-- ArchFlux roles & least-privilege grants (Agent B).
--
-- Run AFTER V1__init.sql, AS OWNER/SUPERUSER, with per-role passwords supplied as
-- psql variables (never baked into this file):
--
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 \
--     -v APP_PASSWORD='K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl' \
--     -v MIGRATOR_PASSWORD='f506189f13b9ff61e04350a8bd983008' \
--     -f db/roles.sql
--
-- Local-dev defaults (convenience ONLY — never use in staging/prod):
--   APP_PASSWORD=K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl  MIGRATOR_PASSWORD=f506189f13b9ff61e04350a8bd983008
-- Production: export strong unique passwords per role from your secret manager and
-- pass them via -v. The two roles MUST have different passwords (separate creds).
--
-- Privilege model:
--   archflux_migrator : DDL owner path for deploys without superuser (CREATE/ALTER/INDEX
--                       on the archflux tables + future-table defaults). Owns nothing here;
--                       run V1 as superuser/owner, then hand DDL to this role.
--   archflux_app      : runtime API role — DML ONLY (SELECT/INSERT/UPDATE/DELETE on the
--                       6 tables + USAGE,SELECT on the sync_log sequence). NO CREATE,
--                       NO DDL, NO schema usage beyond public.
-- Re-runnable: role creation is pg_roles-guarded, GRANTs are idempotent, table grants
-- are to_regclass-guarded so running before V1 emits a NOTICE instead of failing.

-- ---------------------------------------------------------- 1. Role shells
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
    CREATE ROLE archflux_migrator WITH LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    CREATE ROLE archflux_app WITH LOGIN;
  END IF;
END
$$;

-- Passwords come from psql -v variables; psql aborts here if a variable is unset,
-- which is intentional (fail-closed: never create a passwordless login role).
ALTER ROLE archflux_migrator WITH PASSWORD :'MIGRATOR_PASSWORD';
ALTER ROLE archflux_app WITH PASSWORD :'APP_PASSWORD';

-- ---------------------------------------------------------- 2. Grants
-- Schema usage: app may USE public, migrator may also CREATE (future migrations).
GRANT USAGE ON SCHEMA public TO archflux_app;
GRANT USAGE, CREATE ON SCHEMA public TO archflux_migrator;

DO $$
BEGIN
  IF to_regclass('public.users')       IS NOT NULL
     AND to_regclass('public.diagrams')     IS NOT NULL
     AND to_regclass('public.checkpoints')  IS NOT NULL
     AND to_regclass('public.threads')      IS NOT NULL
     AND to_regclass('public.replies')      IS NOT NULL
     AND to_regclass('public.sync_log')     IS NOT NULL THEN

    -- App: DML only on all six tables.
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagrams TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoints TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.threads TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.replies TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_log TO archflux_app;

    -- Migrator: full DML+DDL on existing tables (owner path for schema changes).
    GRANT ALL PRIVILEGES ON public.users TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.diagrams TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.checkpoints TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.threads TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.replies TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.sync_log TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: V1 tables not present yet — run src/main/resources/db/migration/V1__init.sql first, then re-run roles.sql.';
  END IF;

  -- bigserial backing sequence: app needs USAGE+SELECT to insert into sync_log;
  -- nothing else needs sequence UPDATE (no setval in app code).
  IF to_regclass('public.sync_log_id_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.sync_log_id_seq TO archflux_app;
    GRANT ALL PRIVILEGES ON SEQUENCE public.sync_log_id_seq TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.sync_log_id_seq not present yet — run V1__init.sql first, then re-run roles.sql.';
  END IF;
END
$$;

-- Future tables created by the migrator role inherit DML-only access for the app.
-- (Runs as superuser/owner here; harmless no-op to re-run.)
ALTER DEFAULT PRIVILEGES FOR ROLE archflux_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO archflux_app;

-- ---------------------------------------------------------- 3. V6 workspace grants (mirror of V6__workspaces.sql §6–7)
-- Operator-run manual bootstraps: same grants V6 applies when the role exists,
-- so running roles.sql after V6 converges fresh installs and upgrades alike.
-- Re-runnable: every block is to_regclass/pg_proc-guarded; GRANTs idempotent.
DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL
     AND to_regclass('public.workspace_memberships') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_memberships TO archflux_app;
    GRANT ALL PRIVILEGES ON public.workspaces TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.workspace_memberships TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: workspaces/workspace_memberships not present yet — apply V6__workspaces.sql first, then re-run roles.sql.';
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    -- Trigger writes run as the SECURITY DEFINER owner, so the app role needs
    -- no write path of its own; SELECT covers read-back, INSERT covers
    -- operator-driven manual inserts. (audit_log itself has no RLS.)
    GRANT SELECT, INSERT ON public.audit_log TO archflux_app;
    GRANT ALL PRIVILEGES ON public.audit_log TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.audit_log not present yet — apply V3__production_hardening.sql first, then re-run roles.sql.';
  END IF;

  IF to_regclass('public.audit_log_id_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO archflux_app;
    GRANT ALL PRIVILEGES ON SEQUENCE public.audit_log_id_seq TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.audit_log_id_seq not present yet — apply V3 first, then re-run roles.sql.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE proname = 'audit_trigger_fn' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO archflux_app;
    GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.audit_trigger_fn() missing — apply V3 first, then re-run roles.sql.';
  END IF;

  -- V6 RLS membership helper (SECURITY DEFINER; policies cannot subquery
  -- their own table). Same EXECUTE surface as the audit trigger.
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE proname = 'is_workspace_member' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO archflux_app;
    GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.is_workspace_member(uuid, uuid) missing — apply V6 first, then re-run roles.sql.';
  END IF;

  -- V6 login provisioning (SECURITY DEFINER): the ONLY writer for login-time
  -- user upserts, which run outside @Transactional service scope with no
  -- RequestUser yet (users_modify_admin would deny them to non-admins).
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE proname = 'provision_user' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION
      public.provision_user(uuid, text, text, text, text, text, text, text) TO archflux_app;
    GRANT EXECUTE ON FUNCTION
      public.provision_user(uuid, text, text, text, text, text, text, text) TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.provision_user missing — apply V6 first, then re-run roles.sql.';
  END IF;
END
$$;

-- ---------------------------------------------------------- 4. V7 Phase 2 integrity grants (mirror of V7__phase2_integrity.sql §6)
-- Operator-run manual bootstraps: same grants V7 applies when the role exists,
-- so running roles.sql after V7 converges fresh installs and upgrades alike.
-- Re-runnable: every block is to_regclass-guarded; GRANTs idempotent. There
-- are no new functions in V7, so no EXECUTE grants here.
DO $$
BEGIN
  IF to_regclass('public.diagram_revisions') IS NOT NULL
      AND to_regclass('public.webhook_events') IS NOT NULL
      AND to_regclass('public.idempotency_keys') IS NOT NULL
      AND to_regclass('public.audit_events') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_revisions TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_events TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys TO archflux_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO archflux_app;
    GRANT ALL PRIVILEGES ON public.diagram_revisions TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.webhook_events TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.idempotency_keys TO archflux_migrator;
    GRANT ALL PRIVILEGES ON public.audit_events TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: V7 tables not present yet — apply V7__phase2_integrity.sql first, then re-run roles.sql.';
  END IF;

  -- bigserial backing sequences: app needs USAGE+SELECT to insert rows;
  -- nothing else needs sequence UPDATE (no setval in app code).
  IF to_regclass('public.webhook_events_id_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.webhook_events_id_seq TO archflux_app;
    GRANT ALL PRIVILEGES ON SEQUENCE public.webhook_events_id_seq TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.webhook_events_id_seq not present yet — apply V7 first, then re-run roles.sql.';
  END IF;

  IF to_regclass('public.audit_events_id_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO archflux_app;
    GRANT ALL PRIVILEGES ON SEQUENCE public.audit_events_id_seq TO archflux_migrator;
  ELSE
    RAISE NOTICE 'roles.sql: public.audit_events_id_seq not present yet — apply V7 first, then re-run roles.sql.';
  END IF;
END
$$;

-- Belt-and-braces: the app role must never hold schema CREATE (DDL).
REVOKE CREATE ON SCHEMA public FROM archflux_app;

-- ---------------------------------------------------------- 5. V10-V18 grants (mirror of the guarded grants in V10-V18)
-- R1-BUG-06: migrations grant to archflux_app only when the role already exists at
-- migration time. On a fresh environment roles.sql runs AFTER the migrations, so these
-- grants must be repeated here, or every RLS policy that calls a SECURITY DEFINER helper
-- fails with "permission denied for function ..." under the runtime role.
-- Re-runnable: every block is to_regclass/pg_proc-guarded; GRANTs idempotent.
DO $$
BEGIN
  -- Tables (DML only).
  IF to_regclass('public.folders') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO archflux_app;
    GRANT ALL PRIVILEGES ON public.folders TO archflux_migrator;
  END IF;
  IF to_regclass('public.diagram_stars') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_stars TO archflux_app;
    GRANT ALL PRIVILEGES ON public.diagram_stars TO archflux_migrator;
  END IF;
  IF to_regclass('public.diagram_members') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_members TO archflux_app;
    GRANT ALL PRIVILEGES ON public.diagram_members TO archflux_migrator;
  END IF;
  IF to_regclass('public.share_links') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO archflux_app;
    GRANT ALL PRIVILEGES ON public.share_links TO archflux_migrator;
  END IF;
  IF to_regclass('public.access_requests') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO archflux_app;
    GRANT ALL PRIVILEGES ON public.access_requests TO archflux_migrator;
  END IF;
  IF to_regclass('public.workspace_invites') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO archflux_app;
    GRANT ALL PRIVILEGES ON public.workspace_invites TO archflux_migrator;
  END IF;
  IF to_regclass('public.product_events') IS NOT NULL THEN
    GRANT INSERT ON public.product_events TO archflux_app;
    GRANT ALL PRIVILEGES ON public.product_events TO archflux_migrator;
  END IF;
  IF to_regclass('public.product_events_id_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.product_events_id_seq TO archflux_app;
    GRANT ALL PRIVILEGES ON SEQUENCE public.product_events_id_seq TO archflux_migrator;
  END IF;

  -- V14: revision rows are append-only for the app; only name/description may change.
  IF to_regclass('public.diagram_revisions') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'diagram_revisions'
                   AND column_name = 'name') THEN
    REVOKE UPDATE ON public.diagram_revisions FROM archflux_app;
    GRANT UPDATE (name, description) ON public.diagram_revisions TO archflux_app;
  END IF;
END
$$;

-- SECURITY DEFINER helpers called from RLS policies and services. Without EXECUTE the
-- policy evaluation itself errors for the runtime role.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.purge_expired_trash(timestamptz, integer)',
    'public.can_access_diagram(uuid, uuid)',
    'public.share_link_role(uuid, text)',
    'public.resolve_share_token(text)',
    'public.diagram_request_info(uuid)',
    'public.diagram_owner_contacts(uuid)',
    'public.current_user_email()',
    'public.diagram_role_at_least(uuid, uuid, text)',
    'public.workspace_role_at_least(uuid, uuid, text)',
    'public.has_pending_workspace_invite(uuid)',
    'public.workspace_editor_seat_count(uuid)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO archflux_app', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO archflux_migrator', fn);
    ELSE
      RAISE NOTICE 'roles.sql: % missing, apply the migration that creates it, then re-run roles.sql.', fn;
    END IF;
  END LOOP;
END
$$;

-- Belt-and-braces again (section 5 only ever grants DML, never CREATE).
REVOKE CREATE ON SCHEMA public FROM archflux_app;
