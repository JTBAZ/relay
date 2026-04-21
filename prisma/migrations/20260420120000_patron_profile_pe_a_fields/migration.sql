-- PE-A: PatronProfile fields for supporter identity (roadmap D11/D16).

ALTER TABLE "patron_profiles"
  ADD COLUMN "handle_norm" TEXT,
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "avatar_url" TEXT,
  ADD COLUMN "banner_url" TEXT,
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onboarding_step" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "patron_profiles_handle_norm_key" ON "patron_profiles"("handle_norm");
