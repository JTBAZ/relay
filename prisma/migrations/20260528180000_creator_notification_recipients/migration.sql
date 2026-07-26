-- Option B: explicit creator recipient lane on notifications (alongside patron membership lane).

-- New creator-facing notification kinds.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'post_commented';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'post_favorited';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'post_collected';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'new_subscriber';

-- Patron lane becomes nullable; add creator account lane.
ALTER TABLE "notifications" ALTER COLUMN "recipient_membership_id" DROP NOT NULL;

ALTER TABLE "notifications"
ADD COLUMN "recipient_creator_account_id" TEXT;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_recipient_creator_account_id_fkey"
FOREIGN KEY ("recipient_creator_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one recipient lane per row.
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_exactly_one_recipient_chk"
CHECK (
  (
    "recipient_membership_id" IS NOT NULL
    AND "recipient_creator_account_id" IS NULL
  )
  OR (
    "recipient_membership_id" IS NULL
    AND "recipient_creator_account_id" IS NOT NULL
  )
);

CREATE INDEX "notifications_recipient_creator_account_id_read_at_created_at_idx"
ON "notifications" ("recipient_creator_account_id", "read_at", "created_at" DESC);

CREATE INDEX "notifications_recipient_creator_account_id_cluster_key_idx"
ON "notifications" ("recipient_creator_account_id", "cluster_key");

-- Replace single-lane idempotency index with per-lane partial uniques.
DROP INDEX IF EXISTS "notifications_nonclustered_source_recipient_key";

CREATE UNIQUE INDEX "notifications_nonclustered_source_membership_recipient_key"
ON "notifications" ("source_event_id", "recipient_membership_id")
WHERE "cluster_key" IS NULL
  AND "source_event_id" IS NOT NULL
  AND "recipient_membership_id" IS NOT NULL;

CREATE UNIQUE INDEX "notifications_nonclustered_source_creator_recipient_key"
ON "notifications" ("source_event_id", "recipient_creator_account_id")
WHERE "cluster_key" IS NULL
  AND "source_event_id" IS NOT NULL
  AND "recipient_creator_account_id" IS NOT NULL;
