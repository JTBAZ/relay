-- Allow external metric snapshots without a distribution attempt (Platform Instance–scoped ingest).
-- At least one of attempt_id / platform_instance_id must be present.

ALTER TABLE "external_post_metric_snapshots"
DROP CONSTRAINT IF EXISTS "external_post_metric_snapshots_attempt_id_fkey";

ALTER TABLE "external_post_metric_snapshots"
ALTER COLUMN "attempt_id" DROP NOT NULL;

ALTER TABLE "external_post_metric_snapshots"
ADD CONSTRAINT "external_post_metric_snapshots_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "post_distribution_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_post_metric_snapshots"
ADD CONSTRAINT "external_post_metric_snapshots_attempt_or_instance_chk"
CHECK ("attempt_id" IS NOT NULL OR "platform_instance_id" IS NOT NULL);
