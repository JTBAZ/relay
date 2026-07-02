-- WI-5 — creator posting goals + monthly nudge state.

-- CreateTable
CREATE TABLE "creator_posting_goals" (
    "creator_id" TEXT NOT NULL,
    "monthly_post_target" INTEGER NOT NULL DEFAULT 1,
    "bonus_nudges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_posting_goals_pkey" PRIMARY KEY ("creator_id")
);

-- CreateTable
CREATE TABLE "creator_posting_nudges" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "nudge_type" TEXT NOT NULL DEFAULT 'posting_goal',
    "status" TEXT NOT NULL DEFAULT 'active',
    "snoozed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_posting_nudges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_posting_nudges_creator_id_period_key_nudge_type_key"
ON "creator_posting_nudges"("creator_id", "period_key", "nudge_type");

-- CreateIndex
CREATE INDEX "creator_posting_nudges_status_snoozed_until_idx"
ON "creator_posting_nudges"("status", "snoozed_until");
