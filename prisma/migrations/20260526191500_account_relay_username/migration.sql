-- One canonical Relay username per account. This is the source of truth for @mentions.
ALTER TABLE "accounts" ADD COLUMN "username" TEXT;
ALTER TABLE "accounts" ADD COLUMN "username_norm" TEXT;

-- Backfill from existing explicit creator usernames first, then supporter handles.
-- public_slug is intentionally not used: URL slugs are not social aliases.
WITH candidates AS (
  SELECT
    a.id AS account_id,
    cp.username AS username,
    cp.username_norm AS username_norm,
    1 AS priority
  FROM "accounts" a
  JOIN "tenants" t ON t."relay_creator_id" = a."primary_relay_creator_id"
  JOIN "creator_profiles" cp ON cp."tenant_id" = t.id
  WHERE cp.username_norm IS NOT NULL

  UNION ALL

  SELECT
    a.id AS account_id,
    pp.handle AS username,
    pp.handle_norm AS username_norm,
    2 AS priority
  FROM "accounts" a
  JOIN "tenant_memberships" tm ON tm."account_id" = a.id
  JOIN "patron_profiles" pp ON pp."tenant_membership_id" = tm.id
  WHERE pp.handle_norm IS NOT NULL
), ranked AS (
  SELECT
    account_id,
    username,
    username_norm,
    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY priority) AS account_rank,
    ROW_NUMBER() OVER (PARTITION BY username_norm ORDER BY priority, account_id) AS username_rank
  FROM candidates
)
UPDATE "accounts" a
SET "username" = ranked.username,
    "username_norm" = ranked.username_norm
FROM ranked
WHERE ranked.account_id = a.id
  AND ranked.account_rank = 1
  AND ranked.username_rank = 1;

CREATE UNIQUE INDEX "accounts_username_norm_key" ON "accounts"("username_norm");