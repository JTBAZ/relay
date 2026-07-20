# VS3 Build Plan — Delayed Public Release Preset

## Outcome

Ship the first preset as a strict UX/service wrapper over `CreatorDistributionRule`, then make automation-owned rule runs converge on one prepared draft lifecycle without changing legacy rules.

## Scope

In: owned-rule create/update/pause/archive; existing `patreon_published` discovery; shared automation-owned run materializer; template snapshot; draft correlation; legacy parity tests.

Out: scheduled occurrence discovery, rail/toast event creation, Previewizer approval UI, modal.

## Dependencies and permitted parallel work

Depends on VS2 exit. B07 precedes B08. VS4 must consume the B08 materializer rather than fork it.

## Required reading

1. VS2 frozen service/API fixtures and Delta Out
2. `src/autopost/distribution-rule-service.ts`
3. `src/autopost/distribution-rule-worker.ts`
4. `src/autopost/autopost-draft-service.ts`
5. `src/distribution/preview-template-service.ts`
6. `src/distribution/preview-template-config.ts`
7. `tests/schedule-series-service.test.ts`
8. existing distribution-rule tests

## Locked behavior

- Preset create owns one rule with `triggerKind=patreon_published`, `transformMode=preview`, and `draftOnly=true`.
- Existing `discoverDistributionRuleRuns` remains the discovery authority.
- Existing unowned rule rows and run behavior remain unchanged.
- An automation-owned run snapshots validated template config at materialization time when configured.
- Materialization creates/reuses one `AutopostDraft`; it does not create a distribution plan.
- Draft workspace records stable automation/rule/run/source/destination/transform identifiers.
- B08 extracts or introduces one internal `materializeAutomationOwnedDistributionRun` seam consumed by VS4.
- Rail/reminder attention is attached in VS5; B08 exposes the correlation data needed for it.

## Files

Create or edit as dictated by VS0 contract:

- `src/autopost/automation-materializer.ts`
- `tests/automations/delayed-release.test.ts`
- `tests/automations/automation-materializer.test.ts`

Edit:

- `src/autopost/automation-service.ts`
- `src/autopost/distribution-rule-service.ts`

Do not touch:

- schedule series/worker
- rail/reminder code
- Previewizer UI
- legacy rule rows in migration/backfill

## Todo work items

### AUT-VS3-T01 — Wrap delayed release around an owned rule

1. Create the preset's connector/rule graph through VS2 lifecycle transactions.
2. Synchronize offset, destinations, title, reminder preference, pause/resume, and archive.
3. Ensure owned and unowned rules are distinguishable without changing legacy public behavior.
4. Test create retry, update conflict, one published post/one run, and legacy parity.

Acceptance: no second worker or trigger discovery path exists for delayed release.

### AUT-VS3-T02 — Converge owned runs on the prepared-draft materializer

1. Refactor the due-run path so automation-owned and legacy behavior share source loading and draft creation while preserving legacy outputs.
2. Snapshot creator-owned `PreviewTemplateConfigV1` when configured.
3. Persist one draft and stable pointers under duplicate/concurrent delivery.
4. Return stable error codes for missing source/image/template while keeping failed work recoverable.
5. Expose a testable seam for VS4 scheduled runs.

Acceptance: one owned rule run creates at most one draft, no plan/variant, and no legacy regression.

## Safe batches

- **B07:** AUT-VS3-T01 only.
- **B08:** AUT-VS3-T02 only.

## Verification

```bash
npx vitest run tests/automations/delayed-release.test.ts tests/automations/automation-materializer.test.ts
npx vitest run tests/schedule-series-service.test.ts
npm run typecheck
npm run build
```

## Exit gate

Delayed release is a true wrapper; legacy rule tests pass unchanged; owned runs materialize one resumable draft with valid snapshot/correlation and no distribution plan.

## Human stop conditions

Stop if parity requires changing all legacy rules, if a template snapshot would expose cross-creator data, or if implementation attempts to publish or create preview-routed variants before export.

## Delta Out

B07 names B08. B08 names B09 only after the shared materializer and legacy parity evidence pass.

