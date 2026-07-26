-- Autopost schedule series + distribution rules (routine automation)

CREATE TYPE "CreatorScheduleSeriesStatus" AS ENUM ('active', 'paused', 'ended');
CREATE TYPE "CreatorScheduleSeriesCadence" AS ENUM ('weekly', 'monthly');
CREATE TYPE "CreatorScheduleOccurrenceStatus" AS ENUM ('planned', 'materialized', 'completed', 'skipped', 'failed');
CREATE TYPE "CreatorDistributionRuleStatus" AS ENUM ('active', 'paused');
CREATE TYPE "CreatorDistributionRuleRunStatus" AS ENUM ('pending', 'materialized', 'completed', 'failed', 'skipped');

CREATE TABLE "creator_schedule_series" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "status" "CreatorScheduleSeriesStatus" NOT NULL DEFAULT 'active',
    "cadence" "CreatorScheduleSeriesCadence" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "local_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "month_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "planned_format" TEXT NOT NULL DEFAULT 'mixed',
    "destinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remind_me" BOOLEAN NOT NULL DEFAULT true,
    "title_hint" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "source_post_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_schedule_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "creator_schedule_occurrences" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "occurrence_key" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "CreatorScheduleOccurrenceStatus" NOT NULL DEFAULT 'planned',
    "post_id" TEXT,
    "draft_id" TEXT,
    "primary_task_id" TEXT,
    "failure_reason" TEXT,
    "materialized_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_schedule_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "creator_distribution_rules" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "status" "CreatorDistributionRuleStatus" NOT NULL DEFAULT 'active',
    "trigger_kind" TEXT NOT NULL DEFAULT 'patreon_published',
    "offset_days" INTEGER NOT NULL DEFAULT 30,
    "target_destinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transform_mode" TEXT NOT NULL DEFAULT 'preview',
    "remind_me" BOOLEAN NOT NULL DEFAULT true,
    "draft_only" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_distribution_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "creator_distribution_rule_runs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "source_post_id" TEXT NOT NULL,
    "source_published_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "CreatorDistributionRuleRunStatus" NOT NULL DEFAULT 'pending',
    "draft_id" TEXT,
    "plan_id" TEXT,
    "failure_reason" TEXT,
    "materialized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_distribution_rule_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_schedule_series_creator_id_status_idx" ON "creator_schedule_series"("creator_id", "status");
CREATE INDEX "creator_schedule_series_status_updated_at_idx" ON "creator_schedule_series"("status", "updated_at");

CREATE UNIQUE INDEX "creator_schedule_occurrences_series_id_occurrence_key_key" ON "creator_schedule_occurrences"("series_id", "occurrence_key");
CREATE INDEX "creator_schedule_occurrences_creator_id_due_at_idx" ON "creator_schedule_occurrences"("creator_id", "due_at");
CREATE INDEX "creator_schedule_occurrences_creator_id_status_due_at_idx" ON "creator_schedule_occurrences"("creator_id", "status", "due_at");
CREATE INDEX "creator_schedule_occurrences_status_due_at_idx" ON "creator_schedule_occurrences"("status", "due_at");

CREATE INDEX "creator_distribution_rules_creator_id_status_idx" ON "creator_distribution_rules"("creator_id", "status");

CREATE UNIQUE INDEX "creator_distribution_rule_runs_rule_id_source_post_id_key" ON "creator_distribution_rule_runs"("rule_id", "source_post_id");
CREATE INDEX "creator_distribution_rule_runs_creator_id_status_due_at_idx" ON "creator_distribution_rule_runs"("creator_id", "status", "due_at");
CREATE INDEX "creator_distribution_rule_runs_status_due_at_idx" ON "creator_distribution_rule_runs"("status", "due_at");

ALTER TABLE "creator_schedule_occurrences" ADD CONSTRAINT "creator_schedule_occurrences_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "creator_schedule_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creator_distribution_rule_runs" ADD CONSTRAINT "creator_distribution_rule_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "creator_distribution_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
