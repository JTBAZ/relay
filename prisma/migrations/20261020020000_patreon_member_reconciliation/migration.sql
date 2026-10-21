BEGIN;
CREATE SEQUENCE "patreon_member_observation_seq" AS BIGINT;
ALTER TABLE "tenant_memberships" ADD COLUMN "patreon_observation" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "creator_membership_events" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "creator_membership_events_dedupe_key_key" ON "creator_membership_events"("dedupe_key");
DROP INDEX IF EXISTS "creator_membership_events_creator_id_patreon_member_id_event_type_occurred_at_key";
DROP INDEX IF EXISTS "creator_membership_events_creator_id_patreon_member_id_even_key";
CREATE UNIQUE INDEX "creator_membership_events_legacy_event_key" ON "creator_membership_events"("creator_id", "patreon_member_id", "event_type", "occurred_at") WHERE "dedupe_key" IS NULL;
CREATE TABLE "patreon_member_states" (
  "creator_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "seen_scan_id" TEXT,
  "state" JSONB NOT NULL,
  PRIMARY KEY ("creator_id", "campaign_id", "member_id")
);
CREATE INDEX "patreon_member_states_creator_id_campaign_id_seen_scan_id_idx" ON "patreon_member_states"("creator_id", "campaign_id", "seen_scan_id");
CREATE INDEX "patreon_member_states_creator_user_idx" ON "patreon_member_states"("creator_id", ("state"->>'userId'));
CREATE TABLE "patreon_roster_states" (
  "creator_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("creator_id", "campaign_id")
);
CREATE TABLE "patreon_identity_fences" (
  "identity_hash" TEXT PRIMARY KEY,
  "observation" BIGINT NOT NULL
);
ALTER TABLE "patreon_identity_fences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patreon_member_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patreon_roster_states" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "patreon_member_states", "patreon_roster_states", "patreon_identity_fences" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "patreon_member_observation_seq" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "patreon_member_states", "patreon_roster_states", "patreon_identity_fences" FROM anon;
    REVOKE ALL ON SEQUENCE "patreon_member_observation_seq" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "patreon_member_states", "patreon_roster_states", "patreon_identity_fences" FROM authenticated;
    REVOKE ALL ON SEQUENCE "patreon_member_observation_seq" FROM authenticated;
  END IF;
END $$;
COMMIT;
