-- Performance intelligence Phase 1 — Work/Bundle (CreativeWork) + 1:1 default backfill per Post.

CREATE TYPE "CreativeWorkVariantRole" AS ENUM ('full', 'teaser', 'promo', 'repost', 'standalone');

CREATE TABLE "creative_works" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "analytics_campaign_label" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_default_bundle" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_works_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "creative_work_members" (
    "id" TEXT NOT NULL,
    "creative_work_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "variant_role" "CreativeWorkVariantRole" NOT NULL DEFAULT 'standalone',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_work_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creative_work_members_post_id_key" ON "creative_work_members"("post_id");

CREATE INDEX "creative_work_members_creative_work_id_sort_order_idx"
ON "creative_work_members"("creative_work_id", "sort_order");

CREATE INDEX "creative_work_members_creator_id_idx" ON "creative_work_members"("creator_id");

CREATE INDEX "creative_works_creator_id_created_at_idx"
ON "creative_works"("creator_id", "created_at" DESC);

CREATE INDEX "creative_works_creator_id_analytics_campaign_label_idx"
ON "creative_works"("creator_id", "analytics_campaign_label");

ALTER TABLE "creative_work_members"
ADD CONSTRAINT "creative_work_members_creative_work_id_fkey"
FOREIGN KEY ("creative_work_id") REFERENCES "creative_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "creative_work_members"
ADD CONSTRAINT "creative_work_members_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one default Work/Bundle per existing Post (idempotent ids).
INSERT INTO "creative_works" (
    "id",
    "creator_id",
    "title",
    "description",
    "analytics_campaign_label",
    "tags",
    "is_default_bundle",
    "created_at",
    "updated_at"
)
SELECT
    'cw_default_' || p."id",
    p."creator_id",
    COALESCE(
        (
            SELECT pv."title"
            FROM "post_versions" pv
            WHERE pv."post_id" = p."id"
            ORDER BY pv."version_seq" DESC
            LIMIT 1
        ),
        p."id"
    ),
    NULL,
    NULL,
    ARRAY[]::TEXT[],
    true,
    p."created_at",
    CURRENT_TIMESTAMP
FROM "posts" p
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "creative_work_members" (
    "id",
    "creative_work_id",
    "post_id",
    "creator_id",
    "variant_role",
    "sort_order",
    "linked_at"
)
SELECT
    'cwm_default_' || p."id",
    'cw_default_' || p."id",
    p."id",
    p."creator_id",
    'standalone'::"CreativeWorkVariantRole",
    0,
    p."created_at"
FROM "posts" p
ON CONFLICT ("post_id") DO NOTHING;
