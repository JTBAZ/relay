-- T-3.2 — allow MediaAsset rows before a Post exists (Relay direct upload); post link may be set on commit or later.
ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "media_assets_primary_post_id_fkey";

ALTER TABLE "media_assets" ALTER COLUMN "primary_post_id" DROP NOT NULL;

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_primary_post_id_fkey" FOREIGN KEY ("primary_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
