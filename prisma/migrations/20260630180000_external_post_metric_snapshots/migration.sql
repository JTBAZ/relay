-- External post metric snapshots (Slice 2) — append-only engagement keyed by distribution attempt.

CREATE TABLE "external_post_metric_snapshots" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "external_url" TEXT NOT NULL,
    "external_id" TEXT,
    "metric_type" TEXT NOT NULL,
    "value" INTEGER,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_post_metric_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_post_metric_snapshots_attempt_id_metric_type_captured_at_idx"
ON "external_post_metric_snapshots"("attempt_id", "metric_type", "captured_at");

CREATE INDEX "external_post_metric_snapshots_post_id_destination_metric_type_captured_at_idx"
ON "external_post_metric_snapshots"("post_id", "destination", "metric_type", "captured_at");

CREATE INDEX "external_post_metric_snapshots_creator_id_captured_at_idx"
ON "external_post_metric_snapshots"("creator_id", "captured_at");

ALTER TABLE "external_post_metric_snapshots"
ADD CONSTRAINT "external_post_metric_snapshots_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "post_distribution_attempts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_post_metric_snapshots"
ADD CONSTRAINT "external_post_metric_snapshots_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
