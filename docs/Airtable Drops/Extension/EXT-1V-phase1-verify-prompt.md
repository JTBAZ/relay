# EXT-1V — Phase 1 verification suite

## Context

You are running the **Phase 1 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.D. This row confirms the **web** changes (consent page, connected-extensions page, cookie CTA) integrate with **Phase 0** APIs. **No feature code** in this row — checks, manual flows, and documentation timestamp only.

## Preconditions

- [ ] `EXT-1A-consent-page-prompt.md` shipped.
- [ ] `EXT-1B-connected-extensions-page-prompt.md` shipped.
- [ ] `EXT-1C-cookie-page-cta-prompt.md` shipped.
- [ ] `EXT-0V-phase0-verify-prompt.md` previously shipped (API foundation).

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) § Tier 0 invariants (lines 87–94) plus the extension add-on in that section. This gate **verifies** they still hold — failures reopen `EXT-1A` / `EXT-1B` / `EXT-1C` (or Phase 0 if API regression), not patched here.

## Goal

Prove Phase 1 is green: **`npm run build --prefix web`**, root **`npm run test`**, and manual consent + grants flow against deployed Phase 0.

## Reference reading

1. [`EXT-1A-consent-page-prompt.md`](EXT-1A-consent-page-prompt.md)
2. [`EXT-1B-connected-extensions-page-prompt.md`](EXT-1B-connected-extensions-page-prompt.md)
3. [`EXT-1C-cookie-page-cta-prompt.md`](EXT-1C-cookie-page-cta-prompt.md)
4. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §1.D — Phase 1 verification gate
5. [`AGENTS.md`](../../../AGENTS.md) — test invocation (root Vitest for web-related tests)

## Verification checklist

### A. Automated

- [ ] **A1.** `npm run build --prefix web` — green.
- [ ] **A2.** `npm run test` at repo root — green.

### B. Middleware + routing

- [ ] **B1.** Logged-out: `/extension/authorize?...` → `/login?returnTo=...`; after login, returns to authorize URL.
- [ ] **B2.** Logged-out: `/settings/connected-extensions` → login bounce.

### C. Consent + grants (manual)

- [ ] **C1.** With Phase 0 API running: logged-in user on `/extension/authorize` with valid `ext_id` + `installation_id` sees authorize card; **Authorize** calls `consent/start` successfully (Network tab).
- [ ] **C2.** With **`chrome.runtime.sendMessage` stubbed** in DevTools (per plan §1.D), handshake completes without thrown errors in console.
- [ ] **C3.** `/settings/connected-extensions` lists the new grant after successful consent; **Revoke** removes it and extension/Bearer calls would get **401** (spot-check with `curl` if extension not built yet).

### D. Cookie page regression

- [ ] **D1.** Manual paste flow on `/patreon/cookie` still saves and reads status when signed in.
- [ ] **D2.** Extension CTA visible first; advanced manual section collapsed by default.

### E. Regression — repo hygiene

- [ ] **E1.** `rg "fetch\\(\"/api/" web/app/extension/ web/app/settings/connected-extensions/` — no raw app `fetch` to `/api/` (test fixtures excluded if any).

### F. Documentation

- [ ] **F1.** Update [`00-README.md`](00-README.md) — add **Phase 1 verified ✅ YYYY-MM-DD** (single line near Phase 0 verification line).

## Failure handling

If **any** box fails:

1. **Do not patch in this row.** This is a verification gate, not a fix shop.
2. Identify the failing deliverable (B* / C* → likely `EXT-1A` or `EXT-1B`; D* → `EXT-1C` or Phase 0; A* → any).
3. Mark this row **Blocked**. In Delta Out: failing check, probable cause, and **`EXT-1*`** row to reopen.
4. Reopen the named row; after fix merges, re-run **this entire checklist** from scratch. **Partial reruns are not allowed.**

## Acceptance criteria

- [ ] Every box in A–F checked.
- [ ] No feature commits in this row (timestamp line in `00-README.md` only).
- [ ] `00-README.md` shows Phase 1 verified date.

## Out of scope

- Fixing Phase 1 implementation failures.
- Phase 2+ extension scaffold verification.
- Store submission or production extension IDs.

## Handoff

Delta Out:

- “Phase 1 verified ✅” or “Blocked on `EXT-1X`: &lt;check&gt;”.
- Timestamp; note if manual checks used **local** vs **staging** API.

When green, next claimable:

- `EXT-2A-workspace-tooling-prompt.md` → `EXT-2B-production-manifest-prompt.md` → `EXT-2V-phase2-verify-prompt.md` (strict sequence).
