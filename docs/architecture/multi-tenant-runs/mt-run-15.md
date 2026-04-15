# Multi-tenant run 15 — Web Patreon connect uses prepare + state (MT-035)

| | |
|---|---|
| **Step IDs** | `MT-035` |
| **Sort order** | 57 |
| **Precondition** | **MT-033** (bridge token) + **MT-034** (ownership). Patreon app redirect URIs registered for production. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. Implement **MT-035** only: **web creator Patreon OAuth** flow — no user-typed `creator_id` / `state`.

### Flow (must implement)

1. User has **Relay Bearer** (from email login or **MT-033** bridge) and has called **creator workspace** (MT-032) so `relay_creator_id` is known (from API response or follow-up `GET` if you add one).

2. **Prepare:** `POST /api/v1/auth/patreon/creator/prepare` with `{ creator_id }` = workspace id → receive `state`.

3. **Authorize URL:** Patreon OAuth URL includes `state` from server — **not** the raw creator id as state.

4. **Callback page** (e.g. under `web/app/patreon/`): reads `code`, calls **`POST /api/v1/auth/patreon/exchange`** with `creator_id`, `code`, `redirect_uri`, **`state`**, and **`Authorization: Bearer`** same session.

5. **Remove or gate** manual `creator_id` text fields on production **`/patreon/connect`** (dev-only flag OK).

### Files to touch (indicative)

- `web/app/patreon/connect/*` or `PatreonConnectClient.tsx`
- `web/lib/relay-api.ts` if adding `postPatreonCreatorPrepare` / updating exchange helper

### Verify

- Manual: local or staging — workspace → prepare → OAuth → exchange returns healthy.
- `npm run lint` / `npm run build` in `web/`.

### Airtable

Complete **MT-035**; **Next run prompt** → `mt-run-16.md`.
```
