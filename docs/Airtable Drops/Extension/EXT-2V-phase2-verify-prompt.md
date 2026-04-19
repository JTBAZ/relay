# EXT-2V — Phase 2 verification suite

## Context

You are running the **Phase 2 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.C. Confirms the **`extension/`** workspace installs, builds **dev** and **prod** Chrome artifacts, and loads unpacked without service-worker errors. **No new feature code** — verification and `00-README.md` timestamp only.

## Preconditions

- [ ] `EXT-2A-workspace-tooling-prompt.md` shipped.
- [ ] `EXT-2B-production-manifest-prompt.md` shipped.

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) § Tier 0 invariants (lines 87–94) plus extension add-on. Failures reopen `EXT-2A` or `EXT-2B`, not this row.

## Goal

Extension scaffold is loadable; **prod** output is free of **localhost** (P-12); **dev** output includes localhost for local API/web testing.

## Reference reading

1. [`EXT-2A-workspace-tooling-prompt.md`](EXT-2A-workspace-tooling-prompt.md)
2. [`EXT-2B-production-manifest-prompt.md`](EXT-2B-production-manifest-prompt.md)
3. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §2.C — Phase 2 verification gate

## Verification checklist

### A. Install + build

- [ ] **A1.** `cd extension && npm i` — succeeds.
- [ ] **A2.** `npm run build:chrome:dev` — succeeds; output directory contains `manifest.json` with **localhost** in `host_permissions` or `externally_connectable` (spot-check file).

### B. Production cleanliness (P-12)

- [ ] **B1.** `npm run build:chrome:prod` — succeeds.
- [ ] **B2.** `rg localhost extension/dist/chrome-prod/` — **zero** lines.

### C. Manual — Chrome load

- [ ] **C1.** `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/dist/chrome-dev/` (or path from README).
- [ ] **C2.** Extension tile shows with **placeholder** icon; open **service worker** console — **no** uncaught errors on load.
- [ ] **C3.** Open popup — empty/placeholder is OK; no blank crash.

### D. Optional — Firefox artifact

- [ ] **D1.** If `build:firefox:prod` exists: build succeeds; note any AMO sideload quirk in Delta Out (optional for gate if team targets Chrome-only for this sprint — then check **D1** as N/A and document).

### E. Documentation

- [ ] **E1.** Update [`00-README.md`](00-README.md) — **Phase 2 verified ✅ YYYY-MM-DD**.

## Failure handling

If **any** box fails (count D1 as required unless marked N/A with team approval):

1. **Do not patch in this row.**
2. Identify `EXT-2A` vs `EXT-2B` root cause.
3. Mark **Blocked**; Delta Out: failing check + row to reopen.
4. After fix, re-run **entire** checklist. **No partial reruns.**

## Acceptance criteria

- [ ] A–C complete; D per team scope; E complete.
- [ ] No feature commits (README timestamp only).

## Out of scope

- Phase 3 sync logic, consent exchange from extension, popup states.
- Web app Phase 1 re-verification.

## Handoff

Delta Out:

- “Phase 2 verified ✅” or “Blocked on `EXT-2X`”.
- Exact `dist/` paths used for unpacked load.
- Firefox status (verified / deferred).

When green, next claimable (parallel after `EXT-2V`):

- `EXT-3A-storage-shape-prompt.md` first; then `EXT-3B-background-worker-prompt.md`, `EXT-3C-sync-now-prompt.md`, `EXT-3D-cross-browser-shim-prompt.md` in parallel per dependency graph; then `EXT-3V-phase3-verify-prompt.md`.
