-- PMD-071 — append-only audit trail for privileged platform metrics access.

CREATE TABLE "platform_operator_access_audits" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "account_id" TEXT,
    "trace_id" TEXT,
    "route" TEXT,
    "method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_operator_access_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_operator_access_audits_created_at_idx"
    ON "platform_operator_access_audits"("created_at" DESC);

CREATE INDEX "platform_operator_access_audits_account_id_created_at_idx"
    ON "platform_operator_access_audits"("account_id", "created_at");

ALTER TABLE public.platform_operator_access_audits ENABLE ROW LEVEL SECURITY;
