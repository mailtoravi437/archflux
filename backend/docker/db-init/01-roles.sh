#!/bin/sh
# ArchFlux Postgres first-init: self-provision the least-privilege app role.
#
# Runs ONCE, on FIRST db init only (empty data dir), via the
# ./docker/db-init:/docker-entrypoint-initdb.d:ro mount in backend/compose.yml.
# It runs as the postgres superuser/owner, BEFORE Flyway migrates (Flyway
# runs later, at server boot, as POSTGRES_USER so pgcrypto/citext install).
#
# What it does:
#   1. Creates the app role (default archflux_app) idempotently
#      (pg_roles-guarded; safe no-op on re-run).
#   2. Applies schema-level posture that needs NO tables:
#      GRANT USAGE ON SCHEMA public + REVOKE CREATE ON SCHEMA public.
#   3. Grants DML on the V1 tables (users, diagrams, checkpoints, threads,
#      replies, sync_log) plus workspaces/memberships when present, and
#      USAGE,SELECT on sync_log_id_seq / audit_log_id_seq when present.
#      Each grant is to_regclass-guarded: on a fresh volume NO tables exist
#      yet (Flyway hasn't run), so these emit NOTICE and skip — this is
#      expected, not a failure.
#   4. Sets ALTER DEFAULT PRIVILEGES for the owner role so tables/sequences
#      Flyway creates AFTER this script automatically grant DML
#      (SELECT/INSERT/UPDATE/DELETE) and sequence USAGE,SELECT to the app
#      role. THIS is what makes "init then migrate as owner, run as
#      least-privilege app" work without a manual psql step.
#
# Credentials: DB_APP_USER / DB_APP_PASSWORD env (dev defaults flagged
# DEV ONLY). Prod values must come from the secret manager via .env.
#
# Implementation note: the role/owner names travel from the shell into SQL
# via psql -v variables applied at TOP LEVEL (SET my.* / :"var" identifier
# form). Inside DO $$ blocks the server reads them back with
# current_setting(), because psql does not interpolate :vars inside
# dollar-quoted bodies. Passwords use the fail-closed :'var' literal form
# (psql aborts if the variable is unset).
set -eu

APP_USER="${DB_APP_USER:-archflux_app}"
APP_PASSWORD="${DB_APP_PASSWORD:-K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl}"
OWNER_USER="${POSTGRES_USER:-archflux}"
DB_NAME="${POSTGRES_DB:-archflux}"

if [ "$APP_PASSWORD" = "K/aoUfN7OxZlq5x9AY43IdtruUYuOhjl" ]; then
  echo "01-roles.sh: WARNING — using default DEV ONLY app password. Set DB_APP_PASSWORD in prod." >&2
fi

psql -v ON_ERROR_STOP=1 --username "$OWNER_USER" --dbname "$DB_NAME" \
  -v app_user="$APP_USER" \
  -v app_password="$APP_PASSWORD" \
  -v owner_user="$OWNER_USER" <<'EOSQL'
-- Publish shell-supplied names as session settings for the DO blocks below.
SET my.app_user TO :'app_user';
SET my.owner_user TO :'owner_user';

-- 1. Role shell (idempotent).
DO $$
DECLARE
  v_app text := current_setting('my.app_user');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_app) THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN', v_app);
  END IF;
END
$$;

-- Password from env-supplied psql var (fail-closed: aborts if unset).
ALTER ROLE :"app_user" WITH PASSWORD :'app_password';

-- 2. Schema-level posture (no tables needed).
GRANT USAGE ON SCHEMA public TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM :"app_user";

-- 3. Table/sequence grants, each guarded so missing tables (pre-Flyway)
-- NOTICE + skip instead of failing.
DO $$
DECLARE
  v_app text := current_setting('my.app_user');
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'diagrams', 'checkpoints', 'threads', 'replies', 'sync_log', 'workspaces', 'memberships'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, v_app);
    ELSE
      RAISE NOTICE '01-roles.sh: table public.% not present yet — skipping (Flyway migrates after init).', t;
    END IF;
  END LOOP;

  IF to_regclass('public.sync_log_id_seq') IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.sync_log_id_seq TO %I', v_app);
  ELSE
    RAISE NOTICE '01-roles.sh: public.sync_log_id_seq not present yet — skipping.';
  END IF;

  IF to_regclass('public.audit_log_id_seq') IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO %I', v_app);
  ELSE
    RAISE NOTICE '01-roles.sh: public.audit_log_id_seq not present yet — skipping.';
  END IF;
END
$$;

-- 4. Default privileges for the OWNER role (the Flyway user): future tables
-- and sequences the owner creates (i.e. every Flyway migration) automatically
-- grant least-privilege access to the app role. Re-runnable.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- Belt-and-braces: the app role must never hold schema CREATE (DDL).
REVOKE CREATE ON SCHEMA public FROM :"app_user";
EOSQL

echo "01-roles.sh: app role '${APP_USER}' provisioned (table grants deferred to Flyway via default privileges)."
