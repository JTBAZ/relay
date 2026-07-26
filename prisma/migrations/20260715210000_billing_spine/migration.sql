-- Billing spine (MB-1) — Stripe SaaS foundation tables + enums.
-- See docs/BILLING_SPINE_BUILD_PLAN.md frozen contracts.

CREATE TYPE "CreatorPlan" AS ENUM ('studio_core', 'autopost', 'growth_engine');
CREATE TYPE "FanPlan" AS ENUM ('free', 'supporter', 'curator');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'canceled', 'incomplete', 'trialing');

CREATE TABLE "billing_customers" (
    "account_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("account_id")
);

CREATE UNIQUE INDEX "billing_customers_stripe_customer_id_key" ON "billing_customers"("stripe_customer_id");

CREATE TABLE "plan_subscriptions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "creator_plan" "CreatorPlan",
    "fan_plan" "FanPlan",
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_subscriptions_stripe_subscription_id_key" ON "plan_subscriptions"("stripe_subscription_id");
CREATE INDEX "plan_subscriptions_account_id_scope_idx" ON "plan_subscriptions"("account_id", "scope");
CREATE INDEX "plan_subscriptions_status_idx" ON "plan_subscriptions"("status");

CREATE TABLE "creator_plan_entitlements" (
    "creator_id" TEXT NOT NULL,
    "plan" "CreatorPlan" NOT NULL,
    "source" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_plan_entitlements_pkey" PRIMARY KEY ("creator_id")
);

CREATE TABLE "billing_webhook_events" (
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("stripe_event_id")
);

CREATE INDEX "billing_webhook_events_event_type_processed_at_idx" ON "billing_webhook_events"("event_type", "processed_at");
