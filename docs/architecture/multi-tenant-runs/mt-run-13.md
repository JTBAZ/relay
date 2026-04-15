# Multi-tenant run 13 — Supabase ↔ Relay opaque session bridge (MT-033)

| | |
|---|---|
| **Step IDs** | `MT-033` |
| **Sort order** | 55 |
| **Precondition** | **MIG-11** (`POST /api/v1/auth/supabase/sync`) exists. **MT-032** helps ensure studio id exists after signup path; read [`../multi-tenant-cloud-runtime.md`](../multi-tenant-cloud-runtime.md) § MIG-13 sessions. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-033** only: **session bridge** so a user who signs in via **Supabase Auth** can obtain an **opaque Relay Bearer token** usable by `requirePatronBearerSession` (same contract as `POST /api/v1/auth/signup`).

### Preferred approach (C1)

1. **New route** e.g. `POST /api/v1/auth/supabase/relay-session` (exact path up to you; document in `server.ts` JSDoc):
   - Input: `Authorization: Bearer <supabase_access_token>` OR `{ "access_token": "..." }` (mirror `supabase/sync`).
   - Validate with `getSupabaseUserFromAccessToken`.
   - Ensure `Account` via `upsertAccountForSupabaseUser` (reuse MIG-11 logic — avoid duplicating large blocks; extract helper if needed).
   - Ensure **platform** patron `TenantMembership` exists (same as email signup / sync) so `issueSessionForUser` / `createSessionForUser` can attach a `Session`.
   - Return `{ token, expires_at, user_id, creator_id: platform_creator_id, ... }` matching **`POST /api/v1/auth/login`** shape where practical.

2. **Identity:** Map `UserAccount` from membership the same way `loginAccount` does — reuse `DbIdentityStore` helpers; do not fork session hashing.

3. **Tests:** Extend patterns from `tests/supabase-auth-sync-route.test.ts`; assert 401/503 paths.

### Non-goals

- Replacing patron OAuth (separate flows).
- Frontend wiring (MT-036).

### Verify

- `npm run test`; `npm run build`.

### Airtable

Complete **MT-033**; **Next run prompt** → `mt-run-14.md`.
```
