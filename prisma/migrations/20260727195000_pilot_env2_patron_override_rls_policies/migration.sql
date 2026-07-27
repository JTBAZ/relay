-- PILOT-017 ENV-2 — fail-closed RLS policies for patron_follows,
-- patron_entitlement_snapshots, and post_overrides.
--
-- Uses existing auth_account_id() / relay.account_id (Tier 0.3).
-- Prisma DATABASE_URL continues to bypass RLS; these policies defend
-- PostgREST / non-bypass roles and are exercised via rls_fixture_tester.

-- Ensure fixture role exists (idempotent with tier1 migration).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_fixture_tester') THEN
    CREATE ROLE rls_fixture_tester NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO rls_fixture_tester;

-- --- patron_follows: patron owns rows via tenant_memberships.account_id ---
DROP POLICY IF EXISTS pilot_follows_select_own ON public.patron_follows;
DROP POLICY IF EXISTS pilot_follows_insert_own ON public.patron_follows;
DROP POLICY IF EXISTS pilot_follows_delete_own ON public.patron_follows;

CREATE POLICY pilot_follows_select_own ON public.patron_follows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = (SELECT auth_account_id())
    )
  );

CREATE POLICY pilot_follows_insert_own ON public.patron_follows
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = (SELECT auth_account_id())
    )
  );

CREATE POLICY pilot_follows_delete_own ON public.patron_follows
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = (SELECT auth_account_id())
    )
  );

-- --- patron_entitlement_snapshots: patron SELECT only; writes stay privileged ---
DROP POLICY IF EXISTS pilot_entitlement_snapshots_select_own ON public.patron_entitlement_snapshots;

CREATE POLICY pilot_entitlement_snapshots_select_own ON public.patron_entitlement_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.id = patron_user_id
        AND tm.account_id = (SELECT auth_account_id())
    )
  );

-- --- post_overrides: creator ALL scoped to primary_relay_creator_id ---
DROP POLICY IF EXISTS pilot_post_overrides_creator_all ON public.post_overrides;

CREATE POLICY pilot_post_overrides_creator_all ON public.post_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      WHERE a.id = (SELECT auth_account_id())
        AND a.primary_relay_creator_id IS NOT NULL
        AND a.primary_relay_creator_id = post_overrides.creator_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      WHERE a.id = (SELECT auth_account_id())
        AND a.primary_relay_creator_id IS NOT NULL
        AND a.primary_relay_creator_id = post_overrides.creator_id
    )
  );

GRANT SELECT, INSERT, DELETE ON public.patron_follows TO rls_fixture_tester;
GRANT SELECT ON public.patron_entitlement_snapshots TO rls_fixture_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_overrides TO rls_fixture_tester;
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
