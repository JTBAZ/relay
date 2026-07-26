-- Forward migration: portable identity + RLS without Supabase Auth (EH-031 / Path B)
-- Apply on creator-owned plain Postgres (Docker / self-hosted).
-- Does NOT require auth.users or auth.uid().
-- Path A (Supabase): apply 0001 + 0002 instead. Do not mix 0002 and 0003 on one DB.
-- `next build` does not require a live database.
--
-- Auth choice: app-managed users with scrypt password hashes (Node crypto) +
-- opaque session tokens stored as SHA-256 hashes. Magic-link is Path A only.

BEGIN;

CREATE SCHEMA IF NOT EXISTS eh_private;

-- App-managed users (no auth.users dependency)
CREATE TABLE IF NOT EXISTS eh_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT eh_users_email_lower_chk CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS eh_users_email_uidx ON eh_users(email);

-- Opaque session tokens (store hash only; raw token lives in httpOnly cookie)
CREATE TABLE IF NOT EXISTS eh_sessions (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES eh_users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS eh_sessions_user_id_idx ON eh_sessions(user_id);
CREATE INDEX IF NOT EXISTS eh_sessions_expires_at_idx ON eh_sessions(expires_at);

-- Bind site to optional owner (portable user id)
ALTER TABLE eh_sites
  ADD COLUMN IF NOT EXISTS owner_auth_user_id UUID;

CREATE INDEX IF NOT EXISTS eh_sites_owner_auth_user_id_idx
  ON eh_sites(owner_auth_user_id);

-- Profiles linked to eh_users (same shape as EH-030; FK differs)
CREATE TABLE IF NOT EXISTS eh_profiles (
  auth_user_id  UUID PRIMARY KEY REFERENCES eh_users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email_hint    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Site membership: admin / operator / patron
CREATE TABLE IF NOT EXISTS eh_site_memberships (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id  UUID NOT NULL REFERENCES eh_users(id) ON DELETE CASCADE,
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
  auth_user_id        UUID NOT NULL REFERENCES eh_users(id) ON DELETE CASCADE,
  tier_ids            TEXT[] NOT NULL DEFAULT '{}',
  source              TEXT NOT NULL CHECK (
                        source IN ('patreon', 'billing', 'manual', 'bootstrap')
                      ),
  reason              TEXT,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_after         TIMESTAMPTZ,
  actor_auth_user_id  UUID REFERENCES eh_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS eh_entitlement_snapshots_site_id_idx
  ON eh_entitlement_snapshots(site_id);
CREATE INDEX IF NOT EXISTS eh_entitlement_snapshots_auth_user_id_idx
  ON eh_entitlement_snapshots(auth_user_id);

-- Current app user from server session (SET LOCAL eh.user_id = '<uuid>')
CREATE OR REPLACE FUNCTION eh_private.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('eh.user_id', true), '')::uuid;
$$;

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
    AND m.auth_user_id = eh_private.current_user_id()
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
      AND m.auth_user_id = eh_private.current_user_id()
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
      AND m.auth_user_id = eh_private.current_user_id()
  );
$$;

REVOKE ALL ON FUNCTION eh_private.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.member_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.is_site_staff(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION eh_private.is_site_member(TEXT) FROM PUBLIC;

DO $$
BEGIN
  CREATE ROLE eh_app NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO eh_app;
GRANT USAGE ON SCHEMA eh_private TO eh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eh_app;
GRANT EXECUTE ON FUNCTION eh_private.current_user_id() TO eh_app;
GRANT EXECUTE ON FUNCTION eh_private.member_role(TEXT) TO eh_app;
GRANT EXECUTE ON FUNCTION eh_private.is_site_staff(TEXT) TO eh_app;
GRANT EXECUTE ON FUNCTION eh_private.is_site_member(TEXT) TO eh_app;

-- Fail-closed: enable RLS on all exposed tables
ALTER TABLE eh_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_media_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_site_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_schema_migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE eh_sites FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_media_objects FORCE ROW LEVEL SECURITY;
-- eh_users / eh_sessions: ENABLE RLS but do not FORCE — the server
-- connection owner (trusted like a service role) may login/bootstrap.
-- When SET ROLE eh_app, RLS still applies via policies above.
ALTER TABLE eh_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_site_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_entitlement_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_schema_migrations FORCE ROW LEVEL SECURITY;

-- eh_sites
DROP POLICY IF EXISTS eh_sites_select_member ON eh_sites;
CREATE POLICY eh_sites_select_member ON eh_sites
  FOR SELECT TO eh_app
  USING (eh_private.is_site_member(id));

DROP POLICY IF EXISTS eh_sites_staff_all ON eh_sites;
CREATE POLICY eh_sites_staff_all ON eh_sites
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(id))
  WITH CHECK (eh_private.is_site_staff(id));

-- eh_tiers
DROP POLICY IF EXISTS eh_tiers_select_member ON eh_tiers;
CREATE POLICY eh_tiers_select_member ON eh_tiers
  FOR SELECT TO eh_app
  USING (eh_private.is_site_member(site_id));

DROP POLICY IF EXISTS eh_tiers_staff_all ON eh_tiers;
CREATE POLICY eh_tiers_staff_all ON eh_tiers
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_posts: fail-closed until EH-032 — public published only for non-staff
DROP POLICY IF EXISTS eh_posts_select_public ON eh_posts;
CREATE POLICY eh_posts_select_public ON eh_posts
  FOR SELECT TO eh_app
  USING (access_level = 'public' AND published_at IS NOT NULL);

DROP POLICY IF EXISTS eh_posts_select_member ON eh_posts;
CREATE POLICY eh_posts_select_member ON eh_posts
  FOR SELECT TO eh_app
  USING (
    eh_private.is_site_staff(site_id)
    OR (access_level = 'public' AND published_at IS NOT NULL)
  );

DROP POLICY IF EXISTS eh_posts_staff_all ON eh_posts;
CREATE POLICY eh_posts_staff_all ON eh_posts
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_media_objects: public metadata only for non-staff; staff full
DROP POLICY IF EXISTS eh_media_objects_select_public ON eh_media_objects;
CREATE POLICY eh_media_objects_select_public ON eh_media_objects
  FOR SELECT TO eh_app
  USING (access_level = 'public');

DROP POLICY IF EXISTS eh_media_objects_select_member ON eh_media_objects;
CREATE POLICY eh_media_objects_select_member ON eh_media_objects
  FOR SELECT TO eh_app
  USING (
    eh_private.is_site_staff(site_id)
    OR access_level = 'public'
  );

DROP POLICY IF EXISTS eh_media_objects_staff_all ON eh_media_objects;
CREATE POLICY eh_media_objects_staff_all ON eh_media_objects
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_users: self read only (password_hash readable by self; never expose to browser)
DROP POLICY IF EXISTS eh_users_select_self ON eh_users;
CREATE POLICY eh_users_select_self ON eh_users
  FOR SELECT TO eh_app
  USING (id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_users_update_self ON eh_users;
CREATE POLICY eh_users_update_self ON eh_users
  FOR UPDATE TO eh_app
  USING (id = eh_private.current_user_id())
  WITH CHECK (id = eh_private.current_user_id());

-- eh_sessions: own sessions only
DROP POLICY IF EXISTS eh_sessions_select_own ON eh_sessions;
CREATE POLICY eh_sessions_select_own ON eh_sessions
  FOR SELECT TO eh_app
  USING (user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_sessions_delete_own ON eh_sessions;
CREATE POLICY eh_sessions_delete_own ON eh_sessions
  FOR DELETE TO eh_app
  USING (user_id = eh_private.current_user_id());

-- eh_profiles
DROP POLICY IF EXISTS eh_profiles_select_self ON eh_profiles;
CREATE POLICY eh_profiles_select_self ON eh_profiles
  FOR SELECT TO eh_app
  USING (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_profiles_update_self ON eh_profiles;
CREATE POLICY eh_profiles_update_self ON eh_profiles
  FOR UPDATE TO eh_app
  USING (auth_user_id = eh_private.current_user_id())
  WITH CHECK (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_profiles_insert_self ON eh_profiles;
CREATE POLICY eh_profiles_insert_self ON eh_profiles
  FOR INSERT TO eh_app
  WITH CHECK (auth_user_id = eh_private.current_user_id());

-- eh_site_memberships
DROP POLICY IF EXISTS eh_site_memberships_select_own ON eh_site_memberships;
CREATE POLICY eh_site_memberships_select_own ON eh_site_memberships
  FOR SELECT TO eh_app
  USING (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_site_memberships_select_staff ON eh_site_memberships;
CREATE POLICY eh_site_memberships_select_staff ON eh_site_memberships
  FOR SELECT TO eh_app
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_site_memberships_staff_write ON eh_site_memberships;
CREATE POLICY eh_site_memberships_staff_write ON eh_site_memberships
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_entitlement_snapshots
DROP POLICY IF EXISTS eh_entitlement_snapshots_select_own ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_select_own ON eh_entitlement_snapshots
  FOR SELECT TO eh_app
  USING (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_entitlement_snapshots_select_staff ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_select_staff ON eh_entitlement_snapshots
  FOR SELECT TO eh_app
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_entitlement_snapshots_staff_write ON eh_entitlement_snapshots;
CREATE POLICY eh_entitlement_snapshots_staff_write ON eh_entitlement_snapshots
  FOR ALL TO eh_app
  USING (eh_private.is_site_staff(site_id))
  WITH CHECK (eh_private.is_site_staff(site_id));

-- eh_schema_migrations: staff of any site may read
DROP POLICY IF EXISTS eh_schema_migrations_select_authenticated ON eh_schema_migrations;
CREATE POLICY eh_schema_migrations_select_authenticated ON eh_schema_migrations
  FOR SELECT TO eh_app
  USING (
    EXISTS (
      SELECT 1 FROM public.eh_site_memberships m
      WHERE m.auth_user_id = eh_private.current_user_id()
        AND m.role IN ('admin', 'operator')
    )
  );

INSERT INTO eh_schema_migrations (id)
VALUES ('0003_portable_identity')
ON CONFLICT (id) DO NOTHING;

COMMIT;
