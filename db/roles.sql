-- ArchFlux roles & least-privilege grants (Agent B).
--
-- Run AFTER V1__init.sql, AS OWNER/SUPERUSER, with per-role passwords supplied as
-- psql variables (never baked into this file):
--
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 \
--     -v APP_PASSWORD='dev-app-only' \
--     -v MIGRATOR_PASSWORD='dev-migrator-only' \
--     -f db/roles.sql
--
-- Local-dev defaults (convenience ONLY — never use in staging/prod):
--   APP_PASSWORD=dev-app-only  MIGRATOR_PASSWORD=dev-migrator-only
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
    RAISE NOTICE 'roles.sql: V1 tables not present yet — run db/migrations/V1__init.sql first, then re-run roles.sql.';
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

-- Belt-and-braces: the app role must never hold schema CREATE (DDL).
REVOKE CREATE ON SCHEMA public FROM archflux_app;
