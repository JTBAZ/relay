-- PMD-060 — revenue telemetry storage for operator dashboard rollups (Phase 6).

CREATE TYPE "PlatformRevenueSourceLabel" AS ENUM (
  'relay_native',
  'patreon_upstream',
  'external_estimate'
);

CREATE TYPE "PlatformRevenueEventKind" AS ENUM (
  'checkout_started',
  'checkout_completed',
  'checkout_failed',
  'subscription_created',
  'subscription_upgraded',
  'subscription_downgraded',
  'subscription_canceled',
  'refund_issued',
  'payout_settled'
);

CREATE TABLE "platform_revenue_events" (
    "id" TEXT NOT NULL,
    "event_kind" "PlatformRevenueEventKind" NOT NULL,
    "source_label" "PlatformRevenueSourceLabel" NOT NULL,
    "provider" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT,
    "checkout_id" TEXT,
    "subscription_id" TEXT,
    "amount_cents" INTEGER,
    "net_amount_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "trace_id" TEXT,

    CONSTRAINT "platform_revenue_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_revenue_events_event_kind_occurred_at_idx"
    ON "platform_revenue_events"("event_kind", "occurred_at");

CREATE INDEX "platform_revenue_events_source_label_occurred_at_idx"
    ON "platform_revenue_events"("source_label", "occurred_at");

CREATE INDEX "platform_revenue_events_creator_id_occurred_at_idx"
    ON "platform_revenue_events"("creator_id", "occurred_at");

CREATE INDEX "platform_revenue_events_occurred_at_idx"
    ON "platform_revenue_events"("occurred_at");

ALTER TABLE public.platform_revenue_events ENABLE ROW LEVEL SECURITY;
