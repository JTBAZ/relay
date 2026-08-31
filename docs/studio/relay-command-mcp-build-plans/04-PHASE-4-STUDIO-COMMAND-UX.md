# Phase 4 — Studio command UX and lens refinement

## Outcome

Productize the proven P3 harness into a flag-gated Studio command experience on Lab 2 (and a strangler-ready mount for production Library **without** reopening the entire shell). Refine chronological / Collections / schedule lenses using **HUMAN-UX-VISUAL** and **HUMAN-UX-NL** notes. Complete the five-minute creator journey (**HUMAN-UX-JOURNEY**) and write an expansion go/no-go.

## Scope

In:

- Command box UX: compact clarification, ChangeSet summary, risk-matched confirm, Undo, loading/error/retry, reduced motion.
- Feature flag `RELAY_COMMAND_STUDIO_UX_ENABLED`.
- Lens chrome decisions **informed by playground notes** (not invented in this doc). Capacity for future “seat settings” (lens, filters, sort, density, selected collection id) in client types — persistence optional.
- Optional: persist last lens in `localStorage` only; DB presets are go/no-go material.
- Accessibility, narrow Lab 2 width with rail mounted.
- Five-minute script on Lab 2 corpus.
- Expansion decision record: publishing tools, profile maintenance, recurring automations — each yes/no/defer.

Out:

- Autonomous publish.
- Full Studio visual renovation (Phase 7 remains its own pack).
- Mandatory external MCP onboarding.
- Goal Cycle / Automations / Escape Hatch scope grab.
- Exactly three permanent tabs as a frozen IA if humans preferred another control.

## Dependencies and permitted parallel work

Depends on **P3 Done** and **HUMAN-UX-NL pass**. Copy harness components toward shared `web/app/components/studio/command/` if production Library will mount them later; **default mount remains Lab 2** until journey pass. A production `/studio` mount is allowed only behind the Studio UX flag and must not break Phase 2–6 Active Posts, linked sets, or rail.

`GalleryView.tsx` is a hot file: one worker; extract a host boundary first (same lesson as Goal Cycle VS6).

## Required reading

1. Product contract primary experience + risk classes
2. P3 harness implementation *(exists)*
3. HUMAN-UX-VISUAL and HUMAN-UX-NL evidence files *(filled)*
4. [`UI-DEBT.md`](UI-DEBT.md) — playground chrome to fulfill (do not invent a different calendar)
5. `docs/studio/PLAN_PHASE_7_HARDENING_STUDIO_SHELL.md` (do not redo)
6. `docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`
7. `web/app/studio/GalleryView.tsx` structure (floorspace, rail, grid)
8. RC-DF-16, RC-DF-17

## Locked contracts

- In-Relay box is the paid path; MCP remains optional peer.
- Same facade and ChangeSets as P2/P3.
- Publish still not a command tool.
- Lenses remain projections, not inventories.
- Seat-setting **type** may be added:

```ts
type StudioViewPreset = {
  lens: "chronological" | "collections" | "schedule";
  collection_id: string | null;
  sort: string;
  density: "dense" | "normal" | "lab" | "lab2";
  filters: Record<string, unknown>;
};
```

Do not add Prisma `StudioViewPreset` in P4 unless the journey evidence explicitly asks to persist server-side and a human approves a migration.

## Files

Create *(future)*:

- `web/app/components/studio/command/CommandBox.tsx`
- `web/app/components/studio/command/ChangeSetSummary.tsx`
- `web/app/components/studio/command/ClarificationPrompt.tsx`
- `web/lib/studio-view-preset.ts` (client types + localStorage)
- `tests/web/command-box.test.tsx`
- `tests/web/command-journey.test.tsx` (happy-dom states; not a substitute for HUMAN-UX-JOURNEY)
- `docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md`
- `docs/studio/relay-command-mcp-build-plans/EXPANSION-GONOGO.md` (written at gate)

Edit:

- `Lab2CommandHarness.tsx` — become a thin wrapper around CommandBox **or** replace
- `StudioLab2Chassis.tsx` — productized layout; keep rail
- `GalleryView.tsx` — **only** if flag-gated mount is in scope after Lab 2 journey; otherwise defer mount to a follow-up todo in the go/no-go
- `web/lib/relay-api.ts` — already appended in P2/P3; P4 should not invent a second client

Do not touch:

- Completed Studio phase visual contracts
- Extension publish buttons
- Airtable

## Todo work items

### RC-P4-T01 — Product CommandBox states

1. Lift P3 harness into shared components with risk-class UI (execute+undo vs compact review).
2. Empty, error, retry, stale ChangeSet, apply disabled.
3. Screen reader labels; reduced motion skips celebratory motion.

Acceptance: component tests; RC-DF-02/03 presentation.

### RC-P4-T02 — Lens refinement

