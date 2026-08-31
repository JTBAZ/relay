# Phase 9 — Finite schedule workbench

## Outcome

“Hero Academy weekly drops” is a **finite release plan** over the frozen selection — not a new recurring-automation engine. Chat and drag/drop share one versioned `ProposalPatch`. No rail rows while shaping. **One** final approval atomically creates the plan, `CreatorScheduleEvent`s, and destination drafts through existing services.

## Scope

In:

- Replace hardcoded `weeklyDueDates()` (Aug 2026 fixture) with creator-local TZ / DST-safe math.
- `ProposalPatch` for cadence, weekday, start, exclusions already in the frozen set, slot moves.
- Lab 3: collapse confirmed selection left; 30-day calendar open; proposed post/date/time tiles; unscheduled; conflicts; already-posted overrides.
- Flag `RELAY_COMMAND_SCHEDULE_PLAN_ENABLED` (default off).
- HUMAN-UX-PLAN evidence.

Out:

- `CreatorScheduleSeries` / Automations recurrence store (reuse Automations program for true recurrence).
- Publishing.
- General session memory beyond the active proposal.
- New extension packet.
- Streak Keeper (Automations deferred).

## Dependencies and permitted parallel work

Depends on **P8 Done** (durable ChangeSet). Calendar chrome may use fixture occupancy in component tests in parallel with the compiler, but live Lab 3 acceptance needs P8 apply flags locally.

## Required reading

1. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) (stage machine, stage gates)
2. [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md)
3. `src/studio/command/change-set-engine.ts` (`weeklyDueDates`, `applyScheduleAndDrafts`)
4. `src/studio/command/contracts.ts` (`materialize_schedule`, `prepare_destination_drafts`, `create_release_plan`)
5. `web/app/components/studio-lab3/Lab3CalendarDialog.tsx`
6. `web/app/components/schedule-rail/ScheduleRail.tsx`
7. `docs/studio/automation-build-plans/PRODUCT-CONTRACT.md` (do not fork recurrence)
8. `src/goal-cycle/planner/` schedule-local helpers **if** they already exist — reuse, do not copy-paste blindly
9. [`UI-DEBT.md`](UI-DEBT.md) RC-UI-02 (calendar exists; P9 composes it into the command stage)

## Locked contracts

**Finite plan**

- N frozen posts → N or fewer slots (skip already-posted when the artist confirmed keep/skip in P6).
- Cadence: weekly, weekday, start datetime in creator TZ. “Every Saturday” is a patch, not a series row.
- Chronological / page order from P1 sequence. Cover-first when sequence says cover.
- Conflicts with existing rail events: warn, do not silently overwrite.

**ProposalPatch**

- Versioned. Chat planner (P7) and drag/drop emit the same patch shape.
- Allowed: `set_weekday`, `set_interval_days`, `set_start`, `move_slot` `{post_id, due_at}`, `exclude_post_id` (must already be in frozen set), `restore_post_id` (excluded only).
- Not allowed: add arbitrary library posts; `publish_external`; change write layer.

**Shaping vs apply**

- Shaping updates proposal only (P8 store). Zero `CreatorScheduleEvent` / `AutopostDraft` until final approve.
- Final approval: one ChangeSet with `create_release_plan` / `materialize_schedule` / `prepare_destination_drafts` as P2 already does, with real dates from the compiler.
- Undo rolls back that ChangeSet (P8 durable).

**UX**

- After selection Approve, copy: pieces confirmed; confirm weekly / chronological; squash selection; open month calendar.
- Command line remains for patches. Drag is not a second source of truth.

## Files

Create:

- `src/studio/command/finite-plan-compiler.ts`
- `src/studio/command/proposal-patch.ts`
- `web/app/components/studio/command/PlanWorkbench.tsx` *(name flexible)*
- `tests/studio/command/finite-plan-compiler.test.ts`
- `tests/web/plan-workbench.test.tsx`
- `docs/qa/RELAY_COMMAND_P9_PLAN_EVIDENCE.md`

Edit:

