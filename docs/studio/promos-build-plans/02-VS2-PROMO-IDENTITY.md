# VS2 Build Plan — Durable Promo Identity

## Outcome

Make Promo Pool membership a stable, owner-visible identity that survives reorder and can later anchor impressions, clicks, and conversions without adding the placement algorithm now.

## Preconditions

- VS1 is merged and its focused tests pass.
- New `/studio/promos` selections use post targets.

## Scope

In:
- Stable existing `CreatorPromoSlot.id` exposed as `promo_piece_id`.
- Stable identity through full-set replacement.
- Duplicate-target rejection and compact ranks.
- Owner-only gallery membership markers.
- Versioned attribution context and DOM markers.

Out:
- New analytics event tables.
- Actual impressions/conversions.
- Visitor exposure of creator curation state.
- Feed/discovery ranking.

## Required reading

1. `AGENTS.md`
2. `.cursor/rules/patreon-origin-relay-bedrock.mdc`
3. `src/creator/promo-slot-service.ts`
4. `prisma/schema.prisma` — `CreatorPromoSlot`
5. `src/gallery/gallery-service.ts` and `src/gallery/types.ts`
6. `tests/creator-promo-slots.test.ts`

## Locked decisions

- Reuse the existing slot row ID; no new table or migration is required.
- Preserve IDs by matching existing rows on `(target_kind, target_id)` before replace/recreate.
- Never accept an arbitrary client-supplied ID as authoritative.
- A target may appear only once per creator's active slot set.
- Promo markers are owner-only and must not leak through visitor/patron gallery DTOs.
- Historical analytics design will use stable IDs, but no fake event or count is emitted in this slice.

## Todo work items

### VS2-T01 — Add stable identity characterization

Depends on: none.

Steps:
1. Extend service tests to prove:
   - unchanged target retains `promo_piece_id` after reorder;
   - new target gets a new ID;
   - removed target disappears;
   - duplicate target is rejected;
   - legacy media target retains identity;
   - ranks return compact and ordered.
2. Add a read-contract test proving `promo_piece_id` and normalized `post_id` are present.

Acceptance:
- Tests fail against the current delete-and-regenerate service.
- No schema migration is introduced.

### VS2-T02 — Preserve IDs in promo-slot writes

Depends on: VS2-T01.

Target files:
- `src/creator/promo-slot-service.ts`
- `tests/creator-promo-slots.test.ts`

Steps:
1. Read existing rows before the transaction, including `id`, kind, target, and metadata.
2. Reject duplicate `(target_kind, target_id)` payload entries.
3. Normalize incoming rows to compact ranks 1…N while retaining supplied order.
4. During replacement, recreate unchanged targets with their existing IDs and metadata unless metadata was explicitly replaced.
5. Return `promo_piece_id`, `post_id`, title, thumbnail, label, and safe metadata.
6. Keep creator ownership validation for post and media targets.

Acceptance:
- Reorder changes rank but not promo identity.
- The service remains atomic.
- Sparse input cannot create sparse output.

### VS2-T03 — Propagate the enriched API contract

Depends on: VS2-T02.

Target files:
- `src/server.ts` promo-slot routes
- `web/lib/relay-api.ts`
- `web/app/studio/promos/PromoPiecesPanel.tsx`
- `web/app/studio/promos/PromoPieceCard.tsx`

Steps:
1. Add `promo_piece_id` and typed metadata to server/web DTOs.
2. Define `PromoAttributionContextV1` with:
   - `version: 1`;
   - `promo_piece_id`;
   - `creator_id`;
   - `post_id`;
   - `slot_rank`;
   - `source: "promo_pool"`.
3. Build the context only from server-confirmed slot rows.
4. Add stable card attributes: `data-promo-piece-id`, `data-promo-post-id`, `data-promo-rank`, and `data-promo-source`.

Acceptance:
- No `unknown`/unvalidated metadata is treated as attribution context.
- Existing API callers compile without casting away the new fields.

### VS2-T04 — Add owner-only gallery markers

Depends on: VS2-T02.

Target files:
- `src/gallery/types.ts`
- `src/gallery/gallery-service.ts` and/or `src/gallery/query.ts`
- `web/lib/relay-api.ts`
- relevant gallery tests

Steps:
1. For authenticated owner list reads, join active promo slots by post target and media target's resolved post.
2. Enrich each row for a promoted post with:
   - `is_promo_piece: true`;
   - `promo_piece_id`;
   - `promo_slot_rank`.
3. Leave unpromoted rows absent/false consistently.
4. Ensure visitor catalog, patron feed, and exported public DTOs omit these fields unless a future public contract explicitly adds them.
5. Keep Linked Set membership and `variant_role: "promo"` semantically separate from Promo Pool membership.

Acceptance:
- Every media row for a promoted post resolves to the same owner-only marker.
- Visitor regression tests prove no curation-state leak.

### VS2-T05 — Render identity without visual clutter

Depends on: VS2-T03, VS2-T04.

Target files:
- `web/app/studio/promos/PromoPieceCard.tsx`
- optional existing `/studio` card component if a small Promo badge is approved by current patterns

Steps:
1. Keep one compact visible Promo badge on `/studio/promos`.
2. Use stable attribution data attributes on actionable elements.
3. If `/studio` already has a compatible status-chip slot, add a subtle owner-only Promo chip; otherwise retain the marker in data only and do not redesign Active Posts in this slice.
4. Label unresolved legacy media targets honestly and keep them removable.

Acceptance:
- Identity is inspectable and testable without adding mock analytics or dense card chrome.

### VS2-T06 — Close service and leak tests

Depends on: VS2-T05.

Required verification:
```bash
npx vitest run tests/creator-promo-slots.test.ts tests/creator-promo-slots-route.test.ts
npx vitest run tests/gallery-effective-presentation.test.ts tests/patron/assemble-patron-feed.test.ts
npm run typecheck
npm run build
npm run lint --prefix web
```

Add focused tests for owner enrichment and visitor omission if existing suites do not cover both.

## Slice exit gate

Do not begin Tier Rule counts until promo identities and normalized post IDs are stable and owner-only marker tests pass.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS2-T01 + VS2-T02. Lock and implement stable server identity.
- **Batch 2 — 2 todos:** VS2-T03 + VS2-T04. Propagate the contract and owner markers.
- **Batch 3 — 2 todos:** VS2-T05 + VS2-T06. Finish restrained UI usage and regression gates.

Recommended maximum: **2 todo items per builder prompt**.
