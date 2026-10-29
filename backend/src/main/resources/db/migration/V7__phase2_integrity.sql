-- ArchFlux V7 — Phase 2 data integrity (PRODUCTIZATION_SPEC §7 domain model,
-- §16 Phase 2: immutable revisions, durable idempotency/webhook/audit records).
-- Apply AFTER V6__workspaces.sql on the same database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V7__phase2_integrity.sql
--
-- What this does:
--   1. Creates diagram_revisions (immutable snapshots with parent lineage,
--      content hash, author, source metadata).
--   2. Adds diagrams.version (bigint NOT NULL DEFAULT 1 — optimistic
--      concurrency counter; services bump it per mutation).
--   3. Creates webhook_events (durable provider inbox with unique delivery_id
--      for persist-before-ack + dedup).
--   4. Creates idempotency_keys (durable retry record; a services agent moves
--      the filter to this table).
--   5. Creates audit_events (actor, workspace, action, resource, outcome,
--      correlation ID, minimized metadata).
--   6. Backfills one 'backfill' revision per diagram lacking any revision in
--      a single DO block (second run is a no-op — NOT EXISTS guard).
--   7. Enables RLS on all four tables: revisions get SELECT-scoped-to-members
--      + open INSERT bootstrap only (UPDATE/DELETE stay denied = immutability
--      enforced at the database); the three service-owned tables get an
--      app-wide ALL policy (no tenant rows to leak — audit reads are
--      workspace-filtered in service code).
--   8. Grants DML on all four tables + sequence usage to archflux_app
--      (role-existence guarded so upgrade-before-roles.sql and role-less
--      scratch DBs still apply cleanly; GRANT itself is idempotent, hence
--      re-runnable). No new functions, so no EXECUTE grants.
--
-- Re-runnable: every statement is guarded (to_regclass / pg_constraint /
-- information_schema checks, DROP POLICY IF EXISTS), so re-applying on an
-- already-migrated DB is a no-op. NEVER edit this file after it has been
-- applied anywhere — new changes go in V8__... (Flyway checksums). This file
-- MUST stay byte-identical between db/migrations/ and
-- server/src/main/resources/db/migration/ (verify with diff).
--
-- Raw-SQL writers note: diagram_revisions has no UPDATE/DELETE path under the
-- app role (RLS default-deny); every INSERT must supply diagram_id,
-- content_hash, and snapshot (services compute the sha256 over the graph).

