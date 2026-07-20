-- VS7-T01: Post.publishState + nullable PostVersion.publishedAt
-- Existing rows default to published. Epoch-sentinel Relay drafts become draft + null publishedAt.

CREATE TYPE "PostPublishState" AS ENUM ('draft', 'published');

ALTER TABLE "posts"
  ADD COLUMN "publish_state" "PostPublishState" NOT NULL DEFAULT 'published';

CREATE INDEX "posts_creator_id_publish_state_idx" ON "posts"("creator_id", "publish_state");

-- Relay posts whose version used the epoch draft sentinel → draft.
UPDATE "posts" AS p
SET "publish_state" = 'draft'
WHERE p."source" = 'RELAY'
  AND EXISTS (
    SELECT 1
    FROM "post_versions" AS v
    WHERE v."post_id" = p."id"
      AND v."published_at" = TIMESTAMPTZ '1970-01-01 00:00:00+00'
  );

ALTER TABLE "post_versions"
  ALTER COLUMN "published_at" DROP NOT NULL;

UPDATE "post_versions" AS v
SET "published_at" = NULL
FROM "posts" AS p
WHERE v."post_id" = p."id"
  AND p."publish_state" = 'draft'
  AND v."published_at" = TIMESTAMPTZ '1970-01-01 00:00:00+00';
