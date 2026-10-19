BEGIN;

CREATE TYPE "CreatorConversationalPlanReview" AS ENUM (
  'proposed',
  'approved_for_preparation',
  'cancelled'
);

CREATE TYPE "CreatorConversationalPlanPointerSlot" AS ENUM (
  'draft',
  'attention_event',
  'relay_post',
  'preview_media',
  'distribution_plan',
  'variant',
  'current_attempt',
  'engagement_event'
);

CREATE TYPE "CreatorConversationalPlanAuthorityKind" AS ENUM (
  'autopost_draft',
  'schedule_event',
  'relay_post',
  'preview_media',
  'distribution_plan',
  'distribution_variant',
  'distribution_attempt'
);

CREATE TABLE "creator_conversational_plans" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "review" "CreatorConversationalPlanReview" NOT NULL,
  "source_ref" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "client_create_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creator_conversational_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_conversational_plans_schema_version_check" CHECK ("schema_version" = 1),
  CONSTRAINT "creator_conversational_plans_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "creator_conversational_plans_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "tenants"("relay_creator_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "creator_conversational_plans_id_creator_id_key"
  ON "creator_conversational_plans"("id", "creator_id");
CREATE UNIQUE INDEX "creator_conversational_plans_creator_id_client_create_key_key"
  ON "creator_conversational_plans"("creator_id", "client_create_key");
CREATE INDEX "creator_conversational_plans_creator_id_updated_at_idx"
  ON "creator_conversational_plans"("creator_id", "updated_at" DESC);

CREATE TABLE "creator_conversational_plan_revisions" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "client_mutation_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_conversational_plan_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_conversational_plan_revisions_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "creator_conversational_plan_revisions_plan_id_creator_id_fkey"
    FOREIGN KEY ("plan_id", "creator_id")
    REFERENCES "creator_conversational_plans"("id", "creator_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "creator_conversational_plan_revisions_plan_id_revision_key"
  ON "creator_conversational_plan_revisions"("plan_id", "revision");
CREATE UNIQUE INDEX "ccp_rev_creator_mutation_key_uq"
  ON "creator_conversational_plan_revisions"("creator_id", "client_mutation_key");
CREATE INDEX "ccp_rev_creator_plan_created_idx"
  ON "creator_conversational_plan_revisions"("creator_id", "plan_id", "created_at");

CREATE TABLE "creator_conversational_plan_pointers" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "slot" "CreatorConversationalPlanPointerSlot" NOT NULL,
  "authority_kind" "CreatorConversationalPlanAuthorityKind" NOT NULL,
  "authority_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_conversational_plan_pointers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creator_conversational_plan_pointers_plan_id_creator_id_fkey"
    FOREIGN KEY ("plan_id", "creator_id")
    REFERENCES "creator_conversational_plans"("id", "creator_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creator_conversational_plan_pointers_slot_kind_check" CHECK (
    ("slot" = 'draft' AND "authority_kind" = 'autopost_draft') OR
    ("slot" IN ('attention_event', 'engagement_event') AND "authority_kind" = 'schedule_event') OR
    ("slot" = 'relay_post' AND "authority_kind" = 'relay_post') OR
    ("slot" = 'preview_media' AND "authority_kind" = 'preview_media') OR
    ("slot" = 'distribution_plan' AND "authority_kind" = 'distribution_plan') OR
    ("slot" = 'variant' AND "authority_kind" = 'distribution_variant') OR
    ("slot" = 'current_attempt' AND "authority_kind" = 'distribution_attempt')
  )
);

CREATE UNIQUE INDEX "creator_conversational_plan_pointers_plan_id_node_id_slot_key"
  ON "creator_conversational_plan_pointers"("plan_id", "node_id", "slot");
CREATE INDEX "ccp_ptr_creator_authority_idx"
  ON "creator_conversational_plan_pointers"("creator_id", "authority_kind", "authority_id");
CREATE INDEX "creator_conversational_plan_pointers_plan_id_node_id_idx"
  ON "creator_conversational_plan_pointers"("plan_id", "node_id");

-- Nullable unique correlation keys leave all existing authority rows untouched.
ALTER TABLE "autopost_drafts" ADD COLUMN "conversational_step_key" TEXT;
CREATE UNIQUE INDEX "autopost_drafts_conversational_step_key_key"
  ON "autopost_drafts"("conversational_step_key");

ALTER TABLE "creator_schedule_events" ADD COLUMN "conversational_step_key" TEXT;
CREATE UNIQUE INDEX "creator_schedule_events_conversational_step_key_key"
  ON "creator_schedule_events"("conversational_step_key");

ALTER TABLE "post_distribution_plans" ADD COLUMN "conversational_group_key" TEXT;
CREATE UNIQUE INDEX "post_distribution_plans_conversational_group_key_key"
  ON "post_distribution_plans"("conversational_group_key");

ALTER TABLE public.creator_conversational_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_conversational_plan_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_conversational_plan_pointers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_conversational_plans FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_conversational_plan_revisions FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_conversational_plan_pointers FROM PUBLIC;

DO $revoke_optional_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plans FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plan_revisions FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plan_pointers FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plans FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plan_revisions FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.creator_conversational_plan_pointers FROM authenticated';
  END IF;
END
$revoke_optional_roles$;

COMMIT;
