BEGIN;
CREATE TABLE "patreon_change_work" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "creator_id" TEXT NOT NULL REFERENCES "tenants"("relay_creator_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "campaign_id" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL CHECK (resource_type IN ('post', 'member')),
  "resource_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "delivery_hash" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "completed_generation" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "first_pending_at" TIMESTAMP(3),
  "last_accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMP(3) NOT NULL,
  "lease_token" TEXT,
  "retry_not_before" TIMESTAMP(3),
  "lease_until" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  CONSTRAINT "patreon_change_work_generation" CHECK (generation > 0 AND completed_generation >= 0 AND completed_generation <= generation AND attempts >= 0),
  CONSTRAINT "patreon_change_work_lease" CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE UNIQUE INDEX "patreon_change_work_creator_id_campaign_id_resource_type_re_key" ON "patreon_change_work"("creator_id", "campaign_id", "resource_type", "resource_id");
CREATE INDEX "patreon_change_work_status_due_at_idx" ON "patreon_change_work"("status", "due_at");
CREATE INDEX "patreon_change_work_status_lease_until_idx" ON "patreon_change_work"("status", "lease_until");
CREATE INDEX "patreon_change_work_status_completed_at_idx" ON "patreon_change_work"("status", "completed_at");
ALTER TABLE "patreon_change_work" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "patreon_change_work" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "patreon_change_work" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "patreon_change_work" FROM authenticated; END IF;
END $$;
COMMIT;
