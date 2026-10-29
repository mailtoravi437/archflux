-- ArchFlux V13 — product events + per-workspace analytics opt-out (R1-E12-T04, DATA_MODEL_R1 §4.5).
-- Apply AFTER V11__sharing.sql on the same database.
--
-- What this does:
--   1. Creates public.product_events (append-only; name is lower_snake with at least one underscore).
--   2. Index (name, created_at) for funnel queries.
--   3. Adds workspaces.analytics_enabled (default true; opt-out per workspace).
--   4. RLS: the app role may only INSERT rows that carry its own user id.
--      No SELECT/UPDATE/DELETE policy and no such grant: events are read by the DBA only.
--   5. Grants to archflux_app (role-existence guarded).
--
-- Re-runnable: every statement is guarded.
-- NEVER edit this file after it has been applied anywhere — add V16__...

DO $$
BEGIN
  IF to_regclass('public.product_events') IS NULL THEN
    CREATE TABLE public.product_events (
      id           bigserial   NOT NULL,
      workspace_id uuid        NULL,
      user_id      uuid        NULL,
      name         text        NOT NULL,
      props        jsonb       NOT NULL DEFAULT '{}'::jsonb,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_product_events PRIMARY KEY (id),
      CONSTRAINT chk_product_events_name CHECK (name ~ '^[a-z]+(_[a-z]+)+$')
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_product_events_name_created
  ON public.product_events (name, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'analytics_enabled'
  ) THEN
    ALTER TABLE public.workspaces ADD COLUMN analytics_enabled boolean NOT NULL DEFAULT true;
  END IF;
END
$$;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_events_insert_self ON public.product_events;
CREATE POLICY product_events_insert_self ON public.product_events FOR INSERT
  WITH CHECK (product_events.user_id = public.current_user_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT INSERT ON public.product_events TO archflux_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.product_events_id_seq TO archflux_app';
  END IF;
END
$$;
