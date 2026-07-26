-- Schedule Rail Automations connector graph (VS1 / B03).
-- Safe on populated DBs: legacy series → post_draft; legacy runs get rule:post idempotency keys.
-- Does NOT adopt existing series/rules into creator_automations (those remain unowned).
-- Do not apply to production without explicit human authorization.
--
-- Rerun assumptions: enum ADD VALUE IF NOT EXISTS is idempotent; column ADD IF NOT EXISTS
-- patterns are not used (Prisma tracks applied migrations). Re-applying this folder after
-- partial failure requires human repair — prefer migrate deploy once.

-- Approval TTL / cancel terminals on the existing action-run ledger (not a new automation run table).
ALTER TYPE "CreatorDistributionRuleRunStatus" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "CreatorDistributionRuleRunStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "CreatorScheduleSeriesMaterializationKind" AS ENUM ('post_draft', 'automation_trigger');
CREATE TYPE "CreatorAutomationStatus" AS ENUM ('active', 'paused', 'archived');

-- Trigger-only discriminator for schedule series (default preserves ordinary post_draft behavior).
ALTER TABLE "creator_schedule_series"
  ADD COLUMN "materialization_kind" "CreatorScheduleSeriesMaterializationKind" NOT NULL DEFAULT 'post_draft';

CREATE INDEX "creator_schedule_series_materialization_kind_status_idx"
  ON "creator_schedule_series"("materialization_kind", "status");

-- Extend distribution rule runs for Automations correlation + TTL (still the sole run ledger).
ALTER TABLE "creator_distribution_rule_runs"
  ADD COLUMN "idempotency_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "schedule_occurrence_id" TEXT,
  ADD COLUMN "materialized_event_id" TEXT,
  ADD COLUMN "preview_template_snapshot" JSONB,
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3);

-- Deterministic backfill matching src/autopost/automation-contract.ts helpers.
UPDATE "creator_distribution_rule_runs"
SET "idempotency_key" = 'rule:' || "rule_id" || ':post:' || "source_post_id"
WHERE "idempotency_key" IS NULL OR "idempotency_key" = '';

-- Keep legacy create paths working until VS3/VS4 pass explicit keys (including occurrence:*).
CREATE OR REPLACE FUNCTION relay_distribution_rule_run_idempotency_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."idempotency_key" IS NULL OR NEW."idempotency_key" = '' THEN
    NEW."idempotency_key" := 'rule:' || NEW."rule_id" || ':post:' || NEW."source_post_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER creator_distribution_rule_runs_idempotency_key_bir
  BEFORE INSERT ON "creator_distribution_rule_runs"
  FOR EACH ROW
  EXECUTE FUNCTION relay_distribution_rule_run_idempotency_key();

CREATE UNIQUE INDEX "creator_distribution_rule_runs_idempotency_key_key"
  ON "creator_distribution_rule_runs"("idempotency_key");

CREATE INDEX "creator_distribution_rule_runs_schedule_occurrence_id_idx"
  ON "creator_distribution_rule_runs"("schedule_occurrence_id");

CREATE INDEX "creator_distribution_rule_runs_materialized_event_id_idx"
  ON "creator_distribution_rule_runs"("materialized_event_id");

CREATE INDEX "creator_distribution_rule_runs_status_expires_at_idx"
  ON "creator_distribution_rule_runs"("status", "expires_at");

ALTER TABLE "creator_distribution_rule_runs"
  ADD CONSTRAINT "creator_distribution_rule_runs_schedule_occurrence_id_fkey"
  FOREIGN KEY ("schedule_occurrence_id") REFERENCES "creator_schedule_occurrences"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "creator_distribution_rule_runs"
  ADD CONSTRAINT "creator_distribution_rule_runs_materialized_event_id_fkey"
  FOREIGN KEY ("materialized_event_id") REFERENCES "creator_schedule_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Composition connector: owns at most one series and exactly one distribution rule.
CREATE TABLE "creator_automations" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "preset_kind" TEXT NOT NULL,
    "status" "CreatorAutomationStatus" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "schedule_series_id" TEXT,
    "distribution_rule_id" TEXT NOT NULL,
    "preview_template_id" TEXT,
    "approval_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_automations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_automations_schedule_series_id_key"
  ON "creator_automations"("schedule_series_id");

CREATE UNIQUE INDEX "creator_automations_distribution_rule_id_key"
  ON "creator_automations"("distribution_rule_id");

CREATE INDEX "creator_automations_creator_id_status_idx"
  ON "creator_automations"("creator_id", "status");

CREATE INDEX "creator_automations_creator_id_preset_kind_idx"
  ON "creator_automations"("creator_id", "preset_kind");

CREATE INDEX "creator_automations_preview_template_id_idx"
  ON "creator_automations"("preview_template_id");

ALTER TABLE "creator_automations"
  ADD CONSTRAINT "creator_automations_schedule_series_id_fkey"
  FOREIGN KEY ("schedule_series_id") REFERENCES "creator_schedule_series"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "creator_automations"
  ADD CONSTRAINT "creator_automations_distribution_rule_id_fkey"
  FOREIGN KEY ("distribution_rule_id") REFERENCES "creator_distribution_rules"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "creator_automations"
  ADD CONSTRAINT "creator_automations_preview_template_id_fkey"
  FOREIGN KEY ("preview_template_id") REFERENCES "creator_preview_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgREST lockdown: ENABLE RLS + no permissive policies.
-- Relay API Prisma uses a role that BYPASSES RLS.
ALTER TABLE public.creator_automations ENABLE ROW LEVEL SECURITY;
