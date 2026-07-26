# VS0 Build Plan — Baseline, Contracts, and Dream Fixture

## Outcome

Freeze the shared Goal Cycle wire contract, error vocabulary, feature flags, and deterministic Dream fixture before schema, provider, planner, or UI workers begin.

## Scope

In: characterization of Coach → distribution → PostBot → rail → extension; shared TypeScript contracts; fixture creator/history/trend/conversion data; acceptance IDs; feature-flag defaults.

Out: database models, routes, UI, live AI/provider calls, migrations, production behavior changes.

## Dependencies and permitted parallel work

Depends on no Goal Cycle slice. Contract characterization and fixture authoring may run in parallel, but merge the contract first. VS1 and VS3 are unblocked only after the full exit gate.

## Required reading

1. [`00-README.md`](00-README.md)
2. [`../GOAL_CYCLE_PRODUCT_CONTRACT.md`](../GOAL_CYCLE_PRODUCT_CONTRACT.md)
3. [`../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md)
4. `src/distribution/coach-checkpoint-service.ts`
5. `src/distribution/coach-propose-service.ts`
6. `src/distribution/post-distribution-service.ts`
7. `src/distribution/postbot-task-service.ts`
8. `src/distribution/schedule-rail-service.ts`
9. `src/distribution/schedule-reminder-extension-api.ts`

## Locked contracts

Create `src/goal-cycle/contracts.ts` with:

- goal kinds `engagement | views | paid_support | break`;
- break modes `complete_silence | social_upkeep | active_rest`;
- phases/states from the product contract;
- `GoalCycleQuestion` with stable ID, prompt, 2–6 options, optional bounded text, and answer;
- `GoalCyclePlanSlot` with stable ID, intent, format, title, draft body, destination IDs, creator-local time, UTC time, media state, and evidence refs;
- `GoalCyclePlan` with version, rationale, 0–8 slots, questions asked, revision count, evidence summary, warnings, and logistics;
- `GoalCycleProgressEvent` with sequence, phase, safe message code, occurred time, and retryability;
- `GoalCycleSummary`, `GoalCycleDetail`, credit status, evidence, outcome, and materialization receipt references;
- error codes: `GOAL_CYCLE_ACTIVE_EXISTS`, `GOAL_CYCLE_NOT_FOUND`, `GOAL_CYCLE_VERSION_CONFLICT`, `GOAL_CYCLE_INVALID_STATE`, `GOAL_CYCLE_LIMIT_EXCEEDED`, `GOAL_CYCLE_NO_CREDIT`, `GOAL_CYCLE_DESTINATION_UNLINKED`, `GOAL_CYCLE_RESEARCH_UNAVAILABLE`, `GOAL_CYCLE_PLAN_INVALID`, and `GOAL_CYCLE_MATERIALIZATION_FAILED`.

All public IDs are opaque strings. All timestamps are ISO-8601 UTC; creator-local scheduling includes an IANA time zone. Do not expose database row shapes directly.

Feature flags:

- `RELAY_GOAL_CYCLE_ENABLED=false`
- `RELAY_GOAL_CYCLE_AI_ENABLED=false`
- `RELAY_GOAL_CYCLE_TREND_MODE=fixture`, validated as `disabled | fixture | history_only | live`
- `RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED=false`

## Files

Create:

- `src/goal-cycle/contracts.ts`
- `src/goal-cycle/fixtures/dream-flow.ts`
- `tests/goal-cycle/contracts.test.ts`
- `tests/goal-cycle/dream-flow-fixture.test.ts`
- `tests/goal-cycle/spine-characterization.test.ts`

Edit only if needed:

- `.env.example` for the four disabled defaults.

Do not touch:

- `prisma/schema.prisma`
- `src/server.ts`
- `web/app/studio/GalleryView.tsx`
- live provider or billing configuration

## Todo work items

### VS0-T01 — Characterize the existing spine

1. Add read-only characterization tests for Coach checkpoint/proposal, post distribution, task, rail, and extension packet semantics.
2. Record where unpublished state, creator confirmation, dates, media, and idempotency currently diverge.
3. Tests must describe current behavior; do not “fix” it here.

Acceptance: the handoff names every reusable seam and every conflict VS7/VS8 must resolve.

### VS0-T02 — Freeze shared wire and errors

1. Implement the types and runtime validators used by later slices.
2. Assert eight-slot, two-question, two-revision, linked-destination, timestamp, and break-branch bounds.
3. Add the disabled feature-flag defaults.

Acceptance: invalid fixtures fail with stable error codes; no route or DB dependency exists.

### VS0-T03 — Build the canonical Dream fixture

1. Create one creator fixture matching the QA persona.
2. Include strong, weak, unavailable, and adversarial trend evidence.
3. Include deterministic, estimated, zero, and unavailable conversion cases.
4. Include DST/month boundary dates, duplicate approval keys, missing media, and one credit.

Acceptance: downstream backend and frontend tests can import one fixture without live services.

### VS0-T04 — Map acceptance IDs

1. Add test descriptions using DF-01 through DF-10.
2. Verify each contract field is owned by a later slice in `TRACEABILITY.md`.
3. Produce Delta Out with fixture version/hash.

Acceptance: VS1 and VS3 can build without inventing fields.

## Safe batches

- Batch 1: VS0-T01 + VS0-T02.
- Batch 2: VS0-T03 + VS0-T04.

## Verification

```bash
npx vitest run tests/goal-cycle/contracts.test.ts tests/goal-cycle/dream-flow-fixture.test.ts tests/goal-cycle/spine-characterization.test.ts
npm run typecheck
```

## Exit gate

All contract and fixture tests pass; feature flags default off; spine conflicts are assigned to VS7/VS8; no production behavior changed.

## Human stop conditions

Stop if the contract requires a fifth goal, more than eight slots/two revisions, a live vendor, autonomous publishing, or a customer credit allowance.

## Delta Out

Use [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md#delta-out-format) and include the frozen fixture version plus any characterized semantic conflicts.
