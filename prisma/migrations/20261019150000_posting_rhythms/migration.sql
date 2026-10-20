BEGIN;
-- AlterTable
ALTER TABLE "post_distribution_plans" ADD COLUMN     "rhythm_action_id" TEXT;

-- AlterTable
ALTER TABLE "creator_distribution_rules" ADD COLUMN     "rhythm_id" TEXT;

-- AlterTable
ALTER TABLE "creator_distribution_rule_runs" ADD COLUMN     "receipt_at" TIMESTAMP(3),
ADD COLUMN     "receipt_url" TEXT,
ADD COLUMN     "rhythm_enrollment_id" TEXT,
ADD COLUMN     "rhythm_route_id" TEXT;

-- CreateTable
CREATE TABLE "creator_posting_rhythms" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "config" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "always_on" BOOLEAN NOT NULL DEFAULT false,
    "armed" BOOLEAN NOT NULL DEFAULT false,
    "eligible_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cursor" JSONB,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_posting_rhythms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_posting_rhythm_enrollments" (
    "id" TEXT NOT NULL,
    "rhythm_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "source_post_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_posting_rhythm_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_posting_rhythm_drafts" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_posting_rhythm_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_posting_rhythms_creator_id_status_idx" ON "creator_posting_rhythms"("creator_id", "status");

-- CreateIndex
CREATE INDEX "creator_posting_rhythm_enrollments_creator_id_created_at_idx" ON "creator_posting_rhythm_enrollments"("creator_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "creator_posting_rhythm_enrollments_rhythm_id_source_post_id_key" ON "creator_posting_rhythm_enrollments"("rhythm_id", "source_post_id");

-- CreateIndex
CREATE INDEX "creator_posting_rhythm_drafts_creator_id_created_at_idx" ON "creator_posting_rhythm_drafts"("creator_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_distribution_plans_rhythm_action_id_key" ON "post_distribution_plans"("rhythm_action_id");

-- AddForeignKey
ALTER TABLE "creator_distribution_rules" ADD CONSTRAINT "creator_distribution_rules_rhythm_id_fkey" FOREIGN KEY ("rhythm_id") REFERENCES "creator_posting_rhythms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_distribution_rule_runs" ADD CONSTRAINT "creator_distribution_rule_runs_rhythm_enrollment_id_fkey" FOREIGN KEY ("rhythm_enrollment_id") REFERENCES "creator_posting_rhythm_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_posting_rhythm_enrollments" ADD CONSTRAINT "creator_posting_rhythm_enrollments_rhythm_id_fkey" FOREIGN KEY ("rhythm_id") REFERENCES "creator_posting_rhythms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Private configuration; all access is through creator-scoped authenticated services.
ALTER TABLE "creator_posting_rhythms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_posting_rhythm_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_posting_rhythm_drafts" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "creator_posting_rhythms_default_context" ON "creator_posting_rhythms"("creator_id") WHERE "is_default" = true AND "status" <> 'archived';

COMMIT;
