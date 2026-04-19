# EXT-3C — `SYNC_NOW` implementation

## Context

This row implements **Phase 3.C** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): **`syncNow`** reads the Patreon `session_id` cookie, hashes it, skips redundant POSTs when unchanged, and POSTs to **`https://relayapp.me/api/v1/patreon/cookie`** with **`Authorization: Bearer`** from the stored grant. It centralizes HTTP + error reasons for **`EXT-3B`** alarms, external messages, and popup **`SYNC_NOW`**.

## Preconditions

- [ ] `EXT-2V-phase2-verify-prompt.md` shipped.
- [ ] `EXT-3A-storage-shape-prompt.md` shipped — `getGrant`, `setLastSync`, `clearGrant`, etc.
- [ ] `EXT-3D-cross-browser-shim-prompt.md` shipped — `browser.cookies.get` via polyfill.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Cookie ingest is POST** to `/api/v1/patreon/cookie` per plan and [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md). **`chrome.cookies.get` and `cookie.value` are never logged** (P-5 + §3.C critical notes). Use a **`DEBUG`** flag default **`false`** in production builds for any `console.log`.

## Goal

Implement `syncNow` (and `SyncResult` type) per plan listing, using `storage` helpers and `browser.cookies.get` for Patreon URL + `session_id`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.C — `SYNC_NOW` implementation (full code block).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0 — P-9 self-hosting: **`RELAY_BASE`** is `https://relayapp.me` hard-coded per plan (no user-configurable API URL).
3. [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md).
4. **Handoff** from `EXT-3A` — storage API.
5. **Handoff** from `EXT-0A` — POST body uses `creator_id` + `session_id` field names matching server.

## Implementation steps

### Part A — Constants + crypto

1. Define **`PATREON_URL`** and **`RELAY_BASE`** per plan (Patreon: `https://www.patreon.com` or full URL shape expected by `browser.cookies.get` — match MDN / Chrome API contract).

2. Implement **`sha256`** over cookie value (SubtleCrypto in worker or small helper); return hex string for `hash`.

### Part B — `syncNow` (verbatim structure from plan)

3. **New file** e.g. `extension/src/lib/sync-now.ts` (or `sync.ts`) exporting:

   ```ts
   // extension/src/lib/sync-now.ts
   export type SyncResult =
     | { ok: true; status: "stored" | "unchanged" }
     | { ok: false; reason: "no_grant" | "no_patreon_cookie" | "grant_revoked" | "rate_limited" | "http_error"; detail?: string };
   ```

4. Implement **`syncNow`** body per plan — copy logic from [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.C code block (lines 378–412): grant check, `browser.cookies.get`, hash, skip if unchanged, `fetch` POST with Bearer, handle **401** → `clearGrant()`, **429** → `rate_limited`, non-OK → `http_error`, success → `setLastSync`.

5. **Do not** `console.log` cookie value or include `cookie.value` in error strings.

### Part C — Audits

6. **Logging grep:**

   ```bash
   rg "console\.log\(" extension/src/lib/sync-now.ts extension/src/lib/sync.ts 2>/dev/null || true
   rg "cookie\.value" extension/src/
   ```

   Any `cookie.value` usage must be **only** for hash + JSON body, never logged.

7. **Dev vs prod DEBUG:** ensure production build defines `DEBUG=false` or strips logs (Vite `define`).

## Acceptance criteria

- [ ] `syncNow` matches plan control flow: no grant, no cookie, hash dedupe, POST, 401 clears grant, 429, generic errors.
- [ ] `cd extension && npm run build:chrome:dev` succeeds.
- [ ] `rg "console\.log\(.*cookie" extension/src/` returns **no** hits that would log `cookie.value` (plan §3.E / `EXT-3V`).
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Wiring alarms and `onMessageExternal` (`EXT-3B`).
- Popup retry button (`EXT-4A`).

## Handoff

Delta Out:

- Exported function name(s) and `SyncResult` paths.
- Exact `fetch` URL and JSON keys for POST body.
- How **429** surfaces to popup (background message shape).

Next claimable: `EXT-3B-background-worker-prompt.md` (import `syncNow`), then `EXT-3V-phase3-verify-prompt.md` after 3B merges.
