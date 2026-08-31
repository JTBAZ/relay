-- Command Layer durable idempotency (RC-P8-T05).
-- Hosted apply is HUMAN-MIGRATE / HUMAN-SECURITY. Do not enable PostgREST client access.
-- Rollback: DROP TABLE command_idempotency_keys;

CREATE TABLE "command_idempotency_keys" (
    "storage_key" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL DEFAULT '',
    "status" INTEGER,
    "response_json" JSONB,
    "headers_json" JSONB,
    "locked_until" TIMESTAMP(3),
    "snapshot_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_idempotency_keys_pkey" PRIMARY KEY ("storage_key")
);

CREATE INDEX "command_idempotency_keys_snapshot_expires_at_idx" ON "command_idempotency_keys"("snapshot_expires_at");

ALTER TABLE "command_idempotency_keys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.command_idempotency_keys FROM anon, authenticated;
