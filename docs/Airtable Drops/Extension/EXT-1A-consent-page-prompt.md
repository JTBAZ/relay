# EXT-1A — Extension consent page (`/extension/authorize`)

## Context

This row implements **Phase 1.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): the **web** entry point for the extension handshake. A signed-in user opens this route from the extension popup, reviews what the extension may do, and clicks **Authorize**. The page calls `POST /api/v1/auth/extension/consent/start`, receives `consent_code`, and delivers it to the extension with `chrome.runtime.sendMessage` / `browser.runtime.sendMessage` (paired with `externally_connectable` in the extension manifest from Phase 2). This row is **web-only**; it depends on Phase 0 consent endpoints being live.

## Preconditions

- [ ] `EXT-0V-phase0-verify-prompt.md` shipped green — API auth, consent routes, rate limits, and CORS are on the integration branch.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Consent start is a POST**; the page must not display the Patreon **cookie value** anywhere (P-2 in plan §0 — this page only shows studio/extension context, not secrets).

## Goal

Ship `web/app/extension/authorize/` (server + client), register the route in `web/middleware.ts`, and document `NEXT_PUBLIC_RELAY_EXTENSION_IDS` such that a logged-in user can complete authorize and the extension receives `RELAY_CONSENT_CODE`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.A — Extension consent page.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B — session + API auth patterns for authenticated `relayFetch`.
3. **Handoff** from `EXT-0C-extension-consent-endpoints-prompt.md` — request/response shape for `consent/start`.
4. `web/middleware.ts` — add route next to existing entries (plan cites line **12** for `APP_ROUTES` placement).
5. `web/.env.example` — add `NEXT_PUBLIC_RELAY_EXTENSION_IDS`.
6. Existing patterns: `relayFetch` usage in `web/` (search if needed: `rg "relayFetch" web/app/ --max-count 20`).

## Implementation steps

### Part A — Route + middleware

1. **`web/middleware.ts`** — add `/extension/authorize` to `APP_ROUTES` so logged-out users redirect to `/login` with `returnTo` preserved (plan: sits next to `/creator/connect`).

### Part B — Server + client UI

2. **New** `web/app/extension/authorize/page.tsx` — server component: resolve session per existing app patterns and render the client component with any needed props.

3. **New** `web/app/extension/authorize/AuthorizeClient.tsx` — client component:
   - Read `?ext_id=<id>&installation_id=<uuid>&label=<ua-string>` from the URL.
   - Validate `ext_id` against `process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS` (comma-separated). If no match, render **“This extension is not recognized”** (or equivalent copy).
   - Render authorize card: extension name, label preview, permission summary per plan: *“read your Patreon session_id and store it encrypted in your Relay account”*, and one primary **Authorize** button.
   - On click: `relayFetch('/api/v1/auth/extension/consent/start', { method: 'POST', body: JSON.stringify({ installation_id, label }) })` — adjust field names to match `EXT-0C` / server contract exactly.
   - From response, read `consent_code` (or envelope path the API returns).
   - Call `chrome.runtime.sendMessage(ext_id, { type: "RELAY_CONSENT_CODE", code: consent_code })` when available; if `chrome.runtime` missing, use `browser.runtime` from a feature-detect path suitable for Firefox.
   - Success UI: **“Connected ✓ — you can close this tab.”** (per plan).

4. **Audit:**

   ```bash
   rg "fetch\\(\`?[\"']/api/" web/app/extension/
   rg "document\\.cookie" web/app/extension/
   ```

   Expect **zero** raw `fetch` to `/api/` and **zero** `document.cookie` reads in this route.

### Part C — Env

5. **`web/.env.example`** — document `NEXT_PUBLIC_RELAY_EXTENSION_IDS` (comma-separated extension IDs mirroring server `RELAY_EXTENSION_ORIGINS` IDs portion).

## Acceptance criteria

- [ ] Logged-out user opens `/extension/authorize?ext_id=X&installation_id=Y` → redirects to `/login?returnTo=...`; after login, returns to authorize page with query preserved.
- [ ] Logged-in user sees authorize card; **Authorize** triggers `consent/start` and `sendMessage` path (manual verify with dev extension in Phase 3+; for this row, manual with mocked `chrome.runtime.sendMessage` in DevTools per Phase 1.D is acceptable).
- [ ] Unknown `ext_id` shows not-recognized state.
- [ ] `npm run build --prefix web` passes.
- [ ] `npm run test` at repo root passes (`AGENTS.md` — web tests via root Vitest where applicable).
- [ ] `npm run lint` in `web/` if defined — no new errors in touched files.
- [ ] Tier 0 invariants above remain satisfied.

## Out of scope

- Multiple-grant UX edge cases beyond showing errors; N grants are allowed in v1 ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.A).
- Extension background/popup implementation (`EXT-3*`, `EXT-4*`).
- Filling real Web Store URLs (`EXT-1C` / Phase 7).
- Connected-extensions list page (`EXT-1B`).

## Handoff

Delta Out:

- Exact JSON body keys sent to `consent/start` and response field path for `consent_code`.
- How `NEXT_PUBLIC_RELAY_EXTENSION_IDS` is parsed (trim, empty behavior).
- Any TypeScript typing for `chrome.runtime` / `browser` (e.g. optional global declarations).

Next claimable: `EXT-1B-connected-extensions-page-prompt.md`, `EXT-1C-cookie-page-cta-prompt.md` (parallel); then `EXT-1V-phase1-verify-prompt.md` after all three merge.
