-- Slice 9 — Live creator tier-promotion defaults + click telemetry for tier-default tracked links.

CREATE TABLE "creator_tier_promotion_defaults" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "gate_relay_tier_id" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'unpermissioned',
    "discount_code_id" TEXT,
    "headline" TEXT NOT NULL DEFAULT '',
    "cta_text" TEXT NOT NULL DEFAULT '',
    "patreon_destination_url" TEXT,
    "redirect_slug" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_tier_promotion_defaults_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_tier_default_click_events" (
    "id" TEXT NOT NULL,
    "tier_default_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer_host" TEXT,

    CONSTRAINT "marketing_tier_default_click_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_tier_promotion_defaults_redirect_slug_key"
ON "creator_tier_promotion_defaults"("redirect_slug");

CREATE UNIQUE INDEX "creator_tier_promotion_defaults_creator_id_gate_relay_tier_id_segment_key"
ON "creator_tier_promotion_defaults"("creator_id", "gate_relay_tier_id", "segment");

CREATE INDEX "creator_tier_promotion_defaults_creator_id_idx"
ON "creator_tier_promotion_defaults"("creator_id");

CREATE INDEX "marketing_tier_default_click_events_tier_default_id_occurred_at_idx"
ON "marketing_tier_default_click_events"("tier_default_id", "occurred_at");

CREATE INDEX "marketing_tier_default_click_events_creator_id_occurred_at_idx"
ON "marketing_tier_default_click_events"("creator_id", "occurred_at");

ALTER TABLE "creator_tier_promotion_defaults"
ADD CONSTRAINT "creator_tier_promotion_defaults_discount_code_id_fkey"
FOREIGN KEY ("discount_code_id") REFERENCES "creator_patreon_discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_tier_default_click_events"
ADD CONSTRAINT "marketing_tier_default_click_events_tier_default_id_fkey"
FOREIGN KEY ("tier_default_id") REFERENCES "creator_tier_promotion_defaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "creator_tier_promotion_defaults"
ADD CONSTRAINT "creator_tier_promotion_defaults_segment_chk"
CHECK ("segment" = 'unpermissioned');

ALTER TABLE "creator_tier_promotion_defaults"
ADD CONSTRAINT "creator_tier_promotion_defaults_headline_len_chk"
CHECK (char_length("headline") <= 200);

ALTER TABLE "creator_tier_promotion_defaults"
ADD CONSTRAINT "creator_tier_promotion_defaults_cta_text_len_chk"
CHECK (char_length("cta_text") <= 120);