### Batch 7 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B07 / AUT-VS3-T01
- Completed: AUT-VS3-T01
- Files created/edited:
  - src/autopost/distribution-rule-service.ts — findAutomationIdForDistributionRule / isAutomationOwnedDistributionRule; block legacy patch/delete on owned rules; document single discover path
  - src/autopost/automation-service.ts — sync title/offset/destinations/remind onto owned rule (preserve mutation-key title token); series titleHint sync
  - tests/automations/delayed-release.test.ts (new) — ownership, retry, conflict, 1 post→1 run, archive stops discovery, legacy parity, no second worker
  - docs/studio/automation-build-plans/00-README.md (VS3 → In progress)
  - docs/studio/automation-build-plans/04-VS3-DELAYED-RELEASE.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none (legacy DistributionRuleWire unchanged)
- Commands and results:
  - npx vitest run tests/automations/delayed-release.test.ts → 7 passed
  - npx vitest run tests/automations/automation-service.test.ts tests/schedule-series-service.test.ts → passed (with delayed-release)
- Manual/browser checks: n/a
- Feature flags / kill switches: none new
- Existing atom regressions checked: legacy create/patch still works for unowned rules; owned rules share discoverDistributionRuleRuns only
- Known risks or human gates: template snapshot + materializeAutomationOwnedDistributionRun remain B08; mutation-key still encoded on rule.title
- Reopened owner IDs, if any: none
- Next unblocked batch: B08 (AUT-VS3-T02)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/04-VS3-DELAYED-RELEASE.md (latest Delta Out),
  src/autopost/distribution-rule-service.ts, autopost-draft-service,
  and preview-template-service/config.
  Claim global Batch B08 only: AUT-VS3-T02 (owned-run prepared-draft materializer).
  Do not implement rail/toast, scheduled occurrence discovery, or Previewizer UI.
  When complete, append Automation Delta Out, mark VS3 Done if exit gate passes, and name B09 next, then stop.
```

### Batch 8 — 2026-07-20

```text
Automation Delta Out
- Global batch / claimed work items: B08 / AUT-VS3-T02
- Completed: AUT-VS3-T02
- Files created/edited:
  - src/autopost/automation-materializer.ts (new) — loadDistributionRunSourceVersion; materializeLegacyDistributionRun; materializeAutomationOwnedDistributionRun (VS4 seam); template snapshot + approval TTL expiresAt; stable failure codes
  - src/autopost/distribution-rule-service.ts — materializeDueDistributionRuns routes owned vs legacy via findAutomationIdForDistributionRule
  - src/autopost/autopost-draft-service.ts — AutopostDraftWorkspace correlation fields (automation_id, automation_run_id, distribution_rule_run_id, preview_template_id) + mapWorkspace
  - tests/automations/automation-materializer.test.ts (new) — legacy parity, snapshot/correlation, idempotency, source/template gaps, due-run routing
  - tests/automations/spine-characterization.test.ts — materializer seam expectations
  - docs/studio/automation-build-plans/00-README.md (VS3 → Done)
  - docs/studio/automation-build-plans/04-VS3-DELAYED-RELEASE.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): additive workspace correlation keys only (legacy drafts omit them)
- Commands and results:
  - npx vitest run tests/automations/automation-materializer.test.ts tests/automations/delayed-release.test.ts tests/automations/spine-characterization.test.ts tests/schedule-series-service.test.ts → 35 passed
  - tsc errors in automation-materializer / distribution-rule-service / autopost-draft-service → none (repo-wide typecheck still has pre-existing unrelated failures)
- Manual/browser checks: n/a
- Feature flags / kill switches: none new (RELAY_FEATURE_AUTOMATIONS remains off)
- Existing atom regressions checked: legacy materialize workspace shape unchanged; empty source media still allowed for unowned rules; owned path requires source media + valid template when configured
- Known risks or human gates: failed owned runs stay status=failed (recoverable via future repair/rematerialize — not auto-requeued); concurrent loser may leave an orphan nudged draft
- Reopened owner IDs, if any: none
- Next unblocked batch: B09 (AUT-VS4-T01)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/05-VS4-SCHEDULED-PREVIEW-CROSSPOST.md,
  docs/studio/automation-build-plans/04-VS3-DELAYED-RELEASE.md (B08 Delta Out),
  src/autopost/automation-materializer.ts, schedule-series-service.ts,
  schedule-series-worker.ts, and jobs queue registration files.
  Claim global Batch B09 only: AUT-VS4-T01 (trigger-only schedule-series mode).
  Do not implement rail/toast, Previewizer UI, or skip/expiry policy (B10–B11).
  Consume materializeAutomationOwnedDistributionRun; do not fork materialization.
  When complete, append Automation Delta Out, name B10 next, then stop.
```

**Slice status:** VS3 **Done** (B07 wrapper + B08 shared materializer).
