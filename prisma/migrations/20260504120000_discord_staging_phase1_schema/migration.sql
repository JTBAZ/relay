-- Phase 1 Discord capture: enum value, media provenance, binding + link tokens + idempotent ingest keys.

-- Enum extension (PostgreSQL 12+ allows this inside the migration transaction in most setups).
ALTER TYPE "MediaIngestOrigin" ADD VALUE 'DISCORD';

ALTER TABLE "media_assets" ADD COLUMN "discord_capture_json" JSONB;

CREATE INDEX "media_assets_creator_id_ingest_origin_idx" ON "media_assets" ("creator_id", "ingest_origin");

CREATE TABLE "discord_channel_bindings" (
    "id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "discord_guild_id" TEXT NOT NULL,
    "discord_channel_id" TEXT NOT NULL,
    "linked_by_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_channel_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_channel_bindings_relay_creator_id_key" ON "discord_channel_bindings" ("relay_creator_id");
CREATE INDEX "discord_channel_bindings_discord_guild_id_discord_channel_id_idx" ON "discord_channel_bindings" ("discord_guild_id", "discord_channel_id");

ALTER TABLE "discord_channel_bindings" ADD CONSTRAINT "discord_channel_bindings_linked_by_account_id_fkey" FOREIGN KEY ("linked_by_account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "discord_link_tokens" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_link_tokens_code_hash_key" ON "discord_link_tokens" ("code_hash");
CREATE INDEX "discord_link_tokens_relay_creator_id_expires_at_idx" ON "discord_link_tokens" ("relay_creator_id", "expires_at");

ALTER TABLE "discord_link_tokens" ADD CONSTRAINT "discord_link_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discord_media_ingest_keys" (
    "id" TEXT NOT NULL,
    "discord_guild_id" TEXT NOT NULL,
    "discord_channel_id" TEXT NOT NULL,
    "discord_message_id" TEXT NOT NULL,
    "discord_attachment_id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_media_ingest_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_media_ingest_keys_media_asset_id_key" ON "discord_media_ingest_keys" ("media_asset_id");

CREATE UNIQUE INDEX "discord_ingest_key_quad_uq" ON "discord_media_ingest_keys" ("discord_guild_id", "discord_channel_id", "discord_message_id", "discord_attachment_id");

ALTER TABLE "discord_media_ingest_keys" ADD CONSTRAINT "discord_media_ingest_keys_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
