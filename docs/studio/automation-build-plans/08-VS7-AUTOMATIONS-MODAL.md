# VS7 Build Plan — Schedule Rail Automations Modal

## Outcome

Add an accessible, Autopost-gated Automations modal from the Schedule Rail that creates and manages both presets while preserving existing rail popover and routines-page flows.

## Scope

In: shared panel extraction; modal shell; rail icon; preset picker/forms; saved template picker; list/history/lifecycle actions; deep-link resume; states/accessibility; component tests.

Out: new top-level navigation, generic workflow editor, removing `/studio/autopost/routines`, redesigning the post-create playbook/repeat chain.

## Dependencies and permitted parallel work

Depends on stable VS2–VS6 wires and VS6 exit. Presentational extraction may have been prototyped after B06, but only B17/B18 may merge production UI.

## Required reading

1. VS2 API fixtures and VS5/VS6 UI contracts
2. `web/app/components/schedule-rail/ScheduleRail.tsx`
3. `web/app/components/schedule-rail/StudioScheduleRail.tsx`
4. `web/app/components/schedule-rail/EventPopover.tsx`
5. `web/app/components/schedule-rail/AddEventPopover.tsx`
6. `web/app/components/schedule-rail/FollowUpPlaybookPrompt.tsx`
7. `web/app/components/schedule-rail/RepeatEventPrompt.tsx`
8. `web/app/components/autopost/AutopostRoutinesPanel.tsx`
9. `web/app/components/studio/StudioPlanGate.tsx`
10. `web/app/components/distribution/CoachReviewModal.tsx`
11. `web/app/components/previewizer/previewizer-my-templates-modal.tsx`
12. `web/lib/automation-api.ts`

## Modal contract

- Host open/deep-link state in `StudioScheduleRail`.
- `ScheduleRail` receives a dumb `onOpenAutomations` prop; do not extend `PopoverTarget`.
- Portal to `document.body` at the established manage-modal layer (below Previewizer `z-[120]`).
- Maintain body lock, Escape/backdrop behavior, focus trap, focus return, labels, and reduced motion.
- Fetch plan access once in the host and render `StudioPlanGate` inside the modal.
- Existing Add Event → playbook → repeat prompt choreography remains unchanged.

## Information architecture

1. **Overview/list**
   - active/paused/repair-needed automations;
   - preset, trigger summary, destination, template, next tick/latest run;
   - ready/expired/skipped/failed history;
   - pause/resume/edit/archive;
   - ready rows open approval context.
2. **Create**
   - preset card selection;
   - Preview & crosspost: weekly/monthly cadence, local time/timezone, destinations, saved template;
   - Delayed public release: offset days, destinations, optional saved template;
   - concise confirmation summary.
3. **Legacy routines/rules**
   - extract current `AutopostRoutinesPanel` sections for reuse;
   - do not force-adopt legacy rows;
   - keep `/studio/autopost/routines` as a working shared host/deep link.

## UX states

Handle:

- loading and empty;
- Autopost gated;
- no saved template, with link/action to create one in Previewizer;
- template deleted/repair needed;
- destination unlinked;
- no-new-post skipped;
- ready for review;
- expired/cancelled/failed with next action;
- feature disabled;
- stale version conflict with refresh;
- narrow viewport fallback when the rail itself is hidden.

## Files

Create:

- `web/app/components/automations/ScheduleRailAutomationsModal.tsx`
- preset/list/history subcomponents and tests
- shared extracted routine/rule panels as needed
- `tests/web/automations-modal.test.tsx`
- `tests/web/automations-flow.test.tsx`

Edit:

- `web/app/components/autopost/AutopostRoutinesPanel.tsx`
- `web/app/components/schedule-rail/ScheduleRail.tsx`
- `web/app/components/schedule-rail/StudioScheduleRail.tsx`
- `web/app/components/schedule-rail/EventPopover.tsx`
- existing routines page to consume extracted sections

Do not touch:

- backend contracts
- post-create prompt sequencing
- Previewizer internals
- top-level Studio navigation

## Todo work items

### AUT-VS7-T01 — Extract shared panels and add gated modal shell

1. Extract routine/rule sections without behavior change.
2. Add portaled modal host, rail trigger, plan gate, focus/keyboard semantics, and loading/empty/disabled states.
3. Keep old routines page and deep links functional.
4. Add regression tests for popover chain, z-index/portal semantics, gate, close/focus return, and existing panel actions.

Acceptance: AU-01 passes and no existing rail flow is displaced.

### AUT-VS7-T02 — Add preset forms, management, history, and deep links

1. Implement the two frozen preset forms against `automation-api.ts`.
2. Reuse saved preview template list and destination/link state.
3. Add list/history/lifecycle actions and repair states.
4. Wire rail/toast query context to the same approval adapter.
5. Add responsive/accessibility/state-machine tests and stable `data-testid` hooks.