- `src/studio/command/change-set-engine.ts` — remove fixture-only dates for Lab 3/production-shaped apply; Lab 2 eval may still pin dates via payload
- `web/app/components/studio-lab3/Lab3CalendarDialog.tsx` / rail frame
- `web/app/components/studio/command/CommandBox.tsx`
- `web/app/studio/GalleryView.tsx` — Lab 3 floorspace
- `web/lib/relay-api.ts`
- `src/studio/command/flags.ts`, `.env.example`
- Lab 2 eval fixtures if date payload must become explicit for `--facade-only`

Do not touch:

- Automations VS0–VS8 contracts
- `schedule-reminder-extension-api.ts` packet family (P10)
- Production `/studio` mount
- Goal Cycle / Escape Hatch

## Todo work items

### RC-P9-T01 — Creator-TZ finite plan compiler

1. Input: frozen IDs, order, cadence, TZ, destination skip list.
2. Output: slot list `{post_id, due_at}`. DST tests.
3. Lab 2 eval: pass explicit dates in op payload so fixture weeks stay stable **or** keep Lab 2 on payload override; do not break `--facade-only`.

Acceptance: no `2026-08-27` hardcoded default for Lab 3.

### RC-P9-T02 — ProposalPatch API

1. Validate patches. Version bump. Reject add-from-library.
2. HTTP POST patch; GET current plan preview (side-effect free GET).

Acceptance: contract tests; HTTP verb hygiene.

### RC-P9-T03 — Lab 3 calendar squash + occupancy

1. Selection column collapses; calendar 30-day grid shows proposed tiles.
2. Drag slot → patch. Occupied existing events visible as conflicts.
3. Reuse Lab3 overlay/calendar; do not restyle production rail until P10.

Acceptance: component tests; rail closed vs calendar-open states.

### RC-P9-T04 — Final plan approval

1. Apply flag on: one ChangeSet → events + drafts. No rows during shaping (assert count).
2. Destination drafts unpublished. No distribution attempts completed.

Acceptance: RC-DF-09 + RC-CX-08.

### RC-P9-T05 — HUMAN-UX-PLAN

1. Script: confirm pieces → “change the drops to every Saturday” → drag one day → confirm schedule → rail/calendar populate → Undo restores.
2. **Stop.** Do not start P10.

Acceptance: signed evidence.

## Safe batches

- Batch 1: RC-P9-T01 + RC-P9-T02
- Batch 2: RC-P9-T03 + RC-P9-T04
- Batch 3: RC-P9-T05 (gate)

## Verification

```bash
npx vitest run tests/studio/command/finite-plan-compiler.test.ts tests/web/plan-workbench.test.tsx tests/web/studio-lab3-rail.test.tsx
npm run eval:relay-command -- --facade-only
npx tsc -p tsconfig.build.json --noEmit
```

Restart stack after calendar/HTTP changes.

## Exit gate

- HUMAN-UX-PLAN Pass
- No Automations series created
- P9 → Done; next RC-P10-T01 + RC-P10-T02

## Human stop conditions

- **HUMAN-UX-PLAN** (required)
- Product contradiction (recurrence store fork, publish)

## Delta Out

