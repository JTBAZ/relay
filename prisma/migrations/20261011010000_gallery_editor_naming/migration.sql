-- Atomic change: ownership mismatches in old membership/presentation rows abort
-- validation rather than silently transferring tenant ownership.
BEGIN;

-- CreateEnum
CREATE TYPE "CreativeWorkTitleMode" AS ENUM ('independent', 'inherit_series');

-- CreateEnum
CREATE TYPE "PostPresentationTitleMode" AS ENUM ('source', 'inherit_work', 'custom');

-- DropForeignKey
ALTER TABLE "creative_work_members" DROP CONSTRAINT "creative_work_members_creative_work_id_fkey";

-- DropForeignKey
ALTER TABLE "creative_work_members" DROP CONSTRAINT "creative_work_members_post_id_fkey";

-- DropForeignKey
ALTER TABLE "post_presentations" DROP CONSTRAINT "post_presentations_post_id_fkey";

-- AlterTable
ALTER TABLE "creative_works" ADD COLUMN     "title_mode" "CreativeWorkTitleMode" NOT NULL DEFAULT 'independent';

-- AlterTable
ALTER TABLE "post_presentations" ADD COLUMN     "title_mode" "PostPresentationTitleMode" NOT NULL DEFAULT 'source';

-- Preserve exactly the pre-migration displayed title, including its whitespace.
-- Explicit ECMAScript trim characters avoid locale-dependent POSIX whitespace.
UPDATE "post_presentations"
SET "title_mode" = 'custom'
WHERE "relay_title" IS NOT NULL AND btrim("relay_title", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '';

-- CreateTable
CREATE TABLE "gallery_editor_sessions" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "context" JSONB NOT NULL,
    "messages" JSONB NOT NULL,
    "cart" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gallery_editor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_editor_commits" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "scope" TEXT,
    "actions" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "dependencies" JSONB NOT NULL,
    "receipt" JSONB NOT NULL,
    "reversal_of_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_editor_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_series" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_series_members" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "creative_series_id" TEXT NOT NULL,
    "creative_work_id" TEXT NOT NULL,
    "part_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_series_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gallery_editor_sessions_creator_id_actor_id_updated_at_idx" ON "gallery_editor_sessions"("creator_id", "actor_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gallery_editor_sessions_id_creator_id_actor_id_key" ON "gallery_editor_sessions"("id", "creator_id", "actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_editor_commits_reversal_of_id_key" ON "gallery_editor_commits"("reversal_of_id");

-- CreateIndex
CREATE INDEX "gallery_editor_commits_creator_id_actor_id_created_at_idx" ON "gallery_editor_commits"("creator_id", "actor_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gallery_editor_commits_id_creator_id_actor_id_key" ON "gallery_editor_commits"("id", "creator_id", "actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_editor_commits_creator_id_idempotency_key_key" ON "gallery_editor_commits"("creator_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_editor_commits_reversal_of_id_creator_id_actor_id_key" ON "gallery_editor_commits"("reversal_of_id", "creator_id", "actor_id");

-- CreateIndex
CREATE INDEX "creative_series_creator_id_created_at_idx" ON "creative_series"("creator_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "creative_series_id_creator_id_key" ON "creative_series"("id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "creative_series_members_creative_work_id_key" ON "creative_series_members"("creative_work_id");

-- CreateIndex
CREATE INDEX "creative_series_members_creator_id_creative_series_id_sort__idx" ON "creative_series_members"("creator_id", "creative_series_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "creative_series_members_creative_work_id_creator_id_key" ON "creative_series_members"("creative_work_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_id_creator_id_key" ON "posts"("id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "creative_works_id_creator_id_key" ON "creative_works"("id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "creative_work_members_post_id_creator_id_key" ON "creative_work_members"("post_id", "creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_presentations_post_id_creator_id_key" ON "post_presentations"("post_id", "creator_id");

-- AddForeignKey
ALTER TABLE "gallery_editor_commits" ADD CONSTRAINT "gallery_editor_commits_session_id_creator_id_actor_id_fkey" FOREIGN KEY ("session_id", "creator_id", "actor_id") REFERENCES "gallery_editor_sessions"("id", "creator_id", "actor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_editor_commits" ADD CONSTRAINT "gallery_editor_commits_reversal_of_id_creator_id_actor_id_fkey" FOREIGN KEY ("reversal_of_id", "creator_id", "actor_id") REFERENCES "gallery_editor_commits"("id", "creator_id", "actor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_series_members" ADD CONSTRAINT "creative_series_members_creative_series_id_creator_id_fkey" FOREIGN KEY ("creative_series_id", "creator_id") REFERENCES "creative_series"("id", "creator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_series_members" ADD CONSTRAINT "creative_series_members_creative_work_id_creator_id_fkey" FOREIGN KEY ("creative_work_id", "creator_id") REFERENCES "creative_works"("id", "creator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_work_members" ADD CONSTRAINT "creative_work_members_creative_work_id_creator_id_fkey" FOREIGN KEY ("creative_work_id", "creator_id") REFERENCES "creative_works"("id", "creator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_work_members" ADD CONSTRAINT "creative_work_members_post_id_creator_id_fkey" FOREIGN KEY ("post_id", "creator_id") REFERENCES "posts"("id", "creator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_presentations" ADD CONSTRAINT "post_presentations_post_id_creator_id_fkey" FOREIGN KEY ("post_id", "creator_id") REFERENCES "posts"("id", "creator_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "creative_series" ADD CONSTRAINT "creative_series_title_nonblank" CHECK ("title" ~ '[^[:space:]]');
ALTER TABLE "creative_series_members" ADD CONSTRAINT "creative_series_members_part_label_nonblank" CHECK ("part_label" ~ '[^[:space:]]');
ALTER TABLE "creative_series_members" ADD CONSTRAINT "creative_series_members_sort_order_nonnegative" CHECK ("sort_order" >= 0);
ALTER TABLE "gallery_editor_sessions" ADD CONSTRAINT "gallery_editor_sessions_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "gallery_editor_commits" ADD CONSTRAINT "gallery_editor_commits_no_self_reversal" CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" <> "id");

COMMIT;
