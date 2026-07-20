-- Slice 6 — Persist Audience & Promotion teaser pointer on PostPresentation.
-- Soft pointer only: not in media_order / PostVersion.mediaIds; no MediaAsset FK/cascade.

ALTER TABLE "post_presentations"
ADD COLUMN "promo_preview_media_id" TEXT;
