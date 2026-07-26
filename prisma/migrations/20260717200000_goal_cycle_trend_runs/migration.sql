-- Goal Cycle trend evidence runs (VS3-T03). Creator-scoped cache + request idempotency.
-- Raw provider payload storage defaults off (no raw column).
-- No backfill.
-- RLS: ENABLE without permissive policies = deny PostgREST / anon / authenticated.
-- Relay API Prisma uses a role that bypasses RLS.

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_trend_runs" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "cycle_id" TEXT,
  "request_id" TEXT NOT NULL,
  "query_hash" TEXT NOT NULL,
  "cache_key" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "provider_ids_json" JSONB NOT NULL DEFAULT '[]',
  "provider_versions_json" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "evidence_json" JSONB,
  "strength" TEXT,
  "confidence" TEXT,
  "error_code" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "creator_goal_cycle_trend_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_goal_cycle_trend_runs_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycle_trend_runs_creator_id_request_id_key"
  ON "creator_goal_cycle_trend_runs"("creator_id", "request_id");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_trend_runs_creator_id_cache_key_status_idx"
  ON "creator_goal_cycle_trend_runs"("creator_id", "cache_key", "status");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_trend_runs_creator_id_started_at_idx"
  ON "creator_goal_cycle_trend_runs"("creator_id", "started_at");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_trend_runs_expires_at_idx"
  ON "creator_goal_cycle_trend_runs"("expires_at");

ALTER TABLE public.creator_goal_cycle_trend_runs ENABLE ROW LEVEL SECURITY;
