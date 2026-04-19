# EXT-0A — Authenticate `/api/v1/patreon/cookie` endpoints

## Context

This row implements **Phase 0.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): closing the Tier 1 Stage B gap where `POST`/`DELETE` `/api/v1/patreon/cookie` and `GET` `/api/v1/patreon/cookie/status` accepted unauthenticated writes and reads. The Relay browser extension will call these routes with `Authorization: Bearer` (the web app continues to use `relay_session` via `credentials: "include"`). This work item is isolated to those three handlers plus tests; it hardens manual paste and extension ingest equally.

## Preconditions

- [ ] None — first Phase 0 row; assumes existing `requirePatronBearerSession`, `requireAccountMatchesCreator`, and cookie-store helpers are present on the integration branch per the plan’s pre-build audit ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0 findings).

If `requirePatronBearerSession` is missing, mark **Blocked** with Delta Out naming the guardrails prerequisite.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **`relay_session` is `HttpOnly` `SameSite=Lax`; the extension never touches it.** These routes must accept the same auth the web uses: session cookie **or** Bearer — via `requirePatronBearerSession`. Scope writes with `requireAccountMatchesCreator` so the authenticated account’s `primaryRelayCreatorId` matches the request `creator_id`.

## Goal

All three Patreon cookie endpoints require an authenticated account whose creator id matches the requested `creator_id`, with tests proving `401` / `403` / success behavior.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.A — Add auth to `/api/v1/patreon/cookie` endpoints.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B — server authz; every `/api/v1/*` route must use the canonical resolver or be explicitly public.
3. `src/server.ts` — modify the three handlers at lines **1743** (`POST`), **1776** (`DELETE`), **1792** (`GET status`) per the plan.
4. `tests/cookie-ingest-cover-dedupe.test.ts` and `tests/patreon-cookie-oauth-body.test.ts` — add Bearer headers per plan.

## Implementation steps

### Part A — Handlers

1. In `src/server.ts`, for each of the three routes at **1743**, **1776**, and **1792**:
   - Call `await requirePatronBearerSession(req, res, traceId)`; if null, return (handler already sent response).
   - Call `await requireAccountMatchesCreator(req, res, traceId, creatorId)`; if false, return.
   - Keep all existing validation (`validateRequiredFields`, `relayCreatorIdExists`, etc.).

2. **Audit:** Confirm no other code path bypasses auth on these routes:

   ```bash
   rg "/api/v1/patreon/cookie" src/server.ts
   ```

### Part B — Tests

3. Update `tests/cookie-ingest-cover-dedupe.test.ts` and `tests/patreon-cookie-oauth-body.test.ts` to send `Authorization: Bearer <opaque>` where they hit cookie endpoints (existing test sessions should already have an account per plan).

4. **New file** `tests/patreon-cookie-auth.test.ts`:
   - All three endpoints return **401** with no auth.
   - **403** when authenticated as an account whose creator does not match the requested `creator_id`.
   - **200** (or existing success semantics) when auth matches.

## Acceptance criteria

- [ ] `npm run test` passes at repo root; new auth test file included.
- [ ] `curl -X POST "$API/api/v1/patreon/cookie" -d '{"creator_id":"cr_x","session_id":"y"}' -H 'Content-Type: application/json'` returns **401** (no `Authorization`, no session cookie).
- [ ] Manual: web cookie page `web/app/patreon/cookie/page.tsx` still saves and reads status when logged in (uses `relayFetch` + `credentials: "include"`).
- [ ] `npm run build` passes at repo root.
- [ ] No new ESLint errors in touched files (run `npm run lint` at root if defined).
- [ ] Every Tier 0 invariant restated above remains satisfied (manual code review).

## Out of scope

- Changing response shape, encryption format, or file-store schema ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.A).
- Phase 0.B–0.E (`EXT-0B` … `EXT-0E`).
- Web consent page, extension package, CORS allowlist, rate limiting.

## Handoff

Delta Out:

- Three handlers now call `requirePatronBearerSession` + `requireAccountMatchesCreator`; note any helper signature quirks for the next builder.
- New/updated test file paths and how fixtures obtain Bearer tokens.
- Any fixture churn required for unrelated cookie tests.

Next claimable: `EXT-0B-session-kind-extension-ttl-prompt.md`, `EXT-0C-extension-consent-endpoints-prompt.md`, `EXT-0D-rate-limiting-prompt.md`, `EXT-0E-cors-extension-allowlist-prompt.md` (parallel with this row until all Phase 0 build rows merge before `EXT-0V-phase0-verify-prompt.md`).
