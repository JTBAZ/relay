# GR-T0-1 — Cookie mirror: HttpOnly `relay_session` + `relay_signed_in` companion

## Context

You are building **Tier 0 primitive #1** of the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md)). The Relay opaque session token currently lives in `localStorage` (`relay_session_token`). This task moves it into an `HttpOnly` `Secure` `SameSite=Lax` cookie set by the API, so JavaScript can never read it (XSS-resistant) and server middleware can guard routes.

This is **infrastructure only.** No guardrail logic ships in this row. Stages 1.1, 1.3, 1.4, 1.7 all build on the cookie shape this row defines.

## Preconditions

- None. This is the root of the dependency graph.
- Confirm the Production Ledger row references this prompt file.

## Tier 0 invariants (always apply)

1. No JS reads `relay_session`. It is `HttpOnly`. Web code never sees the token.
2. The companion `relay_signed_in` cookie is a presence flag only — never a permission grant.
3. The opaque token's contents and lifetime do not change in this row; only the **transport** changes.

## Goal

The API sets two cookies on every successful auth response:
- `relay_session` — `HttpOnly`, `Secure`, `SameSite=Lax`, contains the opaque token.
- `relay_signed_in=1` — **not** `HttpOnly`, `Secure`, `SameSite=Lax`, presence-only flag so SSR / client code can render the right shell without reading the secret.

The web client stops calling `localStorage.setItem("relay_session_token", ...)` and stops sending the `Authorization` bearer for browser fetches; instead all browser fetches use `credentials: "include"`.

## Reference reading (read these files first, in this order)

1. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1 (Tier 0 decisions), §3 Stage A.
2. [`docs/architecture/multi-tenant-cloud-runtime.md`](../../architecture/multi-tenant-cloud-runtime.md) §"Identity and sessions (Bearer tokens) — MIG-13" — confirms the two Bearer schemes.
3. `src/server.ts` — locate the four endpoints listed under "Implementation steps" below.
4. `src/identity/` — note any existing session-issuing helpers; reuse, don't duplicate.
5. `web/lib/relay-auth-bootstrap.ts`, `web/lib/relay-session-logout.ts`, `web/lib/relay-api.ts`, `web/lib/studio-session-context.tsx` — these are the four web files this row touches.

## Implementation steps

### Backend (src/)

1. **Create `src/identity/session-cookie.ts`** with three exports:
   - `setSessionCookie(res, token, opts?)` — sets `relay_session` and `relay_signed_in=1`.
   - `clearSessionCookie(res)` — sets both to empty with `Max-Age=0`.
   - `readSessionCookie(req): string | null` — reads `relay_session` from `req.headers.cookie`.

   Use these cookie attributes:
   ```
   Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<RELAY_SESSION_TTL_SECONDS or 60*60*24*30>
   ```
   Domain comes from `process.env.RELAY_COOKIE_DOMAIN` (e.g. `.relayapp.me`). When unset, omit the `Domain` attribute (host-only cookie — fine for dev `localhost`).

   The companion `relay_signed_in` cookie is identical except: no `HttpOnly`, value `=1`.

2. **Add env var** `RELAY_COOKIE_DOMAIN` to `.env.example` with a comment explaining that production should set `.relayapp.me` for subdomain sharing.

3. **Wire `setSessionCookie` into the four auth-issuing endpoints** in `src/server.ts`:
   - `POST /api/v1/auth/supabase/relay-session`
   - `POST /api/v1/auth/login`
   - `POST /api/v1/auth/signup`
   - `POST /api/v1/identity/register` and `POST /api/v1/identity/login` (legacy — keep parity)

   After successfully minting the opaque session, call `setSessionCookie(res, token)` **before** sending the JSON response.

4. **Wire `clearSessionCookie` into logout**:
   - `POST /api/v1/identity/logout` — call `clearSessionCookie(res)` after revocation.

5. **Add a feature flag** `RELAY_COOKIE_SESSION_DUAL_WRITE` (default `1` for the transition window). When `1`, the API **also** returns the token in the JSON body (current behavior). When `0`, JSON omits the token (cookie is the only transport). Default to `1` for this row; flipping to `0` is a follow-up.

