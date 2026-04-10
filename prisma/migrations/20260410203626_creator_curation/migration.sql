-- CreateEnum
CREATE TYPE "GalleryVisibility" AS ENUM ('visible', 'hidden', 'review');

-- CreateTable
CREATE TABLE "post_overrides" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL DEFAULT '',
    "add_tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remove_tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "GalleryVisibility",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_collections" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" TEXT,
    "access_ceiling_tier_id" TEXT,
    "theme_tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_posts" (
    "collection_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "sort_index" INTEGER NOT NULL,

    CONSTRAINT "collection_posts_pkey" PRIMARY KEY ("collection_id","post_id")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_layouts" (
    "creator_id" TEXT NOT NULL,
    "layout_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_layouts_pkey" PRIMARY KEY ("creator_id")
);

-- CreateIndex
CREATE INDEX "post_overrides_creator_id_idx" ON "post_overrides"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_overrides_creator_id_post_id_media_id_key" ON "post_overrides"("creator_id", "post_id", "media_id");

-- CreateIndex
CREATE INDEX "library_collections_creator_id_idx" ON "library_collections"("creator_id");

-- CreateIndex
CREATE INDEX "collection_posts_collection_id_idx" ON "collection_posts"("collection_id");

-- CreateIndex
CREATE INDEX "saved_filters_creator_id_idx" ON "saved_filters"("creator_id");

-- AddForeignKey
ALTER TABLE "collection_posts" ADD CONSTRAINT "collection_posts_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "library_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
