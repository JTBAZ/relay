# VS3 Build Plan — Tier Rules Alignment

## Outcome

Replace the Tier Rules placeholder count and raw-ID form with a truthful, pool-aware workflow showing exactly which Promo Pieces inherit each locked-viewer marketing default.

## Preconditions

- VS1 and VS2 pass.
- Promo slots expose stable `promo_piece_id` and normalized `post_id`.

## Scope

In:
- Server-computed Promo Piece gate summary.
- Accurate inherited counts.
- Human tier labels.
- Compact create/edit/delete rule cards.
- Tracked-link status and Preview handoff.

Out:
- Changes to Layer A access rules.
- Bulk-copying defaults onto posts.
- New audience segments beyond `unpermissioned`.
- Placement or conversion tracking.

## Required reading

1. `AGENTS.md`
2. `docs/architecture/adr/004-pilot-three-layer-permissions.md`
3. `web/app/studio/promos/PromosHubView.tsx`
4. `src/marketing/effective-marketing-offer.ts`
5. `src/marketing/tier-promotion-default-service.ts`
6. `docs/qa/LOCKED_VIEWER_PROMOTION_WIRING.md`

## Locked decisions

- “Tier Rules” here means Layer C marketing defaults, not access gating.
- Inheritance key remains the post's normalized minimum Relay gate tier.
- Resolution precedence remains explicit post/persona offer → tier default → none.
- Counts include current Promo Pool posts only, not every gallery post.
- Public/all-patrons posts have no matching tier default and must be reported separately.
- Count computation belongs on the server; do not issue one simulation request per slot.

## Todo work items

### VS3-T01 — Characterize gate summaries

Depends on: none.

Steps:
1. Add tests for minimum-gate resolution across:
   - one concrete tier;
   - multiple tiers with catalog amounts;
   - unknown catalog amount;
   - public/all-patrons;
   - missing/deleted post;
   - legacy media target resolved to post.
2. Define the desired summary DTO:
   - rule/default ID and gate tier;
   - `inherited_piece_count`;
   - matching `promo_piece_ids`;
   - unmatched reason counts.
3. Assert counts use stable Promo Piece IDs.

Acceptance:
- The tests reuse `resolveMinimumGateRelayTierId`; no competing gate algorithm is introduced.

### VS3-T02 — Build the server summary

Depends on: VS3-T01.

Target files:
- new `src/marketing/promotion-hub-summary-service.ts`
- `src/server.ts`
- `web/lib/relay-api.ts`

Steps:
1. Load creator slots, normalized post tier IDs, creator tier catalog amounts, and tier defaults in bounded queries.
2. Resolve each Promo Piece's minimum gate with the existing pure helper.
3. Return matching stable IDs/counts plus unmatched reasons.
4. Add an authenticated creator endpoint such as `GET /api/v1/creator/promotion-hub-summary`.
5. Keep raw Patreon destinations out of any patron/public contract; this endpoint is creator-only.

Acceptance:
- No N+1 audience-simulation calls.
- A creator cannot query another creator's summary.
- Counts update when slot membership or post gates change.

### VS3-T03 — Add Tier Rule view models

Depends on: VS3-T02.

Target files:
- new `web/app/studio/promos/tier-rule-model.ts`
- tests beside the model

Steps:
1. Join defaults, tier catalog rows, discount codes, and server summaries.
2. Resolve human tier title and amount.
3. Produce create/edit form defaults and compact card rows.
4. Represent missing/deactivated code, missing destination, no matching pieces, and unmatched public pieces explicitly.
5. Keep draft state serializable so VS4 can preserve it during tab navigation.

Acceptance:
- No raw tier ID is used as primary creator-facing copy when a title exists.
- Empty and warning states are deterministic pure outputs.

### VS3-T04 — Rebuild the Tier Rules tab

Depends on: VS3-T03.

Target files:
- new `web/app/studio/promos/TierRulesPanel.tsx`
- optional `TierRuleCard.tsx`
- `web/app/studio/promos/PromosHubView.tsx`

Steps:
1. Move rule mutations and form state out of the hub monolith.
2. Present one concise editor for minimum gate, active code, headline, CTA, and Patreon destination.
3. Render saved rules as compact cards with tier title, code, active state, truthful inherited count, and tracked-link readiness.
4. Allow edit and delete with clear pending/error behavior.
5. Expand a rule's matching Promo Pieces on demand; do not show a dense list by default.
6. Add Preview links that select a matching Promo Piece.
7. Explain once that these defaults affect locked presentation and do not change access.

Acceptance:
- The old `inheritedCountByGate` zero-value placeholder is deleted.
- Existing save/delete API behavior and precedence remain intact.

### VS3-T05 — Add tracked-link parity

Depends on: VS3-T04.

Target files:
- new or generalized `TierDefaultTrackedLinkPanel.tsx`
- `web/app/components/studio/OfferTrackedLinkPanel.tsx`
- `web/lib/offer-tracked-link-qr.ts`

Steps:
1. Reuse link building, copy, and QR behavior without duplicating logic.
2. Use `ensureTierDefaultTrackedLink` for tier defaults.
3. Show destination/inactive warnings consistent with post offers.
4. Do not expose raw destination URLs in visitor-facing components.

Acceptance:
- A valid saved rule can mint, copy, and export a QR for `/go/:slug`.
- Missing destination cannot masquerade as a ready tracked link.

### VS3-T06 — Close Tier Rule tests

Depends on: VS3-T05.

Required tests:
- summary service and creator isolation;
- gate matching/unmatched cases;
- real inherited counts;
- create/edit/delete;
- active/inactive/missing code states;
- draft and mutation errors;
- tracked-link copy/QR;
- Preview handoff;
- explicit-over-default resolver regression.

Verification:
```bash
npx vitest run tests/marketing/effective-marketing-offer.test.ts tests/offer-redirect-service.test.ts
npx vitest run tests/creator-promo-slots.test.ts tests/web/promos-hub-tier-rules.test.tsx
npm run typecheck
npm run build
npm run lint --prefix web
```

## Slice exit gate

Path L5 must be true by computation: a matching rule displays `inherited_piece_count >= 1` only when at least one current Promo Piece actually has that normalized gate.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS3-T01 + VS3-T02. Define and implement the server truth.
- **Batch 2 — 2 todos:** VS3-T03 + VS3-T04. Build the view model and replace the tab UI.
- **Batch 3 — 2 todos:** VS3-T05 + VS3-T06. Add tracked-link parity and close regression tests.

Recommended maximum: **2 todo items per builder prompt**.
