-- Escape Hatch generated kit — identity + RLS schema (EH-030)
-- Portable SQL for creator-owned Supabase Auth/Postgres.
-- Not applied by `next build`. Apply via dashboard, `supabase db`, or psql.
-- Requires `auth.users` (Supabase). Portable Postgres without Auth is EH-031.
-- Service role bypasses RLS; never expose service role to the browser.

-- Private helpers (not exposed via PostgREST Data API)
CREATE SCHEMA IF NOT EXISTS eh_private;

CREATE TABLE IF NOT EXISTS eh_sites (
  id                  TEXT PRIMARY KEY,
  handle              TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  owner_auth_user_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eh_sites_owner_auth_user_id_idx
  ON eh_sites(owner_auth_user_id);

CREATE TABLE IF NOT EXISTS eh_tiers (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  rank          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eh_tiers_site_id_idx ON eh_tiers(site_id);

CREATE TABLE IF NOT EXISTS eh_posts (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  published_at    TIMESTAMPTZ,
  access_level    TEXT NOT NULL CHECK (access_level IN ('public', 'member_only', 'tier_gated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, slug)
);

CREATE INDEX IF NOT EXISTS eh_posts_site_id_idx ON eh_posts(site_id);

CREATE TABLE IF NOT EXISTS eh_media_objects (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  post_id         TEXT REFERENCES eh_posts(id) ON DELETE SET NULL,
  object_key      TEXT NOT NULL,
  content_mime    TEXT,
  access_level    TEXT NOT NULL CHECK (access_level IN ('public', 'member_only', 'tier_gated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eh_media_objects_site_id_idx ON eh_media_objects(site_id);
CREATE UNIQUE INDEX IF NOT EXISTS eh_media_objects_site_key_uidx
  ON eh_media_objects(site_id, object_key);

CREATE TABLE IF NOT EXISTS eh_profiles (
  auth_user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email_hint    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS eh_schema_migrations (
  id            TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policy mirror (apply via migrations/0002_identity_rls.sql after 0001).
-- Fail-closed until EH-032: non-staff SELECT is public published posts / public media only.
-- Staff (admin/operator) via eh_private.is_site_staff; never blanket is_site_member on premium rows.

-- eh_posts_select_public:
--   FOR SELECT TO anon, authenticated
--   USING (access_level = 'public' AND published_at IS NOT NULL)
-- eh_posts_select_member:
--   FOR SELECT TO authenticated
--   USING (eh_private.is_site_staff(site_id)
--          OR (access_level = 'public' AND published_at IS NOT NULL))
-- eh_posts_staff_all:
--   FOR ALL TO authenticated USING/WITH CHECK (eh_private.is_site_staff(site_id))
-- eh_media_objects_select_public:
--   FOR SELECT TO anon, authenticated USING (access_level = 'public')
-- eh_media_objects_select_member:
--   FOR SELECT TO authenticated
--   USING (eh_private.is_site_staff(site_id) OR access_level = 'public')
-- eh_media_objects_staff_all:
--   FOR ALL TO authenticated USING/WITH CHECK (eh_private.is_site_staff(site_id))
