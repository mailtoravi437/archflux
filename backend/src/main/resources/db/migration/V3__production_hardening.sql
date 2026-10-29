-- ArchFlux V3 — Production hardening: RLS, audit triggers, constraints, partitioning prep
-- Apply AFTER V2__additional_indexes.sql on the same database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V3__production_hardening.sql

-- ---------------------------------------------------------------- 1. Row Level Security (RLS)
-- Enable RLS on all user-data tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Helper functions for role checks (must exist before policies reference them)
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.current_user_id', true)::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(role text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.current_user_role', true) = role
$$;

-- RLS Policies for users: users can read all, only admins can modify
DROP POLICY IF EXISTS users_select_all ON public.users;
DROP POLICY IF EXISTS users_modify_admin ON public.users;
CREATE POLICY users_select_all ON public.users FOR SELECT USING (true);
CREATE POLICY users_modify_admin ON public.users FOR ALL
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));
DROP POLICY IF EXISTS users_modify_self ON public.users;
CREATE POLICY users_modify_self ON public.users FOR UPDATE
  USING (id = public.current_user_id())
  WITH CHECK (id = public.current_user_id());

-- RLS Policies for diagrams: users see own diagrams + public/shared ones
DROP POLICY IF EXISTS diagrams_owner ON public.diagrams;
DROP POLICY IF EXISTS diagrams_shared_read ON public.diagrams;
CREATE POLICY diagrams_owner ON public.diagrams FOR ALL
  USING (owner_id = public.current_user_id())
  WITH CHECK (owner_id = public.current_user_id());

CREATE POLICY diagrams_shared_read ON public.diagrams FOR SELECT
  USING (tags && ARRAY['public'] OR owner_id = public.current_user_id());

-- RLS Policies for checkpoints: tied to diagram ownership
DROP POLICY IF EXISTS checkpoints_owner ON public.checkpoints;
CREATE POLICY checkpoints_owner ON public.checkpoints FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = checkpoints.diagram_id 
    AND d.owner_id = public.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = checkpoints.diagram_id 
    AND d.owner_id = public.current_user_id()
  ));

-- RLS Policies for threads: tied to diagram ownership
DROP POLICY IF EXISTS threads_owner ON public.threads;
CREATE POLICY threads_owner ON public.threads FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = threads.diagram_id 
    AND d.owner_id = public.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = threads.diagram_id 
    AND d.owner_id = public.current_user_id()
  ));

-- RLS Policies for replies: tied to thread -> diagram ownership
DROP POLICY IF EXISTS replies_owner ON public.replies;
CREATE POLICY replies_owner ON public.replies FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.threads t
    JOIN public.diagrams d ON d.id = t.diagram_id
    WHERE t.id = replies.thread_id 
    AND d.owner_id = public.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.threads t
    JOIN public.diagrams d ON d.id = t.diagram_id
    WHERE t.id = replies.thread_id 
    AND d.owner_id = public.current_user_id()
  ));

-- RLS Policies for sync_log: tied to diagram ownership
DROP POLICY IF EXISTS sync_log_owner ON public.sync_log;
CREATE POLICY sync_log_owner ON public.sync_log FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = sync_log.diagram_id 
    AND d.owner_id = public.current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.diagrams d 
    WHERE d.id = sync_log.diagram_id 
    AND d.owner_id = public.current_user_id()
  ));

-- ---------------------------------------------------------------- 2. Audit Trigger (immutable audit log)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial   PRIMARY KEY,
  table_name  text        NOT NULL,
  operation   text        NOT NULL, -- INSERT, UPDATE, DELETE
  old_row     jsonb,
  new_row     jsonb,
  changed_by  uuid        NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  client_ip   inet,
  user_agent  text
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_pk ON public.audit_log (table_name, (new_row->>'id'));
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON public.audit_log (changed_at DESC);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old = to_jsonb(OLD);
    v_new = NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old = NULL;
    v_new = to_jsonb(NEW);
  ELSE -- UPDATE
    v_old = to_jsonb(OLD);
    v_new = to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, operation, old_row, new_row, changed_by, client_ip, user_agent)
  VALUES (TG_TABLE_NAME, TG_OP, v_old, v_new, 
    COALESCE(NULLIF(current_setting('app.current_user_id', true), ''), '00000000-0000-0000-0000-000000000000')::uuid,
    COALESCE(NULLIF(current_setting('app.client_ip', true), ''), '0.0.0.0')::inet,
    COALESCE(NULLIF(current_setting('app.user_agent', true), ''), 'unknown')
  );
  RETURN NEW;
