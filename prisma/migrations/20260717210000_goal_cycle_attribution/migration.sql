-- Goal Cycle paid-support attribution schema (VS4-T01).
-- Campaign keys nullable on existing rows. No backfill. No patron identity columns.
-- RLS: ENABLE without permissive policies = deny PostgREST / anon / authenticated.
-- Relay API Prisma uses a role that bypasses RLS.

-- Propagate opaque goal_cycle_campaign_key on materialization / tracked surfaces.
ALTER TABLE "creator_goal_cycle_slots"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "creator_goal_cycle_slots_goal_cycle_campaign_key_idx"
  ON "creator_goal_cycle_slots"("goal_cycle_campaign_key");

ALTER TABLE "post_distribution_plans"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "post_distribution_plans_goal_cycle_campaign_key_idx"
  ON "post_distribution_plans"("goal_cycle_campaign_key");

ALTER TABLE "post_distribution_variants"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "post_distribution_variants_goal_cycle_campaign_key_idx"
  ON "post_distribution_variants"("goal_cycle_campaign_key");

ALTER TABLE "postbot_tasks"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "postbot_tasks_goal_cycle_campaign_key_idx"
  ON "postbot_tasks"("goal_cycle_campaign_key");

ALTER TABLE "creator_tier_promotion_defaults"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "creator_tier_promotion_defaults_goal_cycle_campaign_key_idx"
  ON "creator_tier_promotion_defaults"("goal_cycle_campaign_key");

ALTER TABLE "post_marketing_offers"
  ADD COLUMN IF NOT EXISTS "goal_cycle_campaign_key" TEXT;
CREATE INDEX IF NOT EXISTS "post_marketing_offers_goal_cycle_campaign_key_idx"
  ON "post_marketing_offers"("goal_cycle_campaign_key");

CREATE TABLE IF NOT EXISTS "goal_cycle_support_outcomes" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "slot_id" TEXT,
  "campaign_key" TEXT NOT NULL,
  "event_kind" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "amount_minor" INTEGER,
  "currency" TEXT,
  "attribution" TEXT NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'unknown',
  "source" TEXT NOT NULL,
  "coverage" TEXT NOT NULL DEFAULT 'unavailable',
  "freshness_seconds" INTEGER,
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]',
  "dedupe_key" TEXT NOT NULL,
  "reversal_state" TEXT NOT NULL DEFAULT 'none',
  "reversed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "goal_cycle_support_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_cycle_support_outcomes_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "goal_cycle_support_outcomes_slot_id_fkey"
    FOREIGN KEY ("slot_id") REFERENCES "creator_goal_cycle_slots"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "goal_cycle_support_outcomes_creator_id_dedupe_key_key"
  ON "goal_cycle_support_outcomes"("creator_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "goal_cycle_support_outcomes_creator_id_cycle_id_idx"
  ON "goal_cycle_support_outcomes"("creator_id", "cycle_id");

CREATE INDEX IF NOT EXISTS "goal_cycle_support_outcomes_creator_id_campaign_key_idx"
  ON "goal_cycle_support_outcomes"("creator_id", "campaign_key");

CREATE INDEX IF NOT EXISTS "goal_cycle_support_outcomes_cycle_id_occurred_at_idx"
  ON "goal_cycle_support_outcomes"("cycle_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "goal_cycle_support_outcomes_attribution_reversal_state_idx"
  ON "goal_cycle_support_outcomes"("attribution", "reversal_state");

CREATE TABLE IF NOT EXISTS "goal_cycle_attribution_snapshots" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "window_key" TEXT NOT NULL,
  "target_json" JSONB NOT NULL DEFAULT '{}',
  "deterministic_count" INTEGER NOT NULL DEFAULT 0,
  "deterministic_amount_minor" INTEGER,
  "deterministic_currency" TEXT,
  "estimated_lift_json" JSONB,
  "baseline_window_json" JSONB NOT NULL DEFAULT '{}',
  "observation_window_json" JSONB NOT NULL DEFAULT '{}',
  "coverage" TEXT NOT NULL DEFAULT 'unavailable',
  "confidence" TEXT NOT NULL DEFAULT 'unknown',
  "calculated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "goal_cycle_attribution_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_cycle_attribution_snapshots_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "goal_cycle_attribution_snapshots_cycle_id_window_key_key"
  ON "goal_cycle_attribution_snapshots"("cycle_id", "window_key");

CREATE INDEX IF NOT EXISTS "goal_cycle_attribution_snapshots_creator_id_cycle_id_idx"
  ON "goal_cycle_attribution_snapshots"("creator_id", "cycle_id");

CREATE INDEX IF NOT EXISTS "goal_cycle_attribution_snapshots_creator_id_calculated_at_idx"
  ON "goal_cycle_attribution_snapshots"("creator_id", "calculated_at");

ALTER TABLE public.goal_cycle_support_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_cycle_attribution_snapshots ENABLE ROW LEVEL SECURITY;
