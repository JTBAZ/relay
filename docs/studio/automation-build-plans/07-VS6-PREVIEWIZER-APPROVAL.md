# VS6 Build Plan — Previewizer Approval and Distribution Handoff

## Outcome

Resume a prepared automation draft into Previewizer with its saved template snapshot, then create and hand off canonical distribution artifacts only after the creator exports and explicitly approves.

## Scope

In: initial Previewizer config; approval-context API/adapter; source media session; upload; plan/variant creation after export; existing handoff reuse; run/event completion/cancel/expiry synchronization.

Out: Automations modal management UI, server-side image rendering, autonomous publish.

## Dependencies and permitted parallel work

Depends on VS5 exit. B14 → B15 → B16 is serial because all three touch approval contracts and shared frontend distribution state.

## Required reading

1. VS5 approval deep-link/run metadata Delta Out
2. `web/lib/previewizer-session.ts`
3. `web/app/components/previewizer/previewizer-client.tsx`
4. `web/lib/previewizer-template-config.ts`
5. `web/app/components/distribution/PreviewizerOverlay.tsx`
6. `web/app/components/distribution/TransformerNodePage.tsx`
7. `web/app/components/distribution/DistributionHandoffPanel.tsx`
8. `web/lib/relay-native-staging-upload.ts`
9. `web/lib/relay-extension-messaging.ts`
10. `src/distribution/post-distribution-service.ts`
11. `docs/qa/PREVIEWIZER_AUTOPOST_WIRING.md`

## Previewizer preload contract

- Add an optional validated initial template config to the Previewizer session/props.
- Apply it once after source image/session initialization.
- Reuse `hydratePreviewTemplateConfig`.
- Preserve current selection/crop for the source image; templates still do not persist crop.
- Later edits to the creator's template do not change the run snapshot.
- Missing initial config leaves all existing callers unchanged.
- Do not auto-open or auto-export outside an explicit approval deep link.

## Approval-context contract

The server returns creator-scoped context:

- automation/run/draft/source post IDs;
- source media ID and safe export URL/path inputs;
- destination list;
- validated template snapshot;
- expiry/status/version;
- existing plan/attempt receipt if already progressed.

The client adapter:

1. resolves the prepared draft and approval context;
2. opens existing `PreviewizerOverlay`;
3. uploads exported blob with the existing staging adapter;
4. calls existing `createPostDistributionPlan` with:
   - source post;
   - configured destinations;
   - preview routing;
   - real `preview_media_id`;
   - source draft/correlation;
5. renders/reuses existing destination approval and handoff controls.

Preview export alone is not completion.

## Completion contract

- Existing approve/start-handoff/extension or Bluesky paths remain authoritative.
- Mark run/event completed only after the frozen completion receipt (normally successful handoff start or direct Bluesky completion) is durably correlated.
- Extension offline leaves the work resumable and does not claim success.
- Cancel closes Previewizer without destroying draft/run.
- Expiry detected while open blocks new approval and refreshes state.
- Duplicate export/approve/complete requests reuse existing plan/receipt.

## Files

Create:

- `web/app/components/automations/AutomationApprovalOverlay.tsx` or equivalent thin adapter
- `tests/web/automation-previewizer.test.tsx`
- `tests/automations/automation-approval.test.ts`

Edit:

- `web/lib/previewizer-session.ts`
- `web/app/components/previewizer/previewizer-client.tsx`
- `web/app/components/distribution/PreviewizerOverlay.tsx`
- automation service/routes and dedicated web client for approval context/receipt
- shared distribution components only through extracted reusable helpers

Do not:

- duplicate `TransformerNodePage` wholesale
- create a second upload or cross-post implementation
- auto-send on Previewizer complete

## Todo work items

### AUT-VS6-T01 — Add optional saved-template preload

1. Extend session/props with optional validated initial config.
2. Apply once without changing crop or ordinary callers.
3. Handle missing/deleted/invalid snapshot with stable repair state.
4. Add hydration, selection, destination-link, and backward-compatibility tests.

