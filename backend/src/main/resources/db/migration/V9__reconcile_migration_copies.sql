-- ArchFlux V9 — reconcile the retired db/migrations/ copy (SERVICES_SPEC §4.3, SVC-G11).
-- Until 2026-10-24 tests applied an edited db/migrations/V3/V4 while Flyway
-- (prod) applied the classpath originals. V1..V8 stay byte-identical to what
-- deployed databases already recorded (checksums unchanged); the only edit
-- not already superseded by V6 (current_user_id NULLIF, audit SECURITY
-- DEFINER, provider allow-list) is carried forward here. Re-runnable.

-- Unset role GUC reads as 'member' (equivalent for the only caller,
-- current_user_has_role('admin'), but explicit instead of NULL).
CREATE OR REPLACE FUNCTION public.current_user_has_role(role text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'member') = role
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_audit_log_operation') THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT chk_audit_log_operation CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'));
  END IF;
END
$$;
