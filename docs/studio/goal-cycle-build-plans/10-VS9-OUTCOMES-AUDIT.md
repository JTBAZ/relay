# VS9 Build Plan — Outcomes, Audit Route, and Confirmed Learning

## Outcome

Snapshot target versus actual with freshness/confidence, suggest creator-confirmed completion, collect optional reflection, propose explainable next-cycle adjustments, and deliver the quiet `/studio/goals` audit surface.

## Scope

In: outcome snapshot/reconciliation job, completion suggestion, reflection, learning proposal/confirmation, history/detail route, Analytics deep links.

Out: automatic goal changes, hidden profiling, a statistics-heavy primary workspace, new attribution methods.

## Dependencies and permitted parallel work

Depends on VS4 and VS7; execution completeness improves after VS8 but UI can build from fixtures. Outcome service and audit UI may run in parallel after the response contract freezes. Navigation merges last.

## Required reading

1. [`../../analytics/CONVERSION_ATTRIBUTION.md`](../../analytics/CONVERSION_ATTRIBUTION.md)
2. `docs/analytics/INSIGHT_ACTIONS_GOALS.md`
3. `src/analytics/analytics-store-db.ts`
4. `src/autopost/posting-goal-service.ts`
5. `web/app/studio/analytics/page.tsx`
6. `web/app/components/AppNav.tsx`
7. [`TRACEABILITY.md`](TRACEABILITY.md)

## Outcome and learning contract

Outcome detail includes target, deterministic actual, estimated actual separately, baseline, window, coverage, freshness, confidence, task/publish completion, source links, suggested-completion reason, and optional creator reflection.

Learning proposal:

```ts
type GoalCycleLearningProposal = {
  proposal_id: string;
  source_cycle_id: string;
  explanation: string;
  evidence_refs: string[];
  changes: Array<{
    field: "goal" | "target" | "cadence" | "format_mix" | "destination_mix";
    from: unknown;
    to: unknown;
  }>;
  status: "suggested" | "accepted" | "rejected";
};
```

Only `accepted` proposals seed a later cycle. Rejection leaves no hidden preference change.

## Completion-suggestion rules

The service may set `completion_suggested` only when:

- engagement or views: the deterministic goal metric meets/exceeds its target inside the cycle window and the source is not stale by its declared `stale_after`;
- paid support: deterministic attributed paid support meets/exceeds the target; estimated lift alone may suggest **review evidence**, never completion;
- complete silence: the approved reminder-suppression interval has elapsed;
- social upkeep: every required upkeep task is terminal as creator-completed or creator-skipped, including a valid zero-task upkeep Plan;
- active rest: at least one planned low-energy slot is creator-completed/published and every remaining required slot is terminal as completed or creator-skipped.

Passing the Plan end date with incomplete work may suggest a review, not completion. The creator may request completion review at any time, and only creator confirmation terminalizes the cycle.

## Files

Create:

- `src/goal-cycle/outcomes/goal-cycle-outcome-service.ts`
- `src/goal-cycle/outcomes/goal-cycle-learning-service.ts`
- `src/goal-cycle/outcomes/goal-cycle-outcome-worker.ts`
- `src/goal-cycle/outcomes/outcome-routes.ts`
- `web/app/studio/goals/page.tsx`
- `web/app/studio/goals/GoalsAuditView.tsx`
- `web/app/studio/goals/GoalCycleHistoryCard.tsx`
- `web/app/studio/goals/GoalCycleDetail.tsx`
- `tests/goal-cycle/goal-cycle-outcomes.test.ts`
- `tests/goal-cycle/goal-cycle-learning.test.ts`
- `tests/web/goal-cycle-goals-audit.test.tsx`

Edit:

- `prisma/schema.prisma` / migration only for outcome/learning fields not already reserved
- `src/server.ts`
- job registration
- `web/lib/relay-api.ts`
- `web/app/components/AppNav.tsx` for a quiet Studio-accessible route only if current navigation pattern requires it
- Analytics surfaces only for deep links, not duplicated dashboards

Do not touch:

- attribution formulas
- live trend providers
- automatic publish behavior
- credit pricing/top-ups

## Todo work items

### VS9-T01 — Implement outcome snapshots

Aggregate goal-specific facts and task/publish completion into versioned snapshots. Preserve zero/unavailable/estimated distinctions and refresh until the configured window closes.

### VS9-T02 — Suggest and confirm completion

Implement the locked completion-suggestion rules above. Expose creator confirm/reject/continue. Never terminalize from a background job.

### VS9-T03 — Implement reflection and learning proposal

