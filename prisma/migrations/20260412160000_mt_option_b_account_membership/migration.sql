-- Option B: global Account + TenantMembership; remove patron from `users`; session + patron M9 tables → memberships.

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('patron');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "email_hash" TEXT,
    "email_norm" TEXT,
    "password_hash" TEXT,
    "identity_auth_provider" "IdentityAuthProvider" NOT NULL,
    "patron_patreon_user_id" TEXT,
    "legacy_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'patron',
    "tier_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "legacy_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patron_campaign_access" (
    "id" TEXT NOT NULL,
    "tenant_membership_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patron_campaign_access_pkey" PRIMARY KEY ("id")
);

-- Unique indexes (accounts)
CREATE UNIQUE INDEX "accounts_email_norm_key" ON "accounts"("email_norm");
CREATE UNIQUE INDEX "accounts_patron_patreon_user_id_key" ON "accounts"("patron_patreon_user_id");

-- FKs for tenant_memberships
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "tenant_memberships_account_id_tenant_id_key" ON "tenant_memberships"("account_id", "tenant_id");
CREATE INDEX "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");

-- FK patron_campaign_access
ALTER TABLE "patron_campaign_access" ADD CONSTRAINT "patron_campaign_access_tenant_membership_id_fkey" FOREIGN KEY ("tenant_membership_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "patron_campaign_access_tenant_membership_id_relay_creator_id_campaign_id_key" ON "patron_campaign_access"("tenant_membership_id", "relay_creator_id", "campaign_id");
CREATE INDEX "patron_campaign_access_relay_creator_id_campaign_id_idx" ON "patron_campaign_access"("relay_creator_id", "campaign_id");

-- ---------------------------------------------------------------------------
-- Data: accounts + tenant_memberships from legacy patron `users` rows
-- Deterministic account ids from dedupe_key so two INSERTs match without temp tables.
-- ---------------------------------------------------------------------------
WITH _mt_patron_src AS (
  SELECT
    u.id AS user_id,
    u.tenant_id,
    COALESCE(
      NULLIF(TRIM(u.patron_patreon_user_id), ''),
      'email:' || COALESCE(lower(trim(u.email_norm)), u.id)
    ) AS dedupe_key,
    u.email_norm,
    u.email_hash,
    u.password_hash,
    u.identity_auth_provider,
    u.patron_patreon_user_id,
    u.tier_ids,
    u.legacy_file_id,
    u.created_at,
    u.updated_at
  FROM "users" u
  WHERE u.kind::text = 'patron'
),
_mt_account_seed AS (
  SELECT DISTINCT ON (dedupe_key)
    dedupe_key,
    ('acc_mt_' || md5(dedupe_key::text)) AS account_id,
    email_norm,
    email_hash,
    password_hash,
    identity_auth_provider,
    patron_patreon_user_id,
    legacy_file_id,
    created_at,
    updated_at
  FROM _mt_patron_src
  ORDER BY dedupe_key, created_at ASC
)
INSERT INTO "accounts" ("id", "email_norm", "email_hash", "password_hash", "identity_auth_provider", "patron_patreon_user_id", "legacy_file_id", "created_at", "updated_at")
SELECT
  s.account_id,
  s.email_norm,
  s.email_hash,
  s.password_hash,
  s.identity_auth_provider,
  s.patron_patreon_user_id,
  s.legacy_file_id,
  s.created_at,
  s.updated_at
FROM _mt_account_seed s;

WITH _mt_patron_src AS (
  SELECT
    u.id AS user_id,
    u.tenant_id,
    COALESCE(
      NULLIF(TRIM(u.patron_patreon_user_id), ''),
      'email:' || COALESCE(lower(trim(u.email_norm)), u.id)
    ) AS dedupe_key,
    u.tier_ids,
    u.legacy_file_id,
    u.created_at,
    u.updated_at
  FROM "users" u
  WHERE u.kind::text = 'patron'
),
_mt_account_seed AS (
  SELECT DISTINCT ON (dedupe_key)
    dedupe_key,
    ('acc_mt_' || md5(dedupe_key::text)) AS account_id
  FROM _mt_patron_src
  ORDER BY dedupe_key, created_at ASC
)
INSERT INTO "tenant_memberships" ("id", "account_id", "tenant_id", "role", "tier_ids", "legacy_file_id", "created_at", "updated_at")
SELECT
  p.user_id,
  seed.account_id,
  p.tenant_id,
  'patron'::"TenantRole",
  p.tier_ids,
  p.legacy_file_id,
  p.created_at,
  p.updated_at
FROM _mt_patron_src p
JOIN _mt_account_seed seed ON seed.dedupe_key = p.dedupe_key;

-- ---------------------------------------------------------------------------
-- Sessions → tenant_membership_id (patron sessions only)
-- ---------------------------------------------------------------------------
ALTER TABLE "sessions" ADD COLUMN "tenant_membership_id" TEXT;

UPDATE "sessions" s
SET "tenant_membership_id" = s.user_id
FROM "users" u
WHERE s.user_id = u.id AND u.kind::text = 'patron';

DELETE FROM "sessions" WHERE "tenant_membership_id" IS NULL;

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";
DROP INDEX IF EXISTS "sessions_user_id_expires_at_idx";
ALTER TABLE "sessions" DROP COLUMN "user_id";
ALTER TABLE "sessions" ALTER COLUMN "tenant_membership_id" SET NOT NULL;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_membership_id_fkey" FOREIGN KEY ("tenant_membership_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sessions_tenant_membership_id_expires_at_idx" ON "sessions"("tenant_membership_id", "expires_at");

-- ---------------------------------------------------------------------------
-- PatronProfile
-- ---------------------------------------------------------------------------
ALTER TABLE "patron_profiles" ADD COLUMN "tenant_membership_id" TEXT;

UPDATE "patron_profiles" SET "tenant_membership_id" = "user_id";

ALTER TABLE "patron_profiles" DROP CONSTRAINT "patron_profiles_user_id_fkey";
DROP INDEX IF EXISTS "patron_profiles_user_id_key";
ALTER TABLE "patron_profiles" DROP COLUMN "user_id";
ALTER TABLE "patron_profiles" ALTER COLUMN "tenant_membership_id" SET NOT NULL;

CREATE UNIQUE INDEX "patron_profiles_tenant_membership_id_key" ON "patron_profiles"("tenant_membership_id");
ALTER TABLE "patron_profiles" ADD CONSTRAINT "patron_profiles_tenant_membership_id_fkey" FOREIGN KEY ("tenant_membership_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Patron OAuth → Account
-- ---------------------------------------------------------------------------
ALTER TABLE "patron_oauth_credentials" ADD COLUMN "account_id" TEXT;

UPDATE "patron_oauth_credentials" p
SET "account_id" = tm.account_id
FROM "tenant_memberships" tm
WHERE p.user_id = tm.id;

DELETE FROM "patron_oauth_credentials" WHERE "account_id" IS NULL;

-- Collapse duplicate rows per account (merge edge case).
DELETE FROM "patron_oauth_credentials" p
WHERE p.id NOT IN (
  SELECT DISTINCT ON (account_id) id
  FROM "patron_oauth_credentials"
  ORDER BY account_id, updated_at DESC
);

ALTER TABLE "patron_oauth_credentials" DROP CONSTRAINT "patron_oauth_credentials_user_id_fkey";
ALTER TABLE "patron_oauth_credentials" DROP COLUMN "user_id";
ALTER TABLE "patron_oauth_credentials" ALTER COLUMN "account_id" SET NOT NULL;
CREATE UNIQUE INDEX "patron_oauth_credentials_account_id_key" ON "patron_oauth_credentials"("account_id");
ALTER TABLE "patron_oauth_credentials" ADD CONSTRAINT "patron_oauth_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- M9 tables: repoint FK to tenant_memberships (column name unchanged in DB)
-- ---------------------------------------------------------------------------
ALTER TABLE "patron_follows" DROP CONSTRAINT "patron_follows_patron_user_id_fkey";
ALTER TABLE "patron_follows" ADD CONSTRAINT "patron_follows_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patron_entitlement_snapshots" DROP CONSTRAINT "patron_entitlement_snapshots_patron_user_id_fkey";
ALTER TABLE "patron_entitlement_snapshots" ADD COLUMN "campaign_id" TEXT;
ALTER TABLE "patron_entitlement_snapshots" ADD CONSTRAINT "patron_entitlement_snapshots_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "patron_entitlement_snapshots_campaign_id_idx" ON "patron_entitlement_snapshots"("campaign_id");

ALTER TABLE "feed_cursors" DROP CONSTRAINT "feed_cursors_patron_user_id_fkey";
ALTER TABLE "feed_cursors" ADD CONSTRAINT "feed_cursors_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_patron_user_id_fkey";
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_patron_user_id_fkey" FOREIGN KEY ("patron_user_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Remove legacy patron users; trim creator `users` columns
-- ---------------------------------------------------------------------------
DELETE FROM "users" WHERE kind::text = 'patron';

DROP INDEX IF EXISTS "users_tenant_id_email_norm_idx";

ALTER TABLE "users" DROP COLUMN IF EXISTS "email_hash";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_norm";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "users" DROP COLUMN IF EXISTS "patron_patreon_user_id";

-- Replace UserKind enum (remove `patron`)
CREATE TYPE "UserKind_new" AS ENUM ('creator', 'staff');
ALTER TABLE "users" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "kind" TYPE "UserKind_new" USING ("kind"::text::"UserKind_new");
DROP TYPE "UserKind";
ALTER TYPE "UserKind_new" RENAME TO "UserKind";

-- CreatorProfile: index on patreon_campaign_id (non-unique lookup aid; unique index already exists)
CREATE INDEX IF NOT EXISTS "creator_profiles_patreon_campaign_id_idx" ON "creator_profiles"("patreon_campaign_id");
