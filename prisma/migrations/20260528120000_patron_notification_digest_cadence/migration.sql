-- Digest cadence: weekly or monthly wrap-up schedule.
ALTER TABLE "patron_profiles"
  ADD COLUMN "notification_digest_cadence" TEXT NOT NULL DEFAULT 'weekly';
