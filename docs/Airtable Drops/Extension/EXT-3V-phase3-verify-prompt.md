# EXT-3V — Phase 3 verification suite

## Context

You are running the **Phase 3 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.E. Proves the **background worker**, **storage**, **sync**, and **browser shim** work with **Phase 0 + 1** deployed locally (or staging). **No feature code** — verification, grep audits, and `00-README.md` timestamp.

## Preconditions

- [ ] `EXT-3A-storage-shape-prompt.md` shipped.
- [ ] `EXT-3B-background-worker-prompt.md` shipped.
- [ ] `EXT-3C-sync-now-prompt.md` shipped.
- [ ] `EXT-3D-cross-browser-shim-prompt.md` shipped.
- [ ] `EXT-0V` and `EXT-1V` shipped on the environment under test.

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) lines 87–94 plus extension add-on. Failures reopen **`EXT-3A`–`EXT-3D`** as appropriate — not this row.

## Goal

Manual E2E for consent + sync + revoke; automated grep proves no `cookie.value` logging in `extension/src/`.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §3.E — Phase 3 verification gate.
2. [`EXT-3B-background-worker-prompt.md`](EXT-3B-background-worker-prompt.md)
3. [`EXT-3C-sync-now-prompt.md`](EXT-3C-sync-now-prompt.md)

## Verification checklist

### A. Build + load

- [ ] **A1.** `cd extension && npm run build:chrome:dev` — green.
- [ ] **A2.** Load unpacked `dist/chrome-dev/` — service worker runs without uncaught errors on open.

### B. Consent + grant

- [ ] **B1.** With local/staging API + web: open extension flow → `/extension/authorize` → Authorize → extension receives code → **`consent/exchange`** succeeds → grant in `browser.storage.local`.
- [ ] **B2.** Service worker console: **no** errors during happy path.

### C. Sync + cookie change

- [ ] **C1.** After grant: Patreon `session_id` present → **`SYNC_NOW`** stores cookie server-side (verify encrypted store: `.relay-data/cookie-store.json` **or** DB per environment) under correct **`creator_id`**.
- [ ] **C2.** Edit `session_id` in Patreon DevTools (simulate change) → **`cookies.onChanged`** triggers sync within seconds (plan §3.E).

### D. Revoke

- [ ] **D1.** Revoke grant from **`/settings/connected-extensions`** → next **`SYNC_NOW`** clears local grant with **`grant_revoked`** (or equivalent) per plan.

### E. Static audit — logging / leakage

- [ ] **E1.** `rg "console\.log\(.*cookie" extension/src/` — **zero** hits that would log `cookie.value` (plan §3.E).
- [ ] **E2.** Spot-read `background.ts` and `sync-now.ts` (paths as implemented): no `console.log` of grant token or cookie string.

### F. Regression

- [ ] **F1.** `npm run test` at repo root — green if extension tests added; otherwise note N/A.
- [ ] **F2.** `npm run build --prefix web` — green (no accidental web break).

### G. Documentation

- [ ] **G1.** Update [`00-README.md`](00-README.md) — **Phase 3 verified ✅ YYYY-MM-DD**.

## Failure handling

If **any** required box fails:

1. **Do not patch in this row.**
2. Map failure to `EXT-3A` (storage), `EXT-3B` (wiring), `EXT-3C` (HTTP/cookie read), or `EXT-3D` (polyfill).
3. Mark **Blocked**; Delta Out: check id, row, hypothesis.
4. After fix, re-run **entire** checklist. **No partial reruns.**

## Acceptance criteria

- [ ] A–E complete; F as applicable; G complete.
- [ ] No feature commits (README timestamp only).

## Out of scope

- Phase 4 popup polish verification.
- Store submission.

## Handoff

Delta Out:

- “Phase 3 verified ✅” or “Blocked on `EXT-3X`”.
- Environment used (local docker vs staging).
- Any flakiness in `cookies.onChanged` timing.

When green, next claimable: `EXT-4A-popup-ui-prompt.md` → `EXT-4V-phase4-verify-prompt.md`.
