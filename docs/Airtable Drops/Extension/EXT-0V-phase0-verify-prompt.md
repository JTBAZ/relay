# EXT-0V — Phase 0 verification suite

## Context

You are running the **Phase 0 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md). This is a **gate row**: it proves backend prerequisites (0.A–0.E) are shippable before any Phase 1 web or `extension/` work. **No production code changes** belong in this row — only running checks, manual validation, and annotating index metadata with a verification timestamp.

## Preconditions

All five Phase 0 build rows **must be merged** on the integration branch:

- [ ] `EXT-0A-cookie-endpoint-auth-prompt.md` shipped — Patreon cookie routes require `requirePatronBearerSession` + `requireAccountMatchesCreator`.
- [ ] `EXT-0B-session-kind-extension-ttl-prompt.md` shipped — `Session.kind`, `issueExtensionSession`, `touchSessionExpiry` (fire-and-forget).
- [ ] `EXT-0C-extension-consent-endpoints-prompt.md` shipped — consent start/exchange + grants list/delete.
- [ ] `EXT-0D-rate-limiting-prompt.md` shipped — limiters wired.
- [ ] `EXT-0E-cors-extension-allowlist-prompt.md` shipped — `RELAY_EXTENSION_ORIGINS` behavior.

If any precondition is unmet, mark this row **Blocked** with Delta Out naming the missing prompt.

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) § “Tier 0 invariants” lines 87–94, plus the extension add-on in that section. This row **verifies** they still hold after Phase 0 — failures mean a Phase 0 build row must be reopened, not patched here.

## Goal

A passing run means: **Phase 0 is safe to deploy and manual cookie ingest still works; Phase 1 prompts may be claimed.**

## Reference reading

1. [`EXT-0A-cookie-endpoint-auth-prompt.md`](EXT-0A-cookie-endpoint-auth-prompt.md)
2. [`EXT-0B-session-kind-extension-ttl-prompt.md`](EXT-0B-session-kind-extension-ttl-prompt.md)
3. [`EXT-0C-extension-consent-endpoints-prompt.md`](EXT-0C-extension-consent-endpoints-prompt.md)
4. [`EXT-0D-rate-limiting-prompt.md`](EXT-0D-rate-limiting-prompt.md)
5. [`EXT-0E-cors-extension-allowlist-prompt.md`](EXT-0E-cors-extension-allowlist-prompt.md)
6. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.F — Phase 0 verification gate

## Verification checklist

Run each of the following. **Every box must be checked** before marking Phase 0 verified.

### A. Automated builds + tests

- [ ] **A1.** `npm run test` at repo root — green.
- [ ] **A2.** `npm run build` at repo root — green.
- [ ] **A3.** `npm run build --prefix web` — green (no breaking change to web API contract per [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.F).

### B. Cookie endpoint auth regression

- [ ] **B1.** `curl` (or equivalent) `POST /api/v1/patreon/cookie` with JSON body and **no** `Authorization` header and **no** session cookie — returns **401** per §0.A acceptance.
- [ ] **B2.** `GET /api/v1/patreon/cookie/status` without auth — **401**.

### C. Consent + grants (API-level)

- [ ] **C1.** Integration or manual authenticated call: `POST /api/v1/auth/extension/consent/start` returns a `consent_code` (or envelope field name implemented in 0.C).
- [ ] **C2.** `POST /api/v1/auth/extension/consent/exchange` with valid code succeeds; **replay** returns **409** `CONSENT_CODE_USED` per plan.
- [ ] **C3.** `GET /api/v1/auth/extension/grants` when logged in returns list shape expected by Phase 1; `DELETE` revokes and subsequent Bearer use returns **401**.

### D. Rate limiting + CORS smoke

- [ ] **D1.** **61st** `consent/exchange` POST from one IP within the limiter window returns **429** (per §0.D).
- [ ] **D2.** Preflight or browser request to `/api/v1/auth/extension/*` from **unlisted** `chrome-extension://` origin is blocked; from **listed** origin (if configured in test env) succeeds per §0.E.

### E. Regression — existing flows still work

- [ ] **E1.** Manual: visit `web/app/patreon/cookie/page.tsx` while signed in — save Patreon cookie — still succeeds end-to-end (web uses cookie session per plan §0.A).
- [ ] **E2.** Web sign-in / session still ~24h; extension session behavior unchanged for web-only users (no accidental web TTL change).

### F. Human — operator ship gate

- [ ] **F1.** **HUMAN ACTION REQUIRED — Phase 0 ship gate** ([`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §0.F): Operator deploys Phase 0 to **staging**, confirms manual-paste flow and auth closure. Document completion in Delta Out (date, environment).

### G. Documentation annotation

- [ ] **G1.** Update [`00-README.md`](00-README.md) — add a line near the top: **Phase 0 verified ✅ YYYY-MM-DD** (or below the parent plan link).
- [ ] **G2.** Optionally add a one-line note under §0.F in [`EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) pointing to verification date — only if the team wants the parent plan mirrored (minimal edit).

## Failure handling

If **any** box fails:

1. **Do not patch in this row.** This is a verification gate, not a fix shop.
2. Identify which Phase 0 row’s deliverable failed (B* → 0.A; C* → 0.C; D1 → 0.D; D2 → 0.E; E* → potentially any).
3. Mark this row **Blocked**. In Delta Out, name:
   - The failing check (e.g. “B1 failed: unauthenticated POST returned 200”).
   - The probable root cause.
   - The `EXT-0*` row to reopen.
4. Open (or reopen) the named Phase 0 row with the failure description.
5. Once the underlying row is re-shipped, re-claim **this** verification row and run the full suite again. **Partial reruns are not allowed.**

## Acceptance criteria

- [ ] Every box in sections A–G checked.
- [ ] No feature code or migrations committed in this row (documentation timestamp lines only).
- [ ] [`00-README.md`](00-README.md) shows Phase 0 verified date.

## Out of scope

- Fixing failures (reopen `EXT-0A` … `EXT-0E`).
- Verifying Phase 1+ (`EXT-1A` onward).
- Publishing the browser extension or updating store URLs.

## Handoff

Delta Out:

- “Phase 0 verified ✅” or “Blocked on `EXT-0X`: &lt;failing check&gt;”.
- Timestamp and staging confirmation for **F1**.
- Any env vars staging must set (`RELAY_EXTENSION_CONSENT_SECRET`, `RELAY_EXTENSION_ORIGINS` test values).

When green, the following rows are simultaneously unblocked:

- `EXT-1A-consent-page-prompt.md`
- `EXT-1B-connected-extensions-page-prompt.md`
- `EXT-1C-cookie-page-cta-prompt.md` (all three parallel; then `EXT-1V-phase1-verify-prompt.md`)
