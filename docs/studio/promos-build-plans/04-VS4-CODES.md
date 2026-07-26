# VS4 Build Plan — Codes Alignment

## Outcome

Make Codes and Tier Rules feel like one workflow: creator-supplied Patreon codes stay current across tabs, usage is understandable, and rule drafts survive a detour to create a code.

## Preconditions

- VS3 Tier Rule view models and summary endpoint pass.
- `DiscountCodeLibraryPanel` remains the shared code-management surface used by `/studio/promos` and Hero Audience & Promotion.

## Scope

In:
- Shared controlled code state.
- Active/inactive filtering.
- Usage summaries for Tier Rules and post overrides.
- Draft-preserving tab navigation.
- Visual and error-state alignment.

Out:
- Creating coupons on Patreon.
- Deleting referenced codes.
- Changing offer precedence.
- Replacing Hero's shared code panel with a second implementation.

## Required reading

1. `AGENTS.md`
2. `web/app/components/studio/DiscountCodeLibraryPanel.tsx`
3. `web/app/studio/promos/PromosHubView.tsx`
4. `web/app/studio/promos/TierRulesPanel.tsx`
5. `src/marketing/discount-code-service.ts`
6. `src/marketing/post-offer-service.ts`

## Locked decisions

- Relay stores codes created by the artist in Patreon; Relay never creates the Patreon coupon.
- Inactive codes are unavailable for new assignments.
- Existing rules/offers referencing an inactive code remain readable and recoverable.
- Code mutations update one hub-owned source of truth; do not rely on each tab independently refetching at different times.
- Navigating to Codes from a rule draft must not clear the draft.

## Todo work items

### VS4-T01 — Characterize shared code behavior

Depends on: none.

Steps:
1. Add tests for:
   - create code and immediate availability in Tier Rules;
   - deactivate active code;
   - existing rule with inactive code;
   - no codes empty state;
   - failed create/patch;
   - preserving a rule draft across tab navigation.
2. Define usage summary requirements:
   - active Tier Rule count;
   - active post-offer count;
   - inactive references retained.

Acceptance:
- Tests expose stale-state behavior in the current independently loaded panels.

### VS4-T02 — Add code usage summaries

Depends on: VS4-T01.

Target files:
- `src/marketing/discount-code-service.ts`
- promotion hub summary service from VS3
- `web/lib/relay-api.ts`

Steps:
1. Extend creator-only summary data with per-code Tier Rule and post-offer usage counts.
2. Count active and inactive references separately where useful to recovery.
3. Avoid loading raw offer bodies when aggregate counts suffice.
4. Keep creator isolation in every query.

Acceptance:
- Usage counts update after rule/offer/code mutations.
- No public DTO gains code-library information.

### VS4-T03 — Make the code library controlled-capable

Depends on: VS4-T01.

Target file:
- `web/app/components/studio/DiscountCodeLibraryPanel.tsx`

Steps:
1. Add a controlled mode accepting current codes, mutation callbacks, usage summaries, and loading/error state.
2. Preserve the existing self-loading mode for Hero Audience & Promotion callers.
3. Return the created/updated record through callbacks so hub state can update immediately.
4. Use Relay tokens and consistent form labels, validation, busy states, and status badges.
5. Keep the Patreon Discounts external link and boundary copy.

Acceptance:
- Existing Hero usage remains backward compatible.
- `/studio/promos` no longer has two competing copies of code state.

### VS4-T04 — Wire hub state and draft-preserving navigation

Depends on: VS4-T02, VS4-T03.

Target files:
- `web/app/studio/promos/PromosHubView.tsx`
- `web/app/studio/promos/TierRulesPanel.tsx`
- optional new `web/app/studio/promos/CodesPanel.tsx`

Steps:
1. Make the hub the owner of current code records and code mutations.
2. Pass active codes to new-rule selection; retain referenced inactive codes in existing-rule cards.
3. When Tier Rules has no active code, **Add code** switches to Codes and records return intent.
4. After successful creation, return to Tier Rules, restore the draft, and preselect the new code.
5. If the creator manually chooses another tab, do not force a return.

Acceptance:
- Code creation requires no page Refresh before assignment.
- Draft headline, CTA, gate, and destination survive the round trip.

### VS4-T05 — Align code cards and safety states

Depends on: VS4-T04.

Steps:
1. Show code, percentage, optional label, active state, and compact usage summary.
2. Warn before deactivation when active references exist; this is a confirmation, not destructive deletion.
3. Explain that deactivation removes the code from new assignments while referenced rules remain visible.
4. Keep the panel visually sparse; hide secondary counts until they exist.

Acceptance:
- No code appears active in one tab and inactive in another.
- Creator can identify why a code cannot be selected.

### VS4-T06 — Close Codes integration tests

Depends on: VS4-T05.

Required tests:
- controlled and self-loading panel modes;
- hub state update after create/patch;
- usage counts;
- active-only new assignment;
- inactive existing reference;
- draft return flow;
- mutation errors;
- Hero panel regression.

Verification:
```bash
npx vitest run tests/marketing-offers.test.ts tests/web/promos-hub-codes.test.tsx
npx vitest run tests/audience-promotion/hero-audience-promotion-shell.test.tsx
npm run typecheck
npm run lint --prefix web
npm run build --prefix web
```

## Slice exit gate

Create a code in Codes, return to the preserved Tier Rule draft, save it, deactivate the code, and confirm both the rule card and code card show the same truthful state without Refresh.

## Recommended todo batching

- **Batch 1 — 2 todos:** VS4-T01 + VS4-T02. Lock behavior and add server usage truth.
- **Batch 2 — 2 todos:** VS4-T03 + VS4-T04. Generalize the shared panel and wire hub navigation.
- **Batch 3 — 2 todos:** VS4-T05 + VS4-T06. Finish safety UX and integration tests.

Recommended maximum: **2 todo items per builder prompt**.
