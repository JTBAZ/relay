-- SubscribeStar provider foundation: provider enum, creator linkage, source provenance, and provider-scoped sync health.

ALTER TYPE "ProviderKind" ADD VALUE IF NOT EXISTS 'subscribestar';

ALTER TYPE "PostSource" ADD VALUE IF NOT EXISTS 'SUBSCRIBESTAR';

ALTER TYPE "MediaIngestOrigin" ADD VALUE IF NOT EXISTS 'SUBSCRIBESTAR';

ALTER TABLE "creator_profiles"
    ADD COLUMN "subscribestar_profile_id" TEXT;

CREATE UNIQUE INDEX "creator_profiles_subscribestar_profile_id_key"
    ON "creator_profiles"("subscribestar_profile_id");

CREATE INDEX "creator_profiles_subscribestar_profile_id_idx"
    ON "creator_profiles"("subscribestar_profile_id");

CREATE TABLE "creator_provider_sync_states" (
    "creator_id" TEXT NOT NULL,
    "provider" "ProviderKind" NOT NULL,
    "last_post_sync" JSONB,
    "last_member_sync" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_provider_sync_states_pkey" PRIMARY KEY ("creator_id", "provider")
);

-- Match rls_lockdown_prisma_tables: API access goes through server-side Prisma, not direct PostgREST.
ALTER TABLE public.creator_provider_sync_states ENABLE ROW LEVEL SECURITY;
