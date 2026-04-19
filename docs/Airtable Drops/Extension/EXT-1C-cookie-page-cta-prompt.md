# EXT-1C — Manual cookie page extension CTA

## Context

This row implements **Phase 1.C** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): **`web/app/patreon/cookie/page.tsx`** gains a **recommended** card promoting the Relay browser extension (Chrome + Firefox buttons) while preserving the existing manual paste flow as **Advanced — manual paste** (`<details>`), **collapsed by default**. P-1 requires coexistence with manual paste; Phase 0.A already requires cookie endpoints to accept the web session via `credentials: "include"` — this row must **not** break that.

## Preconditions

- [ ] `EXT-0V-phase0-verify-prompt.md` shipped green — cookie POST/status/delete work with session auth.
- [ ] `EXT-1A-consent-page-prompt.md` and `EXT-1B-connected-extensions-page-prompt.md` may still be in flight; this row only touches the cookie page layout. Coordinate copy links (e.g. link to `/settings/connected-extensions`) if those routes exist on branch.

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Do not display the Patreon cookie value** in the new CTA card (P-2); existing paste UI may still accept paste — unchanged behavior below the fold.

## Goal

Restructure the cookie page so the extension is the primary path visually; manual instructions remain complete and functional inside a collapsed **Advanced** section.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.C — Update manual cookie page with extension CTA.
2. [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §3 Stage D — `relayFetch` for existing save/status/remove actions (must remain).
3. `web/app/patreon/cookie/page.tsx` — full current implementation to preserve.
4. **Handoff** from Phase 0 — cookie endpoint paths unchanged.

## Implementation steps

### Part A — Layout

1. **Top card:** **Recommended — install the Relay extension.** One-line explainer; buttons or links for **Chrome Web Store** and **Firefox Add-ons**. Until real URLs exist (Phase 6/7), use **disabled** controls with **“Pending publication”** (or equivalent) per plan.

2. **Below:** move the current *“How to get your session_id”* `<details>` content into **Advanced — manual paste**, **`open={false}`** / collapsed by default.

3. **Preserve verbatim** existing paste, save, status check, and remove behavior — no intentional logic or endpoint changes.

### Part B — Regression audit

4. **Tests:**

   ```bash
   rg "patreon/cookie|cookie/page" tests/ web/
   ```

   Run root `npm run test` — any cookie-ingest tests must stay green.

5. **Visual:** extension CTA is clearly first; advanced section accessible but not default.

## Acceptance criteria

- [ ] Page leads with extension recommendation; manual paste works unchanged inside collapsed advanced section.
- [ ] `npm run test` at repo root passes (no regressions in cookie endpoint tests).
- [ ] `npm run build --prefix web` passes.
- [ ] `npm run lint` in `web/` if defined — no new errors in touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Replacing placeholder store URLs with live links (`EXT-7B` / Phase 7).
- Extension package code.
- API changes.

## Handoff

Delta Out:

- Whether CTA links are disabled placeholders or href `#` with tooltip — match chosen UX.
- Any copy tweaks for accessibility (button vs link semantics).

Next claimable: `EXT-1V-phase1-verify-prompt.md` after `EXT-1A` + `EXT-1B` + this row merge.
