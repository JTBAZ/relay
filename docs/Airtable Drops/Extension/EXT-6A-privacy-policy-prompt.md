# EXT-6A — Extension privacy policy page (public)

## Context

This row implements **Phase 6.A** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): a **public**, **no-auth** legal page at **`/legal/extension-privacy`** describing what the extension collects, sends, stores, and does **not** do. Required URL after deploy: **`https://relayapp.me/legal/extension-privacy`** for **Chrome, Edge, and Firefox** store submissions. Content builds on [`docs/cookie-auth-legal-rationale.md`](../../cookie-auth-legal-rationale.md) plus extension-specific bullets from the plan.

## Preconditions

- [ ] `EXT-5V-e2e-verify-prompt.md` shipped green recommended before legal finalization — ensures described behavior matches product; may draft in parallel with **5V** if copy reviewed before publish.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Public page:** no session requirement; must not leak user-specific data via client-side fetches on load.

## Goal

Ship `web/app/legal/extension-privacy/page.tsx` (and any small supporting components) with accurate extension privacy disclosures per plan §6.A.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.A — Privacy policy (bullet list).
2. [`docs/cookie-auth-legal-rationale.md`](../../cookie-auth-legal-rationale.md) — reuse/adapt.
3. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §1.2 — high-level session posture (no `relay_session` in JS).
4. Plan citations for technical claims: `src/auth/cookie-store.ts` (AES-256-GCM); `FilePatreonCookieStore.maxAgeDays` (90-day retention).
5. `web/middleware.ts` — confirm `/legal/*` is **not** behind auth perimeter (mirror other public legal routes if any).

## Implementation steps

### Part A — Route + content

1. **New** `web/app/legal/extension-privacy/page.tsx` — static or server component; **no login required**.

2. **Sections** (plan §6.A — implement all):
   - **What the extension reads:** only `session_id` on `patreon.com`, when user consents or `cookies.onChanged` fires.
   - **What it sends to Relay:** cookie value, user’s `creator_id`, extension grant token (Bearer).
   - **What it does NOT do:** no telemetry (P-5), no third-party services, no other cookies, no page reading, no ads/tracking.
   - **Storage:** encrypted at rest **AES-256-GCM** — cite **`src/auth/cookie-store.ts`** (path as in repo).
   - **Retention:** cookie record **90 days** — cite **`FilePatreonCookieStore.maxAgeDays`**; grant **sliding 30 days** (P-6); revocation via **`/settings/connected-extensions`**.
   - **Contact + revocation** — how users reach support and revoke access.

3. **Cross-link** relevant Relay URLs (`/settings/connected-extensions`, main site contact).

### Part B — Middleware + SEO

4. Ensure **`web/middleware.ts`** does **not** redirect anonymous users away from `/legal/extension-privacy` (add exception if `APP_ROUTES` is broad).

5. **Optional:** metadata title/description for “Relay Extension Privacy”.

### Part C — Audit

6. **Public reachability:**

   ```bash
   rg "extension-privacy|legal/" web/middleware.ts web/app/legal/
   ```

7. **Build:**

   ```bash
   npm run build --prefix web
   ```

## Acceptance criteria

- [ ] `https://relayapp.me/legal/extension-privacy` path works after deploy (verify on staging with full origin).
- [ ] Logged-out visitor can read full page.
- [ ] `npm run build --prefix web` passes.
- [ ] `npm run test` at repo root passes.
- [ ] `npm run lint` in `web/` if defined — no new errors.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Store listing copy (`EXT-6B`).
- Patreon OAuth legal doc rewrites beyond extension section.
- **`EXT-7B`** reusable install card — separate row.

## Handoff

Delta Out:

- Final deployed URL confirmation.
- Any legal review notes / owner sign-off reference.
- Uninstall paragraph wording for §5.A matrix **C2** cross-check.

Next claimable: `EXT-6B-store-listings-prompt.md` (parallel); then `EXT-6H-build-sign-submit-prompt.md`.
