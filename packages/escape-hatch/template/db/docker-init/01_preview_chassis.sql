-- Forward migration: preview chassis baseline (EH-020)
-- Self-contained (no psql \i). Apply when DATABASE_URL is set (EH-030/031).
-- `next build` does not require a live database.

BEGIN;

CREATE TABLE IF NOT EXISTS eh_sites (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS eh_schema_migrations (
  id            TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO eh_schema_migrations (id)
VALUES ('0001_preview_chassis')
ON CONFLICT (id) DO NOTHING;

COMMIT;
