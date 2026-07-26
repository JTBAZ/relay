-- Digest delivery: patron timezone + idempotent run log.
ALTER TABLE "patron_profiles"
  ADD COLUMN IF NOT EXISTS "notification_digest_timezone" TEXT;

CREATE TYPE "NotificationDigestRunStatus" AS ENUM ('sent', 'skipped', 'failed');

CREATE TABLE "notification_digest_runs" (
    "id" TEXT NOT NULL,
    "patron_membership_id" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "NotificationDigestRunStatus" NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_digest_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_digest_runs_patron_membership_id_cadence_period_start_key"
  ON "notification_digest_runs"("patron_membership_id", "cadence", "period_start");

CREATE INDEX "notification_digest_runs_patron_membership_id_sent_at_idx"
  ON "notification_digest_runs"("patron_membership_id", "sent_at" DESC);

ALTER TABLE "notification_digest_runs"
  ADD CONSTRAINT "notification_digest_runs_patron_membership_id_fkey"
  FOREIGN KEY ("patron_membership_id") REFERENCES "tenant_memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
