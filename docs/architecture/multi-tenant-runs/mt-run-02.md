# Multi-tenant run 02 — Auth API + IdentityService account flows (MT-007, MT-008)

| | |
|---|---|
| **Step IDs** | `MT-007` · `MT-008` |
| **Sort order** | 7–8 |
| **Precondition** | MT-001–MT-006 Complete. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Airtable Step IDs MT-007 and MT-008 only.

Goal: Expose **signup/login** that creates or resolves a global **Account** (email/password) and issues a session compatible with `Session` + `TenantMembership` in Prisma — without requiring `creator_id` for the **first** account creation. Keep backward compatibility where production still uses legacy routes.

### MT-007 — POST signup/login routes + session contract

- Inspect `src/server.ts` for existing `/api/v1/identity/register`, login, and session cookie/Bearer patterns (search `identity`, `session`, `relay_session`).
- Add **dedicated** routes if needed, e.g. `POST /api/v1/auth/signup` and `POST /api/v1/auth/login` with body `{ email, password }` (names may match existing JSON conventions). Do **not** require `creator_id` on signup for Option B first account.
- Session: reuse existing token hashing and `Session` model (`tokenHash` on `TenantMembership`); if a membership does not exist yet for a pre-creator account, define the minimal behavior (e.g. platform tenant vs deferred session — must be consistent with `docs/architecture/multi-tenant-option-b.md` from run 01).
- Wire env and `.env.example` for any new cookie names or TTLs (placeholders only).

### MT-008 — IdentityService: account-scoped register/login; deprecate creator_id on first signup

- Update `src/identity/identity-service.ts`, `src/identity/identity-store-db.ts`, `src/identity/types.ts` so registration finds/creates **Account** by global email (`emailNorm`) and creates `TenantMembership` rows as required by product rules.
- Legacy: `POST /api/v1/identity/register` may still accept `creator_id` for older clients — document deprecation and forward new clients to `/api/v1/auth/*`. Prefer feature flag or clear comments if both paths must coexist briefly.
- Ensure `findByEmail` / lookups use DB store when `RELAY_DB_STORE_IDENTITY=1`.

Verify:
- `npm run build` at repo root.
- `npm run test` for identity if present; add a small unit test only if there is an existing test pattern for identity.
- Manual or scripted smoke: one signup + one login response includes a session mechanism your web client can use.

Airtable: Complete MT-007 and MT-008; Notes with routes added and example curl **without** secrets.

Out of scope: authz middleware (run 03), creator OAuth (run 04).
```

## Links

- **This run:** [mt-run-02.md](mt-run-02.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-02.md`
- **Next run:** [mt-run-03.md](mt-run-03.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-03.md`

## Handoff

Start **[mt-run-03.md](mt-run-03.md)** (session resolution + enforce tenant ownership on creator routes).
