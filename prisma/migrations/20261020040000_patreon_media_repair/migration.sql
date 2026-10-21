BEGIN;
CREATE TABLE "patreon_media_repairs" (
  "creator_id" TEXT NOT NULL REFERENCES "tenants"("relay_creator_id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('post', 'media', 'scan')),
  "resource_id" TEXT NOT NULL,
  "head" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "phase" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "due_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" TEXT,
  "lease_until" TIMESTAMP(3),
  "last_error" TEXT,
  "verified_at" TIMESTAMP(3),
  "collection" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("creator_id", "kind", "resource_id")
);
CREATE INDEX "patreon_media_repairs_due_at_lease_until_idx" ON "patreon_media_repairs"("due_at", "lease_until");
ALTER TABLE "patreon_media_repairs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "patreon_media_repairs" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "patreon_media_repairs" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "patreon_media_repairs" FROM authenticated; END IF;
END $$;
COMMIT;
