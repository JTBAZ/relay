-- AlterTable
ALTER TABLE "page_layouts" ADD COLUMN "published_at" TIMESTAMP(3);

-- Preserve existing deployments: treat current layout rows as already published.
UPDATE "page_layouts" SET "published_at" = "updated_at" WHERE "published_at" IS NULL;
