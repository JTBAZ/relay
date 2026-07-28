-- Unified Relay Identity: durable OAuth callback transactions + identity audit trail.
-- Never stores plaintext OAuth codes or tokens — hashes only.

CREATE TYPE "OAuthTransactionPurpose" AS ENUM ('patron_link', 'creator_ingest');
CREATE TYPE "OAuthTransactionStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed');
CREATE TYPE "IdentityAuditOutcome" AS ENUM ('already_correct', 'safe_claim', 'conflict', 'insufficient_proof', 'dry_run');

CREATE TABLE "oauth_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "purpose" "OAuthTransactionPurpose" NOT NULL,
    "status" "OAuthTransactionStatus" NOT NULL DEFAULT 'pending',
    "state_hash" TEXT,
    "code_hash" TEXT,
    "relay_creator_id" TEXT,
    "redirect_uri" TEXT,
    "return_path" TEXT,
    "result_json" JSONB,
    "error_code" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_transactions_state_hash_key" ON "oauth_transactions"("state_hash");
CREATE UNIQUE INDEX "oauth_transactions_code_hash_key" ON "oauth_transactions"("code_hash");
CREATE INDEX "oauth_transactions_account_id_purpose_status_idx" ON "oauth_transactions"("account_id", "purpose", "status");
CREATE INDEX "oauth_transactions_expires_at_idx" ON "oauth_transactions"("expires_at");

ALTER TABLE "oauth_transactions" ADD CONSTRAINT "oauth_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "identity_audit_events" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "actor_account_id" TEXT,
    "relay_creator_id" TEXT,
    "patreon_campaign_id" TEXT,
    "outcome" "IdentityAuditOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_audit_events_account_id_created_at_idx" ON "identity_audit_events"("account_id", "created_at" DESC);
CREATE INDEX "identity_audit_events_relay_creator_id_idx" ON "identity_audit_events"("relay_creator_id");
CREATE INDEX "identity_audit_events_outcome_created_at_idx" ON "identity_audit_events"("outcome", "created_at" DESC);

ALTER TABLE "identity_audit_events" ADD CONSTRAINT "identity_audit_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth: enable RLS (Prisma service role typically bypasses; fail-closed for direct clients).
ALTER TABLE "oauth_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_audit_events" ENABLE ROW LEVEL SECURITY;
