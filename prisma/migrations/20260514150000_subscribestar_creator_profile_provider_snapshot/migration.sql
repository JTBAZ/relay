-- SubscribeStar: persist merged supplemental GraphQL payload (subscriptions/payments roots) on creator profile.

ALTER TABLE "creator_profiles"
    ADD COLUMN "subscribestar_provider_snapshot" JSONB,
    ADD COLUMN "subscribestar_provider_snapshot_at" TIMESTAMP(3);
