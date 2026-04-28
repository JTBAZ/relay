-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('PATREON', 'RELAY');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "source" "PostSource" NOT NULL DEFAULT 'PATREON';

-- CreateIndex
CREATE INDEX "posts_creator_id_source_idx" ON "posts"("creator_id", "source");
