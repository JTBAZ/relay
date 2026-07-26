-- Posting Assistant premium gating + opt-in schedule reminders.

-- Manually-set per-creator feature gates (no billing system yet).
CREATE TABLE "creator_feature_flags" (
    "creator_id" TEXT NOT NULL,
    "posting_assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_feature_flags_pkey" PRIMARY KEY ("creator_id")
);

-- Opt-in reminder ping when a queued cross-post's scheduled_for arrives.
ALTER TABLE "post_distribution_variants"
ADD COLUMN "remind_me" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

ALTER TYPE "NotificationKind" ADD VALUE 'distribution_schedule_reminder';
