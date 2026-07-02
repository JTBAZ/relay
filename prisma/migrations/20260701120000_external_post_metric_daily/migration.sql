-- Slice 2d — daily rollup rows for creator-level external post metric aggregation.

CREATE TABLE "external_post_metric_daily" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "delta_from_prior" INTEGER,
    "source" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_post_metric_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_post_metric_daily_creator_id_post_id_destination_metric_type_day_key"
ON "external_post_metric_daily"("creator_id", "post_id", "destination", "metric_type", "day");

CREATE INDEX "external_post_metric_daily_creator_id_day_idx"
ON "external_post_metric_daily"("creator_id", "day");

CREATE INDEX "external_post_metric_daily_post_id_metric_type_day_idx"
ON "external_post_metric_daily"("post_id", "metric_type", "day");
