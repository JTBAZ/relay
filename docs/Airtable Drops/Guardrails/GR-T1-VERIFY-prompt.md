# GR-T1-VERIFY — Tier 1 verification suite (cross-stage persona acceptance)

## Context

You are running the **Tier 1 verification gate** for the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §4). All eight Tier 1 primitives must be merged. This row exercises the full system from the persona perspective and either green-lights Tier 2 work or sends specific T1 rows back for fixes.

**This is a gate row.** No code changes ship here. All checks must pass before any Tier 2 prompt is opened.

## Preconditions

All eight Tier 1 prompts shipped on `main`:

- [ ] `GR-T1-1-require-account-prompt.md`
- [ ] `GR-T1-2-rls-policies-prompt.md`
- [ ] `GR-T1-3-fetch-401-prompt.md`
- [ ] `GR-T1-4-auth-hooks-prompt.md`
- [ ] `GR-T1-5-boot-splash-prompt.md`
- [ ] `GR-T1-6-safe-redirect-prompt.md`
- [ ] `GR-T1-7-edge-middleware-prompt.md`
- [ ] `GR-T1-8-verb-hygiene-prompt.md`

Plus all Tier 0:

- [ ] `GR-T0-VERIFY-prompt.md` previously shipped green.

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md). Persona checks below also re-verify them.

## Goal

A passing run means: **the foundation + guardrails are sound.** The user's "relayapp.me redirect / no confused-state" requirement is satisfied at the URL layer, the API layer, and the DB layer simultaneously. Tier 2 (route-by-route guard adoption + UI polish) may begin.

## Reference reading

