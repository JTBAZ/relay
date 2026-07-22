# Database path (EH-030)

This kit ships **portable SQL** under `db/schema/` and `db/migrations/`.

| File | Purpose |
|------|---------|
| `migrations/0001_preview_chassis.sql` | Sites, tiers, posts, media registry |
| `migrations/0002_identity_rls.sql` | Profiles, memberships, entitlement snapshots, RLS |
| `schema/` | Cumulative reference DDL (not auto-applied) |

## Apply (creator-owned Supabase)

1. Create a Supabase project (human gate — not automated here).
2. Open **SQL Editor** (or `supabase db push` / `psql` against the project).
3. Run `migrations/0001_preview_chassis.sql`, then `migrations/0002_identity_rls.sql`.
4. Set env names from `.env.example` (never commit secrets).
5. Bootstrap an admin membership (see `scripts/bootstrap-identity.md`).

`next build` and local soft-preview **do not** require `DATABASE_URL` or Supabase env.

## RLS summary (fail-closed)

- RLS is **enabled + forced** on all `eh_*` tables.
- Patrons read **only their own** entitlement snapshots and memberships.
- Site **admin/operator** roles manage roster and content for **their site only** (no cross-site leakage).
- **Posts / media SELECT is fail-closed until EH-032** (SQL entitlement evaluator):
  - Non-staff (`anon` and patron members) may read only `access_level = 'public'` **and** (for posts) `published_at IS NOT NULL`.
  - Drafts and `member_only` / `tier_gated` rows are **staff-only** — membership alone never grants blanket SELECT on premium or unpublished rows.
  - Premium **bytes** remain EH-033 (`public/media` coexistence is prototype leakage).
- **Service role** bypasses RLS — use only on the server; never ship in the browser bundle.
- Authorization helpers live in **`eh_private`** (`SECURITY DEFINER`) so policies do not recurse.

Do **not** authorize from client persona `tier_ids`, `user_metadata`, or email text alone.

## Portable path

Postgres without Supabase Auth is **EH-031**. Migration `0002` references `auth.users`.
