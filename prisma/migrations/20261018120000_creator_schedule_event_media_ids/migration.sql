-- Event-owned ordered references to selected Library media.
ALTER TABLE "creator_schedule_events"
ADD COLUMN "media_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
