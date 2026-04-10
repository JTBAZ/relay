-- CreateEnum
CREATE TYPE "PostUpstreamStatus" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "MediaUpstreamStatus" AS ENUM ('active', 'deleted');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "identity_auth_provider" DROP DEFAULT;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "upstream_updated_at" TIMESTAMP(3) NOT NULL,
    "version_seq" INTEGER NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "relay_tier_id" TEXT NOT NULL,
    "provider_tier_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "upstream_updated_at" TIMESTAMP(3) NOT NULL,
    "version_seq" INTEGER NOT NULL,

    CONSTRAINT "tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "provider_post_id" TEXT,
    "upstream_status" "PostUpstreamStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_versions" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "upstream_revision" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingested_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_post_id" TEXT NOT NULL,
    "upstream_status" "MediaUpstreamStatus" NOT NULL,
    "current_version_seq" INTEGER NOT NULL,
    "current_upstream_revision" TEXT NOT NULL,
    "current_mime_type" TEXT,
    "current_upstream_url" TEXT,
    "current_role" TEXT,
    "current_ingested_at" TIMESTAMP(3) NOT NULL,
    "versions_json" JSONB NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tiers" (
    "post_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,

    CONSTRAINT "post_tiers_pkey" PRIMARY KEY ("post_id","tier_id")
);

-- CreateTable
CREATE TABLE "sync_cursors" (
    "creator_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("creator_id","campaign_id")
);

-- CreateTable
CREATE TABLE "creator_sync_states" (
    "creator_id" TEXT NOT NULL,
    "last_post_scrape" JSONB,
    "last_member_sync" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_sync_states_pkey" PRIMARY KEY ("creator_id")
);

-- CreateTable
CREATE TABLE "ingest_idempotency_keys" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "batch_key" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_creator_id_idx" ON "campaigns"("creator_id");

-- CreateIndex
CREATE INDEX "tiers_creator_id_idx" ON "tiers"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tiers_creator_id_provider_tier_id_key" ON "tiers"("creator_id", "provider_tier_id");

-- CreateIndex
CREATE INDEX "posts_campaign_id_created_at_idx" ON "posts"("campaign_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "posts_campaign_id_provider_post_id_key" ON "posts"("campaign_id", "provider_post_id");

-- CreateIndex
CREATE INDEX "post_versions_post_id_idx" ON "post_versions"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_versions_post_id_version_seq_key" ON "post_versions"("post_id", "version_seq");

-- CreateIndex
CREATE INDEX "media_assets_primary_post_id_idx" ON "media_assets"("primary_post_id");

-- CreateIndex
CREATE INDEX "ingest_idempotency_keys_creator_id_idx" ON "ingest_idempotency_keys"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_idempotency_keys_creator_id_batch_key_key" ON "ingest_idempotency_keys"("creator_id", "batch_key");

-- AddForeignKey
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_primary_post_id_fkey" FOREIGN KEY ("primary_post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tiers" ADD CONSTRAINT "post_tiers_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tiers" ADD CONSTRAINT "post_tiers_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
