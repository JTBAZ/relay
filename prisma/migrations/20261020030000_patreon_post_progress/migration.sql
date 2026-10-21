ALTER TABLE sync_cursors ALTER COLUMN last_synced_at DROP NOT NULL;
ALTER TABLE sync_cursors
  ADD COLUMN post_progress jsonb,
  ADD COLUMN post_version integer NOT NULL DEFAULT 0,
  ADD COLUMN post_lease_token text,
  ADD COLUMN post_lease_until timestamp(3),
  ADD CONSTRAINT post_progress_version_nonnegative CHECK (post_version >= 0),
  ADD CONSTRAINT post_progress_lease_pair CHECK ((post_lease_token IS NULL) = (post_lease_until IS NULL));
CREATE TABLE patreon_post_scheduler (id text PRIMARY KEY, after_creator_id text);
ALTER TABLE patreon_post_scheduler ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE patreon_post_scheduler FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE patreon_post_scheduler FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE patreon_post_scheduler FROM authenticated; END IF;
END $$;