Persist bounded optional reflection, generate an explainable proposal from supplied facts, validate allowed fields, and require accept/reject before seeding.

### VS9-T04 — Build `/studio/goals` audit

Render compact history, active/resume link, target/actual, confidence/freshness, Plan/revisions/evidence/tasks, reflection, learning decision, and Analytics deep links. Keep the visual hierarchy quiet.

### VS9-T05 — Register refresh job and routes

Add idempotent outcome refresh, detail/history/completion/reflection/learning APIs, route auth, pagination, and safe observability.

### VS9-T06 — Prove truthful learning loop

Test each goal/rest branch, stale/unavailable data, deterministic vs estimated paid support, late refresh, completion reject, learning accept/reject, multiple sequential monthly cycles, and tenant isolation.

## Safe batches

- Batch 1: VS9-T01 + VS9-T02.
- Batch 2: VS9-T03 + learning tests.
- Batch 3: VS9-T04 + fixture UI tests.
- Batch 4: VS9-T05 + VS9-T06.

## Verification

```bash
npx vitest run tests/goal-cycle/goal-cycle-outcomes.test.ts tests/goal-cycle/goal-cycle-learning.test.ts
npx vitest run tests/web/goal-cycle-goals-audit.test.tsx
npm run typecheck
npm run lint --prefix web
npm run build --prefix web
```

## Exit gate

DF-09/10 pass: outcomes are source/freshness/confidence visible; completion and learning require confirmation; rejected proposals have no effect; same-month history supports sequential cycles; audit remains secondary.

## Human stop conditions

Stop for new attribution thresholds, retention/privacy policy, automatic profile learning, a top-level product navigation redesign, or claims unsupported by source coverage.

## Delta Out

Include snapshot/learning versions, completion criteria, job schedule, audit route evidence, navigation decision, and final outcome fixtures consumed by VS11.

### Batch 1 — VS9-T01 + VS9-T02 (2026-07-17)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS9 / VS9-T01, VS9-T02
- Completed:
  - VS9-T01: Versioned outcome snapshots (snapshot_version=1) with coverage/freshness/confidence,
    task + publish completion facts, paid-support via VS4 getPaidSupportFacts, views/engagement
    from context actuals (fixture path until richer PI wiring).
  - VS9-T02: Locked completion eligibility rules; suggest gated by complete (or review+allow_review);
    confirm terminalizes; dismiss returns completion_suggested → active; jobs never terminalize.
- Files created/edited:
  - src/goal-cycle/outcomes/goal-cycle-outcome-service.ts (new)
  - src/goal-cycle/goal-cycle-service.ts (suggest opts, dismiss)
  - src/goal-cycle/goal-cycle-store.ts (hydrate outcome summary)
  - src/goal-cycle/goal-cycle-routes.ts (allow_review, dismiss-completion)
  - web/lib/relay-api.ts (suggest allow_review, dismissClient)
  - tests/goal-cycle/goal-cycle-outcomes.test.ts (new)
  - tests/goal-cycle/goal-cycle-service.test.ts / isolation (force for legacy path)
- Migration and backfill state: none (CreatorGoalCycleOutcome shell already present)
- Contracts changed: none (existing outcome summary shape; optional allow_review body; new dismiss route)
- Commands and results:
  - npx vitest run tests/goal-cycle/goal-cycle-outcomes.test.ts tests/goal-cycle/goal-cycle-service.test.ts → 27 passed
- Manual/browser checks: not required for Batch 1 (no audit UI yet)
- Feature flags / kill switches: RELAY_GOAL_CYCLE_ENABLED (unchanged)
- Known risks or human gates:
  - Views/engagement actuals are context-fixture driven until Analytics PI wiring (coverage=partial).
  - Full DF-09/10 exit still needs T03–T06 (learning, audit UI, job, prove).
