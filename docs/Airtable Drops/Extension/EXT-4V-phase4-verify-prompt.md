# EXT-4V — Phase 4 verification suite

## Context

You are running the **Phase 4 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §4.B. Validates **popup** states, **a11y**, **bundle size**, and **no cookie leakage** in compiled **`popup.js`**. **No feature code** — manual checks, `wc`, `rg`, README timestamp.

## Preconditions

- [ ] `EXT-4A-popup-ui-prompt.md` shipped.
- [ ] `EXT-3V-phase3-verify-prompt.md` shipped (background stable).

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) lines 87–94 plus extension add-on. Failures reopen **`EXT-4A`** (or **`EXT-3B`** if messaging broken) — not this row.

## Goal

All §4.B acceptance checks pass: four states, keyboard nav, **popup.js < 20kb**, no `cookie.value` / `session_id` substrings in **prod** popup bundle.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §4.B — Phase 4 verification gate.
2. [`EXT-4A-popup-ui-prompt.md`](EXT-4A-popup-ui-prompt.md)

## Verification checklist

### A. State coverage (manual)

Force each state using **`browser.storage.local`** + DevTools (or staged grant/cookie fixtures):

- [ ] **A1.** No grant — “Connect…” + consent action works.
- [ ] **A2.** Grant + happy sync — connected + relative time + Manage link + Disconnect confirm.
- [ ] **A3.** Grant + no Patreon cookie — message + opens Patreon login tab.
- [ ] **A4.** Grant + error — error text + Retry fires **`SYNC_NOW`**.

### B. Accessibility

- [ ] **B1.** Tab through interactive elements — order sensible.
- [ ] **B2.** Focus visible on buttons/links in light and dark (`prefers-color-scheme`).

### C. Bundle size + leakage (prod artifact)

- [ ] **C1.** `npm run build:chrome:prod` from `extension/`.
- [ ] **C2.** `wc -c extension/dist/chrome-prod/popup.js` (or actual emitted path for popup entry — adjust if CRXJS hashes filename; target the **popup** bundle) — **strictly < 20480** bytes per plan.
- [ ] **C3.** `rg "cookie\.value|session_id" extension/dist/chrome-prod/popup.js` — **zero** lines (plan §4.B). If build outputs minified single line, use `rg` still; if false positive from harmless minified identifier, document exact match and justify — default expectation is **zero hits**.

### D. Regression

- [ ] **D1.** `cd extension && npm run build:chrome:dev` — green.
- [ ] **D2.** Service worker still clean on reload (`EXT-3V` spot-check).

### E. Documentation

- [ ] **E1.** Update [`00-README.md`](00-README.md) — **Phase 4 verified ✅ YYYY-MM-DD**.

## Failure handling

If **any** box fails:

1. **Do not patch in this row.**
2. **C2/C3 failures** → reopen **`EXT-4A`** (or build config in **`EXT-2A`** if chunking explodes size).
3. **A*/B* failures** → reopen **`EXT-4A`** / **`EXT-3B`**.
4. Re-run full checklist after fix. **No partial reruns.**

## Acceptance criteria

- [ ] A–D complete; E complete.
- [ ] No feature commits (README timestamp only).

## Out of scope

- Phase 5 full matrix (`EXT-5V`).
- Firefox popup parity beyond “build succeeds” (optional note in Delta Out).

## Handoff

Delta Out:

- Actual **`popup.js`** path and byte count.
- “Phase 4 verified ✅” or “Blocked on …”.

When green, next claimable: `EXT-5V-e2e-verify-prompt.md`.
