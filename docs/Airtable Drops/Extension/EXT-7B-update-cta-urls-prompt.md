# EXT-7B — Update CTAs + install prompt component

## Context

This row implements **Phase 7.B** of [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md): after stores are **live**, replace **placeholder** extension links on **`web/app/patreon/cookie/page.tsx`** with real **Chrome Web Store**, **Edge**, and **AMO** URLs; remove **“Pending publication”** disabled state. Add reusable **`InstallExtensionPrompt`** and surface it in **onboarding** and **dashboard** when the user has **no Patreon cookie stored** (detection logic per existing app patterns).

## Preconditions

- [ ] `EXT-7H-pin-extension-ids-prompt.md` completed — production consent path works with real IDs.
- [ ] Live store URLs available from **`EXT-6V`** / operator (Chrome, AMO; Edge may mirror Chrome listing).

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **External links:** use `rel="noopener noreferrer"` where appropriate; store URLs are **https** only.

## Goal

Production-quality install CTAs everywhere the plan names; component reusable for onboarding + dashboard empty states.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §7.B — Update CTAs in the web app.
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.C — prior cookie page CTA structure.
3. **Handoff** from `EXT-6V` / operator — final store URLs.
4. `web/app/patreon/cookie/page.tsx` — current implementation.
5. Locate onboarding + dashboard entry points: `rg "onboarding|dashboard" web/app/` (cap results; refine per codebase).

## Implementation steps

### Part A — Cookie page

1. **`web/app/patreon/cookie/page.tsx`** — replace placeholder **Recommended** card buttons with **live** links to Chrome Web Store, Edge Add-ons, and Firefox AMO; **remove** disabled “Pending publication” state.

### Part B — Reusable component

2. **New** `web/app/components/InstallExtensionPrompt.tsx` — props: optional `className`, store URLs (or read from `process.env.NEXT_PUBLIC_*` if team adds vars — **only if** plan Appendix B is extended; otherwise pass constants / config module). Match Relay visual patterns from cookie page card.

3. **Onboarding** — insert prompt where Patreon/cookie setup is relevant (follow product flow; use `rg` to find step components).

4. **Dashboard** — if user has **no** stored Patreon cookie (reuse same check the app already uses for “needs cookie” if any), render `InstallExtensionPrompt`.

### Part C — Env (optional)

5. If URLs vary by environment, add **`NEXT_PUBLIC_RELAY_EXTENSION_CHROME_URL`** (etc.) to **`web/.env.example`** **only** if plan author approves — **otherwise** hardcode production URLs from operator handoff (document in Delta Out). **Do not invent** URLs — use operator-provided links only.

### Part D — Audit

6. **No placeholders:**

   ```bash
   rg "Pending publication" web/app/patreon/cookie/
   ```

7. **Build:**

   ```bash
   npm run build --prefix web
   ```

## Acceptance criteria

- [ ] Cookie page **Recommended** section links to **live** stores; no disabled placeholder.
- [ ] `InstallExtensionPrompt` used in **≥2** surfaces (onboarding + dashboard) per plan.
- [ ] `npm run build --prefix web` passes; `npm run test` at root passes.
- [ ] `npm run lint` in `web/` if defined — clean on touched files.
- [ ] Tier 0 invariants satisfied.

## Out of scope

- Changing extension manifest or API (`EXT-0*`…`4*`).
- **`EXT-7C`** runbook.

## Handoff

Delta Out:

- Exact URLs committed.
- Env vars added (if any).
- How “no cookie stored” is detected for dashboard.

Next claimable: **`EXT-7C-operational-runbook-prompt.md`** (parallel OK).
