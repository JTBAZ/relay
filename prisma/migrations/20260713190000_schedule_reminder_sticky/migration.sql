-- Phase 5 — extension sticky reminders: global + per-task remind / snooze markers
ALTER TABLE "creator_posting_goals" ADD COLUMN "remind_me_global" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "postbot_tasks" ADD COLUMN "remind_me" BOOLEAN;
ALTER TABLE "postbot_tasks" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);
ALTER TABLE "postbot_tasks" ADD COLUMN "snoozed_until" TIMESTAMP(3);

CREATE INDEX "postbot_tasks_creator_id_status_reminder_sent_at_idx" ON "postbot_tasks"("creator_id", "status", "reminder_sent_at");
