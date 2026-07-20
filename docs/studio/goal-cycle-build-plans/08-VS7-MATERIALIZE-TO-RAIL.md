# VS7 Build Plan — Approval Materialization and Live Rail Handoff

## Outcome

On explicit approval, atomically and idempotently consume the reserved credit for credit-bearing Plans and create the complete unpublished post → distribution plan → variant → PostBot task → time → rail-event graph for every eligible Plan slot. Complete silence creates a zero-slot receipt and suppression interval without a reservation.

## Scope

In: transaction service, downstream identifiers, materialization receipt, duplicate/concurrent approval, unpublished semantics, rail refresh/focus/choreography after persistence.

Out: actual publishing, media completion, extension behavior, outcome learning.

## Dependencies and permitted parallel work

Depends on VS5 and VS6. Backend transaction/receipt and frontend rail focus may develop in parallel after the receipt contract is frozen. Schema/server/client/Gallery changes merge serially.

## Required reading

1. `src/distribution/post-distribution-service.ts`
2. `src/distribution/postbot-task-service.ts`
3. `src/distribution/schedule-rail-service.ts`
4. `src/autopost/posting-goal-service.ts`
5. `docs/AUTOPOST_BUILD_PLAN.md`
6. `web/app/components/schedule-rail/StudioScheduleRail.tsx`
7. `web/app/studio/GalleryView.tsx`
8. VS0 spine-characterization Delta Out

## Materialization contract

`approveAndMaterialize({ creatorId, cycleId, expectedVersion, approvalKey })` returns:

```ts
type GoalCycleMaterializationReceipt = {
  cycle_id: string;
  approval_key: string;
  status: "materialized";
  materialized_at: string;
  slots: Array<{
    slot_id: string;
    post_id: string | null;
    distribution_plan_id: string | null;
    variant_ids: string[];
    task_ids: string[];
    rail_event_ids: string[];
    mode: "new_post" | "upkeep_task" | "silence";
  }>;
};
```

One unique receipt per cycle and approval key; one downstream link per slot/object kind. A retry returns the stored receipt.

New-post slots use the locked compatibility path: add `PostPublishState { draft, published }`, add `Post.publishState` with existing rows migrated/defaulted to `published`, and make `PostVersion.publishedAt` nullable. Goal Cycle creates `Post.source = RELAY`, `publishState = draft`, creator-only access, and a version with `publishedAt = null`. Creator-confirmed publish atomically changes state and stamps the actual publication time. Epoch/future timestamps never represent draft state.

All destination IDs are revalidated as linked/eligible inside the transaction.

## Files

Create:

- `src/goal-cycle/materialization/goal-cycle-materialization-service.ts`
- `src/goal-cycle/materialization/goal-cycle-materialization-store.ts`
- `src/goal-cycle/materialization/materialization-routes.ts`
- `tests/goal-cycle/goal-cycle-materialization.test.ts`
- `tests/goal-cycle/goal-cycle-materialization-concurrency.integration.test.ts`
- `tests/web/goal-cycle-rail-handoff.test.tsx`
- schema/migration additions for receipt/linkage or draft state as required

Edit:

- `prisma/schema.prisma`
- `src/distribution/post-distribution-service.ts`
- `src/distribution/postbot-task-service.ts`
- `src/distribution/schedule-rail-service.ts`
- `src/server.ts`
- `web/lib/relay-api.ts`
- `web/app/components/schedule-rail/StudioScheduleRail.tsx`
- `web/app/studio/GalleryView.tsx`

Do not touch:

- extension reminder behavior
- publish confirmation boundary
- conversion outcome calculation
- live provider registry

## Todo work items

### VS7-T01 — Resolve unpublished-post semantics

Add characterization tests, implement the locked `Post.publishState` plus nullable `PostVersion.publishedAt` migration, update existing readers/writers safely, and ensure monthly posting-goal counts exclude planned drafts.

### VS7-T02 — Build transactional materializer

Within one DB transaction: lock cycle and, for credit-bearing Plans, its reservation; validate approved Plan/version/destinations; create/reuse all slot objects; consume credit when applicable; persist receipt; and move cycle to active. Silence validates that no reservation/slot exists and writes the zero-slot receipt plus suppression interval. Refactor store primitives to accept a transaction client if current services open separate transactions.

### VS7-T03 — Add approval API and recovery

Register one authenticated mutation with approval idempotency, 409 version/state errors, stored-receipt retries, and a repair path that diagnoses pre-existing partial graphs without duplicating them.

### VS7-T04 — Refresh and focus the rail

After receipt success, refresh existing rail data, focus/scroll to the first new event, and highlight all created events using bounded reduced-motion-aware choreography. Failure keeps the review state and never animates ghost events.

### VS7-T05 — Prove atomicity/idempotency

Test duplicate clicks, process retry, concurrent approval, one invalid destination, credit consume failure, 1/8 slots, upkeep/silence, planned-draft counts, and receipt hydration.

### VS7-T06 — Complete Dream handoff

Wire VS6’s callback, preserve close/resume behavior, show receipt summary, and expose missing-media state for VS8.

## Safe batches

- Batch 1: VS7-T01 only.
- Batch 2: VS7-T02 + service tests.
- Batch 3: VS7-T03 + VS7-T05.
- Batch 4: VS7-T04 + VS7-T06.

## Verification

```bash
npx vitest run tests/goal-cycle/goal-cycle-materialization.test.ts
npx vitest run tests/goal-cycle/goal-cycle-materialization-concurrency.integration.test.ts
npx vitest run tests/web/goal-cycle-rail-handoff.test.tsx tests/schedule-rail-service.test.ts tests/posting-goal-service.test.ts
npm run typecheck
npm run build --prefix web
```

## Exit gate

DF-07 passes: one credit-bearing approval yields one complete receipt/graph and one credit consumption; silence yields one zero-slot receipt and no credit movement; duplicates yield no extra rows; invalid work rolls back; rail focus occurs only after persisted success; planned posts remain unpublished.

## Human stop conditions

Stop for destructive post migration, production backfill, changing Patreon-origin canonical semantics, removing publish confirmation, or allowing unlinked destinations.

## Delta Out

Include transaction boundary, unpublished-state decision, all unique/idempotency keys, receipt fixture, rollback/recovery evidence, and event IDs consumed by VS8/VS9.