- [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §4 (Cross-stage acceptance — paragraphs per persona).
- [`00-README.md`](00-README.md) — Tier 0 invariants list.

## Test prep

Provision four test accounts in the dev environment:

| Persona | Email | Setup |
|---|---|---|
| **CR-only** | `qa-creator@relay.test` | Sign up via `/onboarding`. Run creator workspace provisioning (`POST /api/v1/creator/workspace`). Do **not** add patron memberships. |
| **SP-only** | `qa-supporter@relay.test` | Sign up via `/onboarding` against the platform tenant. Manually add one `TenantMembership(role=patron, tier_ids=['gold'])` against an existing creator tenant. Do **not** provision a creator workspace. |
| **COIN** | `qa-both@relay.test` | Provision creator workspace AND add a patron `TenantMembership` to a different creator's tenant. |
| **EXP** | `qa-expired@relay.test` | Same as CR-only, but for the "expired session" tests we'll force-revoke the session row in DB mid-test. |

Record the resulting `Account.id`, `Tenant.id`, and `relay_creator_id` for each.

## Verification checklist

### A. Logged-out visitor

- [ ] **A1.** In a fresh incognito window, visit `relayapp.me`. Result: lands on `/` with the marketing landing (or `/login` if you completed the optional Tier 2 follow-up). No console errors.
- [ ] **A2.** Visit `relayapp.me/designer` directly. Middleware redirects to `/login?returnTo=%2Fdesigner` **before** any designer UI renders. Network tab shows a single 307 from `/designer` → `/login`.
- [ ] **A3.** Visit `relayapp.me/action-center`. Same redirect with `returnTo=%2Faction-center`.
- [ ] **A4.** Visit `relayapp.me/patron/feed`. Same redirect.
- [ ] **A5.** Visit `relayapp.me/patron/c/<known-handle>`. Public profile renders normally. **No** redirect.
- [ ] **A6.** Visit `relayapp.me/login`. Login form renders. No redirect (correctly recognized as the right place).
- [ ] **A7.** From `/login`, attempt to navigate via JS link to `/designer`. The link triggers SPA nav → middleware redirects → `useRequireLoggedIn` hook (when applied in Tier 2) provides belt-and-suspenders. For this row, just verify middleware fires.

### B. Creator (CR-only) persona

- [ ] **B1.** Sign in as CR-only. Lands on `/` with the Library shell (per existing `home-page-client.tsx`).
- [ ] **B2.** DevTools → Application → Cookies: `relay_session` (HttpOnly), `relay_signed_in=1`, `relay_active_role=creator`.
- [ ] **B3.** `useStudioSession()` (inspect via React DevTools) returns `hasRelaySession: true`, `activeRole: "creator"`.
- [ ] **B4.** `GET /api/v1/creator/workspace` (or whatever read endpoint exists) succeeds. Returns the creator's own workspace data only.
- [ ] **B5.** Try to access another creator's tenant data via the API (use a known other `Tenant.id`). Result: API returns either empty rows (RLS filtered) or `403`. Definitely not other creator's rows.
- [ ] **B6.** Type `relayapp.me/login` while signed in. Middleware redirects to `/`. **No login form ever rendered.**
- [ ] **B7.** Sign out from any page. All three cookies clear. Lands on `/login` (or `/landing` per current behavior).

### C. Supporter (SP-only) persona

- [ ] **C1.** Sign in as SP-only. Lands on `/` with the appropriate shell. `relay_active_role=supporter`.
- [ ] **C2.** `useStudioSession()` returns `hasRelaySession: true`, `activeRole: "supporter"`.
- [ ] **C3.** Visit `/patron/feed`. Renders posts from creators they support.
- [ ] **C4.** Confirm RLS at the DB layer: hit `GET /api/v1/<some posts endpoint>` and verify the response includes only posts where (a) `is_public`, **OR** (b) the supporter's `tier_ids` match the post's `required_tier_id`.
- [ ] **C5.** Visit `/designer`. Middleware admits (cookie present). API returns `403` (no creator workspace). The fetch wrapper renders the inline forbidden message — **no logout, no redirect to `/login`**.
- [ ] **C6.** Verify `/patron/c/<the creator they support>` renders the public profile.

### D. Coin-flipper (COIN) persona

- [ ] **D1.** Sign in as COIN. Default `relay_active_role` is `creator` (because they have a `primaryRelayCreatorId`). Lands on `/` with the creator Library.
- [ ] **D2.** Visit `/patron/c/<another creator they support>`. Profile renders. The "Comment" UI (if present) lets them comment **as themselves** — without flipping the active role and without changing sessions.
- [ ] **D3.** Inspect the comment row created in D2 (via DB or API). Confirm `account_id` equals COIN's `Account.id`. **The same `account_id` they would use as a creator.** This is the unified-identity guarantee.
- [ ] **D4.** Manually set `relay_active_role=supporter` cookie via DevTools. Refresh. Confirm the UI lens changes (when row 2.9 ships) but no permission changes — the user can still hit creator endpoints if they want, because authz is DB-derived. **Re-verify that no API permission gate references the cookie** (run `rg "relay_active_role" src/`).
- [ ] **D5.** Sign out. All three cookies clear.

### E. Expired session (EXP) persona

- [ ] **E1.** Sign in as EXP. Open the Library.
- [ ] **E2.** In another terminal/console, manually revoke EXP's session row in the DB (e.g. `prisma session delete` or set its expiry to past).
- [ ] **E3.** In the browser, trigger any authenticated action (refresh data, navigate to a guarded route). The fetch returns `401`. The `relayFetch` wrapper:
  - Calls `performRelayLogout()` → cookies cleared, Supabase signed out.
  - Redirects to `/login?reason=expired&returnTo=<originating path>`.
- [ ] **E4.** Sign back in at `/login`. After auth, lands on the originating `returnTo` path.
- [ ] **E5.** Verify no infinite-redirect loop occurred (single redirect chain).

### F. Open-redirect / safety

- [ ] **F1.** Sign out. Visit `/login?returnTo=//evil.com/x`. Sign in. Lands on `/`, **not** on `evil.com`.
- [ ] **F2.** Sign out. Visit `/login?returnTo=https://evil.com/x`. Sign in. Lands on `/`.
- [ ] **F3.** Sign out. Visit `/login?returnTo=/designer`. Sign in. Lands on `/designer`.
- [ ] **F4.** Run `rg "router\\.(replace|push)\\(" web/` — every dynamically computed destination either uses a hard-coded literal or wraps the input in `resolvePostAuthPath`.

### G. Verb hygiene + logout

- [ ] **G1.** `rg "app\\.get\\(\"/api/" src/` — manually scan. No GET handler writes to DB.
- [ ] **G2.** `rg "<a[^>]+href=[\"']/(logout|sign-out|api/v1/identity/logout)" web/` — zero hits.
- [ ] **G3.** `POST /api/v1/identity/logout` exists, requires auth, returns `204` or `200`.
- [ ] **G4.** A direct browser GET to `/api/v1/identity/logout` returns `405 Method Not Allowed`.

### H. Code-quality regressions

- [ ] **H1.** `npm run test` passes at repo root.
- [ ] **H2.** `npm run test` passes in `web/`.
- [ ] **H3.** `npm run lint` passes in `web/` (includes the safe-redirect rule from 1.6 and the no-raw-fetch rule from 1.3).
- [ ] **H4.** `npm run build` passes at repo root.
- [ ] **H5.** `npm run build` passes in `web/`.
- [ ] **H6.** `node scripts/m10-token-log-scan.mjs` returns clean.
- [ ] **H7.** `rg "relay_session_token" web/` — should only appear in deprecated test fixtures or the comment in `relay-session-logout.ts` referencing the removed key. Zero active uses.

### I. Documentation cross-links

- [ ] **I1.** `00-README.md` updated with a "Tier 1 verified ✅ <date>" line.
- [ ] **I2.** `docs/AUTH_GUARDRAILS_TIER_1.md` annotated with the verification date.
- [ ] **I3.** `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md` cross-links the new auth contract (one-line edit).

## Failure handling

If **any** box fails:

1. Identify the originating Tier 1 row from the section letter:
   - A* (logged-out routing) → 1.7
   - B* / C* / D* (persona behavior) → 1.1, 1.2, 1.4 (depending on which subcheck)
   - E* (expired session) → 1.3
   - F* (safe redirect) → 1.6
   - G* (verb / logout) → 1.8
   - H* (regressions) → bisect to the most recently merged row
2. Mark this row **Blocked.** In Delta Out, name:
   - The failing check (e.g. "C5: 403 caused logout instead of inline error").
   - The probable root cause.
   - The Tier 1 row to reopen.
3. Re-claim this row only after the originating row re-ships. Re-run the **full** suite (no partial reruns).

## Acceptance criteria

- [ ] Every box in sections A–I checked.
- [ ] No new code or migration committed in this row.
- [ ] `00-README.md` and `docs/AUTH_GUARDRAILS_TIER_1.md` annotated.
- [ ] Tier 2 sweep is now **unblocked.**

## Out of scope

- Tier 2 work (route-by-route guard adoption, identity-mismatch detection, cross-tab banner, single-session confirm, OAuth state audit, returnTo audit, token-log extension to web, active-role UI lens) — open separate prompts for each.
- Tier 3 (per-feature guardrails) and Tier 4 (account-takeover hardening) — defer until features exist.

## Handoff

Delta Out:
- "Tier 1 verified ✅ <YYYY-MM-DD>" or "Blocked on <row>: <failing check>".
- Persona test account IDs (so QA can reuse them next time).
- Confirmation that lint, build, and test all pass across both repos.

When this row ships green:
- Open Tier 2 sweep prompts (rows 2.1–2.9 from [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) §5).
- Update the project tracker with the verified Tier 1 milestone.
