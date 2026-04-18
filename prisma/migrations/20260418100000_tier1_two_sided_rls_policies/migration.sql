-- Tier 1.2 — Two-sided RLS (creator / supporter / public) for posts + comments.
--
-- Part A classification (source of truth for first wave):
-- | Table               | Pattern |
-- |---------------------|---------|
-- | posts               | Creator ALL + SELECT via tier1_account_can_read_post() |
-- | relay_comments      | SELECT/INSERT/UPDATE/DELETE; author = TenantMembership row owned by auth account |
-- | tenant_memberships  | SELECT own rows only (fail-closed + fixture tests) |
--
-- Other tenant-scoped tables already have RLS enabled (20260415000000) with no permissive policies;
-- Prisma continues to bypass RLS as superuser. Incremental policy rollout can follow this pattern.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS required_tier_id text;

COMMENT ON COLUMN public.posts.is_public IS 'Tier 1 RLS: visible without tier gate when true.';
COMMENT ON COLUMN public.posts.required_tier_id IS 'Tier 1 RLS: patron must have this id in tenant_memberships.tier_ids when not public.';

-- Stable helper: SECURITY DEFINER reads accounts / tenant_memberships without RLS recursion issues.
CREATE OR REPLACE FUNCTION public.tier1_account_can_read_post(
  p_creator_id text,
  p_is_public boolean,
  p_required_tier_id text
) RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  aid text;
BEGIN
  aid := auth_account_id();
  IF aid IS NULL THEN
    RETURN COALESCE(p_is_public, false);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM accounts a
    WHERE a.id = aid
      AND a.primary_relay_creator_id IS NOT NULL
      AND a.primary_relay_creator_id = p_creator_id
  ) THEN
    RETURN true;
  END IF;
  IF COALESCE(p_is_public, false) THEN
    RETURN true;
  END IF;
  IF p_required_tier_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.account_id = aid
      AND t.relay_creator_id = p_creator_id
      AND p_required_tier_id = ANY (m.tier_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tier1_account_can_read_post(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tier1_account_can_read_post(text, boolean, text) TO PUBLIC;

COMMENT ON FUNCTION public.tier1_account_can_read_post(text, boolean, text) IS
  'Tier 1.2 RLS helper. Reads relay.account_id via auth_account_id() internally. SECURITY DEFINER.';

-- --- accounts (own row — required so creator policies’ EXISTS (accounts …) works for non-superusers) ---
DROP POLICY IF EXISTS tier1_accounts_select_self ON public.accounts;

CREATE POLICY tier1_accounts_select_self ON public.accounts
  FOR SELECT
  USING (id = auth_account_id());

-- --- posts ---
DROP POLICY IF EXISTS tier1_posts_creator_all ON public.posts;
DROP POLICY IF EXISTS tier1_posts_select_scope ON public.posts;

CREATE POLICY tier1_posts_creator_all ON public.posts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM accounts a
      WHERE a.id = auth_account_id()
        AND a.primary_relay_creator_id = posts.creator_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM accounts a
      WHERE a.id = auth_account_id()
        AND a.primary_relay_creator_id = posts.creator_id
    )
  );

CREATE POLICY tier1_posts_select_scope ON public.posts
  FOR SELECT
  USING (tier1_account_can_read_post(creator_id, is_public, required_tier_id));

-- --- tenant_memberships (own rows only; fail-closed for anon) ---
DROP POLICY IF EXISTS tier1_membership_select_own ON public.tenant_memberships;

CREATE POLICY tier1_membership_select_own ON public.tenant_memberships
  FOR SELECT
  USING (account_id = auth_account_id());

-- --- relay_comments ---
DROP POLICY IF EXISTS tier1_comments_select ON public.relay_comments;
DROP POLICY IF EXISTS tier1_comments_insert ON public.relay_comments;
DROP POLICY IF EXISTS tier1_comments_update ON public.relay_comments;
DROP POLICY IF EXISTS tier1_comments_delete ON public.relay_comments;

CREATE POLICY tier1_comments_select ON public.relay_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND tier1_account_can_read_post(p.creator_id, p.is_public, p.required_tier_id)
    )
  );

CREATE POLICY tier1_comments_insert ON public.relay_comments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = auth_account_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_id
        AND tier1_account_can_read_post(p.creator_id, p.is_public, p.required_tier_id)
    )
  );

CREATE POLICY tier1_comments_update ON public.relay_comments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = auth_account_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = auth_account_id()
    )
  );

CREATE POLICY tier1_comments_delete ON public.relay_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = auth_account_id()
    )
  );

-- Role used by Vitest to exercise RLS (superuser connections bypass RLS unless role is switched).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_fixture_tester') THEN
    CREATE ROLE rls_fixture_tester NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO rls_fixture_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO rls_fixture_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relay_comments TO rls_fixture_tester;
GRANT SELECT ON public.tenant_memberships TO rls_fixture_tester;
GRANT SELECT ON public.accounts TO rls_fixture_tester;

DO $$
DECLARE
  r name;
BEGIN
  SELECT current_user INTO r;
  EXECUTE format('GRANT rls_fixture_tester TO %I', r);
END
$$;
