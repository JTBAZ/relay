# Multi-tenant run 12 — Creator workspace provisioning API (MT-032)

| | |
|---|---|
| **Step IDs** | `MT-032` |
| **Sort order** | 54 |
| **Precondition** | **MT-031** merged: `Account` can own a `primaryRelayCreatorId` (or equivalent). |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-032** only: **`POST /api/v1/creator/workspace`** (name may vary if you align with existing naming) — **idempotent** creator workspace provisioning.

### Behavior

1. **Auth:** Caller must resolve to an `Account` (use the same Bearer / session pattern as other account-scoped routes — if only opaque Relay session exists today, use `requirePatronBearerSession` + `getAccountIdForSession`; do **not** implement Supabase bridge here — that is MT-033).

2. **Idempotent GET-or-create:**
   - If `Account.primaryRelayCreatorId` (or workspace table) is already set, return `{ relay_creator_id, account_id }`.
   - Else: generate a new stable `relay_creator_id` (e.g. prefix + cuid), `upsert` `Tenant` with that `relayCreatorId`, create **`User`** with `kind: creator` and **`CreatorProfile`** placeholder under that tenant, persist ownership on `Account`, return the same JSON shape.

3. **Errors:** 401 unauthenticated, 503 if DB not configured, 409/500 only on real conflicts.

4. **Tests:** HTTP test with mocked or test DB: first call creates, second call returns same id.

### Out of scope

- Patreon OAuth `prepare` / `exchange` changes (MT-034), Supabase session bridge (MT-033), Next.js (MT-036).

### Verify

- `npm run test` for new tests; `npm run build`.

### Airtable

Complete **MT-032**; **Next run prompt** → `mt-run-13.md`.
```
