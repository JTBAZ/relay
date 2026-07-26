-- Forward migration: creator-owned Patreon OAuth link + encrypted refresh tokens (EH-040)
-- Path A (Supabase): apply after 0001 + 0002 + 0004_supabase. Uses auth.uid().
-- Path B: apply 0005_patreon_oauth_portable.sql instead.
-- Client secret stays in env (PATREON_CLIENT_SECRET); only refresh tokens are stored encrypted.
-- `next build` does not require a live database.

BEGIN;

-- Identity link: site account ↔ Patreon user (no secrets)
CREATE TABLE IF NOT EXISTS eh_patreon_identity_links (
  id                  TEXT PRIMARY KEY,
  site_id             TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patreon_user_id     TEXT NOT NULL,
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_validated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, auth_user_id),
  UNIQUE (site_id, patreon_user_id)
);

CREATE INDEX IF NOT EXISTS eh_patreon_identity_links_site_id_idx
  ON eh_patreon_identity_links(site_id);
CREATE INDEX IF NOT EXISTS eh_patreon_identity_links_auth_user_id_idx
  ON eh_patreon_identity_links(auth_user_id);

-- Encrypted refresh tokens at rest (ciphertext only; key is ESCAPE_HATCH_PATREON_TOKEN_KEY)
CREATE TABLE IF NOT EXISTS eh_patreon_oauth_credentials (
  id                        TEXT PRIMARY KEY,
  site_id                   TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patreon_user_id           TEXT NOT NULL,
  encrypted_refresh_token   TEXT NOT NULL,
  access_token_expires_at   TIMESTAMPTZ,
  scopes                    TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS eh_patreon_oauth_credentials_site_id_idx
  ON eh_patreon_oauth_credentials(site_id);
CREATE INDEX IF NOT EXISTS eh_patreon_oauth_credentials_auth_user_id_idx
  ON eh_patreon_oauth_credentials(auth_user_id);

ALTER TABLE eh_patreon_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_patreon_identity_links FORCE ROW LEVEL SECURITY;
ALTER TABLE eh_patreon_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh_patreon_oauth_credentials FORCE ROW LEVEL SECURITY;

-- Links: owner may SELECT own; staff SELECT site; no public
DROP POLICY IF EXISTS eh_patreon_identity_links_select_own ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_select_own ON eh_patreon_identity_links
  FOR SELECT
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_patreon_identity_links_select_staff ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_select_staff ON eh_patreon_identity_links
  FOR SELECT
  USING (eh_private.is_site_staff(site_id));

-- Link writes: own row only (server upserts after OAuth); staff manage
DROP POLICY IF EXISTS eh_patreon_identity_links_write_own ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_write_own ON eh_patreon_identity_links
  FOR ALL
  USING (auth_user_id = auth.uid() OR eh_private.is_site_staff(site_id))
  WITH CHECK (auth_user_id = auth.uid() OR eh_private.is_site_staff(site_id));

-- Credentials: NEVER public SELECT of tokens.
-- Owner may SELECT own ciphertext (server decrypt only); staff SELECT site; no anon.
DROP POLICY IF EXISTS eh_patreon_oauth_credentials_select_own ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_select_own ON eh_patreon_oauth_credentials
  FOR SELECT
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS eh_patreon_oauth_credentials_select_staff ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_select_staff ON eh_patreon_oauth_credentials
  FOR SELECT
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_patreon_oauth_credentials_write_own ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_write_own ON eh_patreon_oauth_credentials
  FOR ALL
  USING (auth_user_id = auth.uid() OR eh_private.is_site_staff(site_id))
  WITH CHECK (auth_user_id = auth.uid() OR eh_private.is_site_staff(site_id));

COMMIT;
