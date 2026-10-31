-- H3 (2026-10-31): the provider access token is no longer persisted at login (nothing reads it).
-- Wipe tokens stored by earlier logins. The column and provision_user() signature stay (V4/V6 are
-- immutable); callers now pass NULL.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE public.users SET access_token = NULL WHERE access_token IS NOT NULL;
  END IF;
END
$$;
