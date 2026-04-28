-- T-1.2: align provider_post_id with id for existing Patreon-mirrored rows so
-- @@unique([campaignId, providerPostId]) enforces one row per (campaign, upstream post key).
-- RELAY posts (when added) keep provider_post_id NULL; PostgreSQL allows multiple NULLs in a unique constraint.
UPDATE "posts" SET "provider_post_id" = "id" WHERE "source" = 'PATREON' AND "provider_post_id" IS NULL;