END
$func$;

-- Attach audit triggers to all user-data tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['users', 'diagrams', 'checkpoints', 'threads', 'replies', 'sync_log'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'trg_audit_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- 3. Data Integrity Constraints
-- Add CHECK constraints for data validation

-- diagrams: title length, tags array not too large
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagrams_title_len') THEN
    ALTER TABLE public.diagrams ADD CONSTRAINT diagrams_title_len CHECK (char_length(title) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagrams_tags_max') THEN
    ALTER TABLE public.diagrams ADD CONSTRAINT diagrams_tags_max CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 20);
  END IF;
END
$$;

-- checkpoints: title length, badge length
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkpoints_title_len') THEN
    ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_title_len CHECK (char_length(title) <= 200);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'checkpoints' AND column_name = 'badge')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkpoints_badge_len') THEN
    ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_badge_len CHECK (badge IS NULL OR char_length(badge) <= 100);
  END IF;
END
$$;

-- threads: text not empty, author not empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_text_not_empty') THEN
    ALTER TABLE public.threads ADD CONSTRAINT threads_text_not_empty CHECK (char_length(text) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_author_not_empty') THEN
    ALTER TABLE public.threads ADD CONSTRAINT threads_author_not_empty CHECK (char_length(author) > 0);
  END IF;
END
$$;

-- replies: text not empty, author not empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replies_text_not_empty') THEN
    ALTER TABLE public.replies ADD CONSTRAINT replies_text_not_empty CHECK (char_length(text) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replies_author_not_empty') THEN
    ALTER TABLE public.replies ADD CONSTRAINT replies_author_not_empty CHECK (char_length(author) > 0);
  END IF;
END
$$;

-- sync_log: actor not empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sync_log_actor_not_empty') THEN
    ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_actor_not_empty CHECK (char_length(actor) > 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------- 4. Soft Delete Support
-- Add deleted_at column for soft deletes (instead of hard deletes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagrams' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.diagrams ADD COLUMN deleted_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_diagrams_deleted_at ON public.diagrams (deleted_at) WHERE deleted_at IS NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'checkpoints' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.checkpoints ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'threads' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.threads ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'replies' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.replies ADD COLUMN deleted_at timestamptz;
  END IF;
END
$$;

-- Update RLS policies to exclude soft-deleted rows
DROP POLICY IF EXISTS diagrams_owner ON public.diagrams;
DROP POLICY IF EXISTS diagrams_shared_read ON public.diagrams;

CREATE POLICY diagrams_owner ON public.diagrams FOR ALL
  USING (owner_id = public.current_user_id() AND deleted_at IS NULL)
  WITH CHECK (owner_id = public.current_user_id() AND deleted_at IS NULL);

CREATE POLICY diagrams_shared_read ON public.diagrams FOR SELECT
  USING ((tags && ARRAY['public'] OR owner_id = public.current_user_id()) AND deleted_at IS NULL);

-- ---------------------------------------------------------------- 5. Partitioning Preparation for sync_log (large table)
-- sync_log is append-only and grows unbounded - prepare for partitioning by month
-- Note: Actual partitioning requires table rewrite, so we prepare the structure

-- Create partitioned version of sync_log (run during maintenance window)
-- This is a template - actual partitioning would be:
-- CREATE TABLE public.sync_log_partitioned (
--   LIKE public.sync_log INCLUDING ALL
-- ) PARTITION BY RANGE (created_at);
--
-- CREATE TABLE public.sync_log_2024_01 PARTITION OF public.sync_log_partitioned
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- ... etc for each month
--
-- Then swap during maintenance: 
-- ALTER TABLE public.sync_log RENAME TO sync_log_old;
-- ALTER TABLE public.sync_log_partitioned RENAME TO sync_log;
-- INSERT INTO public.sync_log SELECT * FROM sync_log_old;

-- For now, add a comment to track partitioning requirement
COMMENT ON TABLE public.sync_log IS 'Append-only log. Partition by created_at (monthly) when > 10M rows.';

-- ---------------------------------------------------------------- 6. Additional Indexes for Common Queries
-- diagrams: find by title prefix (for search)
DO $$
BEGIN
  IF to_regclass('public.idx_diagrams_title_prefix') IS NULL THEN
    CREATE INDEX idx_diagrams_title_prefix
      ON public.diagrams (title text_pattern_ops);
  END IF;
END
$$;

-- checkpoints: find active checkpoint for diagram
-- (active column is added in V5; skip if not present yet)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'checkpoints' AND column_name = 'active')
     AND to_regclass('public.idx_checkpoints_diagram_active') IS NULL THEN
    CREATE INDEX idx_checkpoints_diagram_active
      ON public.checkpoints (diagram_id) WHERE active = true;
  END IF;
END
$$;

-- threads: find unresolved for diagram
DO $$
BEGIN
  IF to_regclass('public.idx_threads_diagram_unresolved') IS NULL THEN
    CREATE INDEX idx_threads_diagram_unresolved
      ON public.threads (diagram_id) WHERE resolved = false;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 7. Statistics and Monitoring
-- Enable track_counts for pg_stat_user_tables (default on)
-- Add comments for monitoring

COMMENT ON INDEX public.idx_diagrams_owner_updated IS 'Owner feed queries';
COMMENT ON INDEX public.idx_checkpoints_diagram_created IS 'Document history queries';
COMMENT ON INDEX public.idx_threads_diagram IS 'Threads by document';
COMMENT ON INDEX public.idx_replies_thread IS 'Replies by thread';
COMMENT ON INDEX public.idx_sync_log_diagram_created IS 'Sync feed queries';
COMMENT ON INDEX public.idx_diagrams_tags_gin IS 'Tag containment queries';
COMMENT ON INDEX public.idx_diagrams_title_prefix IS 'Title prefix search';
DO $$
BEGIN
  IF to_regclass('public.idx_checkpoints_diagram_active') IS NOT NULL THEN
    COMMENT ON INDEX public.idx_checkpoints_diagram_active IS 'Active checkpoint lookup';
  END IF;
END
$$;
COMMENT ON INDEX public.idx_threads_diagram_unresolved IS 'Unresolved threads per document';

-- ---------------------------------------------------------------- 8. Function for Cleanup Jobs
-- Archive old sync_log entries (run via pg_cron or external scheduler)
CREATE OR REPLACE FUNCTION public.archive_old_sync_logs(older_than interval DEFAULT '1 year')
RETURNS integer
LANGUAGE plpgsql
AS $func$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.sync_log
  WHERE created_at < now() - older_than
  AND diagram_id IN (
    SELECT id FROM public.diagrams WHERE deleted_at IS NOT NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$func$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.archive_old_sync_logs(interval) TO archflux_app';
    EXECUTE 'GRANT INSERT, SELECT ON public.audit_log TO archflux_app';
  END IF;
END $$;

-- ---------------------------------------------------------------- 9. Performance: Set fillfactor for high-update tables
-- diagrams gets frequent updated_at updates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'diagrams' AND relkind = 'r') THEN
    -- fillfactor can only be set at CREATE TABLE, so this is informational
    -- For production, recreate table with: WITH (fillfactor = 80)
    NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------- 10. Advisory Lock Helper for Distributed Operations
CREATE OR REPLACE FUNCTION public.try_advisory_lock(lock_key bigint, timeout_ms integer DEFAULT 5000)
RETURNS boolean
LANGUAGE plpgsql
AS $func$
DECLARE
  acquired boolean;
  start_time timestamptz := clock_timestamp();
BEGIN
  LOOP
    SELECT pg_try_advisory_xact_lock(lock_key) INTO acquired;
    IF acquired THEN
      RETURN true;
    END IF;
    IF clock_timestamp() - start_time > timeout_ms * interval '1 ms' THEN
      RETURN false;
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END
$func$;