-- Forward migration: entitlement evaluator helpers + entitled SELECT (EH-032)
-- Path A (Supabase): apply after 0001 + 0002. Uses auth.uid() — do NOT apply on Path B.
-- Path B: apply 0004_entitlement_evaluator_portable.sql instead.
-- Complements the TypeScript evaluator; does not authorize private media bytes (EH-033).
-- `next build` does not require a live database.

BEGIN;

-- Required tier gates on content rows (empty = member_only semantics for tier_gated edge)
ALTER TABLE eh_posts
  ADD COLUMN IF NOT EXISTS required_tier_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE eh_media_objects
  ADD COLUMN IF NOT EXISTS required_tier_ids TEXT[] NOT NULL DEFAULT '{}';

-- Explicit expiry / revoke on entitlement snapshots (freshness already has stale_after)
ALTER TABLE eh_entitlement_snapshots
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE eh_entitlement_snapshots
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Append-only grant audit (no secrets; actor is auth user id only)
CREATE TABLE IF NOT EXISTS eh_entitlement_grant_audit (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (
                    source IN ('patreon', 'billing', 'manual', 'bootstrap', 'staff')
                  ),
  action          TEXT NOT NULL CHECK (
                    action IN ('grant', 'refresh', 'expire', 'revoke', 'merge')
                  ),
  tier_ids        TEXT[] NOT NULL DEFAULT '{}',
  reason          TEXT,
  actor_auth_user_id UUID REFERENCES auth.users(id),
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eh_entitlement_grant_audit_site_id_idx
  ON eh_entitlement_grant_audit(site_id);
CREATE INDEX IF NOT EXISTS eh_entitlement_grant_audit_auth_user_id_idx
  ON eh_entitlement_grant_audit(auth_user_id);

ALTER TABLE eh_entitlement_grant_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_entitlement_grant_audit FORCE ROW LEVEL SECURITY;

-- Fresh non-revoked entitlement tier ids for current auth.uid() (fail-closed)
CREATE OR REPLACE FUNCTION eh_private.fresh_entitlement_tiers(p_site_id TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT e.tier_ids
      FROM public.eh_entitlement_snapshots e
      WHERE e.site_id = p_site_id
        AND e.auth_user_id = auth.uid()
        AND e.revoked_at IS NULL
        AND (e.expires_at IS NULL OR e.expires_at > NOW())
        AND (e.stale_after IS NULL OR e.stale_after > NOW())
      LIMIT 1
    ),
    '{}'::TEXT[]
  );
$$;

-- Entitled to member_only / tier_gated row metadata (not bytes)
CREATE OR REPLACE FUNCTION eh_private.entitled_for_access(
  p_site_id TEXT,
  p_access_level TEXT,
  p_required_tier_ids TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN eh_private.is_site_staff(p_site_id) THEN TRUE
    WHEN p_access_level = 'public' THEN TRUE
    WHEN p_access_level = 'member_only' THEN
      COALESCE(cardinality(eh_private.fresh_entitlement_tiers(p_site_id)), 0) > 0
    WHEN p_access_level = 'tier_gated' THEN
      CASE
        WHEN COALESCE(cardinality(p_required_tier_ids), 0) = 0 THEN
          COALESCE(cardinality(eh_private.fresh_entitlement_tiers(p_site_id)), 0) > 0
        ELSE
          eh_private.fresh_entitlement_tiers(p_site_id) && p_required_tier_ids
      END
    ELSE FALSE
  END;
$$;

REVOKE ALL ON FUNCTION eh_private.fresh_entitlement_tiers(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.entitled_for_access(TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eh_private.fresh_entitlement_tiers(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION eh_private.entitled_for_access(TEXT, TEXT, TEXT[]) TO authenticated;

-- Replace fail-closed member SELECT with entitlement-aware SELECT
DROP POLICY IF EXISTS eh_posts_select_member ON eh_posts;
CREATE POLICY eh_posts_select_member ON eh_posts
  FOR SELECT TO authenticated
  USING (
    eh_private.is_site_staff(site_id)
    OR (
      published_at IS NOT NULL
      AND eh_private.entitled_for_access(site_id, access_level, required_tier_ids)
    )
  );

DROP POLICY IF EXISTS eh_media_objects_select_member ON eh_media_objects;
CREATE POLICY eh_media_objects_select_member ON eh_media_objects
  FOR SELECT TO authenticated
  USING (
    eh_private.is_site_staff(site_id)
    OR eh_private.entitled_for_access(site_id, access_level, required_tier_ids)
  );

-- Audit: patrons read own; staff read site
DROP POLICY IF EXISTS eh_entitlement_grant_audit_select_own ON eh_entitlement_grant_audit;
CREATE POLICY eh_entitlement_grant_audit_select_own ON eh_entitlement_grant_audit
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_entitlement_grant_audit_select_staff ON eh_entitlement_grant_audit;
CREATE POLICY eh_entitlement_grant_audit_select_staff ON eh_entitlement_grant_audit
  FOR SELECT TO authenticated
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_entitlement_grant_audit_staff_write ON eh_entitlement_grant_audit;
CREATE POLICY eh_entitlement_grant_audit_staff_write ON eh_entitlement_grant_audit
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

INSERT INTO eh_schema_migrations (id)
VALUES ('0004_entitlement_evaluator_supabase')
ON CONFLICT (id) DO NOTHING;

COMMIT;
