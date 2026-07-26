-- PMD-041 — platform-wide first-party telemetry event store.

CREATE TABLE "platform_telemetry_events" (
    "id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "producer" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_key" TEXT,
    "actor_key" TEXT,
    "creator_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "trace_id" TEXT,

    CONSTRAINT "platform_telemetry_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_telemetry_events_event_name_occurred_at_idx" ON "platform_telemetry_events"("event_name", "occurred_at");

CREATE INDEX "platform_telemetry_events_occurred_at_idx" ON "platform_telemetry_events"("occurred_at");

CREATE INDEX "platform_telemetry_events_creator_id_occurred_at_idx" ON "platform_telemetry_events"("creator_id", "occurred_at");

ALTER TABLE public.platform_telemetry_events ENABLE ROW LEVEL SECURITY;
