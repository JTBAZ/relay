-- Transformer Node rework — PostTemplate CRUD + PostbotTask recommendations store.

CREATE TABLE "post_templates" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_templates_creator_id_idx" ON "post_templates"("creator_id");

CREATE TYPE "PostbotTaskAction" AS ENUM ('post', 'repost', 'pin_comment', 'schedule');

CREATE TYPE "PostbotTaskStatus" AS ENUM ('pending', 'done', 'dismissed');

CREATE TABLE "postbot_tasks" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "action" "PostbotTaskAction" NOT NULL,
    "rationale" TEXT NOT NULL,
    "suggested_time" TIMESTAMP(3),
    "link" TEXT,
    "status" "PostbotTaskStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postbot_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "postbot_tasks_creator_id_status_idx" ON "postbot_tasks"("creator_id", "status");

CREATE INDEX "postbot_tasks_variant_id_idx" ON "postbot_tasks"("variant_id");

CREATE INDEX "postbot_tasks_post_id_idx" ON "postbot_tasks"("post_id");

ALTER TABLE "postbot_tasks" ADD CONSTRAINT "postbot_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "post_distribution_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "postbot_tasks" ADD CONSTRAINT "postbot_tasks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "post_distribution_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
