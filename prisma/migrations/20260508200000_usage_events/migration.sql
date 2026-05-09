-- P7 M1-lite — append-only usage metering (see docs/database/usage-events-rollups.md).

CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "metric" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL DEFAULT 1,
    "meta" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_events_tenant_id_occurred_at_idx" ON "usage_events"("tenant_id", "occurred_at");

CREATE INDEX "usage_events_metric_occurred_at_idx" ON "usage_events"("metric", "occurred_at");

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
