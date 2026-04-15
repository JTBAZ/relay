-- Public creator URL slug (unique, reserved at app layer).

ALTER TABLE "creator_profiles" ADD COLUMN "public_slug" TEXT;

UPDATE "creator_profiles"
SET "public_slug" = 'relay' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE "public_slug" IS NULL;

CREATE UNIQUE INDEX "creator_profiles_public_slug_key" ON "creator_profiles"("public_slug");

ALTER TABLE "creator_profiles" ALTER COLUMN "public_slug" SET NOT NULL;