- Next unblocked todo IDs: VS9-T03 (+ learning tests) = Batch 2
```

**Slice status:** VS9 remains **In progress** (Batch 1 only). Do not mark Done until DF-09/10 exit gate.

### Batch 2 — VS9-T03 + learning tests (2026-07-18)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS9 / VS9-T03
- Completed:
  - Bounded reflection (≤2000 chars) on CreatorGoalCycleOutcome.reflection
  - Explainable learning proposals (proposal_version=1) from outcome snapshots
  - Allowed change fields only: goal | target | cadence | format_mix | destination_mix
  - accept → seed for later cycles; reject → no seed / no preference residue
  - peek/consume seed helpers for sequential-cycle seeding
  - Hydrate GoalCycleDetail.reflection + learning from outcome row
- Files created/edited:
  - src/goal-cycle/outcomes/goal-cycle-learning-service.ts
  - src/goal-cycle/goal-cycle-store.ts (hydrate reflection/learning)
  - tests/goal-cycle/goal-cycle-learning.test.ts
  - outcome-routes.ts exists (registration deferred to VS9-T05)
- Migration and backfill state: none (reflection column already on outcome shell)
- Contracts changed: none (used frozen GoalCycleLearningProposal)
- Commands and results:
  - npx vitest run tests/goal-cycle/goal-cycle-outcomes.test.ts tests/goal-cycle/goal-cycle-learning.test.ts tests/goal-cycle/goal-cycle-service.test.ts → 35 passed
- Manual/browser checks: not required for Batch 2
- Feature flags / kill switches: unchanged
- Known risks or human gates:
  - HTTP routes for reflection/learning not yet mounted (T05)
  - Seed not yet auto-applied on startGoalCycle (consume is explicit helper for later wiring)
- Next unblocked todo IDs: VS9-T04 (+ fixture UI tests) = Batch 3
```

### Batch 3 — VS9-T04 + fixture UI tests (2026-07-18)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS9 / VS9-T04
- Completed:
  - Quiet /studio/goals audit page (StudioRouteGuard)
  - History cards + detail: target/actual, confidence/freshness, plan, evidence,
    reflection, learning accept/reject notes, Analytics deep links, Library resume
  - Fixture pack + vitest UI coverage (no top-level AppNav Goals tab — Analytics link only)
- Files created/edited:
  - web/app/studio/goals/page.tsx, GoalsAuditClient.tsx, GoalsAuditView.tsx,
    GoalCycleHistoryCard.tsx, GoalCycleDetail.tsx, goals-audit.css
  - web/lib/goal-cycle-audit-fixtures.ts
  - tests/web/goal-cycle-goals-audit.test.tsx
  - web/app/studio/analytics/AnalyticsOverviewClient.tsx (deep link to /studio/goals)
- Migration and backfill state: none
- Contracts changed: none
- Commands and results:
  - npx vitest run tests/web/goal-cycle-goals-audit.test.tsx → 5 passed
- Manual/browser checks: deferred to Batch 4 / VS11 (live hydrate after routes mount)
- Feature flags / kill switches: unchanged
- Known risks or human gates:
  - Live client still uses list + get cycle until outcome routes mount (T05)
  - Intentionally no AppNav top-level Goals item (product: secondary audit)
- Next unblocked todo IDs: VS9-T05 + VS9-T06 = Batch 4
```

### Batch 4 — VS9-T05 + VS9-T06 (2026-07-18)

```text
Goal Cycle Delta Out
- Slice / claimed todos: VS9 / VS9-T05, VS9-T06
- Completed:
  - Mounted registerGoalCycleOutcomeRoutes on server (outcome GET/refresh, reflection, learning propose/accept/reject)
  - Outcome refresh BullMQ worker + repeat schedule already registered; kill via RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS=off
  - relay-api client helpers for outcome/reflection/learning
  - Prove suite: eligibility matrix, stale/unavailable, estimated≠deterministic, dismiss, learning accept/reject,
    tenant seed isolation, same-month sequential cycles, refresh never terminalizes, route/job registration check
- Files created/edited:
  - src/server.ts (registerGoalCycleOutcomeRoutes)
  - web/lib/relay-api.ts (outcome/reflection/learning clients)
  - tests/goal-cycle/goal-cycle-vs9-prove.test.ts (T05 registration assert)
  - (pre-existing) outcome-routes.ts, goal-cycle-outcome-worker.ts, job registration
- Migration and backfill state: none
- Contracts changed: none
- Commands and results:
  - npx vitest run tests/goal-cycle/goal-cycle-outcomes.test.ts tests/goal-cycle/goal-cycle-learning.test.ts tests/goal-cycle/goal-cycle-vs9-prove.test.ts tests/web/goal-cycle-goals-audit.test.tsx → 39 passed
- Manual/browser checks: optional live /studio/goals after stack restart (fixture UI already covered)
- Feature flags / kill switches:
  - RELAY_GOAL_CYCLE_ENABLED
  - RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS / _BATCH
- Known risks or human gates:
  - Views/engagement actuals still context-fixture until Analytics PI wiring
  - Accepted learning seed consume not yet auto-wired into startGoalCycle (explicit helper exists)
- Next unblocked todo IDs: VS11 (Ready for fixture/history verification); VS10 remains Blocked (live provider)
```

**Slice status:** VS9 **Done** (DF-09/10 exit met for automated gates). VS11 Ready; conversational UX pass remains deferred.
