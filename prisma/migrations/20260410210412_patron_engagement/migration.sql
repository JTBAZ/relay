-- CreateEnum
CREATE TYPE "PatronFavoriteTargetKind" AS ENUM ('post', 'media');

-- CreateTable
CREATE TABLE "patron_favorites" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "target_kind" "PatronFavoriteTargetKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_saved_collections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_saved_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_saved_collection_entries" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_saved_collection_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patron_favorites_patron_user_id_creator_id_idx" ON "patron_favorites"("patron_user_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "patron_favorite_scope_unique" ON "patron_favorites"("patron_user_id", "creator_id", "target_kind", "target_id");

-- CreateIndex
CREATE INDEX "patron_saved_collections_creator_id_user_id_idx" ON "patron_saved_collections"("creator_id", "user_id");

-- CreateIndex
CREATE INDEX "patron_saved_collection_entries_collection_id_idx" ON "patron_saved_collection_entries"("collection_id");

-- CreateIndex
CREATE INDEX "patron_saved_collection_entries_creator_id_user_id_idx" ON "patron_saved_collection_entries"("creator_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patron_saved_entry_media_unique" ON "patron_saved_collection_entries"("user_id", "creator_id", "collection_id", "media_id");

-- AddForeignKey
ALTER TABLE "patron_saved_collection_entries" ADD CONSTRAINT "patron_saved_collection_entries_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "patron_saved_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
