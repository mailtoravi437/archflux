-- V21 (R1-SEC-02): phone-number sign-in via Firebase Authentication.
-- Phone-only users have no email, so users.email becomes nullable; the new
-- users.phone_number (E.164, unique) identifies them. A CHECK keeps every row
-- reachable by at least one identifier. Existing rows all have an email and
-- are untouched. Re-runnable (guards on every step).

ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_phone_e164') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_phone_e164
      CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{6,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_identifier') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_identifier
      CHECK (email IS NOT NULL OR phone_number IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_provider') THEN
    ALTER TABLE public.users DROP CONSTRAINT chk_users_provider;
  END IF;
  ALTER TABLE public.users
    ADD CONSTRAINT chk_users_provider
    CHECK (provider IN ('github', 'google', 'email', 'sso', 'oidc', 'saml', 'mock', 'phone'));
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_number
  ON public.users (phone_number) WHERE phone_number IS NOT NULL;

-- Login-time provisioning for phone users: find-or-create by phone number,
-- refresh last_login_at, ensure a personal workspace + admin membership.
-- SECURITY DEFINER for the same reason as provision_user (V6): login runs
-- before any RequestUser exists, so RLS would deny the writes.
CREATE OR REPLACE FUNCTION public.provision_phone_user(
  p_phone text,
  p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := NULLIF(p_phone, '');
  v_name text := NULLIF(p_name, '');
  v_id uuid;
  v_ws uuid;
BEGIN
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'provision_phone_user: phone is required';
  END IF;
  IF v_name IS NULL THEN
    v_name := v_phone;
  END IF;
  SELECT id INTO v_id FROM public.users WHERE phone_number = v_phone;
  IF NOT FOUND THEN
    v_id := gen_random_uuid();
    INSERT INTO public.users(id, email, phone_number, name, role, provider, provider_id, last_login_at)
    VALUES (v_id, NULL, v_phone, v_name, 'member', 'phone', v_phone, now());
  ELSE
    UPDATE public.users SET last_login_at = now() WHERE id = v_id;
  END IF;
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
  -- Lost a race (same phone inserted concurrently): adopt the winner.
  SELECT id INTO v_id FROM public.users WHERE phone_number = v_phone;
  IF NOT FOUND THEN
    RAISE;
  END IF;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.provision_phone_user(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_phone_user(text, text) TO archflux_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_migrator') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_phone_user(text, text) TO archflux_migrator';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_phone_user(text, text) TO app_tester';
  END IF;
END
$$;
