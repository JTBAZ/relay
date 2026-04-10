-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "snapshot_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'canonical_rollup',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "estimated" BOOLEAN NOT NULL,
    "label" TEXT,
    "method" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateTable
CREATE TABLE "recommendation_records" (
    "recommendation_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "card_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "recommendation_body" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "expected_impact" JSONB NOT NULL,
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence_refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "dismiss_reason_code" TEXT,

    CONSTRAINT "recommendation_records_pkey" PRIMARY KEY ("recommendation_id")
);

-- CreateTable
CREATE TABLE "action_executions" (
    "action_job_id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "execution_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_executions_pkey" PRIMARY KEY ("action_job_id")
);

-- CreateTable
CREATE TABLE "recommendation_outcomes" (
    "id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "predicted_delta" DOUBLE PRECISION NOT NULL,
    "actual_delta" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "recommendation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_creator_id_kind_period_start_period_end_idx" ON "analytics_snapshots"("creator_id", "kind", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "recommendation_records_creator_id_idx" ON "recommendation_records"("creator_id");

-- CreateIndex
CREATE INDEX "action_executions_creator_id_idx" ON "action_executions"("creator_id");

-- CreateIndex
CREATE INDEX "recommendation_outcomes_creator_id_recommendation_id_idx" ON "recommendation_outcomes"("creator_id", "recommendation_id");