6. **Read precedence** in `src/identity/require-account.ts` (which is built in row 1.1 — for this row, prepare the helper in `session-cookie.ts` to support either source): cookie first, `Authorization: Bearer` second. **For this row, just expose the cookie reader.** Do not change any existing handler's auth resolution yet.

### Web (web/)

7. **`web/lib/relay-auth-bootstrap.ts`** — remove the line that does `window.localStorage.setItem("relay_session_token", relay.token)`. The cookie is already set by the API response. Keep `localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, ...)` and `RELAY_PUBLIC_SLUG_STORAGE_KEY` — those are UI cache, not the session token.

8. **`web/lib/relay-api.ts`** —
   - Add `credentials: "include"` to every `fetch` call inside `relayFetch`.
   - **Do not** remove the `Authorization` header construction yet (some non-browser callers still use it). Make the header conditional: only include it when a token is explicitly passed in. For browser callers (no explicit token), rely entirely on the cookie.

9. **`web/lib/relay-session-logout.ts`** — remove the line `window.localStorage.removeItem(RELAY_SESSION_TOKEN_KEY)`. The API's `Set-Cookie: relay_session=; Max-Age=0` clears it. Keep removing `RELAY_CREATOR_ID_STORAGE_KEY` and `RELAY_PUBLIC_SLUG_STORAGE_KEY`.

10. **`web/lib/studio-session-context.tsx`** — change `readLocalStorage` to derive `token` presence from `document.cookie.includes("relay_signed_in=1")` instead of from `localStorage`. (The actual token is `HttpOnly` and unreadable by JS — that's correct; we only need the presence signal here.) Rename the local variable from `token` to `signedIn: boolean` to make this explicit. The `hasRelaySession` derived value stays the same shape.

11. **Delete unused storage key constant** if `RELAY_SESSION_TOKEN_KEY` (in `web/lib/relay-session-logout.ts`) is no longer referenced anywhere after the changes.

## Acceptance criteria

Run all of these. All must pass.

- [ ] After signing in via `/login`, browser DevTools → Application → Cookies shows two cookies on the Relay origin: `relay_session` (HttpOnly ✓) and `relay_signed_in` (HttpOnly ✗, value `1`).
- [ ] `document.cookie` in the DevTools console returns a string that contains `relay_signed_in=1` but **not** `relay_session=`.
- [ ] `localStorage.getItem("relay_session_token")` returns `null` after a fresh sign-in.
- [ ] Network tab: any `/api/v1/*` request from the web shows the `Cookie` header includes `relay_session=...`.
- [ ] Logout: response includes `Set-Cookie: relay_session=; Max-Age=0; ...` and `Set-Cookie: relay_signed_in=; Max-Age=0; ...`. Cookies disappear from Application tab.
- [ ] All existing `npm run test` suites pass at repo root.
- [ ] All existing `npm run test` suites pass in `web/`.
- [ ] `npm run build` passes at repo root and in `web/`.
- [ ] Token-log scan: `node scripts/m10-token-log-scan.mjs` returns clean (cookie value is never logged).

## Out of scope

- Removing the `Authorization` header path entirely — non-browser callers still need it; deferred to a separate row after Tier 1 lands.
- Flipping `RELAY_COOKIE_SESSION_DUAL_WRITE` to `0` — keep dual-write during the transition.
- Any guardrail logic (redirects, role checks, RLS) — those are Tier 1 rows.
- Cookie-rotation on session refresh — current sessions don't refresh; if/when they do, that's a separate row.

## Handoff

Write **Delta Out** per `docs/database/AIRTABLE_AUTOPIPELINE.md`:
- What changed: the four backend endpoints + four web files + one new helper.
- Risks: any browser blocking third-party cookies on the auth response (shouldn't apply — same-origin); any reverse-proxy stripping `Set-Cookie` (verify in deployed environment, not just locally).
- Next hint: `GR-T0-2-coin-model-active-role-prompt.md` can begin once this merges; `GR-T0-3-rls-context-prompt.md` and `GR-T0-4-slug-uuid-contract-prompt.md` are independent and may already be in flight.

Update Airtable row: **Status = Shipped**, **Delta Out**, **Notes** with PR link.
