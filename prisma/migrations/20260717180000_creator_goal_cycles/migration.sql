-- Goal Cycle core tables (VS1-T01). No backfill from existing posting-goal rows.
-- RLS: ENABLE without permissive policies = deny PostgREST / anon / authenticated.
-- Relay API Prisma uses a role that bypasses RLS.

CREATE TABLE IF NOT EXISTS "creator_goal_cycles" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "phase" TEXT NOT NULL DEFAULT 'goal',
    "goal_kind" TEXT NOT NULL,
    "break_mode" TEXT,
    "period_key" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'UTC',
    "context_json" JSONB NOT NULL DEFAULT '{}',
    "active_scope" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "start_idempotency_key" TEXT,
    "reservation_ref" TEXT,
    "approved_at" TIMESTAMP(3),
    "materialized_at" TIMESTAMP(3),
    "completion_suggested_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycles_creator_id_active_scope_key"
  ON "creator_goal_cycles"("creator_id", "active_scope");

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycles_creator_id_start_idempotency_key_key"
  ON "creator_goal_cycles"("creator_id", "start_idempotency_key");

CREATE INDEX IF NOT EXISTS "creator_goal_cycles_creator_id_period_key_idx"
  ON "creator_goal_cycles"("creator_id", "period_key");

CREATE INDEX IF NOT EXISTS "creator_goal_cycles_creator_id_state_idx"
  ON "creator_goal_cycles"("creator_id", "state");

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_checkpoints" (
    "cycle_id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_checkpoints_pkey" PRIMARY KEY ("cycle_id"),
    CONSTRAINT "creator_goal_cycle_checkpoints_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_revisions" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "request_summary_json" JSONB NOT NULL DEFAULT '{}',
    "response_summary_json" JSONB NOT NULL DEFAULT '{}',
    "plan_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creator_goal_cycle_revisions_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycle_revisions_cycle_id_ordinal_key"
  ON "creator_goal_cycle_revisions"("cycle_id", "ordinal");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_revisions_cycle_id_idx"
  ON "creator_goal_cycle_revisions"("cycle_id");

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_slots" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "slot_key" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "draft_body" TEXT NOT NULL DEFAULT '',
    "destination_ids_json" JSONB NOT NULL DEFAULT '[]',
    "scheduled_local" TEXT,
    "scheduled_utc" TIMESTAMP(3),
    "media_state" TEXT NOT NULL DEFAULT 'missing',
    "downstream_post_id" TEXT,
    "downstream_plan_id" TEXT,
    "downstream_variant_ids_json" JSONB NOT NULL DEFAULT '[]',
    "downstream_task_ids_json" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creator_goal_cycle_slots_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycle_slots_cycle_id_slot_key_key"
  ON "creator_goal_cycle_slots"("cycle_id", "slot_key");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_slots_cycle_id_rank_idx"
  ON "creator_goal_cycle_slots"("cycle_id", "rank");

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_progress" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "message_code" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creator_goal_cycle_progress_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_goal_cycle_progress_cycle_id_sequence_key"
  ON "creator_goal_cycle_progress"("cycle_id", "sequence");

CREATE INDEX IF NOT EXISTS "creator_goal_cycle_progress_cycle_id_idx"
  ON "creator_goal_cycle_progress"("cycle_id");

CREATE TABLE IF NOT EXISTS "creator_goal_cycle_outcomes" (
    "cycle_id" TEXT NOT NULL,
    "target_json" JSONB NOT NULL DEFAULT '{}',
    "actual_json" JSONB,
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "freshness_seconds" INTEGER,
    "suggested_completion" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "reflection" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_outcomes_pkey" PRIMARY KEY ("cycle_id"),
    CONSTRAINT "creator_goal_cycle_outcomes_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE public.creator_goal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goal_cycle_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goal_cycle_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goal_cycle_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goal_cycle_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_goal_cycle_outcomes ENABLE ROW LEVEL SECURITY;
