# Phase 10 — Handoff conveyor and staged rollout

## Outcome

When a conversationally planned drop is due, Relay uses the **existing** reminder packet and distribution handoff. The artist clicks **Post**. No new extension packet. No autonomous submit. Then: flag matrix, evidence, and production `/studio` CommandBox **only** after shared-host **HUMAN-FLAG**.

## Scope

In:

- Bridge approved scheduled drafts to existing `PostDistributionPlan` / variant / attempt **at the correct existing point** (Previewizer valid `preview_media_id` where that path requires it).
- Reuse `schedule_reminder:manual:{event_id}` and `schedule-reminder-toast.ts` (never auto-publish).
- Stubbed/browser journey: due → reminder → preload/fill → human confirm; extension-unavailable and already-posted recovery.
- Flag matrix: planner, selection UX, apply, schedule plan, `RELAY_COMMAND_STUDIO_UX_ENABLED`. All committed defaults remain off.
- Evidence files. Production mount behind HUMAN-FLAG.

Out:

- Autonomous submit.
- Automation-specific extension packet (Automations contract: rejected).
- Recurring Automations via Command Layer.
- Profile commands.
- Lowering P7 thresholds to ship.

## Dependencies and permitted parallel work

Depends on **P9 Done** and **HUMAN-UX-PLAN**. Do not parallelize `schedule-reminder-extension-api.ts` with unrelated packet refactors. Characterize before edit.

## Required reading

1. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md)
2. [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md)
3. `src/distribution/schedule-reminder-extension-api.ts`
4. `src/distribution/creator-schedule-event-contract.ts`
5. `extension/src/lib/schedule-reminder-listener.ts`
6. `extension/src/content/schedule-reminder-toast.ts`
7. `extension/src/lib/cross-post-flow.ts`
8. `src/extension/cross-post-package.ts`
9. `web/app/components/distribution/DistributionHandoffPanel.tsx`
10. `docs/studio/automation-build-plans/PRODUCT-CONTRACT.md` (handoff + Previewizer rules)
11. `docs/architecture/RELAY_MASTER_LINEAGE.md` (direct-source; no auto gallery publish)

## Locked contracts

**Handoff**

- Command Layer may **open** the existing review/handoff. It must not complete a destination attempt as `posted` without the existing confirmPosted / platform publish path.
- Reminder CTA: Studio deep link or platform URL already used by manual events. Fill script fills; it does not submit.
- Missed toast: rail + proposal/history remain recovery. Do not invent a second notification family.

**Draft → plan**

- Reuse `createPostDistributionPlan` after any Previewizer requirement already in Automations/distribution. Do not create a parallel planner.
- Direct-source / Master rules unchanged.

**Flags (all default off in `.env.example`)**

| Flag | Meaning |
|---|---|
| `RELAY_COMMAND_LAYER_ENABLED` | HTTP/MCP host |
| `RELAY_COMMAND_APPLY_ENABLED` | Apply/undo |
| `RELAY_COMMAND_MCP_ENABLED` | MCP |
| `RELAY_COMMAND_PLANNER_ENABLED` | Live interpret planner |
| `RELAY_COMMAND_SELECTION_UX_ENABLED` | Selection review chrome |
| `RELAY_COMMAND_SCHEDULE_PLAN_ENABLED` | Plan workbench |
| `RELAY_COMMAND_STUDIO_UX_ENABLED` | Production `/studio` CommandBox |

Lab 3 may run with local flags on. Shared host needs **HUMAN-FLAG** before Studio UX true.

**Production mount**

- Extract a host boundary if needed; one worker on `GalleryView.tsx`.
- `shouldMountStudioCommandChrome` remains false until the flag is on.

## Files

Create:

- `docs/qa/RELAY_COMMAND_P10_HANDOFF_EVIDENCE.md`
- `tests/studio/command/handoff-bridge.test.ts` *(or extend distribution tests)*
- Playwright or extension-stub journey as the phase names in T03

Edit:

- `src/studio/command/change-set-engine.ts` / compiler — call existing distribution create **only** at the documented step
- `src/studio/command/flags.ts`, `.env.example`
- `web/lib/studio-view-preset.ts` / `GalleryView.tsx` — P10 mount only after HUMAN-FLAG (code may land gated)
- `web/lib/relay-api.ts`

Do not touch:

- Toast `reminderToastMustNeverAutoPublish`
- Automations packet prohibition
- Goal Cycle / Escape Hatch
- Airtable

## Todo work items

### RC-P10-T01 — Draft → existing distribution plan bridge

1. After P9 drafts exist, create plans/variants using current distribution APIs, not a new table.
2. Honor Previewizer valid-media where that path requires it; if the weekly-drop path is copy+media without Previewizer, use the existing Quick Send / handoff input that already supports it. Delta Out must name which existing function was reused.
3. No `publishState` flip; no attempt `posted`.

Acceptance: RC-DF-09 still true; RC-CX-09 bridge portion.

### RC-P10-T02 — Existing reminder packet only

1. Events already created in P9 must set `remind_me` and safe https Studio deep link via `creator-schedule-event-service` validation.
2. Do not add `schedule_reminder:command:` or similar. Use `schedule_reminder:manual:{event_id}`.
3. Characterize `schedule-reminder-extension-api.ts` before any edit; prefer zero edits.

Acceptance: packet id prefix unchanged; toast still cannot publish.

### RC-P10-T03 — Due → fill → confirm journey

1. Stub or e2e: due reminder, open CTA, fill_succeeded/partial/failed, confirmPosted.
2. Cases: extension unavailable (manual URL fallback already in DistributionHandoffPanel); already-posted warning.
3. Do not require a live Twitter account in CI.

Acceptance: evidence table; no auto-submit.

### RC-P10-T04 — Flag matrix + evidence

1. Document local vs committed flags. Kill switches remain independent.
2. Lab 2 `--facade-only` + focused command tests still green.
3. Telemetry: planner feature tag, selection completeness, no raw prompts.

Acceptance: `.env.example` comments; P10 evidence file started.

### RC-P10-T05 — Production mount after HUMAN-FLAG

1. Gated `GalleryView` CommandBox for `surface: "studio"`.
2. **Stop** before enabling on a shared host. Builder does not flip the flag.
3. Expansion go/no-go follow-ups 1–2 from 2026-08-29 remain the human’s.

Acceptance: tests that production is unmounted when flag off; HUMAN-FLAG named, not taken.

## Safe batches

- Batch 1: RC-P10-T01 + RC-P10-T02
- Batch 2: RC-P10-T03 + RC-P10-T04
- Batch 3: RC-P10-T05 (gated mount only; no shared-host enable)

## Verification

```bash
npx vitest run tests/studio/command/handoff-bridge.test.ts tests/schedule-reminder-extension-api.test.ts tests/web/studio-view-preset.test.ts tests/web/command-box.test.tsx
npm run eval:relay-command -- --facade-only
npx tsc -p tsconfig.build.json --noEmit
```

Restart stack after API/web/extension-adjacent server changes.

## Exit gate

- Handoff uses existing packets and confirm paths
- Publish still never in Command apply
- Production mount code gated; flag off
- P10 → Done only after T05 tests; HUMAN-FLAG is a **human** action afterward
- Next unblocked: none in this program until a human enables flags or opens a later program

## Human stop conditions

- **HUMAN-FLAG** before shared-host Studio UX
- **HUMAN-CREDENTIALS** if planner is enabled off-localhost
- **HUMAN-MIGRATE** if P8 tables still unapplied
- Jailbreak/publish: fail closed

## Delta Out

Use the template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md).
