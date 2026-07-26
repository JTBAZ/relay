-- Custom schedule events are destination-free (raw URL / open Relay).
ALTER TABLE "creator_schedule_events" ALTER COLUMN "destination" DROP NOT NULL;