Acceptance: creators can create, understand, pause/resume, repair, archive, and resume both presets without seeing generic workflow jargon.

## Safe batches

- **B17:** AUT-VS7-T01 only.
- **B18:** AUT-VS7-T02 only.

## Verification

```bash
npx vitest run tests/web/automations-modal.test.tsx tests/web/automations-flow.test.tsx
npx vitest run tests/web/autopost-plan-gate-ui.test.tsx tests/web/schedule-rail-grouping.test.tsx
npm run lint --prefix web
npm run build --prefix web
```

## Exit gate

AU-01/AU-02/AU-10/AU-11 UI paths pass; modal is accessible and unclipped; old routines page and post-create chain regress cleanly; all approval deep links converge on one adapter.

## Human stop conditions

Stop if the modal requires a new top-level nav, a generic step editor, content-series selectors, or deletion of the existing routines page before parity is proven.

## Delta Out

B17 names B18. B18 names B19 only after full UI exit and contract parity.

```
Automation Delta Out
- Global batch / claimed work items: B17 / AUT-VS7-T01
- Completed: AUT-VS7-T01
- Files created/edited:
  - web/app/components/autopost/PostingRoutinesSection.tsx — extracted posting-routines list
  - web/app/components/autopost/DistributionRulesSection.tsx — extracted distribution-rules panel
  - web/app/components/autopost/AutopostRoutinesPanel.tsx — composes extracted sections (routines page host)
  - web/app/components/automations/ScheduleRailAutomationsModal.tsx — portaled z-[110] shell, StudioPlanGate, stub presets, legacy panels
  - web/app/components/schedule-rail/ScheduleRail.tsx — dumb onOpenAutomations header trigger (not PopoverTarget)
  - web/app/components/schedule-rail/StudioScheduleRail.tsx — host open state + autopost capability + modal mount
  - tests/web/automations-modal.test.tsx — gate, portal/z-index, Escape/backdrop/focus return, source contracts
  - tests/web/automations-flow.test.tsx — B17 shell placeholder (forms/deep-links = B18)
  - tests/web/autopost-plan-gate-ui.test.tsx — mock AutomationApprovalOverlay (next/font load in happy-dom)
  - docs/studio/automation-build-plans/00-README.md (VS7 → In progress)
  - docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none
- Commands and results:
  - npx vitest run tests/web/automations-modal.test.tsx tests/web/automations-flow.test.tsx tests/web/autopost-plan-gate-ui.test.tsx tests/web/schedule-rail-grouping.test.tsx → 13 passed
  - npm run build (root API tsc) → ok
  - npm run lint --prefix web / npm run build --prefix web → **cleared** by follow-up surgical gate unblock (see below)
- Manual/browser checks: n/a this batch
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS still defaults off
- Existing atom regressions checked: Add Event → playbook → repeat chain untouched; PopoverTarget not extended; /studio/autopost/routines still hosts extracted panels; Autopost plan-gate UI tests green
- Known risks or human gates: none remaining for B17 gate; B18 owns preset forms, connector list/history/lifecycle, deep-link → approval adapter
- Reopened owner IDs, if any: none
- Next unblocked batch: B18 (AUT-VS7-T02 — preset forms, management, history, deep links)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md (B17 Delta Out + surgical unblock).
  Claim global Batch B18 only: AUT-VS7-T02 (preset forms, history, deep links, accessible states).
  Do not invent top-level nav or delete /studio/autopost/routines before parity.
  Reuse VS2–VS6 wires and the B17 modal shell; wire deep-link resume to AutomationApprovalOverlay.
  When complete, append Automation Delta Out, mark VS7 Done if exit gate passes, name B19 next, then stop.
```

**Slice status:** VS7 **In progress** (B17 Done; B18 next).

