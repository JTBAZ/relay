-- AlterTable
ALTER TABLE "post_overrides" ADD COLUMN     "discovery_eligible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "post_overrides_discovery_eligible_idx" ON "post_overrides"("discovery_eligible");
