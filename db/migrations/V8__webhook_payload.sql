-- ArchFlux V8 — webhook payload retention for durable replay
-- (PRODUCTIZATION_SPEC §10: terminal failure with a replay mechanism).
-- V7 webhook_events carries no payload, so a failed event cannot be
-- re-processed after the request body is gone. This additive migration adds
-- a nullable raw-payload column; re-runnable (existence-guarded). MUST stay
-- byte-identical between db/migrations/ and
-- server/src/main/resources/db/migration/ (verify with diff).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'webhook_events' AND column_name = 'payload'
  ) THEN
    ALTER TABLE public.webhook_events ADD COLUMN payload text NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.webhook_events.payload IS 'Raw delivery body retained for async processing and failed-event replay (never logged).';
