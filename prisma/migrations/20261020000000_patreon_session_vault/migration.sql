BEGIN;
CREATE TABLE "patreon_sessions" (
  "creator_id" TEXT NOT NULL PRIMARY KEY,
  "encrypted_session_id" TEXT,
  "stored_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "key_id" TEXT NOT NULL DEFAULT 'RELAY_TOKEN_ENCRYPTION_KEY',
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patreon_sessions_creator_id_fkey" FOREIGN KEY ("creator_id")
    REFERENCES "tenants"("relay_creator_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "patreon_sessions_material_pair" CHECK (("encrypted_session_id" IS NULL) = ("stored_at" IS NULL)),
  CONSTRAINT "patreon_sessions_rejected_empty" CHECK ("rejected_at" IS NULL OR "encrypted_session_id" IS NULL)
);
ALTER TABLE "patreon_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "patreon_sessions" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "patreon_sessions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "patreon_sessions" FROM authenticated;
  END IF;
END $$;
COMMIT;
