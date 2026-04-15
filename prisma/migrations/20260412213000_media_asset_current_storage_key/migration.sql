-- MIG-31 — optional materialized blob key (export path or future R2 object key); not for public premium URLs.
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "current_storage_key" TEXT;
