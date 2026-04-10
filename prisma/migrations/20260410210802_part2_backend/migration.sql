-- CreateTable
CREATE TABLE "clone_sites" (
    "creator_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "clone_sites_pkey" PRIMARY KEY ("creator_id")
);

-- CreateTable
CREATE TABLE "payment_configs" (
    "creator_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configs_pkey" PRIMARY KEY ("creator_id")
);

-- CreateTable
CREATE TABLE "payment_checkouts" (
    "checkout_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "payment_checkouts_pkey" PRIMARY KEY ("checkout_id")
);

-- CreateTable
CREATE TABLE "migration_campaigns" (
    "campaign_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_campaigns_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateTable
CREATE TABLE "migration_audit_entries" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "migration_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_suppression_entries" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "email_norm" TEXT NOT NULL,

    CONSTRAINT "migration_suppression_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_signed_links" (
    "token" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_signed_links_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "deployments" (
    "deployment_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "domain" TEXT,
    "preview_url" TEXT NOT NULL,
    "production_url" TEXT,
    "dns_check" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "launched_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "rollback_from_id" TEXT,
    "build_duration_ms" INTEGER,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("deployment_id")
);

-- CreateTable
CREATE TABLE "creator_active_deployments" (
    "creator_id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,

    CONSTRAINT "creator_active_deployments_pkey" PRIMARY KEY ("creator_id")
);

-- CreateIndex
CREATE INDEX "payment_checkouts_processed_at_idx" ON "payment_checkouts"("processed_at");

-- CreateIndex
CREATE INDEX "migration_campaigns_creator_id_idx" ON "migration_campaigns"("creator_id");

-- CreateIndex
CREATE INDEX "migration_audit_entries_campaign_id_idx" ON "migration_audit_entries"("campaign_id");

-- CreateIndex
CREATE INDEX "migration_audit_entries_creator_id_idx" ON "migration_audit_entries"("creator_id");

-- CreateIndex
CREATE INDEX "migration_audit_entries_timestamp_idx" ON "migration_audit_entries"("timestamp");

-- CreateIndex
CREATE INDEX "migration_suppression_entries_creator_id_idx" ON "migration_suppression_entries"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "migration_suppression_entries_creator_id_email_norm_key" ON "migration_suppression_entries"("creator_id", "email_norm");

-- CreateIndex
CREATE INDEX "migration_signed_links_expires_at_idx" ON "migration_signed_links"("expires_at");

-- CreateIndex
CREATE INDEX "deployments_creator_id_idx" ON "deployments"("creator_id");
