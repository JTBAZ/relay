-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "payload" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "dlq_batch" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "primary_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "trace_id" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_creator_id_status_idx" ON "job_runs"("creator_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_id_key" ON "outbox_events"("event_id");

-- CreateIndex
CREATE INDEX "outbox_events_occurred_at_idx" ON "outbox_events"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_name_tenant_id_primary_id_occurred_at_key" ON "outbox_events"("event_name", "tenant_id", "primary_id", "occurred_at");
