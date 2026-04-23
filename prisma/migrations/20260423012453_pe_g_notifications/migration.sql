-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('comment_replied', 'comment_liked', 'new_follower', 'tier_changed', 'new_post_followed', 'mention');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_membership_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL DEFAULT '',
    "kind" "NotificationKind" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "cluster_key" TEXT,
    "cluster_count" INTEGER NOT NULL DEFAULT 1,
    "source_event_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_cursor" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "last_occurred_at" TIMESTAMP(3) NOT NULL,
    "last_event_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_delivery_cursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_membership_id_read_at_created_at_idx" ON "notifications"("recipient_membership_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_membership_id_cluster_key_idx" ON "notifications"("recipient_membership_id", "cluster_key");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_membership_id_fkey" FOREIGN KEY ("recipient_membership_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
