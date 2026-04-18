# GR-T0-VERIFY — Tier 0 verification suite

## Context

You are running the **Tier 0 verification gate** for the Auth Guardrails plan ([`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md)). This is a **gate row**: it must be green before any Tier 1 prompt may be claimed.

The four Tier 0 primitives are:
- 0.1 — `HttpOnly` `relay_session` + `relay_signed_in` companion cookies (`GR-T0-1`).
- 0.2 — Coin model audit + `relay_active_role` UI cookie (`GR-T0-2`).
- 0.3 — `auth_account_id()` SQL function + `setSupabaseRlsContext` helper (`GR-T0-3`).
- 0.4 — Slug ↔ UUID contract + `resolveTenantBySlug` helper (`GR-T0-4`).

This row does **not** add code. It runs a smoke suite that proves all four wire up correctly and that no existing flow has regressed.

## Preconditions

All four of these **must be merged on `main`** (or the integration branch the team uses for Guardrails work):

- [ ] `GR-T0-1-cookie-mirror-prompt.md` shipped — verify by checking `src/identity/session-cookie.ts` exists and `relay_session` cookie is set on login.
- [ ] `GR-T0-2-coin-model-active-role-prompt.md` shipped — verify by checking `docs/architecture/coin-model-audit.md` exists and `relay_active_role` is set on login.
- [ ] `GR-T0-3-rls-context-prompt.md` shipped — verify by checking the `auth_account_id()` function exists in the DB.
- [ ] `GR-T0-4-slug-uuid-contract-prompt.md` shipped — verify by checking `docs/architecture/url-identity-contract.md` and `src/identity/resolve-tenant.ts` exist.

If any precondition is unmet, mark this row **Blocked** with Delta Out naming the missing primitive.

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md). This row **verifies** them — failures here mean a Tier 0 row needs to be reopened, not patched.

## Goal

A passing run of this suite means: **the foundation is sound. Tier 1 prompts may be claimed.**

## Reference reading

1. [`00-README.md`](00-README.md) — for the Tier 0 invariants list.
2. The four Tier 0 prompt files — for what each primitive promised to deliver.

## Verification checklist

Run each of the following. **Every box must be checked** before marking this row Shipped.

### A. Cookie shape (T0-1 + T0-2)

- [ ] **A1.** Sign in via `/login` with a fresh test Account. Open DevTools → Application → Cookies on the Relay origin. Confirm presence of:
  - `relay_session` — HttpOnly ✓, Secure ✓, SameSite Lax, Path `/`, non-empty value.
  - `relay_signed_in` — HttpOnly ✗, value `1`.
  - `relay_active_role` — HttpOnly ✗, value `creator` or `supporter` (matches the Account's capability).
- [ ] **A2.** In the DevTools Console run `document.cookie`. The string must:
  - Contain `relay_signed_in=1`.
  - Contain `relay_active_role=...`.
  - **Not** contain `relay_session=`.
- [ ] **A3.** Run `localStorage.getItem("relay_session_token")` — returns `null`.
- [ ] **A4.** Open Network tab. Trigger any authenticated request from the web app. Confirm the `Cookie` header includes `relay_session=...`.
- [ ] **A5.** Click sign-out. Confirm response includes `Set-Cookie` with `Max-Age=0` for all three cookies. Confirm cookies disappear from Application tab.

### B. Coin model rules (T0-2)

- [ ] **B1.** `docs/architecture/coin-model-audit.md` exists with all four schema checks confirmed (✓).
- [ ] **B2.** `rg "relay_active_role" src/` returns only:
  - `src/identity/session-cookie.ts`
  - `src/identity/active-role-default.ts`
  - The four auth endpoints in `src/server.ts`.
  - **Zero** references inside permission-decision code paths.
- [ ] **B3.** Manual check: pick any handler that returns user-owned data (e.g. `/api/v1/creator/workspace`). Read the source. Confirm it does **not** branch on `relay_active_role` for any decision.

### C. RLS plumbing (T0-3)

- [ ] **C1.** Run `npm run test -- rls-context` (or whatever invocation runs `tests/identity/rls-context.test.ts`). All three tests pass:
  - `auth_account_id()` returns NULL when unset.
  - Returns the set value within a transaction.
  - Setting is local to the transaction.
- [ ] **C2.** Use `user-supabase` MCP to run `SELECT auth_account_id()` against the dev DB. Returns `NULL`.
- [ ] **C3.** `docs/architecture/rls-context-usage.md` exists.

### D. URL identity contract (T0-4)

- [ ] **D1.** `docs/architecture/url-identity-contract.md` exists with audit table.
- [ ] **D2.** Audit shows zero ❌ FK violations and zero ❌ RLS violations on `relay_creator_id` / `public_slug`.
- [ ] **D3.** `src/identity/resolve-tenant.ts` exists and exports `resolveTenantBySlug`. Unit tests pass.
- [ ] **D4.** `rg "@relation|references" prisma/schema.prisma` — manually scan results. No `@relation` references `relayCreatorId` or `publicSlug` as the FK key.

### E. Regression — existing flows still work

- [ ] **E1.** End-to-end: fresh sign-up via `/onboarding` succeeds, lands on `/onboarding?step=patreon` (per existing `bootstrapStudioAfterSupabase` behavior). Cookie is set; user can navigate to `/`.
- [ ] **E2.** End-to-end: existing user signs in via `/login`, lands on Library (`/`). Library renders without console errors.
- [ ] **E3.** Patreon connect flow (`/patreon/connect` → callback) completes without error. Note: this row does **not** change Patreon flows; we just verify they still work.
- [ ] **E4.** Sign-out from any page returns to `/login` (or `/landing` per current behavior). All three cookies cleared.
- [ ] **E5.** `npm run test` passes at repo root.
- [ ] **E6.** `npm run test` passes in `web/`.
- [ ] **E7.** `npm run build` passes at repo root and in `web/`.
- [ ] **E8.** `node scripts/m10-token-log-scan.mjs` returns clean.

### F. Documentation cross-links

- [ ] **F1.** [`docs/AUTH_GUARDRAILS_TIER_1.md`](../../AUTH_GUARDRAILS_TIER_1.md) is updated with a "Tier 0 verified on YYYY-MM-DD by row <ledger-id>" line at the top of §3 (or wherever appropriate). Single-line edit.
- [ ] **F2.** Update [`00-README.md`](00-README.md) — add a "Tier 0 verified ✅ <date>" line above the Build hierarchy table.

## Failure handling

If **any** box fails:

1. **Do not patch in this row.** This is a verification gate, not a fix shop.
2. Identify which Tier 0 row's deliverable failed (A* → T0-1 or T0-2; B* → T0-2; C* → T0-3; D* → T0-4; E* → potentially any).
3. Mark this row **Blocked**. In Delta Out, name:
   - The failing check (e.g. "A4 failed: cookie not sent on `/api/v1/creator/workspace`").
   - The probable root cause.
   - The Tier 0 row to reopen.
4. Open (or reopen) the named Tier 0 row with the failure description.
5. Once the underlying row is re-shipped, re-claim **this** verification row and run the full suite again. Partial reruns are not allowed.

## Acceptance criteria

- [ ] Every box in sections A–F checked.
- [ ] No new code or migration committed in this row (verification-only).
- [ ] `00-README.md` and `docs/AUTH_GUARDRAILS_TIER_1.md` updated with the verification timestamp.

## Out of scope

- Fixing failures (they go back to the originating Tier 0 row).
- Verifying any Tier 1 behavior — Tier 1 prompts come **after** this gate.

## Handoff

Delta Out:
- "Tier 0 verified ✅" or "Blocked on <row>: <failing check>".
- Timestamp.
- Confirmation that the README and parent plan have been annotated.

When this row ships green, the following Tier 1 rows are simultaneously unblocked:
- `GR-T1-1-require-account-prompt.md`
- `GR-T1-6-safe-redirect-prompt.md` (always was)
- `GR-T1-7-edge-middleware-prompt.md`
- `GR-T1-8-verb-hygiene-prompt.md` (always was)

(1.2, 1.3, 1.4, 1.5 chain off 1.1 / 1.3.)
