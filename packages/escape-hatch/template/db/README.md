# Database path (EH-030 Path A / EH-031 Path B)

This kit ships **portable SQL** under `db/schema/` and `db/migrations/`.

| File | Purpose |
|------|---------|
| `migrations/0001_preview_chassis.sql` | Sites, tiers, posts, media registry |
| `migrations/0002_identity_rls.sql` | **Path A** — profiles, memberships, entitlements, RLS via `auth.uid()` / `auth.users` |
| `migrations/0003_portable_identity.sql` | **Path B** — app-managed users/sessions + same membership shapes, RLS via `eh.user_id` |
| `schema/` | Cumulative reference DDL (not auto-applied) |
| `docker-init/` | Path B Compose init (0001 + 0003 only) |

## Path A — creator-owned Supabase

1. Create a Supabase project (human gate — not automated here).
2. Open **SQL Editor** (or `supabase db push` / `psql` against the project).
3. Run `migrations/0001_preview_chassis.sql`, then `migrations/0002_identity_rls.sql`.
4. Set env names from `.env.example` (never commit secrets).
5. Bootstrap an admin membership (see `scripts/bootstrap-identity.md`).

## Path B — portable Postgres / Docker

1. `docker compose --profile db up -d` (binds `127.0.0.1:5433`) **or** your own Postgres.
2. Compose init applies `docker-init/` (0001 + 0003). Manual: apply `0001` then `0003` via `psql`.
3. Set `ESCAPE_HATCH_IDENTITY_PROVIDER=portable`, `DATABASE_URL`, and `ESCAPE_HATCH_SESSION_SECRET`.
4. Bootstrap operator user + admin membership (see `scripts/bootstrap-identity.md`).

**Do not** apply `0002` on Path B (`auth.users` will not exist). **Do not** mix `0002` and `0003` on one database.

`next build` and local soft-preview **do not** require `DATABASE_URL` or identity env.

## RLS summary (fail-closed)

### Shared honesty (both paths)

- RLS is **enabled** on all `eh_*` content tables (Path B also covers `eh_users` / `eh_sessions`).
- Patrons read **only their own** entitlement snapshots and memberships.
- Site **admin/operator** roles manage roster and content for **their site only**.
- **Posts / media SELECT is fail-closed until EH-032** (SQL entitlement evaluator):
  - Non-staff may read only `access_level = 'public'` **and** (for posts) `published_at IS NOT NULL`.
  - Drafts and `member_only` / `tier_gated` rows are **staff-only** — membership alone never grants blanket SELECT on premium or unpublished rows.
  - Premium **bytes** remain EH-033 (`public/media` coexistence is prototype leakage).
- Authorization helpers live in **`eh_private`** (`SECURITY DEFINER`) so policies do not recurse.

### Path A specifics

- Subject: `auth.uid()` against `auth.users`.
- **Service role** bypasses RLS — use only on the server; never ship in the browser bundle.

### Path B specifics

- Subject: `current_setting('eh.user_id', true)` set by the Node server after session validate.
- App role `eh_app` is the intended least-privilege role for request-scoped queries.
- Server connection used for login/bootstrap is trusted like a service role; do not expose it to the browser.

Do **not** authorize from client persona `tier_ids`, `user_metadata`, or email text alone.
