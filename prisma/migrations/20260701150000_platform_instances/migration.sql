-- Performance intelligence Phase 2 — Platform Instance identity + snapshot linkage.

CREATE TYPE "PlatformInstanceLinkSource" AS ENUM (
    'autopost_success',
    'manual_url_confirm',
    'api_identity',
    'csv_import',
    'suggested_merge',
    'inferred_only',
    'relay_native'
);

CREATE TYPE "PlatformInstanceStatus" AS ENUM ('active', 'unlinked', 'stale');

CREATE TABLE "platform_instances" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "external_url" TEXT,
    "external_id" TEXT,
    "attempt_id" TEXT,
    "link_source" "PlatformInstanceLinkSource" NOT NULL,
    "status" "PlatformInstanceStatus" NOT NULL DEFAULT 'active',
    "refresh_policy" TEXT NOT NULL DEFAULT 'conservative',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_refreshed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_instances_attempt_id_key" ON "platform_instances"("attempt_id");

CREATE UNIQUE INDEX "platform_instances_post_id_destination_key"
ON "platform_instances"("post_id", "destination");

CREATE INDEX "platform_instances_creator_id_destination_idx"
ON "platform_instances"("creator_id", "destination");

CREATE INDEX "platform_instances_creator_id_status_idx"
ON "platform_instances"("creator_id", "status");

CREATE INDEX "platform_instances_external_url_idx" ON "platform_instances"("external_url");

ALTER TABLE "platform_instances"
ADD CONSTRAINT "platform_instances_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_instances"
ADD CONSTRAINT "platform_instances_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "post_distribution_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "external_post_metric_snapshots"
ADD COLUMN "platform_instance_id" TEXT;

CREATE INDEX "external_post_metric_snapshots_platform_instance_id_metric_type_ca_idx"
ON "external_post_metric_snapshots"("platform_instance_id", "metric_type", "captured_at");

ALTER TABLE "external_post_metric_snapshots"
ADD CONSTRAINT "external_post_metric_snapshots_platform_instance_id_fkey"
FOREIGN KEY ("platform_instance_id") REFERENCES "platform_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: latest posted attempt per post + destination with external URL.
INSERT INTO "platform_instances" (
    "id",
    "creator_id",
    "post_id",
    "destination",
    "external_url",
    "external_id",
    "attempt_id",
    "link_source",
    "status",
    "refresh_policy",
    "linked_at",
    "last_refreshed_at",
    "created_at",
    "updated_at"
)
SELECT DISTINCT ON (a."post_id", a."destination")
    'pi_attempt_' || a."id",
    a."creator_id",
    a."post_id",
    a."destination",
    NULLIF(TRIM(a."external_url"), ''),
    NULLIF(TRIM(a."external_id"), ''),
    a."id",
    'autopost_success'::"PlatformInstanceLinkSource",
    'active'::"PlatformInstanceStatus",
    'conservative',
    COALESCE(a."completed_at", a."updated_at", a."created_at"),
    NULL,
    a."created_at",
    CURRENT_TIMESTAMP
FROM "post_distribution_attempts" a
WHERE a."status" = 'posted'
  AND a."external_url" IS NOT NULL
  AND TRIM(a."external_url") <> ''
ORDER BY a."post_id", a."destination", a."completed_at" DESC NULLS LAST, a."updated_at" DESC
ON CONFLICT ("post_id", "destination") DO NOTHING;

-- Backfill: Relay-native instance per post (no external URL).
INSERT INTO "platform_instances" (
    "id",
    "creator_id",
    "post_id",
    "destination",
    "external_url",
    "external_id",
    "attempt_id",
    "link_source",
    "status",
    "refresh_policy",
    "linked_at",
    "last_refreshed_at",
    "created_at",
    "updated_at"
)
SELECT
    'pi_relay_' || p."id",
    p."creator_id",
    p."id",
    'relay',
    NULL,
    NULL,
    NULL,
    'relay_native'::"PlatformInstanceLinkSource",
    'active'::"PlatformInstanceStatus",
    'conservative',
    p."created_at",
    NULL,
    p."created_at",
    CURRENT_TIMESTAMP
FROM "posts" p
ON CONFLICT ("post_id", "destination") DO NOTHING;

-- Link existing metric snapshots to platform instances.
UPDATE "external_post_metric_snapshots" s
SET "platform_instance_id" = pi."id"
FROM "platform_instances" pi
WHERE s."platform_instance_id" IS NULL
  AND pi."attempt_id" IS NOT NULL
  AND pi."attempt_id" = s."attempt_id";

UPDATE "external_post_metric_snapshots" s
SET "platform_instance_id" = pi."id"
FROM "platform_instances" pi
WHERE s."platform_instance_id" IS NULL
  AND pi."post_id" = s."post_id"
  AND pi."destination" = s."destination";
