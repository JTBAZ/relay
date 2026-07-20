# VS4 Build Plan — Scheduled Preview & Crosspost

## Outcome

Use trigger-only schedule-series occurrences to select the latest unprocessed Patreon post and create one automation-owned distribution-rule run, with deterministic skip, retry, and expiry behavior.

## Scope

In: trigger-only series mode; occurrence generation/reconcile; source resolver; coordinator/worker; run idempotency; no-new-post skip; one-pending guard; expiry/recovery; job registration.

Out: rail metadata, reminder event, Previewizer, modal.

## Dependencies and permitted parallel work

Depends on VS2 and VS3 exit. B09 → B10 → B11 is serial. Queue and series hot files have one owner throughout VS4.

## Required reading

1. VS3 materializer contract and Delta Out
2. `src/autopost/schedule-series-service.ts`
3. `src/autopost/schedule-series-worker.ts`
4. `src/jobs/queue-names.ts`
5. `src/jobs/register-workers.ts`
6. `src/jobs/schedule-bullmq-repeat.ts`
7. `src/main.ts`
8. `src/worker.ts`
9. `src/patreon`/ingest model semantics for published posts
10. Goal Cycle/timezone scheduling tests

## Trigger contract

- Automation create owns a `CreatorScheduleSeries` with `materializationKind=automation_trigger`.
- Existing occurrence enumeration, stable `occurrenceKey`, creator timezone, two-month horizon, and unique constraint are reused.
- Ordinary series reconciliation ensures occurrences for both kinds.
- Ordinary `materializeOccurrence` handles only `post_draft`; trigger-only occurrences are handled by the automation coordinator.
- Future trigger occurrences remain `planned` and rail-visible.

## Source-resolution contract

- V1 selects latest `PostSource.PATREON`, published, creator-owned post with a latest published version.
- A source already represented by a non-cancelled run for this owned rule is not eligible.
- The resolver returns a stable result/error, never marks mutable “last processed” state first.
- No eligible source marks the occurrence skipped and emits a deduplicated notification request for VS5.
- Missing image is a distinct recoverable failure, not “no new post.”

## Reconcile contract

Create `automation-worker.ts` and coordinator service:

1. Claim due planned trigger occurrences with retry-safe database writes.
2. Enforce one materialized/awaiting-review run per automation.
3. Resolve eligible source.
4. Create/get one rule run keyed by occurrence identity.
5. Call VS3's shared automation-owned materializer.
6. Set occurrence/run states and expiry timestamps.
7. Sweep stale materialized runs after 72 hours; VS5 later synchronizes events/notifications.

The worker coordinates existing authorities; it does not implement draft, rail, reminder, Previewizer, or distribution logic.

## Files

Create:

- `src/autopost/automation-worker.ts`
- `src/autopost/automation-reconcile-service.ts`
- `tests/automations/trigger-series.test.ts`
- `tests/automations/source-resolver.test.ts`
- `tests/automations/automation-reconcile.test.ts`

Edit:

- `src/autopost/schedule-series-service.ts`
- `src/autopost/schedule-series-worker.ts` only if required to skip trigger materialization
- `src/jobs/queue-names.ts`
- `src/jobs/register-workers.ts`
- `src/jobs/schedule-bullmq-repeat.ts`
- `src/main.ts` / `src/worker.ts` following existing backend-selection patterns

Do not touch:

- rail/reminder projection
- Previewizer/UI
- ordinary `createScheduledPostForRail` semantics

## Todo work items

### AUT-VS4-T01 — Add trigger-only series mode

1. Extend create/list/patch serialization with the frozen discriminator.
2. Reuse occurrence enumeration/horizon for trigger-only series.
3. Prevent JIT blank-post materialization for trigger-only occurrences.
4. Test weekly/monthly interval, DST, short month, pause/end, retry, and ordinary-series parity.

Acceptance: full-month trigger ticks exist without creating posts, drafts, plans, variants, or tasks.

### AUT-VS4-T02 — Resolve source and create an idempotent run

1. Implement creator-scoped latest-eligible Patreon resolver.
2. Atomically create/get the rule run linked to occurrence.
3. Call the shared VS3 materializer.
4. Test concurrent workers, process retry, cross-creator rows, unpublished posts, already-processed posts, and missing images.

Acceptance: one due occurrence produces at most one run and one draft for one eligible source.

### AUT-VS4-T03 — Implement skip, pending guard, expiry, and jobs

1. Mark no-new-post occurrences skipped and produce one notification intent.
2. Skip a new due trigger while an existing run awaits review, without stopping future cadence.
3. Expire untouched materialized runs after 72 hours and make sweeps idempotent.
4. Register in-process and BullMQ execution with env-configured interval and kill switch.
5. Add recovery tests for crash points before/after run and draft persistence.

Acceptance: worker retry and stale recovery never duplicate work, and flag-off performs no new discovery/materialization.

## Safe batches

- **B09:** AUT-VS4-T01 only.
- **B10:** AUT-VS4-T02 only.
- **B11:** AUT-VS4-T03 only.

## Verification

```bash
npx vitest run tests/automations/trigger-series.test.ts tests/automations/source-resolver.test.ts tests/automations/automation-reconcile.test.ts
npx vitest run tests/schedule-series-service.test.ts
npm run typecheck
npm run build
```