-- ---------------------------------------------------------------- 1. Tables
DO $$
BEGIN
  IF to_regclass('public.diagram_revisions') IS NULL THEN
    CREATE TABLE public.diagram_revisions (
      id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
      diagram_id         uuid        NOT NULL,
      parent_revision_id uuid        NULL,
      content_hash       text        NOT NULL,
      snapshot           jsonb       NOT NULL DEFAULT '{}',
      author_id          uuid        NULL,
      source             text        NOT NULL DEFAULT 'manual',
      message            text        NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_diagram_revisions PRIMARY KEY (id),
      CONSTRAINT fk_revisions_diagram FOREIGN KEY (diagram_id)
        REFERENCES public.diagrams (id) ON DELETE CASCADE,
      CONSTRAINT fk_revisions_parent FOREIGN KEY (parent_revision_id)
        REFERENCES public.diagram_revisions (id) ON DELETE SET NULL,
      CONSTRAINT chk_revisions_source
        CHECK (source IN ('manual', 'import', 'sync', 'webhook', 'backfill', 'restore'))
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.webhook_events') IS NULL THEN
    CREATE TABLE public.webhook_events (
      id          bigserial   NOT NULL,
      provider    text        NOT NULL DEFAULT 'github',
      delivery_id text        NOT NULL,
      event_type  text        NULL,
      payload_hash text       NULL,
      status      text        NOT NULL DEFAULT 'received',
      retry_count int         NOT NULL DEFAULT 0,
      error       text        NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz NULL,
      CONSTRAINT pk_webhook_events PRIMARY KEY (id),
      CONSTRAINT uq_webhook_delivery UNIQUE (delivery_id),
      CONSTRAINT chk_webhook_status
        CHECK (status IN ('received', 'processing', 'processed', 'failed'))
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idempotency_keys') IS NULL THEN
    CREATE TABLE public.idempotency_keys (
      key           uuid        NOT NULL,
      user_id       uuid        NULL,
      status_code   int         NOT NULL,
      response_body text        NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      expires_at    timestamptz NOT NULL,
      CONSTRAINT pk_idempotency_keys PRIMARY KEY (key)
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.audit_events') IS NULL THEN
    CREATE TABLE public.audit_events (
      id             bigserial   NOT NULL,
      actor_id       uuid        NULL,
      workspace_id   uuid        NULL,
      action         text        NOT NULL,
      resource_type  text        NULL,
      resource_id    text        NULL,
      outcome        text        NOT NULL DEFAULT 'ok',
      correlation_id text        NULL,
      metadata       jsonb       NULL,
      created_at     timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_audit_events PRIMARY KEY (id),
      CONSTRAINT chk_audit_outcome CHECK (outcome IN ('ok', 'denied', 'error'))
    );
  END IF;
END
$$;

-- ------------------------------------------------- 2. diagrams.version
-- Optimistic concurrency counter (plain column, NOT a JPA @Version field —
-- services bump it explicitly per mutation; stale writes resolve to 409).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagrams' AND column_name = 'version'
  ) THEN
    ALTER TABLE public.diagrams ADD COLUMN version bigint NOT NULL DEFAULT 1;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 3. Backfill
-- One DO block: for every diagrams row lacking a revision, insert one
-- revision (parent NULL, sha256 over the graph text, source='backfill',
-- author=owner). Second run is a no-op (NOT EXISTS guard).
DO $$
BEGIN
  IF to_regclass('public.diagram_revisions') IS NULL THEN
    RAISE NOTICE 'V7 backfill: public.diagram_revisions missing — skipping backfill.';
    RETURN;
  END IF;
  IF to_regclass('public.diagrams') IS NULL THEN
    RAISE NOTICE 'V7 backfill: public.diagrams missing — skipping backfill.';
    RETURN;
  END IF;

  INSERT INTO public.diagram_revisions
    (diagram_id, parent_revision_id, content_hash, snapshot, author_id, source, message)
  SELECT d.id,
         NULL,
         encode(digest(convert_to(d.graph::text, 'UTF8'), 'sha256'), 'hex'),
         COALESCE(d.graph, '{}'::jsonb),
         d.owner_id,
         'backfill',
         NULL
  FROM public.diagrams d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.diagram_revisions r WHERE r.diagram_id = d.id
  );
END
$$;

-- ---------------------------------------------------------------- 4. Indexes
--   idx_revisions_diagram <- revision feed: WHERE diagram_id=? ORDER BY created_at DESC
--   idx_revisions_hash    <- content dedup lookup: WHERE content_hash=?
--   idx_webhook_status    <- inbox sweep: WHERE status=? ORDER BY received_at
--   idx_idem_expires      <- TTL cleanup: WHERE expires_at < now()
--   idx_audit_ws          <- workspace audit trail: WHERE workspace_id=? ORDER BY created_at DESC
--   idx_audit_actor       <- actor audit trail: WHERE actor_id=? ORDER BY created_at DESC
DO $$
BEGIN
  IF to_regclass('public.idx_revisions_diagram') IS NULL THEN
    CREATE INDEX idx_revisions_diagram
      ON public.diagram_revisions (diagram_id, created_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_revisions_hash') IS NULL THEN
    CREATE INDEX idx_revisions_hash
      ON public.diagram_revisions (content_hash);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_webhook_status') IS NULL THEN
    CREATE INDEX idx_webhook_status
      ON public.webhook_events (status, received_at);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_idem_expires') IS NULL THEN
    CREATE INDEX idx_idem_expires
      ON public.idempotency_keys (expires_at);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_audit_ws') IS NULL THEN
    CREATE INDEX idx_audit_ws
      ON public.audit_events (workspace_id, created_at DESC);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_audit_actor') IS NULL THEN
    CREATE INDEX idx_audit_actor
      ON public.audit_events (actor_id, created_at DESC);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 5. RLS
-- Defense in depth: the service layer is the primary gate; these policies
-- confine a leaked / mis-scoped connection. current_user_id() reads the
-- transaction-scoped app.current_user_id GUC (NULL when unset → predicates
-- are false → fail-closed, never an error).
--
-- diagram_revisions: readable iff the requester holds a membership in the
-- diagram's workspace (join through diagrams + is_workspace_member, the
-- SECURITY DEFINER helper — policies may NOT subquery
-- workspace_memberships directly). Companion INSERT stays open: revision
-- writes originate in services (which authorize them) and run as
-- archflux_app — without an INSERT policy they would be denied. There is
-- deliberately NO update/delete policy: revisions are immutable, so UPDATE
-- and DELETE are denied for every non-owner role at the database.
--
-- webhook_events / idempotency_keys / audit_events: service-owned tables
-- with no tenant rows to leak, so the app role gets an explicit ALL policy
-- (audit reads are workspace-filtered in service code).
ALTER TABLE public.diagram_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revisions_member_select ON public.diagram_revisions;
CREATE POLICY revisions_member_select ON public.diagram_revisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.diagrams d
    WHERE d.id = diagram_revisions.diagram_id
      AND public.is_workspace_member(d.workspace_id, public.current_user_id())
  ));

