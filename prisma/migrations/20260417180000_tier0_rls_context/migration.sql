-- Tier 0.3: RLS context plumbing.
-- Defines auth_account_id() which reads the per-request config 'relay.account_id'.
-- Returns NULL when unset, so policies fail-closed for unauthenticated requests.

CREATE OR REPLACE FUNCTION public.auth_account_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('relay.account_id', true), '')
  $$;

GRANT EXECUTE ON FUNCTION public.auth_account_id() TO PUBLIC;

COMMENT ON FUNCTION public.auth_account_id() IS
  'Tier 0 RLS plumbing. Reads relay.account_id session config. Returns NULL when unset (fail-closed).';
