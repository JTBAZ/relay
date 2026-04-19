# EXT-1B — Connected extensions settings page

## Context

This row implements **Phase 1.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a **settings** surface where the signed-in user lists every active extension grant (label, last used, expiry) and revokes any device. It calls Phase 0 grant APIs (`GET` list, `DELETE` by id). This complements P-8 and P-10 (grants independent of web logout; revocation is explicit here or via extension).

## Preconditions

- [ ] `EXT-0V-phase0-verify-prompt.md` shipped green — `GET/DELETE /api/v1/auth/extension/grants` behave per Phase 0.C.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Revoke is DELETE** on `/api/v1/auth/extension/grants/:tokenId` — do not use GET for mutation ([`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md)).

## Goal

Ship `web/app/settings/connected-extensions/` with list + revoke, middleware registration, and navigation link from existing settings or user menu per repo patterns.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.B — Connected extensions settings page.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage D — `relayFetch` / auth errors (if applicable to client revoke).
3. [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md).
4. **Handoff** from `EXT-0C-extension-consent-endpoints-prompt.md` — grant list item shape and `tokenId` path param.
5. `web/middleware.ts` — add `/settings/connected-extensions` to `APP_ROUTES`.
6. Locate navigation pattern: run `rg "settings/" web/app/` and mirror existing link styling.

## Implementation steps

### Part A — Middleware + pages

1. **`web/middleware.ts`** — add `/settings/connected-extensions` to `APP_ROUTES` (logged-out → `/login?returnTo=...`).

2. **New** `web/app/settings/connected-extensions/page.tsx` — server-rendered list using `relayFetch('/api/v1/auth/extension/grants')` per plan. Map API fields to rows: **`label`**, **`last_used_at`** (relative time in UI), **`expires_at`**, and a **Revoke** control per row.

3. **New** `web/app/settings/connected-extensions/RevokeButton.tsx` — client component: `relayFetch` with **`DELETE /api/v1/auth/extension/grants/:tokenId`**, then refresh the list (router refresh, revalidate, or client state — match patterns used elsewhere in `web/app/settings/`).

### Part B — Navigation + empty state

4. **Settings index or user menu** — add a link to `/settings/connected-extensions` following the pattern from `rg "settings/" web/app/`. If no settings index exists, add from the user menu per plan.

5. **Empty state** copy per plan: *“No connected extensions. Install the [Relay browser extension](…) to capture your Patreon session in one click.”* — use a placeholder `href` for the extension link until Phase 6/7 URLs exist, or link to `/patreon/cookie` as interim per product preference (document in Delta Out).

### Part C — Audit

6. **No raw fetch:**

   ```bash
   rg "fetch\\(" web/app/settings/connected-extensions/
   ```

   All API calls must go through `relayFetch`.

## Acceptance criteria

- [ ] Page lists grants for the signed-in account; dates formatted readably (`last_used_at` relative, `expires_at` clear).
- [ ] **Revoke** removes the row; subsequent API calls using that grant’s Bearer token return **401** (verify via extension or direct API test).
- [ ] Logged-out request to the page bounces to `/login`.
- [ ] `npm run build --prefix web` passes; `npm run test` at repo root passes.
- [ ] `npm run lint` in `web/` if defined — no new errors in touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Extension runtime (`EXT-3*`).
- Consent page (`EXT-1A`).
- Cookie page CTA (`EXT-1C`).
- Store listing URLs and legal privacy page (`EXT-6*`).

## Handoff

Delta Out:

- Grant row **`id` / `tokenId`** field name from API and how it maps to `DELETE` path.
- Navigation entry point chosen (settings index vs menu path).
- Empty-state link destination until store URLs land.

Next claimable: `EXT-1V-phase1-verify-prompt.md` after `EXT-1A` + `EXT-1B` + `EXT-1C` merge.
