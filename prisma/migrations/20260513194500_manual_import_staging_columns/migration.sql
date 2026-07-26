-- Manual Import staged uploads — provider-linked access bins + persisted staging metadata on MediaAsset.

ALTER TABLE "tiers"
ADD COLUMN "manual_upload_access_relay_tier_id" TEXT;

ALTER TABLE "media_assets"
ADD COLUMN "manual_import_staging_json" JSONB;
