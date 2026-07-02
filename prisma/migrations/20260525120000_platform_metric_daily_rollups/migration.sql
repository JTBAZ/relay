-- PMD-050 — durable daily rollup rows for operator dashboard metrics.

CREATE TABLE "platform_metric_daily_rollups" (
    "id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "day_utc" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL DEFAULT '',
    "value" DECIMAL(24,6) NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "source_freshness" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_metric_daily_rollups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_metric_daily_rollups_metric_key_day_utc_scope_scope_id_key"
    ON "platform_metric_daily_rollups"("metric_key", "day_utc", "scope", "scope_id");

CREATE INDEX "platform_metric_daily_rollups_metric_key_day_utc_idx"
    ON "platform_metric_daily_rollups"("metric_key", "day_utc");

CREATE INDEX "platform_metric_daily_rollups_day_utc_idx"
    ON "platform_metric_daily_rollups"("day_utc");

CREATE INDEX "platform_metric_daily_rollups_scope_scope_id_day_utc_idx"
    ON "platform_metric_daily_rollups"("scope", "scope_id", "day_utc");

ALTER TABLE public.platform_metric_daily_rollups ENABLE ROW LEVEL SECURITY;