```
Automation Delta Out
- Global batch / claimed work items: B17 follow-up / surgical web gate unblock (not B18)
- Completed: cleared VS7 verification block for web lint/build; B18 remains named next
- Files created/edited:
  - web/app/components/VisitorBatchSlideMedia.tsx — LockedPromoOverlay on all-locked branch
  - tests/web/visitor-batch-locked-promo.test.tsx — locked+promo regression
  - web/app/components/schedule-rail/AddEventPopover.tsx — remove write-only postStartMode state
  - web/app/components/distribution/TransformerNodePage.tsx — remove unused hasBadge
  - web/app/components/distribution/PostingAssistantContextPanel.tsx — consume deprecated props as no-op
  - web/app/components/goal-cycle/GoalCycleLauncher.tsx — drop unused plan param
  - web/app/components/previewizer/previewizer-overlay-layers.ts — no-arg graphic renderer
  - web/app/components/previewizer/compositions/blur-plug-overlay.tsx — consume parked variants; fix revealShape narrowing
  - web/app/components/previewizer/previewizer-template-compositions.tsx — drop unused DEFAULT_SELECTION import
  - web/app/components/previewizer/previewizer-v0-promo-graphics.tsx — stop unused shell id / unused fontClass destructuring
  - web/app/components/studio/AudiencePromotionPanel.tsx — remove unused child enterX plumbing
  - web/app/studio/analytics/action-hub/action-hub-types.ts — drop unused findings param
  - web/lib/schedule-date-presets.ts — drop unused now param
  - web/lib/audience-simulation-client.ts — plumb effective_promo on SimulatorPersonaOption
  - web/app/components/studio/HeroInspectOverlay.tsx — safe HeroMediaThumb strip builder
  - docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none (simulator option now carries effective_promo already present on API DTO)
- Commands and results:
  - npm run lint --prefix web → exit 0 (warnings only)
  - npx vitest run tests/web/visitor-batch-locked-promo.test.tsx tests/schedule-date-presets.test.ts tests/web/goal-cycle-accessibility.test.tsx tests/web/goal-cycle-rail-handoff.test.tsx tests/audience-promotion/access-checklist.test.tsx tests/web/previewizer-qr-overlay.test.tsx tests/web/automations-modal.test.tsx tests/web/automations-flow.test.tsx → 51 passed
  - npm run build --prefix web → ok
  - npm run build (root) → ok
- Manual/browser checks: n/a
- Feature flags / kill switches: unchanged
- Existing atom regressions checked: locked promo overlay path; schedule presets; goal-cycle; audience promotion; automations modal shell
- Known risks or human gates: none for proceed-to-B18 gate; hook/<img> warnings remain non-blocking
- Reopened owner IDs, if any: none
- Next unblocked batch: B18 (AUT-VS7-T02)
- Pasteable next-worker prompt: same as B17 above (web lint/build block removed)
```

```
Automation Delta Out
- Global batch / claimed work items: B18 / AUT-VS7-T02
- Completed: AUT-VS7-T02
- Files created/edited:
  - web/app/components/automations/AutomationsPanel.tsx — list/create/history/lifecycle + repair; opens approval via host callback
  - web/app/components/automations/ScheduleRailAutomationsModal.tsx — mounts AutomationsPanel; onOpenApproval prop
  - web/app/components/schedule-rail/StudioScheduleRail.tsx — approval overlay host; Library query deep links; mobile Automations fallback
  - web/app/components/schedule-rail/ScheduleRail.tsx — onOpenAutomationApproval pass-through
  - web/app/components/schedule-rail/EventPopover.tsx — Review Automation CTA → same adapter (+ Autopost deep-link fallback)
  - tests/web/automations-flow.test.tsx — AU-02/10/11 create/pause/archive/history/approval convergence
  - tests/web/automations-modal.test.tsx — AU-01 locked create disabled; overview testids
  - docs/studio/automation-build-plans/00-README.md (VS7 → Done)
  - docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md (this Delta Out)
- Migration and backfill state: none
- Contracts changed (expected: none unless this batch owns them): none (consumes frozen automation-api wires)
- Commands and results:
  - npx vitest run tests/web/automations-modal.test.tsx tests/web/automations-flow.test.tsx tests/web/autopost-plan-gate-ui.test.tsx tests/web/schedule-rail-grouping.test.tsx → 19 passed
  - npm run lint --prefix web → exit 0 (warnings only)
  - npm run build --prefix web → ok
  - npm run build (root) → ok
- Manual/browser checks: n/a this batch
- Feature flags / kill switches: RELAY_FEATURE_AUTOMATIONS still defaults off
- Existing atom regressions checked: Autopost plan-gate UI; schedule-rail grouping; legacy routines sections still in modal; Add Event chain untouched; approval converges on AutomationApprovalOverlay only
- Known risks or human gates: full AU-01–AU-12 integrated matrix + flag flip owned by VS8/B19; Edit full form is repair/template-focused (pause/resume/archive/history covered)
- Reopened owner IDs, if any: none
- Next unblocked batch: B19 (AUT-VS8 — integrated verification / rollout; first VS8 work item)
- Pasteable next-worker prompt:
  You are a Schedule Rail Automations builder in Rescue/Relay.
  Read AGENTS.md, .cursor/rules/rescue-workflow-always.mdc,
  docs/studio/automation-build-plans/BUILDER-ORIENTATION.md,
  docs/studio/automation-build-plans/00-README.md,
  docs/studio/automation-build-plans/09-VS8-INTEGRATION-ROLLOUT.md,
  docs/studio/automation-build-plans/08-VS7-AUTOMATIONS-MODAL.md (B18 Delta Out).
  Claim global Batch B19 only: first VS8 work item (follow slice todo IDs).
  Do not flip RELAY_FEATURE_AUTOMATIONS default-on without exit evidence.
  When complete, append Automation Delta Out, name B20 next (or human gate), then stop.
```

**Slice status:** VS7 **Done** (B17–B18 complete; exit gate: gated modal + both presets + lifecycle/history + one approval adapter).

