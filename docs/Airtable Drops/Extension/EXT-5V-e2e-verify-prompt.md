# EXT-5V — End-to-end verification (staging test matrix)

## Context

You are running the **Phase 5 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §5.A–5.B. This validates the **full chain** on **staging** (or equivalent) before store submission. Mixes **automated** checks (`curl`, `rg`, rate limit) with **manual** UI flows. **HUMAN ACTION REQUIRED:** a real Patreon creator account and time for matrix execution (§5.B).

## Preconditions

- [ ] `EXT-4V-phase4-verify-prompt.md` shipped green.
- [ ] Staging (or local stack) runs Phase **0–4** artifacts: API, web, extension dev/prod builds as appropriate.
- [ ] **Operator:** Patreon creator test account available; can capture **screenshots** for store listings during this pass (§5.B).

## Tier 0 invariants (always apply)

1. **No JS reads `relay_session`.** It is `HttpOnly`. Web code never sees the token.
2. **No handler grants permission based on `relay_active_role`.** That cookie is a UI hint. Authz is derived from DB rows (`Account.primaryRelayCreatorId`, `TenantMembership`).
3. **No FK or RLS policy references `public_slug` or `relay_creator_id`.** Both can change shape under us; `Tenant.id` (UUID) is the only safe key.
4. **One Account, one Supabase user, one cookie.** A second simultaneous sign-in must invalidate the first server-side.
5. **All web calls go through `relayFetch`.** Raw `fetch("/api/...")` is forbidden after Stage 1.3 lands.
6. **All `/api/v1/*` routes use `requireAccount` / `requireAccountWithRole`** unless explicitly public with a `// PUBLIC: <reason>` comment.
7. **All redirects derived from user input pass through `resolvePostAuthPath`.**
8. **All mutations use POST/PUT/PATCH/DELETE.** GETs are side-effect-free.
9. **Extension:** no telemetry (P-5); cookie value never logged; consent + cookie flows use correct verbs per [`docs/qa/HTTP_VERB_HYGIENE.md`](../../qa/HTTP_VERB_HYGIENE.md).

## Goal

Every row of the §5.A matrix is exercised with **Expected** outcomes observed; evidence (notes, screenshots, HTTP traces) captured for store submission prep.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §5.A — Test matrix (table).
2. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §5.B — Human gate text.
3. [`00-README.md`](00-README.md) — dependency context.

## Verification checklist

Map each scenario to a box. **All must be checked** (mark **N/A** only with operator-written justification, e.g. cannot simulate day 29 in one session — then schedule follow-up).

### A. Happy path + consent edge cases

- [ ] **A1.** Fresh install → consent → cookie capture — grant stored; cookie encrypted server-side for correct `creator_id`.
- [ ] **A2.** Consent code expires (wait **61s**) — `consent/exchange` returns **410**; popup shows **“Consent expired, try again”** (or equivalent copy from `EXT-4A`).
- [ ] **A3.** Replay consent code — **409** `CONSENT_CODE_USED`.

### B. Cookie + sync behavior

- [ ] **B1.** Patreon `session_id` deleted in DevTools — next sync → `no_patreon_cookie`; popup reflects state.
- [ ] **B2.** User re-logs into Patreon — `cookies.onChanged` path posts new value without extra click.

### C. Revocation + uninstall semantics

- [ ] **C1.** User revokes grant on `/settings/connected-extensions` — next `SYNC_NOW` → `grant_revoked`; popup **Connect** state.
- [ ] **C2.** User **uninstalls** extension — server grant remains until expiry or user revokes; behavior matches **privacy policy** text after `EXT-6A` (re-verify policy sentence if 6A not merged — note dependency).

### D. Token + security

- [ ] **D1.** Token sliding renewal — **if practical:** exercise near TTL or use DB clock manipulation; else **N/A** with follow-up ticket and operator sign-off.
- [ ] **D2.** Wrong extension origin → `consent/exchange` — CORS preflight rejects (§0.E).
- [ ] **D3.** Extension `POST /api/v1/patreon/cookie` with **`creator_id`** not owned by account — **403 FORBIDDEN**.
- [ ] **D4.** Rate limit — **61st** `consent/exchange` from one IP in 5 min → **429**.

### E. Firefox

- [ ] **E1.** Firefox build sideloaded — same flow E2E as Chrome (matrix §5.A last row).

### F. Regression + hygiene

- [ ] **F1.** `npm run test` at repo root — green.
- [ ] **F2.** `npm run build` at repo root — green.
- [ ] **F3.** `npm run build --prefix web` — green.
- [ ] **F4.** `rg "console\.log\(.*cookie" extension/src/` — zero bad hits (spot-check).

### G. Human — operator sign-off (§5.B)

- [ ] **G1.** **HUMAN ACTION REQUIRED — staging account:** Operator confirms matrix run complete; **screenshots** captured for store listings where useful.

### H. Documentation

- [ ] **H1.** Update [`00-README.md`](00-README.md) — **Phase 5 verified ✅ YYYY-MM-DD** (and environment name).

## Failure handling

If **any** non-N/A box fails:

1. **Do not “fix” in this row** — open or reopen the failing Phase (`EXT-0*` … `EXT-4*`) or file a bug.
2. Mark **Blocked**; Delta Out: scenario id (e.g. **D4**), observed vs expected, owner.
3. After fix, **re-run the full matrix** from A1. Partial reruns not allowed for final sign-off.

## Acceptance criteria

- [ ] A–H complete (N/A items documented).
- [ ] No production code commits in this row (README / notes only if team allows).

## Out of scope

- Store submission (`EXT-6H`).
- Production env var updates (`EXT-7H`).

## Handoff

Delta Out:

- Matrix result summary + link/path to screenshot folder.
- Any N/A rows and follow-ups (especially **D1**).
- “Phase 5 verified ✅” or “Blocked on …”.

When green, next claimable: **`EXT-6A-privacy-policy-prompt.md`** and **`EXT-6B-store-listings-prompt.md`** in parallel; then **`EXT-6H`** → **`EXT-6V`**.
