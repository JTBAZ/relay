-- VS7-T02: idempotent Goal Cycle materialization receipts

CREATE TABLE "creator_goal_cycle_materialization_receipts" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "approval_key" TEXT NOT NULL,
    "receipt_json" JSONB NOT NULL,
    "materialized_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_goal_cycle_materialization_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_goal_cycle_materialization_receipts_cycle_id_approval_key_key"
  ON "creator_goal_cycle_materialization_receipts"("cycle_id", "approval_key");

CREATE INDEX "creator_goal_cycle_materialization_receipts_cycle_id_idx"
  ON "creator_goal_cycle_materialization_receipts"("cycle_id");

ALTER TABLE "creator_goal_cycle_materialization_receipts"
  ADD CONSTRAINT "creator_goal_cycle_materialization_receipts_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
