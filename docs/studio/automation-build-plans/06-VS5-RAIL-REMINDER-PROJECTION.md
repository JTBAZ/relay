# VS5 Build Plan — Rail, Reminder, and Notification Projection

## Outcome

Make future and prepared automation work visible through existing Schedule Rail and manual-event reminder atoms, with no new rail source or extension packet family.

## Scope

In: planned-occurrence metadata enrichment; prepared manual event; rail run metadata; safe deep link; sticky reminder reuse; skip/expire notifications; event/run synchronization; tests.

Out: Previewizer adapter, distribution approval, modal create/manage forms.

## Dependencies and permitted parallel work

Depends on VS3 and VS4 exit. B12 precedes B13. `ScheduleRail.tsx` UI changes are deferred to VS7; VS5 owns DTO/wire metadata only.

## Required reading

1. VS4 run/occurrence contract and Delta Out
2. `src/distribution/schedule-rail-service.ts`
3. `web/lib/schedule-rail-data.ts`
4. `src/distribution/creator-schedule-event-service.ts`
5. `src/distribution/creator-schedule-event-contract.ts`
6. `src/distribution/schedule-reminder-extension-api.ts`
7. `extension/src/lib/schedule-reminder-types.ts`
8. `extension/src/content/schedule-reminder-toast.ts`
9. `src/patron/notification-service.ts`
10. playbook rail enrichment in `social-playbook-service.ts`

## Projection contract

Future:

- Query existing planned occurrences.
- Enrich trigger-only rows by series/automation relation with automation ID, title, preset, destination(s), and state.
- Keep `source=recurrence_occurrence`.

Prepared:

- After an automation-owned run has a draft, create/get one validated `CreatorScheduleEvent`:
  - `event_type=custom`;
  - creator-owned source post link;
  - title such as `Review X preview`;
  - due time from the run;
  - `remind_me` from connector/rule preference;
  - HTTPS Relay Studio deep link containing opaque draft/run context only.
- Persist `materializedEventId` on the run.
- Enrich the resulting `manual_event` with automation/run/preset/draft/expiry metadata, following playbook's batch enrichment pattern.
- When the event exists, the planned trigger placeholder no longer renders as a duplicate.

Do not add `automation_occurrence` or expose private URLs/body text.

## Reminder and notification contract

- The existing manual-event due query produces the sticky packet and CTA.
- Prefer zero extension contract changes. If VS0 characterization requires additive fields, keep old clients compatible and retain manual reminder IDs.
- No-new-post and expiry use `createOrClusterNotification` with deterministic source event IDs.
- Expiry/cancel dismisses the attention event so it is no longer due.
- Opening a toast does not complete the event/run.

## Files

Create:

- `src/autopost/automation-attention-service.ts`
- `tests/automations/automation-rail.test.ts`
- `tests/automations/automation-attention.test.ts`

Edit:

- `src/distribution/schedule-rail-service.ts`
- `web/lib/schedule-rail-data.ts`
- `src/distribution/schedule-reminder-extension-api.ts` only if characterized additive metadata is necessary
- extension reminder types only if the backend contract changed additively

Do not touch:

- Previewizer/distribution approval
- modal components
- ordinary event/task status semantics

## Todo work items

### AUT-VS5-T01 — Project planned and prepared metadata

1. Batch-load automation metadata for planned occurrence series and materialized event IDs.
2. Extend frozen rail wires additively.
3. Create/get the custom attention event through validated service boundaries.
4. Guarantee one visual row as placeholder transitions to prepared event.
5. Test month queries, grouping, creator isolation, and playbook/ordinary event parity.

Acceptance: future cadence and ready work are visible without a new rail source or duplicate calendar slice.

### AUT-VS5-T02 — Reuse reminders and emit lifecycle notifications

1. Prove the existing manual-event packet opens the safe approval deep link.
2. Add only required additive automation metadata.
3. Implement deterministic clustered no-new-post and expiry notifications.
4. Synchronize expired/cancelled/completed run states to attention-event state through idempotent helpers.
5. Extend backend/extension tests for preferences, snooze, presented/dismissed behavior, and old-client compatibility.

Acceptance: one prepared run yields one persistent rail item and one sticky reminder opportunity; skip/expiry notify once.

## Safe batches

- **B12:** AUT-VS5-T01 only.
- **B13:** AUT-VS5-T02 only.

## Verification

```bash
npx vitest run tests/automations/automation-rail.test.ts tests/automations/automation-attention.test.ts
npx vitest run tests/schedule-rail-service.test.ts tests/schedule-reminder-extension-api.test.ts
npm run typecheck
npm run build
npm run build --prefix extension
```

## Exit gate

AU-03, AU-05, AU-06, and AU-07 backend gates pass; existing rail/manual/Postbot packets regress cleanly; no new packet family/source exists; stale events are removed from due delivery.

## Human stop conditions

Stop if a new extension permission/store action is needed, if safe Relay deep links cannot pass current validators, or if projection would require changing ordinary event grouping/status semantics.

## Delta Out

B12 names B13. B13 names B14 after rail/reminder regressions and slice exit pass.
