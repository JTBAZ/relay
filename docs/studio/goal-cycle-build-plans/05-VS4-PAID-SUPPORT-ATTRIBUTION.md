# VS4 Build Plan — Paid-Support Attribution and Goals

## Outcome

Propagate Goal Cycle campaign context through tracked Relay surfaces and reconcile joins, upgrades, purchases, and tips as deterministic, estimated, or insufficient paid-support outcomes.

## Scope

In: campaign keys, placement/link context, support-event reconciliation, aggregate lift method, goal facts, labels, fixtures.

Out: treating reach/clicks as conversions, patron identity in prompts, unsupported provider ingestion, UI audit route.

## Dependencies and permitted parallel work

Depends on VS1. It may run parallel with VS2 and VS3. Attribution schema merges after VS1. VS5 and VS9 wait for exit.

## Required reading

1. [`../../analytics/CONVERSION_ATTRIBUTION.md`](../../analytics/CONVERSION_ATTRIBUTION.md)
2. `docs/analytics/INSIGHT_ACTIONS_GOALS.md`
3. `src/analytics/analytics-store-db.ts`
4. `src/distribution/post-distribution-service.ts`
5. tracked Relay Link/offer/placement models and services
6. `prisma/schema.prisma` analytics outcome and membership/purchase fields

## Data contract

Add/extend:

- opaque `goal_cycle_campaign_key` on Goal Cycle slot materialization references, distribution plans/variants, tracked links, and placements where those models support attribution;
- `GoalCycleSupportOutcome`: creator ID, cycle ID, slot ID nullable, campaign key, event kind, occurred time, amount/currency nullable, attribution class, confidence, source, coverage, freshness, evidence refs, dedupe key, reversal state;
- `GoalCycleAttributionSnapshot`: cycle ID/window unique, target, deterministic totals, estimated-lift result nullable, baseline/observation windows, coverage, confidence, calculated time.

Do not store patron identity in Goal Cycle outcome JSON. References to source records remain opaque and creator-scoped.

## Service contract

- `recordCampaignContext`
- `reconcileSupportEvent`
- `calculateCampaignLift`
- `getPaidSupportFacts`
- `snapshotCycleAttribution`

Deterministic dedupe is source event ID plus creator/source. Estimated lift uses an approved pure function and never emits person-level rows.

## Files

Create:

- `src/analytics/goal-cycle-attribution-store.ts`
- `src/analytics/goal-cycle-attribution-service.ts`
- `src/analytics/goal-cycle-lift.ts`
- `tests/analytics/goal-cycle-attribution.test.ts`
- `tests/analytics/goal-cycle-lift.test.ts`
- `tests/analytics/goal-cycle-attribution-isolation.integration.test.ts`
- migration/schema additions after VS1

Edit:

- `prisma/schema.prisma`
- tracked link/placement creation service
- `src/analytics/analytics-store-db.ts`
- `src/distribution/post-distribution-service.ts` only to carry opaque campaign context
- `src/server.ts` only for creator-scoped read/refresh routes

Do not touch:

- raw AI prompts
- credit accounting
- live checkout/provider contracts
- navigation or `/studio/goals`

## Todo work items

### VS4-T01 — Add campaign and outcome schema

Implement campaign-key propagation fields, support outcome/snapshot models, indexes, unique dedupe, reversal handling, and creator isolation. Existing rows remain nullable.

### VS4-T02 — Reconcile deterministic support

Map approved Relay joins/upgrades/purchases/tips into normalized outcomes. Ignore clicks and views. Make reruns and late events idempotent.

### VS4-T03 — Implement estimated lift

Create a pure method-v1 campaign-window calculation using the canonical 14-day/80%-coverage/three-event guards. Return `insufficient` rather than zero when requirements fail.

### VS4-T04 — Build planner fact output

Expose target/actual/baseline/freshness/confidence with deterministic and estimated values separate. Strip patron and transaction details before Coach receives facts.

### VS4-T05 — Add creator-scoped routes

Expose cycle attribution summary and refresh request through existing auth patterns. A GET never triggers reconciliation.

### VS4-T06 — Prove truthfulness

Test click-only, zero support, missing data, duplicate/late/reversed events, mixed currencies, out-of-window events, estimated labeling, and cross-tenant campaign-key access.

## Safe batches

- Batch 1: VS4-T01 only.
- Batch 2: VS4-T02 + focused deterministic tests.
- Batch 3: VS4-T03 + VS4-T04.
- Batch 4: VS4-T05 + VS4-T06.

## Verification

```bash
npx vitest run tests/analytics/goal-cycle-attribution.test.ts tests/analytics/goal-cycle-lift.test.ts
npx vitest run tests/analytics/goal-cycle-attribution-isolation.integration.test.ts
npm run typecheck
```

## Exit gate

The fixture distinguishes deterministic, estimated, insufficient, unavailable, and true zero; duplicate support counts once; clicks never count; planner facts contain no patron identity.

## Human stop conditions

Stop for a new support provider, consent/retention decision, attribution window/threshold change, currency conversion rule, or claim of person-level causality from lift.

## Delta Out

Include event-source coverage, dedupe keys, lift method version, unsupported sources, migration state, and the fact fixture consumed by VS5/VS9.
