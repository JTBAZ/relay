# Bootstrap creator-owned identity (EH-030)

This kit does **not** create a Supabase cloud project and does **not** paste secrets into chat or git.

## 1. Create a Supabase project (human gate)

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project you own.
2. Note **Project URL**, **anon/publishable key**, and **service_role** key from **Project Settings → API**.
3. Store keys only in your host secret store or local `.env.local` (gitignored).

## 2. Apply migrations

In the SQL editor (or CLI), apply in order:

1. `db/migrations/0001_preview_chassis.sql`
2. `db/migrations/0002_identity_rls.sql`

Confirm `eh_schema_migrations` contains `0001_preview_chassis` and `0002_identity_rls`.

## 3. Environment names

Copy `.env.example` → `.env.local` and set **names only** (values are secrets):

| Name | Where used |
|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + user-scoped server client |
| `SUPABASE_URL` | Optional alias for server if public URL unset |
| `SUPABASE_ANON_KEY` | Optional alias for server if public anon unset |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — bootstrap, recovery, staff jobs |
| `DATABASE_URL` | Optional direct Postgres (migrations / EH-031) |

`npm run build` succeeds with these unset (local-preview mode).

## 4. Seed site + admin membership (recovery)

Use the **service role** only in a one-off server script or SQL editor session you control.

Replace placeholders (never commit real UUIDs/keys):

```sql
-- 1) Site row (id must match data/site.json site_id)
INSERT INTO eh_sites (id, handle, display_name, owner_auth_user_id)
VALUES (
  'YOUR_SITE_ID',
  'your-handle',
  'Your display name',
  'YOUR_AUTH_USER_UUID'
)
ON CONFLICT (id) DO UPDATE
SET owner_auth_user_id = EXCLUDED.owner_auth_user_id,
    updated_at = NOW();

-- 2) Profile for the admin auth user
INSERT INTO eh_profiles (auth_user_id, display_name)
VALUES ('YOUR_AUTH_USER_UUID', 'Operator')
ON CONFLICT (auth_user_id) DO NOTHING;

-- 3) Admin membership (authorizes /admin mutations when identity is configured)
INSERT INTO eh_site_memberships (id, site_id, auth_user_id, role)
VALUES (
  'mem_admin_YOUR_SITE_ID',
  'YOUR_SITE_ID',
  'YOUR_AUTH_USER_UUID',
  'admin'
)
ON CONFLICT (site_id, auth_user_id) DO UPDATE
SET role = 'admin', updated_at = NOW();
```

Create the auth user first via Supabase Auth (dashboard **Authentication → Users**, or magic-link login on `/login`).

## 5. Key rotation

1. Rotate anon + service_role in Supabase dashboard.
2. Update host secrets / `.env.local` — **do not** commit.
3. Revoke old sessions if compromise is suspected (Auth → Users → sign out).
4. Service role compromise: rotate immediately; audit `eh_site_memberships` and entitlement rows.

## 6. Honesty

- Soft demo personas on `/preview` are **not** entitlements and **never** authorize admin.
- `productionSafe` remains **false** until EH-033 private media and broader gates land.
- Auth/DB adapter health may report configured readiness when env is real and non-placeholder; that is **not** a production-safe deploy claim.
