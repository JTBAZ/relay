-- P4-onb-001 — Creator onboarding funnel state (persisted step + optional metadata).

CREATE TYPE "CreatorOnboardingStep" AS ENUM ('connected', 'import_started', 'organized', 'published');

CREATE TABLE "creator_onboarding_states" (
    "creator_id" TEXT NOT NULL,
    "step" "CreatorOnboardingStep" NOT NULL DEFAULT 'connected',
    "metadata" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_onboarding_states_pkey" PRIMARY KEY ("creator_id")
);

-- Existing data: assume Patreon connect already satisfied; downstream items (P4-onb-004+) refine transitions.
INSERT INTO "creator_onboarding_states" ("creator_id", "step", "updated_at")
SELECT DISTINCT t."relay_creator_id", 'connected'::"CreatorOnboardingStep", CURRENT_TIMESTAMP
FROM "tenants" t
WHERE t."relay_creator_id" IS NOT NULL
ON CONFLICT ("creator_id") DO NOTHING;

INSERT INTO "creator_onboarding_states" ("creator_id", "step", "updated_at")
SELECT DISTINCT c."creator_id", 'connected'::"CreatorOnboardingStep", CURRENT_TIMESTAMP
FROM "campaigns" c
WHERE NOT EXISTS (
  SELECT 1 FROM "creator_onboarding_states" o WHERE o."creator_id" = c."creator_id"
);
