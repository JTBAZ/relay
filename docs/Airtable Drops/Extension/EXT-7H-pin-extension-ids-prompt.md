# EXT-7H — Pin production extension IDs (operator)

## Context

This row is a **human-action gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §7.A. After stores go **live**, production **Chrome** and **Firefox** extension IDs must be copied into **`RELAY_EXTENSION_ORIGINS`** (API) and **`NEXT_PUBLIC_RELAY_EXTENSION_IDS`** (web). Until then, production users **cannot** complete consent (CORS + consent page allowlist).

## Preconditions

- [ ] `EXT-6V-store-review-gate-prompt.md` — listings **published** (or IDs known from pinned manifest key for Chrome — document which).
- [ ] Access to production secrets / hosting dashboard for API + web env.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Origin format:** `chrome-extension://<id>`, `moz-extension://<id>` per `.env.example` in Phase 0.E.

## Goal

Production env vars list **real** extension IDs; API restarted; web rebuilt/redeployed so **`/extension/authorize`** accepts published `ext_id` values.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §7.A — Pin production extension IDs.
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) Appendix B — env var table.
3. **Handoff** from `EXT-6V` — store console IDs.

## Operator actions

1. **HUMAN ACTION REQUIRED:** From Chrome Web Store developer console and Firefox AMO, copy **public extension IDs** for the **published** listings.

2. **HUMAN ACTION REQUIRED:** Set **`RELAY_EXTENSION_ORIGINS`** on the **API** host to comma-separated `chrome-extension://…`, `moz-extension://…` per real IDs.

3. **HUMAN ACTION REQUIRED:** Set **`NEXT_PUBLIC_RELAY_EXTENSION_IDS`** on the **web** build env to the **same** IDs (comma-separated). **Rebuild** Next.js and deploy.

4. **HUMAN ACTION REQUIRED:** **Restart** the API process after env change.

5. **Smoke test (operator or agent with prod access):** open production **`/extension/authorize?ext_id=<chrome_id>&installation_id=test-uuid&label=test`** — should **not** show “extension not recognized” if ID matches allowlist.

## Acceptance criteria

- [ ] Operator confirms prod API and web env contain matching ID lists.
- [ ] Agent or operator records the **exact** strings used (redacted in public notes if needed) in Delta Out for future rotations.
- [ ] Consent page recognizes published Chrome extension ID in production smoke test.

## Out of scope

- Changing CORS logic (`EXT-0E` already shipped).
- Filling store URLs on marketing pages — **`EXT-7B`**.

## Handoff

Delta Out:

- Confirmation API + web deployed with new env.
- Date/time of restart.
- Any mismatch between Edge ID (if distinct) and Chrome — Edge often shares Chrome package ID story; document actual Edge behavior.

Next claimable: **`EXT-7B-update-cta-urls-prompt.md`** and **`EXT-7C-operational-runbook-prompt.md`** in parallel.
