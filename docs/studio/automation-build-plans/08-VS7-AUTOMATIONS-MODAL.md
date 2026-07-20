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
