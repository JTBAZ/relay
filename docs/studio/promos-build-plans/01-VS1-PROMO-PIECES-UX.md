# VS1 Build Plan — Promo Pieces UX

## Outcome

Deliver the first complete `/studio/promos` workflow: **Add Post** opens a clean gallery picker, the creator selects one to five active posts, **Make Promos** persists them, and the page renders discrete Promo Piece cards.

## Scope

In:
- Pieces tab only.
- Post-level selection.
- Linked Set members listed separately.
- Add, replace, remove, reorder, preview handoff, loading, empty, and error states.

Out:
- Tier Rule redesign.
- Performance metrics.
- Discovery/feed insertion.
- Changes to access permissions.

## Required reading

1. `AGENTS.md`
2. `web/app/studio/promos/PromosHubView.tsx`
3. `web/app/components/onboarding/CreatorLibraryReviewModal.tsx`
4. `web/lib/relay-api.ts` — promo-slot and gallery-list contracts
5. `web/lib/active-post-linked-sets.ts`
6. `tests/web/creator-library-review-modal.test.tsx`

## Locked decisions

- New selections write `target_kind: "post"` and `target_id: post_id`.
- A carousel/multi-asset post is one selectable tile.
- Each post in a non-default CreativeWork is a separate tile. Do not call `collapsePostGroupsToGridCards`.
- Match `/studio` Active Posts eligibility; exclude hidden, review, deleted, and shadow-only rows.
- Fetch all pages needed to represent the creator's active posts. Do not silently stop at the onboarding modal's current limit of 60.
- `PUT /api/v1/creator/promo-slots` remains a full-set replacement. Always submit the complete ranked selection.
- Use Relay CSS variables; do not add another hardcoded green/gray palette.

## Todo work items

### VS1-T01 — Characterize the Pieces contract

Depends on: none.

Steps:
1. Add failing tests for the current empty Pieces state and its missing Add Post action.
2. Add pure test fixtures covering:
   - one normal post;
   - one multi-asset post;
   - two posts in the same Linked Set;
   - hidden/review rows;
   - more than one API page;
   - legacy media-target slots.
3. Record the expected full-set PUT payload using post targets and compact ranks.

Acceptance:
- Tests describe the requested behavior before implementation.
- No production behavior changes in this todo.

### VS1-T02 — Extract Pieces UI from the hub

Depends on: VS1-T01.

Target files:
- `web/app/studio/promos/PromosHubView.tsx`
- new `web/app/studio/promos/PromoPiecesPanel.tsx`
- new `web/app/studio/promos/PromoPieceCard.tsx`

Steps:
1. Move Pieces rendering and mutation handlers behind a focused panel API.
2. Keep hub-owned slot loading until the panel contract is stable.
3. Render the empty Promo Pieces window plus the requested green pill **Add Post** button directly below it.
4. Render populated state as a responsive grid of one to five discrete cards.
5. Each card shows thumbnail/fallback, rank, title, visible Promo marker, optional Linked Set member label, reorder, remove, and Preview.
6. Compact ranks after remove or reorder and persist the complete list.

Acceptance:
- Existing Tier Rules, Codes, and Preview tabs behave unchanged.
- Empty and populated Pieces states are visually distinct and uncluttered.
- Buttons have accessible names and disabled/busy behavior.

### VS1-T03 — Build the post picker data model

Depends on: VS1-T01.

Target files:
- new `web/app/studio/promos/promo-post-picker-model.ts`
- `web/lib/relay-api.ts` only if pagination typing needs correction

Steps:
1. Create pure helpers for post deduplication, active eligibility, current-slot preselection, rank assignment, compacting, and max-five enforcement.
2. Represent selection by `post_id`, not `media_id`.
3. Preserve the best primary thumbnail and title for each post.
4. Carry `creative_work_id`, `member_label`, `variant_role`, and sort order for display only.
5. Keep legacy media slots visible in the current selection by using their resolved `post_id`; identify unresolved legacy rows explicitly.

Acceptance:
- Multi-asset rows collapse to one post option.
- Linked Set member posts do not collapse into one set option.
- A sixth selection is rejected without disturbing the first five.

### VS1-T04 — Build the Add Post modal

Depends on: VS1-T02, VS1-T03.

Target file:
- new `web/app/studio/promos/PromoPostPickerModal.tsx`

Steps:
1. Reuse the onboarding modal's proven selection interaction, but remove onboarding phases, goals, and monetization copy.
2. Load `display: "post_primary"` pages while open; provide lightweight title/tag search without clutter.
3. Preselect current Promo Pieces whenever the modal opens.
4. Render a large responsive thumbnail grid with separate Linked Set member labels.
5. Show `N / 5 selected`; keep selected tiles removable at the cap and disable only unselected tiles.
6. Implement dialog title, `aria-modal`, `aria-pressed`, Escape close, focus return, initial focus, and body-scroll containment.
7. Footer actions are Cancel and **Make Promos**. Disable Make Promos at zero or during save.

Acceptance:
- Keyboard and pointer users can select/deselect, close, and submit.
- Search/filter changes do not erase selection.
- Existing selections remain if loading or saving fails.

### VS1-T05 — Wire persistence and refresh

Depends on: VS1-T04.

Target files:
- `web/app/studio/promos/PromoPiecesPanel.tsx`
- `web/app/studio/promos/PromosHubView.tsx`

Steps:
1. Convert selected posts to compact ranks 1…N.
2. Submit the complete set through `putCreatorPromoSlots`.
3. Replace local slots from the server response, then close the modal.
4. Keep the modal open with an inline error when PUT fails.
5. Support removing the final card, returning to the exact empty state and Add Post action.
6. Ensure Refresh and tab changes do not create duplicate requests or stale selected ranks.

Acceptance:
- Zero → one → five → fewer → zero all persist through reload.
- Failed writes never display an unsaved card as saved.

### VS1-T06 — Complete focused tests

Depends on: VS1-T05.

Target tests:
- new `tests/web/promos-hub-pieces.test.tsx`
- new `web/app/studio/promos/promo-post-picker-model.test.ts`
- retain `tests/web/creator-library-review-modal.test.tsx`

Required cases:
- exact Add Post and Make Promos labels;
- all-pages loading;
- active-only filtering;
- multi-asset post dedupe;
- Linked Set member separation;
- preselection;
- max five;
- compact ranks;
- remove/reorder;
- loading/save errors;
- dialog keyboard behavior;
- Preview callback.

Verification:
```bash
npx vitest run tests/web/promos-hub-pieces.test.tsx web/app/studio/promos/promo-post-picker-model.test.ts tests/web/creator-library-review-modal.test.tsx
npm run typecheck
npm run lint --prefix web
```

## Slice exit gate

Do not start VS2 until the complete empty-to-saved flow works against the existing promo-slot API and all VS1 focused tests pass.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS1-T01 + VS1-T02. Characterize behavior and establish the component boundary.
- **Batch 2 — 2 todos:** VS1-T03 + VS1-T04. Build the pure picker model and modal together.
- **Batch 3 — 2 todos:** VS1-T05 + VS1-T06. Wire persistence and close the focused test gate.

Recommended maximum: **2 todo items per builder prompt**.
