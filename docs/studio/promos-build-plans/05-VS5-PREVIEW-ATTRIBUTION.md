# VS5 Build Plan — Preview and Attribution Readiness

## Outcome

Make Preview explain the real locked-viewer result for a selected Promo Piece and establish a stable, honest attribution handoff for future placement, click, and conversion systems.

## Preconditions

- VS1–VS4 pass.
- Promo Pieces have stable IDs.
- Tier Rule summaries and code state are current.

## Scope

In:
- Exact card-to-preview selection.
- Audience simulation parity.
- Effective source/status explanation.
- Nullable performance contract and honest no-data state.
- Versioned future placement/attribution specification.

Out:
- Discovery/feed insertion.
- Impression generation.
- Patreon webhook/conversion reconciliation.
- Mock metrics from Action Center.
- Marketing Previewizer/teaser generation.

## Required reading

1. `AGENTS.md`
2. `web/app/studio/promos/PromosHubView.tsx`
3. `web/app/components/studio/AudienceSimulatorSection.tsx`
4. `web/app/components/visitor/LockedPromoOverlay.tsx`
5. `src/marketing/offer-redirect-service.ts`
6. `src/platform-metrics/first-party-event-contract.ts`

## Locked decisions

- Preview consumes the same `fetchAudienceSimulation` envelope as Hero; it does not recreate permission logic client-side.
- Allowed viewers receive content/no promo. Hidden viewers never receive promo data.
- `effective_promo.source` remains `explicit | tier_default`.
- Promo Pool membership is context, not another offer-precedence source.
- No numeric performance value is shown unless returned by a real backend.
- Future attribution must carry `promo_piece_id`, `post_id`, and a placement/impression identifier; rank alone is not identity.

## Todo work items

### VS5-T01 — Characterize Preview parity

Depends on: none.

Steps:
1. Add tests for:
   - card Preview selects the exact stable Promo Piece;
   - anonymous locked result with tier default;
   - explicit override wins;
   - entitled persona has no promo;
   - public/no-gate piece has no matching Tier Rule;
   - deleted/unresolved legacy target;
   - simulation loading/error/retry;
   - tracked URL presence/absence.
2. Assert the shared `LockedPromoOverlay` receives the server DTO unchanged.

Acceptance:
- Tests prohibit client-side fabrication of `effective_promo`.

### VS5-T02 — Build the Preview view model

Depends on: VS5-T01.

Target files:
- new `web/app/studio/promos/promo-preview-model.ts`
- pure tests beside it

Steps:
1. Join selected Promo Piece, promotion hub summary, simulation persona, matching rule, code state, and explicit source.
2. Produce a compact status chain:
   - In Promo Pool;
   - access gate;
   - matching Tier Rule or no match;
   - effective source;
   - code/CTA;
   - tracked-link readiness.
3. Model unresolved and no-data states explicitly.
4. Keep output display-only; never mutate access or offers.

Acceptance:
- All status copy is derived from server-backed inputs.
- Source and tracked-link status cannot contradict the simulation DTO.

### VS5-T03 — Rebuild the Preview tab

Depends on: VS5-T02.

Target files:
- new `web/app/studio/promos/PromoPreviewPanel.tsx`
- `web/app/studio/promos/PromosHubView.tsx`
- `web/app/studio/promos/PromoPieceCard.tsx`

Steps:
1. Move simulation state/effects out of the hub monolith.
2. Selecting Preview on a card passes `promo_piece_id`, then resolves its post.
3. Keep persona pills and shared locked overlay.
4. Add the compact status chain beside/below the visual.
5. Keep the link to Hero Audience & Promotion for per-post editing.
6. Add retry for simulation failure and a clear explanation for pieces without a locked persona.

Acceptance:
- Deep link `?post_id=` remains compatible.
- Switching pieces cannot show the previous piece's simulation while loading.

### VS5-T04 — Add an honest performance contract

Depends on: VS5-T02.

Target files:
- `web/lib/relay-api.ts`
- new shared attribution contract module in `src/marketing/` or `src/platform-metrics/`
- mirrored web type if needed

Steps:
1. Define `PromoPerformanceSummary` with nullable or absent:
   - impressions;
   - clicks;
   - conversions;
   - conversion value;
   - measurement window.
2. Define `PromoAttributionContextV1` server-side as the canonical contract.
3. Return no summary, or an explicit unavailable state, until a real service owns the values.
4. Remove any temptation to import Action Center's local `PROMO_PIECES` metrics.

Acceptance:
- UI renders “No distribution data yet” when unavailable.
- Zero and unavailable are distinct states.

### VS5-T05 — Specify the future event handoff

Depends on: VS5-T04.

Target docs/contracts:
- `docs/studio/TRACKED_OFFER_LINKS.md`
- `src/platform-metrics/first-party-event-contract.ts` as documentation/status only where appropriate

Specify:
1. Future placement creates an opaque `placement_id`/`impression_id`.
2. Impression event requires creator, Promo Piece, post, placement, surface, and timestamp.
3. Click carries the opaque context into `/go/:slug`; the server validates ownership/context before recording.
4. Tier-default clicks need post and Promo Piece context for per-piece reporting.
5. Conversion reconciliation references the click/placement context when Patreon supplies a trustworthy subscription event.
6. Privacy stores host-only referrer and no raw destination/query data.
7. Event implementation status remains planned until writes and tests exist.

Acceptance:
- The contract is implementable later without using slot rank as a permanent key.
- This todo makes no algorithmic insertion or conversion claims.

### VS5-T06 — Close Preview tests

Depends on: VS5-T03, VS5-T05.

Required tests:
- exact card selection and race cancellation;
- persona outcomes;
- source precedence;
- tracked-link states;
- no-match and unresolved states;
- unavailable versus zero performance;
- hidden/allowed no-leak regressions;
- deep-link compatibility.

Verification:
```bash
npx vitest run tests/web/promos-hub-preview.test.tsx
npx vitest run tests/marketing/effective-marketing-offer.test.ts tests/audience-simulation.test.ts tests/offer-redirect-service.test.ts
npx vitest run tests/patron/assemble-patron-feed.test.ts
npm run typecheck
npm run lint --prefix web
```

## Slice exit gate

A creator can select any current Promo Piece, inspect each persona's real effective offer and source, and see an honest unavailable performance state. No test or UI implies that Promo Pool placement/conversion ingestion already exists.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS5-T01 + VS5-T02. Lock parity and create the pure view model.
- **Batch 2 — 2 todos:** VS5-T03 + VS5-T04. Rebuild Preview and add the honest performance contract.
- **Batch 3 — 2 todos:** VS5-T05 + VS5-T06. Document the future handoff and close regressions.

Recommended maximum: **2 todo items per builder prompt**.
