-- Slice 4 — Creator Patreon discount code library + per-post marketing offers.
-- Relay stores creator-supplied codes only; it does not create Patreon coupons.

-- CreateTable
CREATE TABLE "creator_patreon_discount_codes" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "label" TEXT,
    "code" TEXT NOT NULL,
    "percent_off" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_patreon_discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_marketing_offers" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "audience_key" TEXT NOT NULL,
    "discount_code_id" TEXT,
    "headline" TEXT NOT NULL DEFAULT '',
    "cta_text" TEXT NOT NULL DEFAULT '',
    "patreon_destination_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_marketing_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_patreon_discount_codes_creator_id_idx"
ON "creator_patreon_discount_codes"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_patreon_discount_codes_creator_id_code_key"
ON "creator_patreon_discount_codes"("creator_id", "code");

-- CreateIndex
CREATE INDEX "post_marketing_offers_creator_id_idx"
ON "post_marketing_offers"("creator_id");

-- CreateIndex
CREATE INDEX "post_marketing_offers_creator_id_post_id_idx"
ON "post_marketing_offers"("creator_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_marketing_offers_creator_id_post_id_audience_key_key"
ON "post_marketing_offers"("creator_id", "post_id", "audience_key");

-- AddForeignKey
ALTER TABLE "post_marketing_offers"
ADD CONSTRAINT "post_marketing_offers_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_marketing_offers"
ADD CONSTRAINT "post_marketing_offers_discount_code_id_fkey"
FOREIGN KEY ("discount_code_id") REFERENCES "creator_patreon_discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guardrails
ALTER TABLE "creator_patreon_discount_codes"
ADD CONSTRAINT "creator_patreon_discount_codes_percent_off_chk"
CHECK ("percent_off" >= 1 AND "percent_off" <= 100);

ALTER TABLE "post_marketing_offers"
ADD CONSTRAINT "post_marketing_offers_headline_len_chk"
CHECK (char_length("headline") <= 200);

ALTER TABLE "post_marketing_offers"
ADD CONSTRAINT "post_marketing_offers_cta_text_len_chk"
CHECK (char_length("cta_text") <= 120);
