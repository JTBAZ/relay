# Database path (EH-030 Path A / EH-031 Path B / EH-032 entitlements)

This kit ships **portable SQL** under `db/schema/` and `db/migrations/`.

| File | Purpose |
|------|---------|
| `migrations/0001_preview_chassis.sql` | Sites, tiers, posts, media registry |
| `migrations/0002_identity_rls.sql` | **Path A** — profiles, memberships, entitlements, RLS via `auth.uid()` / `auth.users` |
| `migrations/0003_portable_identity.sql` | **Path B** — app-managed users/sessions + same membership shapes, RLS via `eh.user_id` |
| `migrations/0004_entitlement_evaluator_supabase.sql` | **Path A EH-032** — freshness columns, grant audit, entitled SELECT helpers (`auth.uid()`) |
| `migrations/0004_entitlement_evaluator_portable.sql` | **Path B EH-032** — same shapes using `eh_private.current_user_id()` (no `auth.uid()`) |
| `schema/` | Cumulative reference DDL (not auto-applied) |
| `docker-init/` | Path B Compose init (0001 + 0003 + portable 0004) |

## Path A — creator-owned Supabase

1. Create a Supabase project (human gate — not automated here).
2. Open **SQL Editor** (or `supabase db push` / `psql` against the project).
3. Run `migrations/0001_preview_chassis.sql`, then `0002_identity_rls.sql`, then `0004_entitlement_evaluator_supabase.sql`.
4. Set env names from `.env.example` (never commit secrets).
5. Bootstrap an admin membership (see `scripts/bootstrap-identity.md`).

## Path B — portable Postgres / Docker

1. `docker compose --profile db up -d` (binds `127.0.0.1:5433`) **or** your own Postgres.
2. Compose init applies `docker-init/` (0001 + 0003 + entitlement evaluator). Manual: apply `0001`, `0003`, then `0004_entitlement_evaluator_portable.sql` via `psql`.
3. Set `ESCAPE_HATCH_IDENTITY_PROVIDER=portable`, `DATABASE_URL`, and `ESCAPE_HATCH_SESSION_SECRET`.
4. Bootstrap operator user + admin membership (see `scripts/bootstrap-identity.md`).

**Do not** apply `0002` on Path B (`auth.users` will not exist). **Do not** mix `0002` and `0003` on one database. **Do not** apply the Path A `0004_*_supabase` file on Path B.

`next build` and local soft-preview **do not** require `DATABASE_URL` or identity env.

## RLS summary (fail-closed + EH-032 entitlements)

### Shared honesty (both paths)

- RLS is **enabled** on all `eh_*` content tables (Path B also covers `eh_users` / `eh_sessions`).
- Patrons read **only their own** entitlement snapshots, memberships, and grant audit rows.
- Site **admin/operator** roles manage roster and content for **their site only**.
- **Posts / media SELECT (after EH-032 `0004_*`)**:
  - Public published posts require `published_at IS NOT NULL`.
  - Staff retain full site access.
  - Entitled patrons may SELECT `member_only` / `tier_gated` **metadata** when `eh_private.fresh_entitlement_tiers` is non-empty and (for tier_gated) overlaps `required_tier_ids`.
  - Stale / expired / revoked snapshots yield **no** premium metadata SELECT (fail-closed); membership alone never grants blanket SELECT.
  - Premium **bytes** remain EH-033 (`public/media` coexistence is prototype leakage).
- Authorization helpers live in **`eh_private`** (`SECURITY DEFINER`) so policies do not recurse.
- The TypeScript evaluator in `lib/entitlements/` is the app-layer source of truth for UX/API decisions; RLS is defense in depth.

### Path A specifics

- Subject: `auth.uid()` against `auth.users`.
- **Service role** bypasses RLS — use only on the server; never ship in the browser bundle.

### Path B specifics

- Subject: `current_setting('eh.user_id', true)` set by the Node server after session validate.
- App role `eh_app` is the intended least-privilege role for request-scoped queries.
- Server connection used for login/bootstrap is trusted like a service role; do not expose it to the browser.

Do **not** authorize from client persona `tier_ids`, `user_metadata`, or email text alone.
