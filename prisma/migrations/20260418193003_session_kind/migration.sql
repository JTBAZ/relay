-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('web', 'extension');

-- DropIndex
DROP INDEX "sessions_tenant_membership_id_expires_at_idx";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'web',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "last_used_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sessions_tenant_membership_id_kind_expires_at_idx" ON "sessions"("tenant_membership_id", "kind", "expires_at");