1. Apply visual/NL notes **and** [`UI-DEBT.md`](UI-DEBT.md): denser Collections stacks (RC-UI-01); **full-visual month grid with click-through to months ahead** (RC-UI-02). If the list-only Schedule lens is redundant with the rail, replace or demote it — **follow evidence**, do not argue with this plan. Reuse `?month=YYYY-MM` and the Goals Lab month-grid stub; do not invent a third calendar store.
2. Optional `localStorage` last-lens.
3. Keep rail mounted (product invariant from Goal Cycle / Studio). The month grid is an additional inspect surface, not a replacement for the narrow rail.

Acceptance: RC-DF-14 still holds; no second inventory; a weekly plan spanning September+ is inspectable without leaving Studio.

### RC-P4-T03 — Flag, empty corpus, and production-safe defaults

1. `RELAY_COMMAND_STUDIO_UX_ENABLED` gates chrome.
2. Command box hidden or disabled when layer/apply flags off, with a calm message — not a crash.
3. Confirm MCP is not required for the box to work.

Acceptance: flag off → Lab 2 still usable as gallery.

### RC-P4-T04 — Five-minute journey wiring

1. Ensure seeded Hero Academy path matches [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md) RC-DF-16.
2. Timing: organization result visible without a dashboard tour. No mandatory voice questionnaire.
3. Refresh persistence (RC-DF-17) and Undo.

Acceptance: builder dry-run recorded; **stop for HUMAN-UX-JOURNEY**.

### RC-P4-T05 — Expansion go/no-go

1. Write `EXPANSION-GONOGO.md`: publishing tools, profile/presence maintenance, recurring automations, production `/studio` mount, DB view presets.
2. Each item: ship / defer / never, with evidence citations.
3. Autonomous publish remains **never**.

Acceptance: file exists; `00-README.md` program-complete checklist updated; P4 Done only after journey pass **or** explicit human waiver.

## Safe batches

- Batch 1: RC-P4-T01
- Batch 2: RC-P4-T02 + RC-P4-T03
- Batch 3: RC-P4-T04 → human gate
- Batch 4: RC-P4-T05 after journey notes

## Verification

```bash
npx vitest run tests/web/command-box.test.tsx tests/web/command-journey.test.tsx tests/web/lab2-command-harness.test.tsx
npm run typecheck
# web lint/build when UI ships
npm run lint --prefix web
npm run dev:stack:restart
```

Manual: RC-DF-16 script on seeded Lab 2, desktop; optionally ~390px if the box is mounted there.

## Exit gate

- HUMAN-UX-JOURNEY pass
- Flags default off
- Go/no-go written
- No publish tool
- Program complete per `00-README.md` **or** remaining items listed as deferred with owners

## Human stop conditions

- **HUMAN-UX-JOURNEY** (required)
- HUMAN-FLAG for enabling Studio UX on a shared environment
- HUMAN-MIGRATE if someone insists on DB presets
- Do not “just enable” production `/studio` during the Lab 2 journey

## Delta Out

