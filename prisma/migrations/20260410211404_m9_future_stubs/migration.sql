-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('oauth_exchange', 'scheduled_refresh', 'webhook', 'manual_support');

-- CreateEnum
CREATE TYPE "CommentModState" AS ENUM ('visible', 'hidden', 'removed');

-- CreateTable
CREATE TABLE "patron_follows" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patron_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_entitlement_snapshots" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "entitled_tier_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "stale_after" TIMESTAMP(3),

    CONSTRAINT "patron_entitlement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_cursors" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "cursor_key" TEXT NOT NULL,
    "cursor_value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "preference_type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_oauth_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_payload" BYTEA NOT NULL,
    "key_id" TEXT NOT NULL,
    "health_status" "CredentialHealth" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_oauth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relay_comments" (
    "id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "mod_state" "CommentModState" NOT NULL DEFAULT 'visible',

    CONSTRAINT "relay_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_decision_logs" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT,
    "relay_creator_id" TEXT,
    "item_key" TEXT NOT NULL,
    "rank_score" DOUBLE PRECISION,
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inputs_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_tag_embeddings" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "embedding_blob" BYTEA,

    CONSTRAINT "smart_tag_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_suggestions" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "patreon_campaign_numeric_id" TEXT,
    "encrypted_secret" BYTEA NOT NULL,
    "key_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patron_follows_relay_creator_id_idx" ON "patron_follows"("relay_creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "patron_follow_scope_unique" ON "patron_follows"("patron_user_id", "relay_creator_id");

-- CreateIndex
CREATE INDEX "patron_entitlement_snapshots_relay_creator_id_idx" ON "patron_entitlement_snapshots"("relay_creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "patron_entitlement_snapshots_patron_user_id_relay_creator_i_key" ON "patron_entitlement_snapshots"("patron_user_id", "relay_creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_cursors_patron_user_id_cursor_key_key" ON "feed_cursors"("patron_user_id", "cursor_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_patron_user_id_relay_creator_id_pr_key" ON "notification_preferences"("patron_user_id", "relay_creator_id", "preference_type");

-- CreateIndex
CREATE UNIQUE INDEX "patron_oauth_credentials_user_id_key" ON "patron_oauth_credentials"("user_id");

-- CreateIndex
CREATE INDEX "relay_comments_relay_creator_id_post_id_idx" ON "relay_comments"("relay_creator_id", "post_id");

-- CreateIndex
CREATE INDEX "relay_comments_patron_user_id_idx" ON "relay_comments"("patron_user_id");

-- CreateIndex
CREATE INDEX "discovery_decision_logs_created_at_idx" ON "discovery_decision_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "smart_tag_embeddings_creator_id_idx" ON "smart_tag_embeddings"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_stub_scope_unique" ON "smart_tag_embeddings"("creator_id", "entity_type", "entity_id", "model_version");

-- CreateIndex
CREATE INDEX "tag_suggestions_creator_id_media_id_idx" ON "tag_suggestions"("creator_id", "media_id");

-- CreateIndex
CREATE INDEX "webhook_endpoints_relay_creator_id_idx" ON "webhook_endpoints"("relay_creator_id");

-- AddForeignKey
ALTER TABLE "patron_follows" ADD CONSTRAINT "patron_follows_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patron_entitlement_snapshots" ADD CONSTRAINT "patron_entitlement_snapshots_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_cursors" ADD CONSTRAINT "feed_cursors_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patron_oauth_credentials" ADD CONSTRAINT "patron_oauth_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
