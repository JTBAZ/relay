# Bootstrap creator-owned identity (EH-030 Path A / EH-031 Path B)

This kit does **not** create a cloud project and does **not** paste secrets into chat or git.

Choose **one** path. Do not mix migration `0002` (Supabase `auth.users`) with `0003` (portable) on the same database.

---

## Path A — Supabase Auth/Postgres (EH-030)

### 1. Create a Supabase project (human gate)

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project you own.
2. Note **Project URL**, **anon/publishable key**, and **service_role** key from **Project Settings → API**.
3. Store keys only in your host secret store or local `.env.local` (gitignored).

### 2. Apply migrations

In the SQL editor (or CLI), apply in order:

1. `db/migrations/0001_preview_chassis.sql`
2. `db/migrations/0002_identity_rls.sql`

Confirm `eh_schema_migrations` contains `0001_preview_chassis` and `0002_identity_rls`.

### 3. Environment names (Path A)

| Name | Where used |
|------|------------|
| `ESCAPE_HATCH_IDENTITY_PROVIDER` | Optional `supabase` (or unset with real Supabase env for EH-030 auto-select) |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + user-scoped server client |
| `SUPABASE_URL` | Optional alias for server if public URL unset |
| `SUPABASE_ANON_KEY` | Optional alias for server if public anon unset |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — bootstrap, recovery, staff jobs |

`npm run build` succeeds with these unset (local-preview mode).

### 4. Seed site + admin membership (Path A)

Use the **service role** only in a one-off server script or SQL editor session you control.

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

### 5. Key rotation (Path A)

1. Rotate anon + service_role in Supabase dashboard.
2. Update host secrets / `.env.local` — **do not** commit.
3. Revoke old sessions if compromise is suspected (Auth → Users → sign out).
4. Service role compromise: rotate immediately; audit `eh_site_memberships` and entitlement rows.

---

## Path B — portable Postgres (EH-031)

Auth choice: **app-managed users** with **scrypt** password hashes (Node `crypto`) and **opaque session tokens** (SHA-256 hash stored in `eh_sessions`; raw token in httpOnly cookie). Magic-link remains Path A only.

### 1. Start loopback Postgres (optional Compose)

```bash
docker compose --profile db up -d
```

Binds **`127.0.0.1:5433` only**. Dev password is for local use — never expose the profile publicly. Init applies `0001` + `0003` from `db/docker-init/`.

Or point `DATABASE_URL` at any creator-owned Postgres and apply migrations manually.

### 2. Apply migrations (if not using Compose init)

```bash
psql "$DATABASE_URL" -f db/migrations/0001_preview_chassis.sql
psql "$DATABASE_URL" -f db/migrations/0003_portable_identity.sql
```

Confirm `eh_schema_migrations` contains `0001_preview_chassis` and `0003_portable_identity`. **Do not** apply `0002_identity_rls.sql` on Path B.

### 3. Environment names (Path B)

| Name | Where used |
|------|------------|
| `ESCAPE_HATCH_IDENTITY_PROVIDER` | Must be `portable` (never auto-selected) |
| `DATABASE_URL` | Postgres connection string |
| `ESCAPE_HATCH_SESSION_SECRET` | Server pepper for session token hashing |
| `ESCAPE_HATCH_COOKIE_SECURE` | Optional `1` to force Secure cookies |

Example Compose URL (dev only):  
`postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch`

### 4. Seed operator user + admin membership (Path B)

Generate a scrypt hash with a one-off Node snippet on a trusted machine (never commit the password or hash into git):

```js
// node -e "..." locally — do not paste real passwords into chat or repos
const { scryptSync, randomBytes } = require("crypto");
const salt = randomBytes(16);
const key = scryptSync("YOUR_PASSWORD_HERE", salt, 64, { N: 16384, r: 8, p: 1 });
console.log(["scrypt","16384","8","1",salt.toString("base64url"),key.toString("base64url")].join("$"));
```

Or use the kit helper `portableHashPasswordForBootstrap` from `lib/portable-auth` in a local script.

```sql
-- 1) Site row
INSERT INTO eh_sites (id, handle, display_name)
VALUES ('YOUR_SITE_ID', 'your-handle', 'Your display name')
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- 2) Operator user (replace YOUR_SCRYPT_HASH)
INSERT INTO eh_users (id, email, password_hash, display_name)
VALUES (
  'YOUR_USER_UUID',
  'operator@example.com',
  'YOUR_SCRYPT_HASH',
  'Operator'
)
ON CONFLICT (email) DO NOTHING;

-- 3) Profile + admin membership
INSERT INTO eh_profiles (auth_user_id, display_name, email_hint)
VALUES ('YOUR_USER_UUID', 'Operator', 'operator@example.com')
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO eh_site_memberships (id, site_id, auth_user_id, role)
VALUES (
  'mem_admin_YOUR_SITE_ID',
  'YOUR_SITE_ID',
  'YOUR_USER_UUID',
  'admin'
)
ON CONFLICT (site_id, auth_user_id) DO UPDATE
SET role = 'admin', updated_at = NOW();

UPDATE eh_sites
SET owner_auth_user_id = 'YOUR_USER_UUID', updated_at = NOW()
WHERE id = 'YOUR_SITE_ID';
```

Sign in at `/login` (portable form) via **POST** `/auth/portable/login`.

### 5. Key / password rotation (Path B)

1. Rotate `ESCAPE_HATCH_SESSION_SECRET` → existing sessions become invalid; revoke rows in `eh_sessions`.
2. Re-hash operator passwords (scrypt) and update `eh_users.password_hash`.
3. Rotate Postgres credentials in `DATABASE_URL` via the host secret store.
4. Never commit secrets; never ship session secret or password hashes to the browser.

### 6. RLS note (Path B)

After validating a session, the server sets `eh.user_id` (`SET LOCAL` / `set_config`) so policies use `eh_private.current_user_id()` — **not** `auth.uid()`. Non-staff cannot SELECT premium post/media metadata (same honesty bar as Path A until EH-032).

---

## Honesty (both paths)

- Soft demo personas on `/preview` are **not** entitlements and **never** authorize admin.
- `productionSafe` remains **false** until EH-033 private media and broader gates land.
- Auth/DB adapter health may report configured readiness when env is real and non-placeholder; that is **not** a production-safe deploy claim.
