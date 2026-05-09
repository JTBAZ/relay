-- P5a-db-002 — Pilot analytics DDL: membership ledger, Patreon Insights import + per-post metrics, Relay engagement.
-- Design: docs/database/p5a-analytics-pilot-schema.md

CREATE TYPE "CreatorMembershipEventType" AS ENUM ('join', 'upgrade', 'downgrade', 'cancel', 'rejoin');

CREATE TYPE "CreatorMembershipEventSource" AS ENUM ('sync', 'webhook', 'backfill');

CREATE TYPE "RelayEngagementEventType" AS ENUM ('gallery_view', 'reveal_interaction', 'profile_view');

CREATE TABLE "creator_membership_events" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "patreon_member_id" TEXT NOT NULL,
    "event_type" "CreatorMembershipEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "tier_id" TEXT,
    "amount_cents" INTEGER,
    "source" "CreatorMembershipEventSource" NOT NULL,
    "payload" JSONB,

    CONSTRAINT "creator_membership_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_membership_events_creator_id_occurred_at_idx" ON "creator_membership_events"("creator_id", "occurred_at");

CREATE TABLE "patreon_insights_imports" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT,

    CONSTRAINT "patreon_insights_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patreon_insights_imports_creator_id_file_hash_key" ON "patreon_insights_imports"("creator_id", "file_hash");

CREATE INDEX "patreon_insights_imports_creator_id_idx" ON "patreon_insights_imports"("creator_id");

CREATE TABLE "patreon_insights_post_metrics" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "patreon_post_id" TEXT NOT NULL,
    "impressions" INTEGER,
    "seen" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "as_of" TIMESTAMP(3),
    "post_id" TEXT,

    CONSTRAINT "patreon_insights_post_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patreon_insights_post_metrics_import_id_idx" ON "patreon_insights_post_metrics"("import_id");

CREATE INDEX "patreon_insights_post_metrics_creator_id_patreon_post_id_idx" ON "patreon_insights_post_metrics"("creator_id", "patreon_post_id");

ALTER TABLE "patreon_insights_post_metrics" ADD CONSTRAINT "patreon_insights_post_metrics_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "patreon_insights_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patreon_insights_post_metrics" ADD CONSTRAINT "patreon_insights_post_metrics_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "relay_engagement_events" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "event_type" "RelayEngagementEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "post_id" TEXT,
    "media_id" TEXT,
    "session_key" TEXT,

    CONSTRAINT "relay_engagement_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relay_engagement_events_creator_id_occurred_at_idx" ON "relay_engagement_events"("creator_id", "occurred_at");

ALTER TABLE "relay_engagement_events" ADD CONSTRAINT "relay_engagement_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "relay_engagement_events" ADD CONSTRAINT "relay_engagement_events_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match rls_lockdown_prisma_tables: deny PostgREST on new Prisma tables (API uses pooler role that bypasses RLS).
ALTER TABLE public.creator_membership_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patreon_insights_imports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patreon_insights_post_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.relay_engagement_events ENABLE ROW LEVEL SECURITY;
