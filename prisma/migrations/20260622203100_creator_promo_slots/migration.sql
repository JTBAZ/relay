-- Slice D (onboarding media review): ranked creator promo slots for Step 5 review selection.

-- CreateEnum
CREATE TYPE "CreatorPromoSlotTargetKind" AS ENUM ('post', 'media');

-- CreateTable
CREATE TABLE "creator_promo_slots" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "slot_rank" INTEGER NOT NULL,
    "target_kind" "CreatorPromoSlotTargetKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "label" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_promo_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_promo_slots_creator_id_slot_rank_key"
ON "creator_promo_slots"("creator_id", "slot_rank");

-- CreateIndex
CREATE INDEX "creator_promo_slots_creator_id_idx"
ON "creator_promo_slots"("creator_id");

-- Guardrail: slot rank is always 1..5.
ALTER TABLE "creator_promo_slots"
ADD CONSTRAINT "creator_promo_slots_slot_rank_chk"
CHECK ("slot_rank" >= 1 AND "slot_rank" <= 5);
