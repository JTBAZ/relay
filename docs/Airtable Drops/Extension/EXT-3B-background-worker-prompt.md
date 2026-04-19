# EXT-3B — Background service worker

## Context

This row implements **Phase 3.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): replace Phase 2 stubs with the real **`extension/src/background.ts`** — install + alarm, popup messages, **external** message from `https://relayapp.me/extension/authorize`, cookie change listener, and orchestration of **`syncNow`** from `EXT-3C`. No long-lived module state: always read grant/sync from **`EXT-3A`** storage.

## Preconditions

- [ ] `EXT-2V-phase2-verify-prompt.md` shipped.
- [ ] `EXT-3A-storage-shape-prompt.md` shipped.
- [ ] `EXT-3C-sync-now-prompt.md` shipped — `syncNow` export available.
- [ ] `EXT-3D-cross-browser-shim-prompt.md` shipped — `import browser from "./lib/browser"`.
- [ ] `EXT-1V-phase1-verify-prompt.md` shipped recommended — consent page live for E2E manual tests.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **External messages:** only accept senders whose URL starts with **`https://relayapp.me/`**. **`chrome.cookies.get` / `cookie.value` must never be logged** (§3.C). Revoke path: **`DELETE /api/v1/auth/extension/grants/:id`** when clearing grant from popup (`REVOKE_LOCAL`) — optional server call if grant exists per plan.

## Goal

`background.ts` implements all five listener groups from plan §3.B, calling `syncNow` for alarm, cookie change, post-consent, and popup `SYNC_NOW`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.B — Background worker (numbered list 1–5).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.A — consent tab URL query shape: `https://relayapp.me/extension/authorize?ext_id=<self>&installation_id=<id>&label=<ua>`.
3. **Handoff** from `EXT-0C` — `consent/exchange` request body and response; `DELETE` grants path.
4. `extension/src/lib/storage.ts`, `extension/src/lib/sync-now.ts`, `extension/src/lib/browser.ts`.

## Implementation steps

### Part A — Install + alarm

1. **`browser.runtime.onInstalled`**: if `installation_id` missing, generate UUID and persist via storage helper. Create **`browser.alarms`** named **`relay-cookie-refresh`** with **12-hour** period (plan: set on install; document `periodInMinutes` math).

### Part B — Internal messages (popup)

2. **`browser.runtime.onMessage`** handle:
   - **`START_CONSENT`**: open tab to `https://relayapp.me/extension/authorize?ext_id=<runtime.id>&installation_id=<from storage>&label=<encode UA>` — use `encodeURIComponent` for label/UA; return **tab id** to popup.
   - **`SYNC_NOW`**: call `syncNow()`, return `SyncResult`.
   - **`REVOKE_LOCAL`**: `clearGrant` from storage; optionally **`fetch` DELETE** `https://relayapp.me/api/v1/auth/extension/grants/:tokenId` if plan requires server revoke — use token/session id field from grant storage (align with `EXT-0C` list/delete shape).
   - **`STATUS`**: return `{ hasGrant, lastSyncAt, lastSyncStatus, accountId, relayCreatorId }` from storage (map field names to popup needs).

### Part C — External message (consent page)

3. **`browser.runtime.onMessageExternal`**: reject if `sender.url` does not start with **`https://relayapp.me/`**.

4. On **`RELAY_CONSENT_CODE`**: **`fetch` POST** `https://relayapp.me/api/v1/auth/extension/consent/exchange` with payload per `EXT-0C` (code + installation metadata as server expects). On success, **`setGrant`**, then **`await syncNow()`** (or fire-and-forget with error capture per UX). On failure, persist error state for popup and return error to sender.

### Part D — Alarms + cookies

5. **`browser.alarms.onAlarm`**: if name is `relay-cookie-refresh`, run `syncNow()` (no-op if no grant).

6. **`browser.cookies.onChanged`**: if `cookie.name === "session_id"` and host matches Patreon domain and **`removed === false`**, call `syncNow()`.

### Part E — Audits

7. **No module-scoped grant cache:**

   ```bash
   rg "^let |^var " extension/src/background.ts
   ```

8. **No cookie value logging:**

   ```bash
   rg "console\.log" extension/src/background.ts
   ```

## Acceptance criteria

- [ ] All message types and listeners behave per plan §3.B.
- [ ] External messages from non-`https://relayapp.me/` origins rejected.
- [ ] `cd extension && npm run build:chrome:dev` succeeds; load unpacked — service worker starts without throw.
- [ ] Manual smoke (with API + web running): complete consent end-to-end stores grant (deferred full matrix to `EXT-3V`).
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Popup UI states (`EXT-4A`).
- Changing server consent contract (`EXT-0C`).

## Handoff

Delta Out:

- Message type string literals (must match `EXT-4A` popup).
- How **`ext_id`** is obtained (`browser.runtime.id` Chrome vs Firefox differences if any).
- Grant field used for **`DELETE .../grants/:tokenId`**.

Next claimable: `EXT-3V-phase3-verify-prompt.md` after this merges with 3A+3C+3D.
