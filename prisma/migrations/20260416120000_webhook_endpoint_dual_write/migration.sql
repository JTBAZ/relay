-- Dual-write support for Patreon platform webhook metadata (Plan A WI-2).

-- AlterTable
ALTER TABLE "webhook_endpoints" ALTER COLUMN "encrypted_secret" DROP NOT NULL;
ALTER TABLE "webhook_endpoints" ALTER COLUMN "key_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "webhook_endpoints" ADD COLUMN "opaque_delivery_token" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "patreon_webhook_id" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "uri_registered" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "registration_status" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "webhook_triggers" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_relay_creator_id_key" ON "webhook_endpoints"("relay_creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_opaque_delivery_token_key" ON "webhook_endpoints"("opaque_delivery_token");
