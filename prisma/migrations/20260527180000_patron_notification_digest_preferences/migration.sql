-- Patron browse-window preference for batched creator update wrap-ups.
ALTER TABLE "patron_profiles"
  ADD COLUMN "notification_digest_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notification_digest_slot" TEXT;
