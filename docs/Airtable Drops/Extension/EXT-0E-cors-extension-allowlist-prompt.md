# EXT-0E — CORS allowlist for extension auth routes

## Context

This row implements **Phase 0.E** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): without loosening **global** CORS for cookie+credentials traffic, allow **only** listed extension origins (`chrome-extension://`, `moz-extension://`) to call **`/api/v1/auth/extension/*`**. The extension uses **`Authorization: Bearer`**, not `credentials: "include"`, so these responses **omit** `Access-Control-Allow-Credentials` while still echoing `Access-Control-Allow-Origin` for a matching allowlist entry — tightening exposure vs reflecting arbitrary origins.

## Preconditions

- [ ] `EXT-0C-extension-consent-endpoints-prompt.md` shipped — extension auth routes exist under `/api/v1/auth/extension/`.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Do not** add `Access-Control-Allow-Credentials: true` for these extension-only routes; the extension must not rely on cross-origin cookies for Relay ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.E, §0 finding 2).

## Goal

`RELAY_EXTENSION_ORIGINS` (comma-separated) gates preflight and responses for `/api/v1/auth/extension/*`; unlisted extension origins fail preflight; **`/api/v1/patreon/cookie`** CORS behavior stays unchanged (still reflects any origin with credentials per plan).

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.E — Tighten CORS for the extension endpoints only (lines **925–947** cited for existing middleware).
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1 Decision 0.1 — `relay_session` cookie model.
3. **Handoff** from `EXT-0C-extension-consent-endpoints-prompt.md` — exact route prefix to match.
4. `src/server.ts` — existing CORS middleware **925–947** per plan.
5. `.env.example` — add variable block per plan.

## Implementation steps

### Part A — Env + parsing

1. **`.env.example`** — append (copy verbatim from plan):

   ```
   # Comma-separated extension origins permitted to hit /api/v1/auth/extension/*
   # Get the production extension ID from chrome.google.com/webstore/devconsole after publishing
   # Format: chrome-extension://<id>,moz-extension://<id>
   # RELAY_EXTENSION_ORIGINS=chrome-extension://abcdefghijklmnop,moz-extension://abcdefghijklmnop
   ```

2. **`src/server.ts`** — extend existing CORS middleware (lines **925–947** per plan): read **`RELAY_EXTENSION_ORIGINS`**. For requests whose path starts with **`/api/v1/auth/extension/`**:
   - If `Origin` header matches an allowlisted entry **and** is a `chrome-extension://` or `moz-extension://` URL, set `Access-Control-Allow-Origin: <origin>` and **do not** set `Access-Control-Allow-Credentials` (or omit it).
   - Otherwise, for these routes, **reject preflight** (no CORS success headers — browser blocks).

3. **Non-extension routes:** leave existing behavior — especially cookie-based endpoints (`/api/v1/patreon/cookie`) continue to reflect any origin with credentials **unchanged** per plan acceptance.

### Part B — Verification commands

4. **Listed origin:** `curl` or browser preflight to `consent/exchange` with `Origin: chrome-extension://<listed-id>` succeeds CORS for that path.

5. **Unlisted origin:** preflight from `chrome-extension://bogus` does **not** receive allowlisting headers.

6. **Audit:**

   ```bash
   rg "RELAY_EXTENSION_ORIGINS|auth/extension" src/server.ts .env.example
   ```

## Acceptance criteria

- [ ] Request to `/api/v1/auth/extension/consent/exchange` from an **unlisted** `chrome-extension://...` origin is blocked at preflight.
- [ ] Same from a **listed** origin succeeds.
- [ ] Cookie endpoints (`/api/v1/patreon/cookie`) still use prior CORS behavior with credentials.
- [ ] `npm run test` and `npm run build` pass at repo root.
- [ ] No new ESLint errors in touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Setting real production extension IDs on the host ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) human note after Phase 6 — operator updates env and restarts).
- Next.js `web/` CORS — API-only change.
- Phase 1 `NEXT_PUBLIC_RELAY_EXTENSION_IDS` — separate env on web.

## Handoff

Delta Out:

- Env var name and parsing rules (trim, empty means deny-all for extension routes vs fail-closed).
- Exact path prefix used in code (`/api/v1/auth/extension/`).
- Note for ops: after first store publish, paste real IDs into `RELAY_EXTENSION_ORIGINS` (see plan §0.E block quote).

Next claimable: `EXT-0V-phase0-verify-prompt.md` once `EXT-0A` … `EXT-0E` are merged.
