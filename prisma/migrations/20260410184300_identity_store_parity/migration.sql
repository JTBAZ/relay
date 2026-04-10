-- CreateEnum
CREATE TYPE "IdentityAuthProvider" AS ENUM ('independent', 'patreon');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "relay_creator_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_relay_creator_id_key" ON "tenants"("relay_creator_id");

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_norm" TEXT,
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "identity_auth_provider" "IdentityAuthProvider" NOT NULL DEFAULT 'patreon',
ADD COLUMN "patron_patreon_user_id" TEXT,
ADD COLUMN "tier_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "users_tenant_id_email_norm_idx" ON "users"("tenant_id", "email_norm");
