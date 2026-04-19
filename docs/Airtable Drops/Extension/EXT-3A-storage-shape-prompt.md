# EXT-3A — Storage shape and auth state

## Context

This row implements **Phase 3.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a **typed, async** wrapper over `chrome.storage.local` (Firefox via `webextension-polyfill` from `EXT-3D`). Extension auth and sync state must survive **service worker termination** (~30s idle) — all durable state lives in storage, not module-level variables. This file is **library-only**; `background.ts` wires it in `EXT-3B`.

## Preconditions

- [ ] `EXT-2V-phase2-verify-prompt.md` shipped green — `extension/` builds and loads.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **P-5:** No telemetry from extension code — storage errors may `console.error` generic messages only; **never** log grant token or Patreon cookie values.

## Goal

Ship `extension/src/lib/storage.ts` with strongly-typed getters/setters for `installation_id`, `grant`, and last-sync fields; validate schema; clear corrupt state on mismatch.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.A — Storage shape and auth state.
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.C — Critical correctness (storage vs module `let`).
3. **Handoff** from `EXT-2A` / `EXT-2B` — `extension/` layout and TS config.
4. `extension/src/lib/browser.ts` — after `EXT-3D`, storage should `import browser from "./browser"` (or relative path); if `EXT-3D` not merged yet, use `chrome.storage.local` behind a minimal local wrapper and replace in 3D, **or** land `EXT-3D` before this row (recommended: **3D before or with 3A**).

## Implementation steps

### Part A — API surface

1. **New** `extension/src/lib/storage.ts` — implement async helpers using **`browser.storage.local`** (polyfill). Keys and shapes per plan:

   - **`installation_id`**: `string` (UUID), generated once, immutable for install.
   - **`grant`**: `{ token: string; expires_at: string; account_id: string; relay_creator_id: string; created_at: string }` after successful `consent/exchange`.
   - **`last_sync_at`**, **`last_sync_hash`**, **`last_sync_status`** (use names consistent with `setLastSync` / `getLastSync` ergonomics in §3.C — e.g. a single `last_sync` object or flat keys; document chosen shape in Delta Out).

2. **Validation:** on read, if JSON shape mismatches, **throw** or return a discriminated error and **clear corrupt keys** for that namespace per plan (“clear corrupt state”).

3. **Exports:** at minimum `getInstallationId`, `setInstallationId`, `getGrant`, `setGrant`, `clearGrant`, `getLastSync`, `setLastSync` — names may vary but behaviors must satisfy §3.B / §3.C.

### Part B — Audit

4. **No module-level mutable auth cache:**

   ```bash
   rg "let grant|var grant|const grant =" extension/src/lib/storage.ts
   ```

   Grant must be read from storage each operation (callers in 3B/3C reload via these helpers).

5. **Dependency direction:** `storage.ts` must **not** import `background.ts`.

## Acceptance criteria

- [ ] Unit tests optional — if none, manual: DevTools Application → Extension Storage shows keys after test writes from a scratch script or temporary harness.
- [ ] `cd extension && npm run build:chrome:dev` succeeds after wiring imports (may require `EXT-3D` for `browser`).
- [ ] `npm run test` at repo root if extension tests exist; otherwise extension build is the gate.
- [ ] No ESLint errors in new file.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- `background.ts` listeners (`EXT-3B`).
- `syncNow` HTTP logic (`EXT-3C`).
- Popup UI (`EXT-4A`).

## Handoff

Delta Out:

- Exact storage key strings and TypeScript types exported.
- Whether `last_sync` is one object or multiple keys.
- Polyfill import path used (`./browser` vs `chrome`).

Next claimable: `EXT-3D-cross-browser-shim-prompt.md` (often landed before/with this row); `EXT-3C-sync-now-prompt.md`; `EXT-3B-background-worker-prompt.md` **after** 3A+3C+3D modules exist on branch.
