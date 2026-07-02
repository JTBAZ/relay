-- Post-level distribution plans, variants, and handoff attempts.

CREATE TABLE "post_distribution_plans" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "source_draft_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "assistant_mode" TEXT NOT NULL DEFAULT 'none',
    "assistant_context" JSONB NOT NULL DEFAULT '{}',
    "assistant_plan" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_distribution_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_distribution_variants" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "body_text" TEXT,
    "post_text" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locale" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "platform_fields" JSONB NOT NULL DEFAULT '{}',
    "advice" JSONB NOT NULL DEFAULT '{}',
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_distribution_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_distribution_attempts" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "extension_installation_id" TEXT,
    "extension_tab_id" INTEGER,
    "fill_result" JSONB NOT NULL DEFAULT '{}',
    "external_url" TEXT,
    "external_id" TEXT,
    "error_code" TEXT,
    "error_detail" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_distribution_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_distribution_plans_creator_id_status_idx"
ON "post_distribution_plans"("creator_id", "status");

CREATE INDEX "post_distribution_plans_post_id_status_idx"
ON "post_distribution_plans"("post_id", "status");

CREATE UNIQUE INDEX "post_distribution_variants_plan_id_destination_key"
ON "post_distribution_variants"("plan_id", "destination");

CREATE INDEX "post_distribution_variants_post_id_destination_idx"
ON "post_distribution_variants"("post_id", "destination");

CREATE INDEX "post_distribution_variants_creator_id_status_idx"
ON "post_distribution_variants"("creator_id", "status");

CREATE INDEX "post_distribution_attempts_variant_id_status_idx"
ON "post_distribution_attempts"("variant_id", "status");

CREATE INDEX "post_distribution_attempts_post_id_destination_idx"
ON "post_distribution_attempts"("post_id", "destination");

CREATE INDEX "post_distribution_attempts_creator_id_status_idx"
ON "post_distribution_attempts"("creator_id", "status");

ALTER TABLE "post_distribution_plans"
ADD CONSTRAINT "post_distribution_plans_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_distribution_plans"
ADD CONSTRAINT "post_distribution_plans_source_draft_id_fkey"
FOREIGN KEY ("source_draft_id") REFERENCES "autopost_drafts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "post_distribution_variants"
ADD CONSTRAINT "post_distribution_variants_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "post_distribution_plans"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_distribution_attempts"
ADD CONSTRAINT "post_distribution_attempts_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "post_distribution_variants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
