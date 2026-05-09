-- Partial unique: non-clustered notification rows are idempotent on (outbox row id, recipient).
-- Clustered kinds use cluster_key and are excluded. See P1-queue-015 / notification-delivery-worker.
CREATE UNIQUE INDEX "notifications_nonclustered_source_recipient_key"
ON "notifications" ("source_event_id", "recipient_membership_id")
WHERE "cluster_key" IS NULL AND "source_event_id" IS NOT NULL;
