-- Performance intelligence Phase 4 — manual refresh cooldown tracking.

ALTER TABLE "platform_instances"
ADD COLUMN "last_manual_refresh_requested_at" TIMESTAMP(3);