DROP POLICY IF EXISTS revisions_insert_bootstrap ON public.diagram_revisions;
CREATE POLICY revisions_insert_bootstrap ON public.diagram_revisions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS webhook_events_app_all ON public.webhook_events;
CREATE POLICY webhook_events_app_all ON public.webhook_events FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS idempotency_keys_app_all ON public.idempotency_keys;
CREATE POLICY idempotency_keys_app_all ON public.idempotency_keys FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_events_app_all ON public.audit_events;
CREATE POLICY audit_events_app_all ON public.audit_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------- 6. Grants
-- Fresh-install path runs as owner so plain GRANTs would suffice, but the
-- role-existence guard keeps upgrade-before-roles.sql and role-less scratch
-- DBs applying cleanly. GRANT is idempotent → re-runnable either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagram_revisions TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_events TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys TO archflux_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO archflux_app';
    IF to_regclass('public.webhook_events_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.webhook_events_id_seq TO archflux_app';
    END IF;
    IF to_regclass('public.audit_events_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO archflux_app';
    END IF;
  ELSE
    RAISE NOTICE 'V7 grants: role archflux_app missing — run db/roles.sql, then re-run V7 (or roles.sql) to apply table grants.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON public.diagram_revisions TO archflux_migrator';
    EXECUTE 'GRANT ALL PRIVILEGES ON public.webhook_events TO archflux_migrator';
    EXECUTE 'GRANT ALL PRIVILEGES ON public.idempotency_keys TO archflux_migrator';
    EXECUTE 'GRANT ALL PRIVILEGES ON public.audit_events TO archflux_migrator';
    IF to_regclass('public.webhook_events_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT ALL PRIVILEGES ON SEQUENCE public.webhook_events_id_seq TO archflux_migrator';
    END IF;
    IF to_regclass('public.audit_events_id_seq') IS NOT NULL THEN
      EXECUTE 'GRANT ALL PRIVILEGES ON SEQUENCE public.audit_events_id_seq TO archflux_migrator';
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 7. Comments
COMMENT ON TABLE public.diagram_revisions IS 'Immutable diagram snapshots with parent lineage + sha256 content hash (PRODUCTIZATION_SPEC §7). No UPDATE/DELETE path for the app role — immutability is RLS-enforced.';
COMMENT ON TABLE public.webhook_events IS 'Durable provider webhook inbox: persist-before-ack, dedup by unique delivery_id (PRODUCTIZATION_SPEC §10).';
COMMENT ON TABLE public.idempotency_keys IS 'Durable idempotency records for externally retried mutations with TTL cleanup (PRODUCTIZATION_SPEC §6.2).';
COMMENT ON TABLE public.audit_events IS 'Actor/workspace/action/resource/outcome trail with correlation ID (PRODUCTIZATION_SPEC PROD-009).';
COMMENT ON COLUMN public.diagrams.version IS 'Optimistic concurrency counter (NOT NULL since V7 backfill); services bump per mutation, stale writes resolve to 409.';
