# VS6 Build Plan — Verification and Rollout

## Outcome

Prove the complete `/studio/promos` workflow across API, web UI, permission safety, browser behavior, and documentation before treating the enhancement as complete.

## Preconditions

- VS1–VS5 implementation todos are complete.
- Their focused test suites pass independently.

## Scope

In:
- Cross-slice regression tests.
- Browser verification.
- Accessibility and responsive checks.
- Documentation and route inventory.
- Build/lint/type gates.
- Required local stack restart and health confirmation.

Out:
- Opportunistic refactors outside promos.
- Fixing unrelated existing failures without evidence they block this feature.
- CI/PR/commit operations unless separately requested.

## Required reading

1. `AGENTS.md`
2. `.cursor/rules/rescue-workflow-always.mdc`
3. `docs/qa/LOCKED_VIEWER_PROMOTION_WIRING.md`
4. `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`
5. `docs/studio/AUDIENCE_PROMOTION_CONVERSION.md`
6. `docs/studio/promos-build-plans/00-README.md`

## Verification rule

Verification todos diagnose and report failures. Fix only failures introduced by VS1–VS5 or necessary to satisfy their stated acceptance criteria. Record unrelated pre-existing failures separately.

## Todo work items

### VS6-T01 — Audit test coverage against every slice

Depends on: none.

Steps:
1. Map each VS1–VS5 acceptance statement to at least one automated test or explicit browser check.
2. Add missing cross-slice cases:
   - Add Post → Make Promos → cards;
   - reorder preserves identity;
   - Linked Set members remain separate;
   - gate change updates inherited count;
   - code creation updates rule draft;
   - card Preview shows matching source;
   - visitor/patron does not receive owner marker.
3. Avoid snapshot-only assertions for behavior.

Acceptance:
- No acceptance criterion is left with “manual” as the only evidence unless it is inherently visual.

### VS6-T02 — Run focused and permission regressions

Depends on: VS6-T01.

Run:
```bash
npx vitest run tests/creator-promo-slots.test.ts tests/creator-promo-slots-route.test.ts
npx vitest run tests/web/promos-hub-pieces.test.tsx tests/web/promos-hub-tier-rules.test.tsx tests/web/promos-hub-codes.test.tsx tests/web/promos-hub-preview.test.tsx
npx vitest run tests/marketing/effective-marketing-offer.test.ts tests/offer-redirect-service.test.ts tests/audience-promotion/
npx vitest run tests/patron/assemble-patron-feed.test.ts
```

Steps:
1. Fix feature-caused failures in the owning slice.
2. Re-run the narrow failing suite, then the complete focused set.
3. Record unrelated failures with command and exact message.

Acceptance:
- Promo, marketing, audience, and patron permission regressions pass.

### VS6-T03 — Run static and production gates

Depends on: VS6-T02.

Run:
```bash
npm run typecheck
npm run build
npm run lint --prefix web
npm run build --prefix web
```

Steps:
1. Resolve only errors caused by the feature or required for its production build.
2. Check recently edited files for IDE lint diagnostics.
3. Confirm no hardcoded test creator/persona IDs entered production runtime.
4. Confirm no raw Patreon destination leaks into patron DTOs.

Acceptance:
- Root and web production builds pass.
- No new lint or type errors remain.

### VS6-T04 — Browser-test the creator workflow

Depends on: VS6-T03.

Required desktop scenarios:
1. Empty pool: exact empty state and Add Post button placement.
2. Modal: all active posts, search, separate Linked Set members, max five, keyboard close/focus return.
3. Save one, then five; refresh; reorder; remove; remove all.
4. Tier Rules: real matching count, no-match case, edit/delete, tracked link.
5. Codes: create, assign, deactivate with usage, restore rule draft.
6. Preview: anonymous locked, below-tier locked, entitled, explicit override, no-rule piece.
7. Error recovery: simulate or observe failed list/save response where practical.

Required responsive scenarios:
- 375px mobile;
- tablet-width modal/card grid;
- desktop reference width matching the supplied `/studio/promos` screenshot.

Acceptance:
- No horizontal overflow, clipped modal footer, inaccessible action, stale card, or contradictory status.

### VS6-T05 — Browser-test patron safety

Depends on: VS6-T03.

Scenarios:
1. Locked patron/visitor sees the same `LockedPromoOverlay` and tracked CTA as Preview.
2. Entitled viewer sees content and no promo overlay.
3. Hidden creator post is absent from upsell surfaces.
4. Owner-only `promo_piece_id`/rank markers are absent from patron/public network DTOs.
5. `/go/:slug` redirects without exposing raw destination in the prior DTO.

Acceptance:
- Promo Pool membership never changes access outcome or export redaction.

### VS6-T06 — Update canonical documentation

Depends on: VS6-T02.

Target files:
- `docs/qa/LOCKED_VIEWER_PROMOTION_WIRING.md`
- `docs/studio/AUDIENCE_PROMOTION_CONVERSION.md`
- `docs/studio/TRACKED_OFFER_LINKS.md`
- `docs/web-route-inventory.md`

Steps:
1. Add the empty-to-promo golden path and separate Linked Set member check.
2. Replace the old placeholder inherited-count language with server-computed behavior.
3. Document stable Promo Piece identity and owner-only markers.
4. State explicitly that placement, impressions, and Patreon conversion ingestion are future work.
5. Add `/studio/promos` and its supported deep link to route inventory.
6. Remove or correct copy claiming unimplemented tip/revenue behavior if encountered in touched promo surfaces.

Acceptance:
- Docs no longer label the old read-mostly Pieces UX as complete.
- Shipped and planned attribution stages are distinguishable.

### VS6-T07 — Restart and final health check

Depends on: VS6-T04, VS6-T05, VS6-T06.

Run:
```bash
npm run dev:stack:restart
```

Steps:
1. Confirm API listens on 8787 and web on 3000.
2. Reopen `/studio/promos` and perform a short smoke: load, open modal, close, switch all tabs.
3. Report final pass/fail status, test commands, browser scenarios, unrelated failures, and remaining out-of-scope dependencies.

Acceptance:
- The refreshed stack serves the implemented code.
- No work is declared complete while a feature-owned gate is failing.

## Slice exit gate

All automated gates pass, the desktop/mobile creator path passes, patron safety passes, canonical docs are current, and the restarted local stack is healthy.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS6-T01 + VS6-T02. Close cross-slice automated behavior and permission regressions.
- **Batch 2 — 1 todo:** VS6-T03. Run static/production gates in isolation.
- **Batch 3 — 2 todos:** VS6-T04 + VS6-T05. Browser-test creator UX and patron safety in one running stack.
- **Batch 4 — 2 todos:** VS6-T06 + VS6-T07. Update docs, restart, smoke-test, and report.

Recommended maximum: **2 todo items per builder prompt**; keep the production-gate batch to **1 todo**.
