-- CreateEnum
CREATE TYPE "PatronFollowSeedSource" AS ENUM ('oauth_unified', 'oauth_creator_scoped_exchange', 'initial_follow_worker');

-- CreateTable
CREATE TABLE "account_follows" (
    "id" TEXT NOT NULL,
    "follower_account_id" TEXT NOT NULL,
    "followed_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_follow_seeds" (
    "id" TEXT NOT NULL,
    "patron_user_id" TEXT NOT NULL,
    "source" "PatronFollowSeedSource" NOT NULL,
    "relay_creator_ids_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patron_follow_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_follows_followed_account_id_idx" ON "account_follows"("followed_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_follow_pair_unique" ON "account_follows"("follower_account_id", "followed_account_id");

-- CreateIndex
CREATE INDEX "patron_follow_seeds_patron_user_id_idx" ON "patron_follow_seeds"("patron_user_id");

-- AddForeignKey
ALTER TABLE "account_follows" ADD CONSTRAINT "account_follows_follower_account_id_fkey" FOREIGN KEY ("follower_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_follows" ADD CONSTRAINT "account_follows_followed_account_id_fkey" FOREIGN KEY ("followed_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patron_follow_seeds" ADD CONSTRAINT "patron_follow_seeds_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostgREST lockdown (same pattern as 20260415000000_rls_lockdown_prisma_tables).
ALTER TABLE public.account_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_follow_seeds ENABLE ROW LEVEL SECURITY;
