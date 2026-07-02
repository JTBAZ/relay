-- Performance intelligence Phase 8 — targeted performance goals

CREATE TYPE "PerformanceGoalScope" AS ENUM ('creator', 'work', 'campaign', 'platform');

CREATE TYPE "PerformanceGoalMetric" AS ENUM ('reach', 'likes', 'comments');

CREATE TABLE "creator_performance_goals" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "scope" "PerformanceGoalScope" NOT NULL,
    "scope_ref" TEXT,
    "metric" "PerformanceGoalMetric" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "range" TEXT NOT NULL DEFAULT '30d',
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_performance_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_performance_goals_creator_id_enabled_idx" ON "creator_performance_goals"("creator_id", "enabled");

CREATE INDEX "creator_performance_goals_creator_id_scope_scope_ref_idx" ON "creator_performance_goals"("creator_id", "scope", "scope_ref");
