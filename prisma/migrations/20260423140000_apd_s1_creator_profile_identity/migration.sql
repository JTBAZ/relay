-- AlterTable: add identity columns to creator_profiles (APD-S1)
ALTER TABLE "creator_profiles" ADD COLUMN "username" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "username_norm" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "display_name" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "banner_url" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "bio" TEXT;
ALTER TABLE "creator_profiles" ADD COLUMN "discipline" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_username_norm_key" ON "creator_profiles"("username_norm");
