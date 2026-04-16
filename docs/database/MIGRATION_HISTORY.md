# Prisma migration history vs Supabase (reconciliation)

This note records **why** `prisma migrate deploy` can fail against our Supabase project with **`42710` / “already exists”**, what we do about it **safely**, and **how we operate** afterward so history stays trustworthy.

## Context

The application database may evolve through more than one path over time (for example `prisma db push`, manual SQL in the Supabase SQL editor, or restores). Prisma’s migration ledger lives in Postgres table **`_prisma_migrations`**. If the **real schema** already contains objects that an older migration file would create again, **`migrate deploy`** stops at the first conflicting statement (often **`CREATE TYPE …`**).

That is a **bookkeeping** mismatch between migration files and `_prisma_migrations`, not necessarily a bug in application code. Runtime behavior depends on **`schema.prisma`** matching the **actual** database, not on whether every historical migration row was applied in chronological order.

## When this is safe to fix with `migrate resolve`

Use manual resolution **only** when you have confirmed that the database **already reflects** what that migration would create (duplicate enum, table, index, etc.). If something is genuinely missing, do **not** mark the migration as applied; apply the missing DDL manually or fix drift, then reconcile.

## Commands (repeat until deploy succeeds)

From the repo root, with **`DATABASE_URL`** pointing at the target database (e.g. in `.env`):

### Per failed migration

When `npx prisma migrate deploy` fails with **P3018** and names a **Migration name** (for example `20260410193101_canonical_content`):

```bash
npx prisma migrate resolve --rolled-back "MIGRATION_NAME"
npx prisma migrate resolve --applied "MIGRATION_NAME"
npx prisma migrate deploy
```

If **`--rolled-back`** errors because there is no failed migration record, omit it:

```bash
npx prisma migrate resolve --applied "MIGRATION_NAME"
npx prisma migrate deploy
```

Replace **`MIGRATION_NAME`** with the exact folder name under `prisma/migrations/`. Loop: deploy → on failure, resolve that name → deploy again.

### After deploy completes without error

```bash
npx prisma migrate status
npx prisma validate
npx prisma generate
```

Confirm **`migrate status`** reports no pending migrations for this database.

## Rules after reconciliation

1. Prefer **schema changes** via **`prisma migrate dev`** (local) → commit migration SQL → **`prisma migrate deploy`** in CI/staging/production.
2. Avoid **`prisma db push`** against **shared** environments (staging/production) unless there is an explicit plan to generate a migration and align `_prisma_migrations` afterward.
3. Track one-off reconciliation in your issue tracker (title/date, “manual `migrate resolve --applied` after drift”) so future operators know history was aligned intentionally.

## Relationship to product work

Webhook reliability (and similar features) is **orthogonal** to this reconciliation: feature work proceeds in the repo; **new** migrations must still **apply cleanly** once `_prisma_migrations` matches reality. Keep CI running **`migrate deploy`** (or equivalent) before application start for environments that use Postgres.

## Reconciliation log

### 2026-04-16 — Full ledger reconciliation (P3009 + webhook dual-write)

**Database:** Supabase `db.nxfawnuflagbimcyrsqs.supabase.co` / `postgres`

**Root cause:** Prior `prisma db push` runs created all schema objects (enums, tables, columns, indexes) without recording entries in `_prisma_migrations`. When `migrate deploy` ran, earlier migrations failed with `42710` ("type already exists"). Three migrations had been partially resolved before this session; `20260410193101_canonical_content` remained in a `failed` state (P3009), blocking all subsequent deploys.

**What was done:**

| Migration | Action | Reason |
|-----------|--------|--------|
| `20260410193101_canonical_content` | `--rolled-back` then `--applied` | Failed record (P3009); all objects already present in DB |
| `20260410203626_creator_curation` | `--applied` | No ledger record; tables/indexes exist |
| `20260410205342_operations_dlq` | `--applied` | No ledger record; tables exist |
| `20260410205842_analytics_recommendations` | `--applied` | No ledger record; tables exist |
| `20260410210412_patron_engagement` | `--applied` | No ledger record; tables exist |
| `20260410210802_part2_backend` | `--applied` | No ledger record; tables exist |
| `20260410211038_part2_audience_migration_updated_at_default` | `--applied` | No ledger record; column defaults exist |
| `20260410211404_m9_future_stubs` | `--applied` | No ledger record; tables exist |
| `20260412160000_mt_option_b_account_membership` | `--applied` | No ledger record; accounts/tenant_memberships exist, patron users migrated |
| `20260412200000_account_supabase_user_id` | `--applied` | No ledger record; `supabase_user_id` column exists |
| `20260412213000_media_asset_current_storage_key` | `--applied` | No ledger record; `current_storage_key` column exists |
| `20260414120000_account_primary_relay_creator_id` | `--applied` | No ledger record; column + FK exist |
| `20260414120000_creator_profile_public_slug` | `--applied` | No ledger record; `public_slug` column exists |
| `20260415000000_rls_lockdown_prisma_tables` | `--applied` | No ledger record; RLS enabled on all tables |
| `20260416120000_webhook_endpoint_dual_write` | Applied via `migrate deploy` | Columns were genuinely missing (opaque_delivery_token, patreon_webhook_id, uri_registered, registration_status, webhook_triggers); NOT NULL on encrypted_secret/key_id dropped; unique indexes created |

**Verification:** `prisma migrate status` → "Database schema is up to date", `prisma validate` → valid, `npm run build` → clean, `npm test` → 107 files / 353 tests pass, `web lint` → warnings only (pre-existing).

## References

- Prisma: [Production troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting), [`migrate resolve`](https://www.prisma.io/docs/reference/api-reference/command-reference#migrate-resolve)
- Repo: `prisma/migrations/`, `prisma/schema.prisma`, `prisma.config.ts`
