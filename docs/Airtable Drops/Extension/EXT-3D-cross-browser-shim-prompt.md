# EXT-3D — Cross-browser shim (`browser.ts`)

## Context

This row implements **Phase 3.D** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a **single import path** for WebExtensions APIs. Chrome MV3 and Firefox builds both use `import browser from "./lib/browser"` everywhere else; this file re-exports **`webextension-polyfill`**. It is the only browser-specific entry point — no scattered `chrome.*` vs `browser.*` in business logic after migration.

## Preconditions

- [ ] `EXT-2V-phase2-verify-prompt.md` shipped green.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **N/A** — shim only; must not introduce logging of secrets.

## Goal

Add `extension/src/lib/browser.ts` that default-exports the polyfill; refactor any existing `extension/src/**/*.ts` files that use raw `chrome` globals to use `browser` from this module (except manifest-only concerns).

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.D — Cross-browser shim.
2. `extension/package.json` — `webextension-polyfill` dependency from Phase 2.A.
3. `extension/tsconfig.json` — module resolution for ESM default import.

## Implementation steps

1. **New** `extension/src/lib/browser.ts`:

   ```ts
   // extension/src/lib/browser.ts
   import browser from "webextension-polyfill";
   export default browser;
   ```

   Adjust if project uses `import * as browser` per bundler — match Vite + TS defaults; polyfill package typings from `@types/firefox-webext-browser` / polyfill’s own types.

2. **Refactor** existing extension TS (stubs from Phase 2, `storage.ts`, `background.ts`, `popup.ts` as they land) to **`import browser from "./lib/browser"`** (correct relative path per file).

3. **Audit** stray `chrome.` usage in TS sources (manifest JSON may still say `chrome` — ignore JSON):

   ```bash
   rg "\bchrome\." extension/src --glob "*.ts"
   ```

   Target: **zero** hits in application TS after refactor (or only in comments documenting MV3 naming).

4. **Build** both targets if CI supports Firefox:

   ```bash
   cd extension && npm run build:chrome:dev
   # npm run build:firefox:prod — if defined
   ```

## Acceptance criteria

- [ ] `extension/src/lib/browser.ts` exists and is the canonical import.
- [ ] `rg "\bchrome\." extension/src --glob "*.ts"` returns no unintended usages (document any allowed exceptions).
- [ ] `npm run build:chrome:dev` succeeds.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Changing `manifest.firefox.prod.json` structure (`EXT-2B` owns).
- Business logic in `background` / `sync` (`EXT-3B`, `EXT-3C`).

## Handoff

Delta Out:

- Default import vs namespace import decision for bundler compatibility.
- Any `// @ts-expect-error` needed for polyfill typings.

Next claimable: `EXT-3A-storage-shape-prompt.md` (if not done), `EXT-3C-sync-now-prompt.md`, `EXT-3B-background-worker-prompt.md`.
