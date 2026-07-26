# VS6 Build Plan — Library Dream-Flow UI

## Outcome

Deliver an accessible, resume-capable Library modal/drawer that guides goal → context → research → questions → Plan/revisions → logistics → approval while keeping the existing Schedule Rail mounted.

## Scope

In: UI state machine, reusable Coach presentation, API hydration, progress/evidence/credit states, keyboard/reduced-motion/responsive behavior.

Out: backend contract changes, approval materialization, new top-level Goals navigation, Transformer single-post behavior changes.

## Dependencies and permitted parallel work

Depends on VS5’s frozen API fixture. Pure state-machine and component work may run in parallel. `GalleryView.tsx` integration is the final serialized batch. VS7 waits for exit.

## Required reading

1. [`06-VS5-BOUNDED-PLANNER.md`](06-VS5-BOUNDED-PLANNER.md)
2. [`../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md)
3. `web/app/studio/GalleryView.tsx`
4. `web/app/components/schedule-rail/StudioScheduleRail.tsx`
5. `web/app/components/studio/PostingGoalStatusCard.tsx`
6. existing Coach/Transformer UI and `web/lib/relay-api.ts`

## UI contract

State machine phases mirror the server; the server checkpoint is authoritative after every mutation. Local state may optimistically hold field edits but never invent a committed phase.

Required surfaces:

- Library entry card/button with `plan this month`, `resume Plan`, and `review completion / plan next cycle` states;
- credit/silence explanation before paid research;
- bounded goal/rest controls;
- context form with length limits;
- progress list using safe message codes;
- source/freshness/confidence evidence summary;
- zero-to-two question cards;
- Plan slot editor with max-eight feedback;
- revision controls and visible `N / 2`;
- logistics editor restricted to linked destinations;
- explicit approval review;
- resumable/error/no-credit/conflict states.

The rail remains mounted. The drawer uses dialog semantics on narrow screens and a non-destructive side-panel pattern where space permits.

## Files

Create:

- `web/app/components/goal-cycle/GoalCycleLauncher.tsx`
- `web/app/components/goal-cycle/GoalCycleFlow.tsx`
- `web/app/components/goal-cycle/goal-cycle-machine.ts`
- `web/app/components/goal-cycle/GoalStep.tsx`
- `web/app/components/goal-cycle/ResearchStep.tsx`
- `web/app/components/goal-cycle/QuestionsStep.tsx`
- `web/app/components/goal-cycle/PlanStep.tsx`
- `web/app/components/goal-cycle/LogisticsStep.tsx`
- `web/app/components/goal-cycle/ApprovalStep.tsx`
- `web/app/components/goal-cycle/GoalCycleErrorState.tsx`
- `web/app/components/goal-cycle/goal-cycle.css`
- `tests/web/goal-cycle-machine.test.ts`
- `tests/web/goal-cycle-flow.test.tsx`
- `tests/web/goal-cycle-library-integration.test.tsx`

Edit:

- `web/app/studio/GalleryView.tsx`
- `web/lib/relay-api.ts` only to append methods already defined by the frozen VS5 contract; VS6 may not invent or rename API fields
- reusable Coach presentation components only by extraction preserving existing behavior

Do not touch:

- `AppNav.tsx`
- `/studio/goals`
- backend routes/schema
- Schedule Rail internals
- Transformer proposal semantics

## Todo work items

### VS6-T01 — Build pure state machine

Model load/start/resume, phases, mutation pending/error/version conflict, retry, close/reopen, and terminal states. Reject illegal local transitions.

### VS6-T02 — Extract reusable Coach presentation

Extract only stateless progress, evidence, question, and proposal visuals needed by both flows. Keep current single-post Transformer tests green.

### VS6-T03 — Build goal/context/research/questions

Implement bounded controls, goal help that explains the measurable source, break branches, credit explanation, progress, weak-evidence disclosure, answer persistence, focus management, and error recovery.

### VS6-T04 — Build Plan/revision/logistics/approval

Render/edit 0–8 slots, revision cap, evidence refs, linked destination choices, creator-local times, media readiness, and final explicit approval. The button calls a passed callback; VS7 owns effects.

### VS6-T05 — Integrate with Library host

Mount one launcher/flow in `GalleryView.tsx` without unmounting the rail. VS6 owns reconciliation with `PostingGoalStatusCard`: preserve its count-goal status/nudge, avoid duplicate competing CTAs, and derive the three Goal Cycle entry states from server hydration. Preserve filters, selection, inspect panels, and mobile layout.

### VS6-T06 — Complete accessibility and fixture tests

Cover keyboard order, Escape/close/resume, focus return, labels, announcements, reduced motion, narrow/wide layout, loading, empty/new-cycle, retryable error, permanent failure, no-credit, reservation conflict, weak evidence, version conflict, and all break branches.

## Safe batches

- Batch 1: VS6-T01 + VS6-T02.
- Batch 2: VS6-T03 + focused tests.
- Batch 3: VS6-T04 + focused tests.
- Batch 4: VS6-T05 + VS6-T06.

## Verification

```bash
npx vitest run tests/web/goal-cycle-machine.test.ts tests/web/goal-cycle-flow.test.tsx
npx vitest run tests/web/goal-cycle-library-integration.test.tsx tests/coach-attack-review.test.ts
npm run lint --prefix web
npm run build --prefix web
```

## Exit gate

DF-01 through DF-06 pass against frozen fixtures; close/reopen resumes; the rail remains mounted; no existing Library/Transformer regression; approval has no side effect beyond the callback.

## Human stop conditions

Stop for navigation redesign, new visual system, more questions/revisions/slots, a top-up CTA, or any backend field not in the frozen fixture.

## Delta Out

Include component/state-machine API, fixture version, accessibility results, Gallery hot-file diff owner, and the approval callback contract VS7 will implement.
