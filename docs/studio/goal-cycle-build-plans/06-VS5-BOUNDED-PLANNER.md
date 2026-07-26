# VS5 Build Plan — Bounded Goal Planner Engine

## Outcome

Combine deterministic creator facts, trend evidence, paid-support evidence, linked destinations, and bounded context into a validated, resumable Plan with at most two questions, two AI revisions, and eight slots.

## Scope

In: planning orchestration, fact pack, question/revision limits, structured AI output, deterministic fallback, credit reservation, progress, retry/idempotency.

Out: frontend, approval materialization, live provider selection, metric calculation by AI.

## Dependencies and permitted parallel work

Depends on VS1, VS2, VS3, and VS4. Fact-pack assembly and structured validator may begin in parallel, then orchestration merges. VS6 may start against the frozen final fixture only after exit.

## Required reading

1. `src/distribution/coach-fact-pack.ts`
2. `src/distribution/coach-propose-service.ts`
3. `src/distribution/coach-checkpoint-service.ts`
4. `src/ai/ai-service.ts`, `src/ai/types.ts`, `src/ai/config.ts`
5. [`03-VS2-COACH-PLAN-CREDITS.md`](03-VS2-COACH-PLAN-CREDITS.md)
6. [`04-VS3-TREND-EVIDENCE-GATEWAY.md`](04-VS3-TREND-EVIDENCE-GATEWAY.md)
7. [`05-VS4-PAID-SUPPORT-ATTRIBUTION.md`](05-VS4-PAID-SUPPORT-ATTRIBUTION.md)

## Planner contract

Input:

- cycle/version/idempotency key;
- goal and break mode;
- bounded creator context;
- prior confirmed cycle outcomes;
- deterministic Coach facts;
- `TrendEvidence`;
- paid-support facts;
- linked destination capabilities;
- credit reservation state.

Output is the VS0 `GoalCyclePlan`. The model returns strict JSON only. Runtime validation enforces:

- max eight ranked unique slots;
- max two answered questions and max two `ai_revision` rows;
- linked/compatible destinations only;
- creator-local and UTC date consistency;
- no unsupported metric claims;
- evidence refs exist in the supplied fact pack;
- break branch limits;
- no publish-complete state.

Progress codes: `credit_reserved`, `facts_loaded`, `research_complete`, `questions_ready`, `generating_plan`, `plan_ready`, `revision_started`, `revision_ready`, `fallback_ready`, `planner_failed`.

## Rest branch rules

- Complete silence: no reservation, provider, or model call; zero slots; reminder-suppression intent; immediately reviewable. Approval creates a zero-slot receipt and an active break interval, then completion is suggested at interval end.
- Social upkeep: one credit; creator context/history only, no external trend-provider call; may create zero new posts and only bounded existing-post upkeep tasks.
- Active rest: one credit; 1–4 low-energy slots restricted to product-contract formats; uses the standard trend gateway with transparent history-only fallback.

## Files

Create:

- `src/goal-cycle/planner/goal-cycle-fact-pack.ts`
- `src/goal-cycle/planner/plan-schema.ts`
- `src/goal-cycle/planner/goal-cycle-planner-service.ts`
- `src/goal-cycle/planner/deterministic-plan-fallback.ts`
- `src/goal-cycle/planner/planner-prompts.ts`
- `src/goal-cycle/planner/planner-routes.ts`
- `tests/goal-cycle/goal-cycle-fact-pack.test.ts`
- `tests/goal-cycle/plan-schema.test.ts`
- `tests/goal-cycle/goal-cycle-planner.test.ts`
- `tests/goal-cycle/goal-cycle-planner-routes.test.ts`

Edit:

- `src/server.ts`
- `src/goal-cycle/goal-cycle-service.ts`
- `web/lib/relay-api.ts`
- AI usage-event mapping for safe model/provider cost metadata

Do not touch:

- `GalleryView.tsx`
- post/distribution/task materialization
- live provider activation
- credit allowance values

## Todo work items

### VS5-T01 — Assemble deterministic fact pack

Build one versioned fact pack from existing facts, prior confirmed outcomes, trend envelope, attribution facts, linked capabilities, and creator context. Metric values are computed before the model.

### VS5-T02 — Implement Plan schema and fallback

Add runtime validation, evidence-reference checks, rest rules, logistics normalization, and a deterministic Plan fallback that is useful but makes no trend claim.

### VS5-T03 — Implement question and initial-Plan flow

Reserve one credit when required, ask zero-to-two bounded questions, persist checkpoints/progress, call the model once for the initial Plan, validate/fallback, and support retry by idempotency key.

### VS5-T04 — Implement revisions and manual edits

Allow two AI revision rounds against the last valid Plan. Reject a third without charging. Manual validated edits create `manual_edit` revisions and remain available.

### VS5-T05 — Register planner APIs

Add research/start, answer, generate, revise, manual-edit, and progress/hydration endpoints under Goal Cycle routes. Return conflict versions and current valid Plan on safe retry.

### VS5-T06 — Prove bounded/failure behavior

Test malformed JSON, hallucinated evidence/metrics, ninth slot, third question/revision, unlinked destination, timeout/rate-limit, concurrent retry, weak evidence, all rest branches, zero credit, resume, and usage telemetry redaction.

## Safe batches

- Batch 1: VS5-T01 + VS5-T02.
- Batch 2: VS5-T03 + focused initial-flow tests.
- Batch 3: VS5-T04 + revision tests.
- Batch 4: VS5-T05 + VS5-T06.

## Verification

```bash
npx vitest run tests/goal-cycle/goal-cycle-fact-pack.test.ts tests/goal-cycle/plan-schema.test.ts
npx vitest run tests/goal-cycle/goal-cycle-planner.test.ts tests/goal-cycle/goal-cycle-planner-routes.test.ts
npm run typecheck
npm run build --prefix web
```

## Exit gate

The canonical fixture reaches one stable Plan in AI and fallback modes; limits and linked destinations are enforced server-side; retries/resume do not duplicate revisions or reservations; the final API fixture is frozen for VS6/VS7.

## Human stop conditions

Stop for model/provider procurement, prompt-policy expansion, a third AI revision, a ninth slot, autonomous publish instructions, or allowance/pricing changes.

## Delta Out

Include fact-pack version, prompt/schema version, final UI fixture, progress sequence, fallback behavior, usage-event fields, and all APIs unblocking VS6/VS7.
