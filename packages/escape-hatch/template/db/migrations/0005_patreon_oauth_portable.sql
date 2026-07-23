-- Forward migration: creator-owned Patreon OAuth link + encrypted refresh tokens (EH-040)
-- Path B (portable): apply after 0001 + 0003 + 0004_portable. Uses eh_private.current_user_id().
-- Path A: apply 0005_patreon_oauth_supabase.sql instead.
-- Client secret stays in env; only refresh tokens are stored encrypted.
-- `next build` does not require a live database.

BEGIN;

CREATE TABLE IF NOT EXISTS eh_patreon_identity_links (
  id                  TEXT PRIMARY KEY,
  site_id             TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id        UUID NOT NULL REFERENCES eh_users(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS eh_patreon_oauth_credentials (
  id                        TEXT PRIMARY KEY,
  site_id                   TEXT NOT NULL REFERENCES eh_sites(id) ON DELETE CASCADE,
  auth_user_id              UUID NOT NULL REFERENCES eh_users(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS eh_patreon_identity_links_select_own ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_select_own ON eh_patreon_identity_links
  FOR SELECT
  USING (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_patreon_identity_links_select_staff ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_select_staff ON eh_patreon_identity_links
  FOR SELECT
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_patreon_identity_links_write_own ON eh_patreon_identity_links;
CREATE POLICY eh_patreon_identity_links_write_own ON eh_patreon_identity_links
  FOR ALL
  USING (
    auth_user_id = eh_private.current_user_id()
    OR eh_private.is_site_staff(site_id)
  )
  WITH CHECK (
    auth_user_id = eh_private.current_user_id()
    OR eh_private.is_site_staff(site_id)
  );

DROP POLICY IF EXISTS eh_patreon_oauth_credentials_select_own ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_select_own ON eh_patreon_oauth_credentials
  FOR SELECT
  USING (auth_user_id = eh_private.current_user_id());

DROP POLICY IF EXISTS eh_patreon_oauth_credentials_select_staff ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_select_staff ON eh_patreon_oauth_credentials
  FOR SELECT
  USING (eh_private.is_site_staff(site_id));

DROP POLICY IF EXISTS eh_patreon_oauth_credentials_write_own ON eh_patreon_oauth_credentials;
CREATE POLICY eh_patreon_oauth_credentials_write_own ON eh_patreon_oauth_credentials
  FOR ALL
  USING (
    auth_user_id = eh_private.current_user_id()
    OR eh_private.is_site_staff(site_id)
  )
  WITH CHECK (
    auth_user_id = eh_private.current_user_id()
    OR eh_private.is_site_staff(site_id)
  );

COMMIT;
