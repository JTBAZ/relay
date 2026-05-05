-- BO-RPB-01 — Relay presentation overlay table + FK from comments to media_assets.
--
-- Ingest stays append-only on post_versions/posts; presentation rows are creator-owned overlays.
-- Orphan pinned comments (media_id not in media_assets) become post-level before the FK attaches.

UPDATE "relay_comments"
SET "media_id" = NULL, "anchor_x" = NULL, "anchor_y" = NULL
WHERE "media_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "media_assets" m WHERE m."id" = "relay_comments"."media_id");

-- CreateTable
CREATE TABLE "post_presentations" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "relay_title" TEXT,
    "relay_description" TEXT,
    "media_order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier_preview_settings" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_presentations_post_id_key" ON "post_presentations"("post_id");

-- CreateIndex
CREATE INDEX "post_presentations_creator_id_idx" ON "post_presentations"("creator_id");

-- CreateIndex
CREATE INDEX "post_presentations_creator_id_post_id_idx" ON "post_presentations"("creator_id", "post_id");

-- AddForeignKey
ALTER TABLE "post_presentations" ADD CONSTRAINT "post_presentations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relay_comments" ADD CONSTRAINT "relay_comments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match rls_lockdown_prisma_tables: deny PostgREST on new Prisma tables (API uses pooler role that bypasses RLS).
ALTER TABLE public.post_presentations ENABLE ROW LEVEL SECURITY;