Acceptance: AU-08 passes and current Previewizer wiring tests remain unchanged for callers without initial config.

### AUT-VS6-T02 — Build approval adapter and post-export plan creation

1. Add creator-scoped approval-context read API.
2. Build the thin adapter around `PreviewizerOverlay`.
3. Reuse staging upload and `createPostDistributionPlan`.
4. Reuse existing destination approval/handoff UI.
5. Add ordering tests proving plan creation cannot precede a valid preview media ID.

Acceptance: exported media produces one valid plan/variant graph and still requires explicit send.

### AUT-VS6-T03 — Synchronize completion and recovery

1. Add idempotent completion/cancel endpoints or receipts using frozen VS0 contract.
2. Correlate plan/attempt and mark the attention event done only at the approved completion point.
3. Handle offline extension, failed upload, expired context, duplicate callback, and resume.
4. Preserve existing Bluesky and extension semantics.

Acceptance: AU-09/AU-10 pass without false completion or duplicate plans/attempts.

## Safe batches

- **B14:** AUT-VS6-T01 only.
- **B15:** AUT-VS6-T02 only.
- **B16:** AUT-VS6-T03 only.

## Verification

```bash
npx vitest run tests/web/automation-previewizer.test.tsx tests/automations/automation-approval.test.ts
npx vitest run web/lib/previewizer-template-config.test.ts
npm run typecheck
npm run build
npm run lint --prefix web
npm run build --prefix web
```

## Exit gate

Saved template snapshot preloads safely; preview upload precedes plan creation; existing approval/handoff remains explicit; completion/recovery is idempotent; ordinary Previewizer and distribution flows regress cleanly.

## Human stop conditions

Stop if implementation requires server-side rendering, a new external publisher, changing extension permissions, or marking completion before an existing durable handoff receipt.

## Delta Out

B14 names B15, B15 names B16, and B16 names B17 after the full approval exit gate.

```
Automation Delta Out
- Global batch / claimed work items: B14 / AUT-VS6-T01
- Completed: AUT-VS6-T01
- Files created/edited:
  - web/lib/previewizer-session.ts — optional initialTemplateConfig on session (omitted when absent)
  - web/lib/previewizer-template-config.ts — tryHydratePreviewTemplateConfig soft hydrate
  - web/app/components/previewizer/previewizer-client.tsx — shared applyHydratePatch; apply-once after source mount (selection unchanged)
  - web/lib/previewizer-session.test.ts — ordinary omit + opt-in preload
  - web/lib/previewizer-template-config.test.ts — tryHydrate cases
  - tests/automations/spine-characterization.test.ts — additive preload expectation
  - docs/studio/automation-build-plans/00-README.md (VS6 → In progress)
  - docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): additive PreviewizerSession.initialTemplateConfig only
- Commands and results:
  - npx vitest run web/lib/previewizer-{session,template-config}.test.ts tests/automations/spine-characterization.test.ts → 20 passed
  - npm run lint --prefix web / tsc: pre-existing repo errors; no new errors from this batch
- Manual/browser checks: n/a (B15 wires approval deep-link adapter)
- Feature flags / kill switches: unchanged
- Existing atom regressions checked: ordinary buildPreviewizerSession still omits initialTemplateConfig; crop never on template config
- Known risks or human gates: none for T01
- Reopened owner IDs, if any: none
- Next unblocked batch: B15 (AUT-VS6-T02)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (B14 Delta Out),
  web/lib/previewizer-session.ts, PreviewizerOverlay, staging upload, createPostDistributionPlan.
  Claim global Batch B15 only: AUT-VS6-T02 (approval-context API + thin adapter + plan only after preview export).
  Do not implement Automations modal (VS7) or completion receipts (B16).
  When complete, append Automation Delta Out, name B16 next, then stop.
```

**Slice status:** VS6 **In progress** (B14 Done; B15 next).

