-- MIG-10: Pattern A — link `Account` to Supabase Auth `auth.users.id` (nullable until MIG-11+).

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "supabase_user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_supabase_user_id_key" ON "accounts"("supabase_user_id");
