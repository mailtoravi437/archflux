-- ArchFlux V4 — OAuth2 fields for users table.
-- Apply AFTER V3__production_hardening.sql on the same database:
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/migrations/V4__oauth_fields.sql

-- Add OAuth2 fields to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.users ADD COLUMN provider text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN provider_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.users ADD COLUMN avatar_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE public.users ADD COLUMN access_token text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_login_at timestamptz;
  END IF;
END $$;

-- Index for provider lookups
DO $$
BEGIN
  IF to_regclass('public.idx_users_provider') IS NULL THEN
    CREATE INDEX idx_users_provider ON public.users (provider);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_users_provider_id') IS NULL THEN
    CREATE INDEX idx_users_provider_id ON public.users (provider_id);
  END IF;
END $$;

-- Add provider enum check constraint (optional, for data integrity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'chk_users_provider'
  ) THEN
    ALTER TABLE public.users 
    ADD CONSTRAINT chk_users_provider 
    CHECK (provider IN ('github', 'google', 'email', 'sso', 'mock'));
  END IF;
END $$;