Use the template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md).

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P9-T01 + RC-P9-T02
- Completed: Creator-TZ finite plan compiler with DST-safe weekly slots via Goal Cycle zonedLocalDateTimeToUtc. Versioned ProposalPatch (set_weekday / set_interval_days / set_start / move_slot / exclude_post_id / restore_post_id). GET plan preview is side-effect free; POST patch persists into the P8 proposal store (plan JSON inside snapshot). Lab 2 eval pins due_ats; Lab 3 apply no longer uses a hardcoded 2026-08-27 default. Flag RELAY_COMMAND_SCHEDULE_PLAN_ENABLED default off. P9 remains In progress (calendar T03, final approve T04, HUMAN-UX-PLAN T05).
- Files created/edited: src/studio/command/finite-plan-compiler.ts; src/studio/command/proposal-patch.ts; src/studio/command/proposal-types.ts; src/studio/command/change-set-engine.ts; src/studio/command/command-durable-store.ts; src/studio/command/http-routes.ts; src/studio/command/flags.ts; src/studio/eval/command-eval-runner.ts; src/studio/eval/command-harness-interpret-creator.ts; web/lib/relay-api.ts; web/lib/command-selection-review.ts; web/app/components/studio/command/CommandBox.tsx; web/app/components/studio/command/SelectionReviewOverlay.tsx; .env.example; tests/studio/command/finite-plan-compiler.test.ts; tests/studio/command/proposal-patch.test.ts; tests/studio/command/plan-proposal-http.test.ts; tests/studio/command/contracts.test.ts; tests/web/* flag objects; control-plane status files
- Migration and backfill state: none. Plan JSON is stored on existing command_selection_proposals.snapshot_json as __finite_plan (no new table).
- Contracts changed: plan_shaping stage; GET /api/v1/creator/command/plan-proposal; POST /api/v1/creator/command/plan-proposal/patch. Committed flags still off. Production CommandBox still unmounted. No rail rows during shaping.
- Commands and results: vitest finite-plan-compiler, proposal-patch, plan-proposal-http, contracts, change-set-engine, durable, apply-http, mcp-tools, command-box, selection-review — passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` scenarios 13/13 ok; overall ok=false from pre-existing Lab 2 metrics gap. live_model=skipped.
- Manual/browser checks: stack restart after plan HTTP + flags
- Feature flags / kill switches: committed RELAY_COMMAND_SCHEDULE_PLAN_ENABLED=false
- Known risks or human gates: Next RC-P9-T03 + RC-P9-T04 (calendar squash + final approve). Do not start T05 HUMAN-UX-PLAN or P10. Do not flip committed flags. Do not fork Automations recurrence.
- Next unblocked todo IDs: RC-P9-T03 + RC-P9-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P9-T03 + RC-P9-T04
- Completed: Lab 3 schedule journeys squash the frozen selection and open a month calendar after Approve. Drag and click-to-move emit the same ProposalPatch (`move_slot`). Occupied rail days warn and do not overwrite. Confirm schedule compiles one `materialize_schedule` ChangeSet (events + unpublished `nudged` drafts). Zero rail/draft rows during shaping. Collection Organize still applies to the library and does not auto-open the calendar. Flag RELAY_COMMAND_SCHEDULE_PLAN_ENABLED remains off. P9 remains In progress (HUMAN-UX-PLAN T05).
- Files created/edited: web/lib/command-plan-workbench.ts; web/app/components/studio/command/PlanWorkbench.tsx; web/app/components/studio/command/CommandBox.tsx; web/app/components/studio-lab3/Lab3Overlay.tsx; web/app/components/studio/command/SelectionReviewOverlay.tsx; src/studio/command/proposal-patch.ts (compileFinitePlanChangeSet); src/studio/command/http-routes.ts (plan apply); tests/web/plan-workbench.test.tsx; tests/web/studio-lab3-rail.test.tsx; tests/web/selection-review.test.tsx; tests/studio/command/plan-apply-http.test.ts; tests/studio/command/proposal-patch.test.ts; tests/studio/command/change-set-engine.test.ts; control-plane status files
- Migration and backfill state: none. Plan JSON still lives on command_selection_proposals.snapshot_json as __finite_plan.
- Contracts changed: none beyond T01/T02. Confirm schedule is the one apply for schedule write_layer when the schedule-plan flag is on. Production CommandBox still unmounted. Committed flags still off. Rail stays closed until after apply (`lab3RailShouldOpen`).
- Commands and results: vitest finite-plan-compiler, proposal-patch, plan-apply-http, command-apply-proposal-http, change-set-engine, plan-workbench, studio-lab3-rail, selection-review, command-box — 75/75 passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` scenarios 13/13 ok; overall ok=false from pre-existing Lab 2 metrics gap. live_model=skipped.
- Manual/browser checks: stack restart after calendar/HTTP/UI
- Feature flags / kill switches: committed RELAY_COMMAND_SCHEDULE_PLAN_ENABLED=false
- Known risks or human gates: Next RC-P9-T05 HUMAN-UX-PLAN only. Do not start P10. Do not flip committed flags. Do not create docs/qa/RELAY_COMMAND_P9_PLAN_EVIDENCE.md until T05. Do not fork Automations recurrence.
- Next unblocked todo IDs: RC-P9-T05
```

