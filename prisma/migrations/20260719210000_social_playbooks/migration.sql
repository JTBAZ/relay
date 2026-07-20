-- Follow-up Social Playbooks (Autopost)

CREATE TYPE "CreatorSocialPlaybookRunStatus" AS ENUM ('applied', 'cancelled');
CREATE TYPE "CreatorSocialPlaybookStepStatus" AS ENUM ('pending', 'materialized', 'skipped', 'failed');

CREATE TABLE "creator_social_playbook_runs" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "CreatorSocialPlaybookRunStatus" NOT NULL DEFAULT 'applied',
    "anchor_post_id" TEXT NOT NULL,
    "anchor_task_id" TEXT,
    "anchor_due_at" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "destinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remind_me" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_social_playbook_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "creator_social_playbook_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "action_key" TEXT NOT NULL,
    "execution_mode" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "planned_format" TEXT,
    "offset_minutes" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "CreatorSocialPlaybookStepStatus" NOT NULL DEFAULT 'pending',
    "materialized_event_id" TEXT,
    "materialized_task_id" TEXT,
    "materialized_draft_id" TEXT,
    "materialized_post_id" TEXT,
    "failure_reason" TEXT,
    "atom_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_social_playbook_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_social_playbook_runs_creator_id_template_key_anchor_post_id_key"
  ON "creator_social_playbook_runs"("creator_id", "template_key", "anchor_post_id");

CREATE INDEX "creator_social_playbook_runs_creator_id_status_idx"
  ON "creator_social_playbook_runs"("creator_id", "status");

CREATE INDEX "creator_social_playbook_runs_anchor_post_id_idx"
  ON "creator_social_playbook_runs"("anchor_post_id");

CREATE UNIQUE INDEX "creator_social_playbook_steps_run_id_step_index_key"
  ON "creator_social_playbook_steps"("run_id", "step_index");

CREATE INDEX "creator_social_playbook_steps_creator_id_due_at_idx"
  ON "creator_social_playbook_steps"("creator_id", "due_at");

CREATE INDEX "creator_social_playbook_steps_materialized_event_id_idx"
  ON "creator_social_playbook_steps"("materialized_event_id");

CREATE INDEX "creator_social_playbook_steps_materialized_task_id_idx"
  ON "creator_social_playbook_steps"("materialized_task_id");

ALTER TABLE "creator_social_playbook_steps"
  ADD CONSTRAINT "creator_social_playbook_steps_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "creator_social_playbook_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
