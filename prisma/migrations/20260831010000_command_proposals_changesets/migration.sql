-- Command Layer durable proposals, ChangeSets, and undo snapshots (RC-P8-T04).
-- Hosted apply is HUMAN-MIGRATE / HUMAN-SECURITY. Do not enable PostgREST client access.
-- Rollback: DROP TABLE command_change_set_undos, command_change_sets, command_selection_proposals.

CREATE TABLE "command_selection_proposals" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "records_json" JSONB NOT NULL,
    "exclude_post_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frozen_post_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frozen_revision" TEXT,
    "snapshot_revision" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_selection_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "command_selection_proposals_creator_id_key" ON "command_selection_proposals"("creator_id");
CREATE INDEX "command_selection_proposals_creator_id_stage_idx" ON "command_selection_proposals"("creator_id", "stage");

CREATE TABLE "command_change_sets" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolved_post_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ops_json" JSONB NOT NULL,
    "expected_revisions_json" JSONB NOT NULL,
    "before_snapshot_ref" TEXT,
    "after_summary" TEXT,
    "access_implications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_change_sets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "command_change_sets_creator_id_status_idx" ON "command_change_sets"("creator_id", "status");
CREATE INDEX "command_change_sets_creator_id_idempotency_key_idx" ON "command_change_sets"("creator_id", "idempotency_key");

CREATE TABLE "command_change_set_undos" (
    "change_set_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_change_set_undos_pkey" PRIMARY KEY ("change_set_id")
);

CREATE INDEX "command_change_set_undos_creator_id_idx" ON "command_change_set_undos"("creator_id");

ALTER TABLE "command_change_set_undos"
  ADD CONSTRAINT "command_change_set_undos_change_set_id_fkey"
  FOREIGN KEY ("change_set_id") REFERENCES "command_change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "command_selection_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "command_change_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "command_change_set_undos" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.command_selection_proposals FROM anon, authenticated;
REVOKE ALL ON TABLE public.command_change_sets FROM anon, authenticated;
REVOKE ALL ON TABLE public.command_change_set_undos FROM anon, authenticated;
