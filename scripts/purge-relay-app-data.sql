-- Purge all Relay *application* rows (Prisma / public app tables) while leaving schema, migrations, and
-- Supabase `auth` / `storage` / system schemas untouched.
--
-- Run with a role that can TRUNCATE (e.g. `postgres` or Supabase SQL Editor / service role):
--   npx prisma db execute --file scripts/purge-relay-app-data.sql
--   # or: psql "$DATABASE_URL" -f scripts/purge-relay-app-data.sql
--
-- Afterward (optional, manual):
--   In Supabase Dashboard → Auth → remove stale users if you want email reuse for the same addresses.
--   R2 / Storage buckets: delete test objects if your intake wrote outside Postgres.
--
-- Does NOT touch: `_prisma_migrations`, `auth.*`, `storage.*`, `realtime.*`, `extensions`, etc.

BEGIN;

SET LOCAL statement_timeout = '5min';

-- Single TRUNCATE: Postgres orders tables; CASCADE catches any straggler FKs from listed tables.
-- RESTART IDENTITY resets serial/identity columns where present (string cuid ids unaffected).
TRUNCATE TABLE
  "comment_reactions",
  "relay_comments",
  "content_reports",
  "moderation_actions",
  "account_blocks",
  "discovery_decision_logs",
  "smart_tag_embeddings",
  "tag_suggestions",
  "webhook_endpoints",
  "sessions",
  "oauth_credentials",
  "provider_accounts",
  "patron_oauth_credentials",
  "notification_delivery_cursor",
  "notifications",
  "notification_preferences",
  "feed_cursors",
  "patron_entitlement_snapshots",
  "patron_campaign_access",
  "patron_follow_seeds",
  "patron_follows",
  "account_follows",
  "patron_profiles",
  "creator_active_deployments",
  "deployments",
  "migration_signed_links",
  "migration_suppression_entries",
  "migration_audit_entries",
  "migration_campaigns",
  "payment_checkouts",
  "payment_configs",
  "clone_sites",
  "patron_saved_collection_entries",
  "patron_saved_collections",
  "patron_favorites",
  "recommendation_outcomes",
  "action_executions",
  "recommendation_records",
  "analytics_snapshots",
  "outbox_events",
  "job_runs",
  "page_layouts",
  "saved_filters",
  "collection_posts",
  "library_collections",
  "post_overrides",
  "ingest_idempotency_keys",
  "creator_sync_states",
  "sync_cursors",
  "media_assets",
  "post_tiers",
  "post_versions",
  "posts",
  "tiers",
  "campaigns",
  "creator_profiles",
  "users",
  "account_deletions",
  "tenant_memberships",
  "accounts",
  "tenants"
RESTART IDENTITY CASCADE;

COMMIT;
