-- Public slug provenance: opaque default vs Patreon vanity vs user edit.
-- Existing rows: user_chosen so Patreon promotion never rewrites live URLs without explicit policy.

CREATE TYPE "PublicSlugSource" AS ENUM ('allocated', 'patreon_default', 'user_chosen');

ALTER TABLE "creator_profiles" ADD COLUMN "slug_source" "PublicSlugSource" NOT NULL DEFAULT 'allocated';

UPDATE "creator_profiles" SET "slug_source" = 'user_chosen';
