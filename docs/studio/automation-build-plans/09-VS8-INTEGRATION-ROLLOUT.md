# VS8 Build Plan — Integrated Verification and Rollout

## Outcome

Prove AU-01 through AU-12 across the complete schedule → source → draft → rail/toast → Previewizer → distribution path, verify legacy atoms, and stage a reversible rollout.

## Scope

In: integration/concurrency tests; browser matrix; extension-offline checks; tenant/timezone/failure matrix; docs/runbook/flags; rollout and rollback evidence.

Out: silent feature repair, production migration execution, flag activation, extension-store release, new product scope.

## Dependencies and permitted parallel work

Depends on VS3–VS7 exits. B19 diagnoses only; failures reopen the owning work item. B20 begins only after B19 is green or remaining external gates are explicitly documented.

## Required reading

1. [`../../qa/AUTOMATIONS_ACCEPTANCE.md`](../../qa/AUTOMATIONS_ACCEPTANCE.md)
2. [`TRACEABILITY.md`](TRACEABILITY.md)
3. all slice Delta Outs
4. `docs/qa/PREVIEWIZER_AUTOPOST_WIRING.md`
5. `docs/studio/PLAN_PHASE_5_EXTENSION_STICKY_REMINDERS.md`
6. relevant deployment/worker/feature-flag runbooks
7. `.cursor/rules/supabase-mcp-read-check.mdc`

## Verification roles

- Verification workers reproduce, diagnose, and cite evidence.
- A behavior defect reopens the smallest owner in `TRACEABILITY.md`.
- The verifier does not silently change production behavior in B19.
- Test-harness-only defects may be fixed in AUT-VS8-T01.
- Credential, production DB, live OAuth, extension-store, and flag-activation checks are recorded as human gates, never fabricated.

## Integrated matrix

Automate where possible:

1. Create connector graph under duplicate request.
2. Reconcile visible-month trigger occurrences across DST/month boundary.
3. Process a due occurrence under concurrent worker delivery.
4. Skip when no new source exists and emit one notification.
5. Materialize one draft/event and one manual reminder packet.
6. Open the same approval context from rail and toast deep link.
7. Preload template snapshot; preserve crop; export preview.
8. Reject plan-before-preview; create one plan/variant after export.
9. Exercise extension connected/offline and Bluesky existing paths.
10. Complete/cancel/expire and verify event/run/history synchronization.
11. Exercise delayed release parity.
12. Verify ordinary series, manual events, playbooks, legacy rules, Previewizer, and distribution regression suites.

## Manual/browser matrix

- Autopost eligible and gated creator.
- Empty modal, two presets, saved-template missing/repair states.
- Weekly Preview & crosspost create; visible-month rail ticks.
- Due ready event; sticky reminder; deep-link resume.
- Previewizer preload, tweak, cancel/resume, export, explicit send.
- Extension offline fallback and retry.
- Delayed public release create/edit/pause/resume/history.
- 72-hour expiry fixture.
- Keyboard-only, screen reader labels, focus return, reduced motion.
- Wide rail viewport and narrow fallback entry.

## Rollout contract

- `RELAY_FEATURE_AUTOMATIONS` stays false until a human release owner approves evidence.
- Existing series/rule/Previewizer flags remain independent kill switches.
- Document worker queue/interval, observability counters, safe replay, stale-run sweep, and rollback.
- Rollback disables new discovery/materialization without deleting connectors, runs, drafts, or events.
- Migration deployment and flag activation are separate human-controlled steps.
- No automatic adoption of legacy rows in v1.

## Files

Create:

- `tests/automations/integration.test.ts`
- `tests/automations/concurrency.test.ts`
- `docs/studio/AUTOMATIONS_RUNBOOK.md`
- browser evidence artifact in the repository's existing QA convention

Edit:

- `.env.example` / deployment docs for final flag/worker variables
- this program status and traceability evidence

Do not:

- apply production migrations
- activate production flags
- publish extension builds
- repair upstream behavior without reopening owner

## Todo work items

### AUT-VS8-T01 — Execute integrated acceptance and regression matrix

1. Add integration/concurrency tests and run all focused suites.
2. Verify tenant, retry, DST/month, no-new-post, missing-image, deleted-template, upload failure, destination unlink, extension offline, and legacy parity.
3. Run browser flows where environment permits.
4. Reopen failures through `TRACEABILITY.md` with evidence.

Acceptance: AU-01–AU-12 have explicit pass evidence or named external human gates; no known behavior defect remains hidden in VS8.

### AUT-VS8-T02 — Stage reversible rollout and operator handoff

1. Write runbook for migration sequence, workers, metrics, replay, expiry, support recovery, kill switches, and rollback.
2. Verify disabled/default behavior and flag-off preservation of prepared work.
3. Update master status, traceability, and final Delta Out.
4. Provide human checklist for production migration, flag activation, and any extension release.

Acceptance: a release owner can deploy, observe, disable, and recover the feature without data loss or autonomous publishing.

## Safe batches

- **B19:** AUT-VS8-T01 only.
- **B20:** AUT-VS8-T02 only.

## Verification

```bash
npx prisma validate
npx vitest run tests/automations
npm run test
npm run typecheck
npm run build
npm run lint --prefix web
npm run build --prefix web
npm run build --prefix extension
```

If production behavior changes require it and no process is already healthy:

```bash
npm run dev:stack:restart
```

Then verify API and web ports and perform the manual/browser matrix.

## Exit gate

All AU gates pass or only explicit external release gates remain; full applicable builds/tests pass; rollout flag remains off pending approval; rollback and recovery are documented; program status and Delta Out are current.

## Human stop conditions

Stop before production migration, flag activation, live OAuth/credentials, extension-store release, or any attempt to waive an AU failure.

## Delta Out

B19 names B20 only when behavior is green or external-only gates are named. B20 names `Program complete` or the exact human release gate; there is no B21.
