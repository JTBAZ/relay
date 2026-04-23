-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('pending', 'executed', 'cancelled');

-- CreateTable
CREATE TABLE "account_deletions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "reason" TEXT,
    "requester_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletions_account_id_idx" ON "account_deletions"("account_id");

-- CreateIndex
CREATE INDEX "account_deletions_status_scheduled_for_idx" ON "account_deletions"("status", "scheduled_for");
