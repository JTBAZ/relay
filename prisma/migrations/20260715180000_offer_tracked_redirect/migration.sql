-- Slice 7 — Immutable tracked redirect slug per marketing offer + privacy-minimized click events.

ALTER TABLE "post_marketing_offers"
ADD COLUMN "redirect_slug" TEXT;

CREATE UNIQUE INDEX "post_marketing_offers_redirect_slug_key"
ON "post_marketing_offers"("redirect_slug");

CREATE TABLE "marketing_offer_click_events" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer_host" TEXT,

    CONSTRAINT "marketing_offer_click_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_offer_click_events_offer_id_occurred_at_idx"
ON "marketing_offer_click_events"("offer_id", "occurred_at");

CREATE INDEX "marketing_offer_click_events_creator_id_occurred_at_idx"
ON "marketing_offer_click_events"("creator_id", "occurred_at");

ALTER TABLE "marketing_offer_click_events"
ADD CONSTRAINT "marketing_offer_click_events_offer_id_fkey"
FOREIGN KEY ("offer_id") REFERENCES "post_marketing_offers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
