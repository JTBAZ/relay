-- Enable Row Level Security on every Prisma-managed table in `public`.
--
-- Context: Relay's API accesses Postgres exclusively via DATABASE_URL (Supabase pooler,
-- user `postgres.<project_ref>` — a superuser that BYPASSES RLS). PostgREST, however,
-- exposes every `public` table via the Supabase anon/authenticated roles unless RLS is on.
-- Enabling RLS with NO permissive policies = implicit DENY for PostgREST callers while
-- leaving all server-side Prisma queries completely unaffected.
--
-- Resolves: rls_disabled_in_public (×44) and sensitive_columns_exposed advisors reported
-- by Supabase security linter on 2026-04-15.
--
-- Note: `_prisma_migrations` is handled separately because Prisma owns its DDL; we use
-- a conditional to avoid errors if the table does not exist in a given env.

-- Core identity & multi-tenancy
ALTER TABLE public.tenants                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_accounts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_credentials                ENABLE ROW LEVEL SECURITY;

-- Creator & patron profiles
ALTER TABLE public.creator_profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_campaign_access           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_oauth_credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_entitlement_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_follows                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_favorites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_saved_collections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patron_saved_collection_entries  ENABLE ROW LEVEL SECURITY;

-- Content
ALTER TABLE public.campaigns                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_versions                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tiers                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_overrides                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets                     ENABLE ROW LEVEL SECURITY;

-- Curation & UX
ALTER TABLE public.library_collections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_posts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_layouts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_cursors                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_comments                   ENABLE ROW LEVEL SECURITY;

-- Sync & operations
ALTER TABLE public.sync_cursors                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_sync_states              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_idempotency_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints                ENABLE ROW LEVEL SECURITY;

-- Analytics & AI
ALTER TABLE public.analytics_snapshots              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_outcomes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_executions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_decision_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_tag_embeddings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_suggestions                  ENABLE ROW LEVEL SECURITY;

-- Payments & deployments
ALTER TABLE public.clone_sites                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_configs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_checkouts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_active_deployments       ENABLE ROW LEVEL SECURITY;

-- Audience migration
ALTER TABLE public.migration_campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_audit_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_suppression_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_signed_links           ENABLE ROW LEVEL SECURITY;

-- Prisma metadata (exposes migration history — lock it down too)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  ) THEN
    EXECUTE 'ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;
