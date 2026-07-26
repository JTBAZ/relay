# VS8 Build Plan — Media, Reminders, and Human-Confirmed Execution

## Outcome

Complete the creator-controlled execution loop: attach media, deliver due packets/deep links, execute upkeep/active-rest tasks, confirm publishing, synchronize post/task/rail state, and recover partial slot failures.

## Scope

In: media binding, task/due packet linkage, extension UX, creator confirmation, completion synchronization, repair/retry.

Out: autonomous posting, new destination adapters, outcome learning, extension-store publication.

## Dependencies and permitted parallel work

Depends on VS7. Media/task backend and extension UI may run in parallel after the due-packet contract freezes. Job registration and final integration are serial.

## Required reading

1. `src/distribution/media-binding.ts`
2. `src/distribution/distribution-package.ts`
3. `src/distribution/distribution-schedule-reminder-worker.ts`
4. `src/distribution/schedule-reminder-extension-api.ts`
5. `extension/src/lib/schedule-reminder-types.ts`
6. `extension/src/lib/schedule-reminder-listener.ts`
7. `extension/src/content/schedule-reminder-toast.ts`
8. `web/app/components/schedule-rail/EventMediaDropBin.tsx`
9. `web/app/components/schedule-rail/EventPopover.tsx`

## Due packet contract

Extend the existing reminder packet with optional:

- `goal_cycle_id`, `goal_cycle_slot_id`, `campaign_key`;
- `relay_post_id`, `distribution_plan_id`, `variant_id`, `task_id`, `rail_event_id`;
- `task_kind: publish | social_upkeep | active_rest`;
- creator-confirmed destination/deep link;
- media readiness and missing requirements;
- creator-local due time/time zone;
- safe title/instructions.

Bearer grants and existing extension consent rules remain unchanged. Packets contain no private media bytes/URLs or patron data.

## State synchronization

- Media attach updates slot, post/version, distribution readiness, task, and rail projection idempotently.
- Publish confirmation is the existing explicit creator action and records external result/reference where available.
- A successful destination marks only its variant/task complete.
- Partial failure leaves failed variants retryable and does not roll back successful destinations.
- Upkeep/active-rest tasks use bounded completion/reflection states and never masquerade as published posts.

## Files

Create:

- `src/goal-cycle/execution/goal-cycle-execution-service.ts`
- `src/goal-cycle/execution/goal-cycle-repair-service.ts`
- `tests/goal-cycle/goal-cycle-execution.test.ts`
- `tests/goal-cycle/goal-cycle-partial-recovery.test.ts`
- `tests/web/goal-cycle-event-media.test.tsx`
- `extension/src/lib/goal-cycle-reminder.ts`
- extension test files using the existing test harness/location

Edit:

- `src/distribution/media-binding.ts`
- `src/distribution/distribution-package.ts`
- `src/distribution/postbot-task-service.ts`
- `src/distribution/distribution-schedule-reminder-worker.ts`
- `src/distribution/schedule-reminder-extension-api.ts`
- `src/jobs/register-workers.ts` / queue registration as needed
- `web/app/components/schedule-rail/EventMediaDropBin.tsx`
- `web/app/components/schedule-rail/EventPopover.tsx`
- listed extension reminder files for additive Goal Cycle fields/states only; preserve Studio Phase 5 non-Goal-Cycle reminder behavior and compatibility

Do not touch:

- extension authorization/token model
- autonomous publish capability
- attribution calculation
- `/studio/goals`

## Todo work items

### VS8-T01 — Freeze due packet and deep links

Extend backend/extension shared types, preserve backward compatibility, validate destination/deep-link allowlists, and add packet fixtures for publish/upkeep/active-rest/missing-media.

### VS8-T02 — Complete media attachment

Attach/replace/remove media through existing permission and storage paths, update all projections, and keep draft unpublished. Add creator-visible readiness/errors on the event.

### VS8-T03 — Execute bounded task kinds

Route publish tasks to existing confirmation flow; render upkeep and active-rest instructions/actions without requiring fake media/post creation.

### VS8-T04 — Synchronize completion

Make destination completion update variant, plan, PostBot task, Goal Cycle slot, and rail event idempotently. Preserve partial success and retry failed destinations.

### VS8-T05 — Extend extension reminder UX

Poll/receive compatible due packets, show safe Goal Cycle context, deep-link to Relay/destination, handle revoked/offline/outdated states, and never click publish.

### VS8-T06 — Add repair and end-to-end tests

Detect missing/stale linkage, replay safe projection updates, test duplicate completion, media replacement, partial failure, offline extension, revoked grant, DST due time, and existing reminder compatibility.

## Safe batches

- Batch 1: VS8-T01 + packet tests.
- Batch 2: VS8-T02 + VS8-T03.
- Batch 3: VS8-T04 + VS8-T06 backend cases.
- Batch 4: VS8-T05 + extension compatibility tests.

## Verification

```bash
npx vitest run tests/goal-cycle/goal-cycle-execution.test.ts tests/goal-cycle/goal-cycle-partial-recovery.test.ts
npx vitest run tests/web/goal-cycle-event-media.test.tsx tests/schedule-reminder-extension-api.test.ts tests/distribution-media-binding.test.ts
npm run build --prefix web
npm run build --prefix extension
```

## Exit gate

DF-08 passes for new-post, upkeep, and active-rest fixtures; media and completion survive retries; partial destinations remain truthful; revoked/offline/outdated extension states are explicit and recoverable; extension opens the right work but never publishes autonomously.

## Human stop conditions

Stop for new extension permissions, store submission, destination credential changes, direct automation of publish clicks, or private-media exposure.

## Delta Out

**Status: Done** (human DF-08 acceptance + follow-up fixes, 2026-07-17/18)

### Exit evidence
- New-post / upkeep / active-rest materialization → Schedule Rail; media attach + publish confirm; no autonomous publish; extension handoff OK (human).
- Partial destinations: rail **groups visually** (`groupScheduleRailItems`) with per-dest Done/Dismiss; backend still one variant/task per destination.
- Logistics date edit now syncs `scheduled_local` → `scheduled_utc` (datetime-local + server manual-edit normalize) so rail day matches Approve.
- Research timeout on cache-hit request_ids fixed (materialize complete run for new `request_id`).
- Local Coach Plan credit top-ups are operational, not product debt.

### Deferred (not VS8 reopen)
- Conversational / denser Coach Plan UI, archaic control polish beyond logistics datetime, thumbnail-after-drop UX → [`COACH-PLAN-CONVERSATIONAL-UX-PASS.md`](COACH-PLAN-CONVERSATIONAL-UX-PASS.md).

### Unblocks
- VS9 (outcomes/audit) may proceed; VS11 still waits on VS9 (+ VS10 only for live-mode rollout).