## Exit gate

Trigger-only occurrences show deterministic calendar rhythm; due work resolves one eligible source and one prepared draft; skip/pending/expiry paths are idempotent; both job backends are registered behind the disabled flag; ordinary routines remain unchanged.

## Human stop conditions

Stop before selecting non-Patreon sources, changing the 72-hour policy, applying production queue changes, or broadening worker scope into rail/Previewizer/publishing.

## Delta Out

B09 names B10, B10 names B11, and B11 names B12 after the full slice exit.

### Batch 9 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B09 / AUT-VS4-T01
- Completed: AUT-VS4-T01
- Files created/edited:
  - src/autopost/schedule-series-service.ts — materialization_kind on create/list wire; automation_trigger skips JIT blank-post reconcile + materializeOccurrence; seed forbidden on trigger series
  - src/server.ts — POST schedule-series accepts materialization_kind
  - web/lib/autopost-routines-api.ts — additive materialization_kind on wire/create body
  - tests/automations/trigger-series.test.ts (new) — weekly/monthly, DST, short month, pause/end, retry idempotency, ordinary post_draft parity
  - tests/automations/spine-characterization.test.ts — VS4 discriminator behavior expectations
  - docs/studio/automation-build-plans/00-README.md (VS4 → In progress)
  - docs/studio/automation-build-plans/05-VS4-SCHEDULED-PREVIEW-CROSSPOST.md (this Delta Out)
- Migration and backfill state: none (schema discriminator already from VS1)
- Contracts changed (expected: none unless this batch owns them): ScheduleSeriesWire.materialization_kind additive (default post_draft)
- Commands and results:
  - npx vitest run tests/automations/trigger-series.test.ts tests/automations/spine-characterization.test.ts tests/schedule-series-service.test.ts → 25 passed
  - npm run build → ok
- Manual/browser checks: n/a
- Feature flags / kill switches: none new
- Existing atom regressions checked: post_draft series still JIT via createScheduledPostForRail; trigger series only ensure planned occurrences
- Known risks or human gates: source resolver + owned-run materialize from occurrences remain B10; worker/queue registration remains B11
- Reopened owner IDs, if any: none
- Next unblocked batch: B10 (AUT-VS4-T02)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/05-VS4-SCHEDULED-PREVIEW-CROSSPOST.md (B09 Delta Out),
  src/autopost/automation-materializer.ts, schedule-series-service.ts,
  and distribution-rule-service.ts.
  Claim global Batch B10 only: AUT-VS4-T02 (latest-eligible Patreon source resolver + idempotent occurrence-linked rule run + call materializeAutomationOwnedDistributionRun).
  Do not implement rail/toast, Previewizer UI, skip/expiry sweeps, or job registration (B11).
  When complete, append Automation Delta Out, name B11 next, then stop.
```

### Batch 10 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B10 / AUT-VS4-T02
- Completed: AUT-VS4-T02
- Files created/edited:
  - src/autopost/automation-source-resolver.ts (new) — resolveLatestEligiblePatreonPost (published Patreon only; skip non-cancelled runs; missing media ≠ no-new-post)
  - src/autopost/automation-reconcile-service.ts (new) — createOrGetAutomationRunForOccurrence (occurrence:{id} idempotency); prepareAutomationOccurrenceWork → shared materializer
  - tests/automations/source-resolver.test.ts (new)
  - tests/automations/automation-reconcile.test.ts (new) — concurrent/retry create, one draft, no-eligible, missing-image
  - docs/studio/automation-build-plans/05-VS4-SCHEDULED-PREVIEW-CROSSPOST.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none (uses frozen automationRunIdempotencyKeyForOccurrence)
- Commands and results:
  - npx vitest run tests/automations/source-resolver.test.ts tests/automations/automation-reconcile.test.ts tests/automations/trigger-series.test.ts → 18 passed
  - npx vitest run tests/schedule-series-service.test.ts → passed
  - npm run build → ok
- Manual/browser checks: n/a
- Feature flags / kill switches: none new
- Existing atom regressions checked: does not register workers; does not skip/expire occurrences; delayed-release discover path untouched
- Known risks or human gates: occurrence claim/skip/one-pending/expiry + automation-worker/jobs remain B11; prepareAutomationOccurrenceWork does not yet flip occurrence status
- Reopened owner IDs, if any: none
- Next unblocked batch: B11 (AUT-VS4-T03)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/05-VS4-SCHEDULED-PREVIEW-CROSSPOST.md (B10 Delta Out),
  src/autopost/automation-reconcile-service.ts, automation-source-resolver.ts,
  jobs queue-names/register-workers/schedule-bullmq-repeat, main.ts, worker.ts.
  Claim global Batch B11 only: AUT-VS4-T03 (skip/no-new-post, one-pending guard, 72h expiry, in-process+BullMQ registration behind feature flag).
  Do not implement rail/toast or Previewizer UI.
  Consume prepareAutomationOccurrenceWork / materializeAutomationOwnedDistributionRun; do not fork.
  When complete, append Automation Delta Out, mark VS4 Done if exit gate passes, name B12 next, then stop.
```

**Slice status:** VS4 **In progress** (B09–B10 landed; B11 remaining).