```
Automation Delta Out
- Global batch / claimed work items: B15 / AUT-VS6-T02
- Completed: AUT-VS6-T02
- Files created/edited:
  - src/autopost/automation-service.ts — getAutomationApprovalContext; correlateAutomationRunPlan; AUTOMATION_APPROVAL_EXPIRED → 410
  - src/server.ts — GET approval-context; POST correlate-plan
  - web/lib/automation-api.ts — getAutomationApprovalContext + correlateAutomationRunPlan client
  - web/lib/automation-approval.ts (new) — preview routing + plan body ordering guard
  - web/app/components/automations/AutomationApprovalOverlay.tsx (new) — PreviewizerOverlay adapter + handoff panel
  - web/app/studio/autopost/autopost-page-client.tsx — deep-link mount (automation_id + automation_run_id)
  - tests/automations/automation-approval.test.ts (new)
  - tests/web/automation-previewizer.test.tsx (new)
  - tests/automations/automation-api.test.ts + fixtures paths
  - docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): approval-context GET implements frozen AutomationApprovalContextWire; no new packet families
- Commands and results:
  - npx vitest run tests/automations/{automation-approval,automation-api}.test.ts tests/web/automation-previewizer.test.tsx → 11 passed
  - npm run build → ok
- Manual/browser checks: n/a (deep-link opens adapter when query present)
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS still defaults off
- Existing atom regressions checked: materializer still does not create plans; send remains explicit via DistributionHandoffPanel
- Known risks or human gates: completion/cancel/expiry sync is B16; do not mark run completed on export
- Reopened owner IDs, if any: none
- Next unblocked batch: B16 (AUT-VS6-T03)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (B15 Delta Out),
  automation-attention-service, DistributionHandoffPanel, post-distribution-service.
  Claim global Batch B16 only: AUT-VS6-T03 (idempotent completion/cancel/expiry sync + attention event done only after durable handoff receipt).
  Do not implement Automations modal (VS7). Publishing remains human-confirmed.
  When complete, append Automation Delta Out, mark VS6 Done if exit gate passes, name B17 next, then stop.
```

**Slice status:** VS6 **In progress** (B14–B15 Done; B16 next).

```
Automation Delta Out
- Global batch / claimed work items: B16 / AUT-VS6-T03
- Completed: AUT-VS6-T03
- Files created/edited:
  - src/autopost/automation-service.ts — completeAutomationRunFromHandoff; cancelAutomationRun (idempotent; attempt-gated complete)
  - src/server.ts — POST …/complete and …/cancel
  - web/lib/automation-api.ts — completeAutomationRun + cancelAutomationRun clients
  - web/app/components/distribution/DistributionHandoffPanel.tsx — optional onDurableAttempt after handoff start / Bluesky posted
  - web/app/components/automations/AutomationApprovalOverlay.tsx — complete after durable attempt; Cancel approval vs Close; expiry re-check
  - tests/automations/automation-approval.test.ts — complete/cancel/idempotency + no-attempt reject
  - tests/web/automation-previewizer.test.tsx — adapter complete/cancel contract
  - docs/studio/automation-build-plans/00-README.md (VS6 → Done)
  - docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): run mutation receipts { run, applied }; no new packet families
- Commands and results:
  - npx vitest run tests/automations/automation-approval.test.ts tests/web/automation-previewizer.test.tsx → 9 passed
  - npm run build → ok
- Manual/browser checks: n/a
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS still defaults off
- Existing atom regressions checked: correlate/export still does not complete; extension offline (no attempt) cannot complete; Close without Cancel leaves run materialized
- Known risks or human gates: none for T03; VS7 owns Automations modal UI
- Reopened owner IDs, if any: none
- Next unblocked batch: B17 (AUT-VS7 — Automations modal; first VS7 work item)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md,
  docs/studio/automation-build-plans/07-VS6-PREVIEWIZER-APPROVAL.md (B16 Delta Out).
  Claim global Batch B17 only: first VS7 work item (Automations modal — follow slice todo IDs).
  Do not redesign approval/handoff contracts; reuse VS2–VS6 wires.
  When complete, append Automation Delta Out, name B18 next, then stop.
```

**Slice status:** VS6 **Done** (B14–B16 complete; exit gate: preload + plan-after-export + durable completion/cancel/expiry sync).
