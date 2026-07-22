-- Forward migration: creator-owned Supabase identity + RLS (EH-030)
-- Apply in the creator's Supabase SQL editor or `supabase db push` / `psql`.
-- Self-contained (no psql \i). Requires Supabase Auth (`auth.users`).
-- `next build` does not require a live database.
-- Portable Postgres without `auth.users` is EH-031.

BEGIN;

-- Private helpers (not exposed via PostgREST Data API)
CREATE SCHEMA IF NOT EXISTS eh_private;

-- Bind site to optional owner auth subject (bootstrap recovery)
ALTER TABLE eh_sites
  ADD COLUMN IF NOT EXISTS owner_auth_user_id UUID;

CREATE INDEX IF NOT EXISTS eh_sites_owner_auth_user_id_idx
  ON eh_sites(owner_auth_user_id);

-- Profiles linked to auth.users (durable site account)
CREATE TABLE IF NOT EXISTS eh_profiles (
  auth_user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email_hint    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Site membership: admin / operator / patron (authorization source of truth)
CREATE TABLE IF NOT EXISTS eh_site_memberships (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'patron')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS eh_site_memberships_site_id_idx
  ON eh_site_memberships(site_id);
CREATE INDEX IF NOT EXISTS eh_site_memberships_auth_user_id_idx
  ON eh_site_memberships(auth_user_id);

-- Entitlement snapshot (server-owned; never trust client tier_ids)
CREATE TABLE IF NOT EXISTS eh_entitlement_snapshots (
  id                  TEXT PRIMARY KEY,
  site_id             TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_ids            TEXT[] NOT NULL DEFAULT '{}',
  source              TEXT NOT NULL CHECK (
                        source IN ('patreon', 'billing', 'manual', 'bootstrap')
                      ),
  reason              TEXT,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_after         TIMESTAMPTZ,
  actor_auth_user_id  UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS eh_entitlement_snapshots_site_id_idx
  ON eh_entitlement_snapshots(site_id);
CREATE INDEX IF NOT EXISTS eh_entitlement_snapshots_auth_user_id_idx
  ON eh_entitlement_snapshots(auth_user_id);

-- SECURITY DEFINER helpers (private schema — avoid RLS recursion)
CREATE OR REPLACE FUNCTION eh_private.member_role(p_site_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.eh_site_memberships m
  WHERE m.site_id = p_site_id
    AND m.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION eh_private.is_site_staff(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eh_site_memberships m
    WHERE m.site_id = p_site_id
      AND m.auth_user_id = auth.uid()
      AND m.role IN ('admin', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION eh_private.is_site_member(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.eh_site_memberships m
    WHERE m.site_id = p_site_id
      AND m.auth_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION eh_private.member_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.is_site_staff(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.is_site_member(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eh_private.member_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION eh_private.is_site_staff(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION eh_private.is_site_member(TEXT) TO authenticated;

-- Fail-closed: enable RLS on all exposed tables
ALTER TABLE eh_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_media_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_site_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_schema_migrations ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners (defense in depth; service_role still bypasses)
ALTER TABLE eh_sites FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_media_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_site_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_entitlement_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_schema_migrations FORCE ROW LEVEL SECURITY;

-- eh_sites: staff read/write; authenticated members can read their sites
DROP POLICY IF EXISTS eh_sites_select_member ON eh_sites;
CREATE POLICY eh_sites_select_member ON eh_sites
  FOR SELECT TO authenticated
  USING (eh_private.is_site_member(id));

DROP POLICY IF EXISTS eh_sites_staff_all ON eh_sites;
CREATE POLICY eh_sites_staff_all ON eh_sites
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(id))
  WITH CHECK (eh_private.is_site_staff(id));

-- eh_tiers: members read catalog; staff write
DROP POLICY IF EXISTS eh_tiers_select_member ON eh_tiers;
CREATE POLICY eh_tiers_select_member ON eh_tiers
  FOR SELECT TO authenticated
  USING (eh_private.is_site_member(site_id));

DROP POLICY IF EXISTS eh_tiers_staff_all ON eh_tiers;
CREATE POLICY eh_tiers_staff_all ON eh_tiers
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_posts: public posts readable by anon; staff full; members read site posts
DROP POLICY IF EXISTS eh_posts_select_public ON eh_posts;
CREATE POLICY eh_posts_select_public ON eh_posts
  FOR SELECT TO anon, authenticated
  USING (access_level = 'public' AND published_at IS NOT NULL);

DROP POLICY IF EXISTS eh_posts_select_member ON eh_posts;
CREATE POLICY eh_posts_select_member ON eh_posts
  FOR SELECT TO authenticated
  USING (eh_private.is_site_member(site_id));

DROP POLICY IF EXISTS eh_posts_staff_all ON eh_posts;
CREATE POLICY eh_posts_staff_all ON eh_posts
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_media_objects: public metadata only for anon; staff full.
-- Premium byte delivery remains EH-033 (signed URLs). Metadata is not authorization.
DROP POLICY IF EXISTS eh_media_objects_select_public ON eh_media_objects;
CREATE POLICY eh_media_objects_select_public ON eh_media_objects
  FOR SELECT TO anon, authenticated
  USING (access_level = 'public');

DROP POLICY IF EXISTS eh_media_objects_select_member ON eh_media_objects;
CREATE POLICY eh_media_objects_select_member ON eh_media_objects
  FOR SELECT TO authenticated
  USING (eh_private.is_site_member(site_id));

DROP POLICY IF EXISTS eh_media_objects_staff_all ON eh_media_objects;
CREATE POLICY eh_media_objects_staff_all ON eh_media_objects
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_profiles: self read/update; no cross-user reads
DROP POLICY IF EXISTS eh_profiles_select_self ON eh_profiles;
CREATE POLICY eh_profiles_select_self ON eh_profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_profiles_update_self ON eh_profiles;
CREATE POLICY eh_profiles_update_self ON eh_profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_profiles_insert_self ON eh_profiles;
CREATE POLICY eh_profiles_insert_self ON eh_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- eh_site_memberships: own row; staff can manage site roster
DROP POLICY IF EXISTS eh_site_memberships_select_own ON eh_site_memberships;
CREATE POLICY eh_site_memberships_select_own ON eh_site_memberships
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_site_memberships_select_staff ON eh_site_memberships;
CREATE POLICY eh_site_memberships_select_staff ON eh_site_memberships
  FOR SELECT TO authenticated
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_site_memberships_staff_write ON eh_site_memberships;
CREATE POLICY eh_site_memberships_staff_write ON eh_site_memberships
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_entitlement_snapshots: patrons read only their own; staff manage
DROP POLICY IF EXISTS eh_entitlement_snapshots_select_own ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_select_own ON eh_entitlement_snapshots
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_entitlement_snapshots_select_staff ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_select_staff ON eh_entitlement_snapshots
  FOR SELECT TO authenticated
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_entitlement_snapshots_staff_write ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_staff_write ON eh_entitlement_snapshots
  FOR ALL TO authenticated
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_schema_migrations: staff of any site may read applied migration ids (no writes via API)
DROP POLICY IF EXISTS eh_schema_migrations_select_authenticated ON eh_schema_migrations;
CREATE POLICY eh_schema_migrations_select_authenticated ON eh_schema_migrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.eh_site_memberships m
      WHERE m.auth_user_id = auth.uid()
        AND m.role IN ('admin', 'operator')
    )
  );

INSERT INTO eh_schema_migrations (id)
VALUES ('0002_identity_rls')
ON CONFLICT (id) DO NOTHING;

COMMIT;
