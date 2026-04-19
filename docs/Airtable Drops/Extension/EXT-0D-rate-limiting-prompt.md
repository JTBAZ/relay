# EXT-0D — Rate limiting (in-memory)

## Context

This row implements **Phase 0.D** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): throttle **consent exchange** (unauthenticated), **consent start** (per account), and **cookie writes** (per account) using `express-rate-limit` v7.x in-memory. P-11 locks in-memory for v1 with a documented Redis upgrade path. This row only adds middleware and wires it to routes from Phase 0.A and 0.C — it does not change handler logic.

## Preconditions

- [ ] `EXT-0A-cookie-endpoint-auth-prompt.md` shipped — cookie routes exist and are authed (limiter keys must run **after** auth for account-scoped limiters).
- [ ] `EXT-0C-extension-consent-endpoints-prompt.md` shipped — consent routes exist to attach limiters.

May be implemented on a branch that includes both; merge order: land 0A + 0C before applying limiter wiring in `src/server.ts`, or land this PR stacked after them.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **`consentStart` limiter runs after `requirePatronBearerSession`** so `keyGenerator` can read the resolved `accountId` (plan: key by `accountId`; if the codebase exposes `req.session?.user_id`, align with actual attachment point per [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.D).

## Goal

Named limiters apply to the correct routes; **61st** rapid `consent/exchange` POST from one IP returns **429**; rate-limit headers appear on responses; full test suite stays green.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.D — Rate limiting (in-memory).
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage B — auth ordering vs middleware.
3. **Handoff** from `EXT-0C-extension-consent-endpoints-prompt.md` — route paths for consent.
4. **Handoff** from `EXT-0A-cookie-endpoint-auth-prompt.md` — Patreon cookie POST path.
5. `package.json` (repo root) — add dependency.
6. `src/server.ts` — apply limiters per route.

## Implementation steps

### Part A — Dependency + module

1. **Root `package.json`** — add `express-rate-limit` (latest **7.x** per plan).

2. **New file** `src/middleware/rate-limits.ts` — top comment block (copy verbatim):

   ```
   In-memory limiter — counters are per-process. For multi-node deploys, swap
   the store for `rate-limit-redis` and wire REDIS_URL. See AGENTS.md.
   ```

3. **Three named limiters** (exact limits from plan):
   - `consentStart`: **30** req / **5 min** per **`accountId`** — apply **after** auth middleware populates account context; implement `keyGenerator` using the same identifier `requirePatronBearerSession` sets (adjust field names to match `src/server.ts`).
   - `consentExchange`: **60** req / **5 min** per **IP** (strict — unauthenticated).
   - `cookieWrite`: **60** req / **1 hour** per **`accountId`** — for `POST` (and `DELETE` if plan intends all cookie mutations; plan text says "cookie writes" — apply to `POST /api/v1/patreon/cookie` at minimum; use plan + product judgment for DELETE).

### Part B — Wire in server

4. **`src/server.ts`** — import limiters and attach to:
   - Routes registered in **0.C** (`consent/start` → `consentStart`; `consent/exchange` → `consentExchange`).
   - Cookie **POST** (and per plan scope, other mutating cookie routes) → `cookieWrite`.

5. **Verify header visibility:** ensure `RateLimit-Remaining`, `RateLimit-Reset` (or library defaults) appear — per plan acceptance.

### Part C — Smoke + audit

6. Manual or scripted smoke: **61** rapid `POST /api/v1/auth/extension/consent/exchange` from same IP → **429** on the 61st.

7. **Audit** route wiring:

   ```bash
   rg "rate-limits|consentStart|consentExchange|cookieWrite" src/server.ts src/middleware/
   ```

## Acceptance criteria

- [ ] 61st rapid `consent/exchange` from one IP in five minutes returns **429**.
- [ ] Rate-limit headers visible on limited responses.
- [ ] `npm run test` passes at repo root (no regressions).
- [ ] `npm run build` passes at repo root.
- [ ] No new ESLint errors in touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Redis store, distributed counters, adaptive per-tenant limits ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.D).
- Limiter coverage for unrelated `/api/v1/*` routes not named in Phase 0.A/0.C.
- Phase 1+ web or extension work.

## Handoff

Delta Out:

- Exact middleware order (which runs before/after `requirePatronBearerSession`).
- Limiter names and numeric caps for ops/runbooks.
- Any `keyGenerator` field names tied to Express request shape.

Next claimable: `EXT-0E-cors-extension-allowlist-prompt.md` (parallel if already unblocked), then `EXT-0V-phase0-verify-prompt.md` after **all** of 0A–0E are on main.