Include journey timing notes, lens decision, flag states, and link to `EXPANSION-GONOGO.md`.

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P4-T01 (P4 Batch 1)
- Completed: Shared CommandBox with risk-class UI (execute_undo Apply, review Review & apply, publish_confirm no Apply). Empty/error/Retry/stale (Apply hidden until Preview again). Lab 2 harness is a thin wrapper. Enter always Previews (never Apply). After Apply, focus stays in the command field; success announced via aria-live. Reduced-motion class on applied banner. Stale copy is a single role=alert (not duplicated in the summary).
- Files created/edited: web/app/components/studio/command/{CommandBox,ChangeSetSummary,ClarificationPrompt,index}.tsx; web/lib/command-risk.ts; web/app/components/studio-lab2/Lab2CommandHarness.tsx; tests/web/command-box.test.tsx; tests/web/command-journey.test.tsx
- Migration and backfill state: none
- Contracts changed: none. Production GalleryView untouched. RELAY_COMMAND_STUDIO_UX_ENABLED still T03.
- Commands and results: npx vitest run tests/web/command-box.test.tsx tests/web/command-journey.test.tsx tests/web/lab2-command-harness.test.tsx tests/web/studio-lab2-chassis.test.tsx → 26 passed; npx tsc -p tsconfig.build.json --noEmit clean; npm run lint --prefix web exit 0 (pre-existing warnings only, none in command/)
- Manual/browser checks: 2026-08-28 after `npm run dev:stack:restart` (8787 listening, Next Ready on 3000). `/login/studio-lab2` → `/studio/lab2`. Labelled Lab 2 command + Preview + Reset. Enter on watercolor sentence → preview (18 posts), Apply visible, not applied. Click Apply → applied + Undo; focus remained in the command field. Academy sentence → clarification radios (Academy Studies / Hero Academy), Apply hidden until Continue.
- Feature flags / kill switches: committed defaults still off (layer/apply/MCP/Studio UX)
- Known risks or human gates: P4 In progress, not Done. Do not start T02/T03 in this batch. HUMAN-UX-JOURNEY remains T04. T05 live model still skipped.
- Next unblocked todo IDs: RC-P4-T02 + RC-P4-T03
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P4-T02 + RC-P4-T03 (P4 Batch 2)
- Completed: Dense Collections board (RC-UI-01, size=board, 3–6 columns). Schedule lens is a 7-column month grid with Previous/Next (RC-UI-02); day occupancy + click inspect highlights the rail; title-only list demoted. Last Lab 2 lens persisted in localStorage. GET /api/v1/creator/command/flags (ungated). CommandBox disabled with a calm status when layer is off; Apply-off allows Preview. Lab 2 still mounts the box when STUDIO_UX is off; production GalleryView stays unmounted (shouldMountStudioCommandChrome). MCP not required.
- Files created/edited: Lab2CollectionsLens.tsx; CollectionStackCard.tsx; Lab2ScheduleLens.tsx; StudioLab2Chassis.tsx; CommandBox.tsx; web/lib/studio-view-preset.ts; web/lib/relay-api.ts (fetchCommandFlags); src/studio/command/flags.ts (publicCommandFlags); src/studio/command/http-routes.ts; src/studio/command/contracts.ts; tests/web/{lab2-schedule-lens,studio-view-preset,command-box,studio-lab2-lenses,studio-lab2-chassis}.tsx; UI-DEBT.md
- Migration and backfill state: none
- Contracts changed: none. GalleryView untouched.
- Commands and results: focused vitest 49 passed (command-box, journey, harness, chassis, lenses, schedule lens, view-preset, contracts); tsconfig.build --noEmit clean
- Manual/browser checks: 2026-08-28 after restart. Flags GET returns layer/apply on, MCP/Studio UX off. Lab 2: Collections density=dense, board stacks ~320px. Schedule grid August → Next → September 2026. Reload restores Schedule tab (last-lens). Command layer on after flags load; Preview enabled. Rail remains mounted.
- Feature flags / kill switches: committed .env.example still off. Local layer/apply on; STUDIO_UX off (Lab 2 playground exception).
- Known risks or human gates: P4 In progress. Next RC-P4-T04 (five-minute journey) then HUMAN-UX-JOURNEY. Do not start T05. Do not mount production GalleryView.
- Next unblocked todo IDs: RC-P4-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P4-T04 (P4 Batch 3)
- Completed: Five-minute journey wiring. CommandBox full-bleed above gallery/rail so ~390px keeps Preview/Reset usable. Weekly X preview discloses skip list + Tuesday-evening cluster (no invented minute). Last applied ChangeSet in sessionStorage so Undo survives refresh (RC-DF-16 step 9). Chassis onUndone clears gallery cache. Script C written. Builder dry-run recorded in docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md (human unsigned).
- Files created/edited: CommandBox.tsx; StudioLab2Chassis.tsx; command-eval-runner.ts (fact-pack warning on skip_posted); studio-view-preset.ts; tests/web/{command-journey,command-box,studio-lab2-chassis,studio-view-preset}.tsx; command-harness-interpret.test.ts; LAB2-TEST-GROUND-CONTRACT.md; RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md
- Migration and backfill state: none
- Contracts changed: none. GalleryView untouched.
- Commands and results: focused vitest 38 passed (journey, command-box, harness, chassis, view-preset, interpret); tsconfig.build --noEmit clean
- Manual/browser checks: 2026-08-28 after restart. Reset → Chronological. HA organize (20, gap 17, dup 8). Weekly X skip+cluster; rail Page 7; September occupancy + inspect Page 8. Watercolor 18. Refresh keeps stacks + Undo. Undo removes watercolor, HA remains. 390px: command full width, rail mounted.
- Feature flags / kill switches: committed defaults still off
- Known risks or human gates: **Stop for HUMAN-UX-JOURNEY**. Do not start T05 or mark P4 Done. Undo store is in-memory (API restart drops Undo until a new Apply).
- Next unblocked todo IDs: HUMAN-UX-JOURNEY then RC-P4-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: HUMAN-UX-JOURNEY + RC-P4-T05
- Completed: Journey signed. Command chrome fitted in the gallery column. EXPANSION-GONOGO.md: publish never; production mount / DB presets / profile / automations / live-model defer. P4 Done.
- Files created/edited: see 00-README latest Delta Out
- Migration and backfill state: none
- Contracts changed: none. GalleryView untouched.
- Commands and results: chassis + command-box 20 passed
- Manual/browser checks: Reset/Apply fitted left of rail 2026-08-29
- Feature flags / kill switches: committed defaults still off
- Known risks or human gates: Program complete. HUMAN-FLAG before production Studio UX.
- Next unblocked todo IDs: none in this program
```


