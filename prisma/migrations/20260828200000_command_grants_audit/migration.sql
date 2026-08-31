-- Command Layer MCP grants + tool audit (RC-P3-T02).
-- Distinct from web/extension sessions. Hashed tokens only.
-- Hosted apply is HUMAN-MIGRATE / HUMAN-SECURITY. Do not enable PostgREST client access.

CREATE TABLE "command_grants" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "client_label" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "command_grants_token_hash_key" ON "command_grants"("token_hash");
CREATE INDEX "command_grants_account_id_creator_id_idx" ON "command_grants"("account_id", "creator_id");
CREATE INDEX "command_grants_creator_id_expires_at_idx" ON "command_grants"("creator_id", "expires_at");

ALTER TABLE "command_grants"
  ADD CONSTRAINT "command_grants_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "command_audit_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "creator_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "change_set_id" TEXT,
    "outcome" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "command_audit_events_creator_id_created_at_idx" ON "command_audit_events"("creator_id", "created_at");
CREATE INDEX "command_audit_events_trace_id_idx" ON "command_audit_events"("trace_id");

ALTER TABLE "command_audit_events"
  ADD CONSTRAINT "command_audit_events_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "command_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "command_audit_events" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.command_grants FROM anon, authenticated;
REVOKE ALL ON TABLE public.command_audit_events FROM anon, authenticated;
