-- Manual Social Events — standalone CreatorScheduleEvent (Studio Core)
-- Exact event taxonomy; no fake Relay posts for URL-only reminders.

CREATE TYPE "CreatorScheduleEventType" AS ENUM (
  'make_post',
  'schedule_post',
  'engage_comments',
  'pin_comment',
  'repost',
  'custom'
);

CREATE TYPE "CreatorScheduleEventStatus" AS ENUM (
  'pending',
  'done',
  'dismissed'
);

CREATE TABLE "creator_schedule_events" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "event_type" "CreatorScheduleEventType" NOT NULL,
  "destination" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "due_at" TIMESTAMP(3) NOT NULL,
  "post_id" TEXT,
  "external_url" TEXT,
  "remind_me" BOOLEAN NOT NULL DEFAULT true,
  "reminder_sent_at" TIMESTAMP(3),
  "snoozed_until" TIMESTAMP(3),
  "status" "CreatorScheduleEventStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "creator_schedule_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_schedule_events_creator_id_due_at_idx"
  ON "creator_schedule_events"("creator_id", "due_at");

CREATE INDEX "creator_schedule_events_creator_id_status_reminder_sent_at_idx"
  ON "creator_schedule_events"("creator_id", "status", "reminder_sent_at");

CREATE INDEX "creator_schedule_events_creator_id_status_due_at_idx"
  ON "creator_schedule_events"("creator_id", "status", "due_at");

CREATE INDEX "creator_schedule_events_post_id_idx"
  ON "creator_schedule_events"("post_id");

ALTER TABLE "creator_schedule_events"
  ADD CONSTRAINT "creator_schedule_events_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
