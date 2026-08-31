# Phase 6 — Selection confirmation workbench

## Outcome

A multi-item command on Lab 3 opens a **selection review**: explainable filter chips, count, paged tile grid, per-item evidence, gap/duplicate and already-posted warnings. The artist excludes false positives, then **Approve** freezes IDs. Gallery is not mutated. That frozen set is the **active proposal** until cancel (P8/P9 consume it).

## Scope

In:

- Proposal types + HTTP that preview a P5 snapshot without apply.
- Lab 3 overlay: tiles, chips, warnings, exclude/restore/select-all within the proposal, cancel, approve.
- Freeze snapshot on Approve (`revision` pinned; later library changes cannot silently enter).
- CommandBox states for `selection_review` / `selection_approved`.
- Tests + **HUMAN-UX-SELECTION** evidence template.
- Flag reader for `RELAY_COMMAND_SELECTION_UX_ENABLED` (default off). Lab 3 may enable locally; committed `.env.example` stays off.

Out:

- LLM paraphrase (P7).
- Collection/schedule writes (P8/P9).
- Calendar squash (P9).
- Replacing Gallery search, single-tile select, or bulk-action bar.
- Requiring a new modal after every later plan tweak (stage-gate lock).

## Dependencies and permitted parallel work

Depends on **P5 Done**. Component tests against fixture snapshots may start after T01 freezes the wire. Do not start P7 until HUMAN-UX-SELECTION is signed.

## Required reading

1. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) (continuity + stage gates)
2. [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md)
3. [`05-PHASE-5-SELECTION-TRUTH.md`](05-PHASE-5-SELECTION-TRUTH.md)
4. `web/app/components/studio/command/CommandBox.tsx`
5. `web/app/components/studio-lab3/` overlays (`Lab3Overlay` grammar in Lab 3 evidence)
6. `web/app/studio/GalleryView.tsx` (floorspace `lab3` only)
7. [`../../qa/RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md`](../../qa/RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md)

## Locked contracts

**Stage**

- `selection_review` after interpret preview when `resolved_post_ids.length >= 2` (or always for search_collect / sequence). Single-object “select this tile” remains Gallery UI — do not force the workbench for one obvious visible card.
- Approve → `selection_approved` with frozen `post_ids` + `revision`. Exclusions are stored on the proposal (`exclude_post_ids`); they do not rewrite the library.
- Cancel / discard clears the proposal. A new unrelated instruction prompts discard if a proposal is open.
- Follow-ups in P7/P9 patch this proposal; they do not re-query the live library into the frozen set unless the artist explicitly re-runs selection.

**HTTP**

- Preview/interpret remains GET-free of mutations. Approve-selection is POST that persists proposal state (in-memory allowed in P6 if documented; P8 makes it durable). No collection/rail writes.
- Idempotency: approving the same snapshot revision twice returns the same proposal id.

**UX**

- Lab 3 overlay grammar (Escape, Close, focus restore). Tiles reuse gallery thumb/fallback, not a new media pipeline.
- Show destination warning: “already posted to X” when `destination_flags` or distribution summary says so. Artist may keep or exclude; do not auto-drop.
- Ordinary Gallery selection/search stays available behind the overlay.

**Flags**

- `RELAY_COMMAND_SELECTION_UX_ENABLED` default false in `.env.example`.

## Files

Create:

- `src/studio/command/proposal-types.ts`
- `web/app/components/studio/command/SelectionReviewOverlay.tsx` *(name flexible)*
- `tests/web/selection-review.test.tsx`
- `docs/qa/RELAY_COMMAND_P6_SELECTION_EVIDENCE.md` (template at T04; human signs)

Edit:

- `src/studio/command/contracts.ts` — proposal/freeze fields if not in P5
- `src/studio/command/http-routes.ts` — preview already exists; add approve/cancel selection endpoints if needed
- `web/lib/relay-api.ts` — frozen client methods
- `web/app/components/studio/command/CommandBox.tsx`
- `web/app/studio/GalleryView.tsx` — Lab 3 floorspace host only
- `src/studio/command/flags.ts` + `.env.example`
- `tests/web/command-box.test.tsx`

Do not touch:

- Production CommandBox mount on `/studio`
- Lab 2 fixture interpreter golden path
- `change-set-engine.ts` apply
- Goal Cycle / Automations / Escape Hatch

## Todo work items

### RC-P6-T01 — Proposal types + preview HTTP (no apply)

1. Wire types: proposal id, stage, snapshot ref, `exclude_post_ids`, `frozen_post_ids`, instruction, explanation, warnings.
2. Validate freeze: `frozen_post_ids` ⊆ snapshot `post_ids` minus exclusions; `complete` must be true.
3. HTTP: create/update proposal from interpret preview; cancel. Apply ChangeSet still separate and unused here.

Acceptance: unit tests; no Prisma writes required if in-memory (document that P8 persists).

### RC-P6-T02 — Lab 3 tile review overlay

1. Grid of compact tiles for snapshot IDs (page the **view**, not the ID list).
2. Chips for the deterministic explanation. Count. Gap/duplicate copy. Already-posted badge.
3. Keyboard + reduced-motion. Overlay a11y.

Acceptance: component tests; 390px and desktop layouts noted.

### RC-P6-T03 — Exclude / restore / freeze

1. Exclude removes from the pending set (still listed as excluded until restore).
2. Select all / none **within the proposal**, not the whole library.
3. Approve freezes. Subsequent interpret of a patch (P7) must not add new library hits to `frozen_post_ids` without a new selection review.

Acceptance: tests for exclude then approve; checksum of frozen list.

### RC-P6-T04 — CommandBox + HUMAN-UX-SELECTION

1. States: after Preview of a multi-item command, open review; Apply-to-library remains disabled until P8.
2. Evidence template: Script — type a deterministic Lab 3/Lab 2-capable select (or seeded query), exclude one false positive, confirm already-posted if present, Approve, verify gallery membership unchanged.
3. **Stop** for human sign-off. Do not start P7.

Acceptance: evidence file prepared; `00-README` P6 stays In progress until signed.

## Safe batches

- Batch 1: RC-P6-T01 + RC-P6-T02
- Batch 2: RC-P6-T03 + RC-P6-T04 (stop at gate)

## Verification

```bash
npx vitest run tests/web/selection-review.test.tsx tests/web/command-box.test.tsx tests/studio/eval/command-eval-facade.test.ts
npm run eval:relay-command -- --facade-only
npx tsc -p tsconfig.build.json --noEmit
```

Restart stack after HTTP/UI behavior changes.

## Exit gate

- HUMAN-UX-SELECTION signed Pass
- Gallery not mutated by Approve
- Frozen IDs stable across refresh of the overlay (in-memory OK if session-scoped and documented)
- P6 → Done; next RC-P7-T01 + RC-P7-T02

## Human stop conditions

- **HUMAN-UX-SELECTION** (required)
- HUMAN-FLAG not required (Lab 3 only)
- Product contradiction (using conversation for single-tile select as the only path)

## Delta Out

Use the template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md).

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P6-T01 + RC-P6-T02
- Completed: In-memory selection proposal (create/cancel HTTP, freeze validator, no Prisma). Lab 3 tile review overlay: count chips, gap/duplicate copy, already-posted badges, paged view (12/page), Lab 3 overlay a11y (Escape/Close). P6 remains In progress (T03–T04 open). Approve/exclude not wired.
- Files created/edited: src/studio/command/proposal-types.ts; src/studio/command/flags.ts; src/studio/command/http-routes.ts; src/studio/command/selection.ts (`compactCommandLibraryItem` export); web/lib/command-selection-review.ts; web/lib/relay-api.ts; web/app/components/studio/command/SelectionReviewOverlay.tsx; web/app/components/studio/command/CommandBox.tsx; web/app/components/studio-lab3/Lab3Overlay.tsx; web/app/studio/GalleryView.tsx (libraryItems only); .env.example (`RELAY_COMMAND_SELECTION_UX_ENABLED=false`); tests/studio/command/proposal-types.test.ts; tests/studio/command/contracts.test.ts; tests/web/selection-review.test.tsx; tests/web/command-box.test.tsx; tests/web/command-journey.test.tsx; tests/web/lab2-command-harness.test.tsx; TRACEABILITY.md; LAB3-TEST-GROUND-CONTRACT.md; 00-README.md; this file
- Migration and backfill state: none. Proposal store is process memory; P8 persists. Hosted migrate not required.
- Contracts changed: public flags include `selection_ux_enabled`. Proposal HTTP is POST-only (create + cancel). Interpret remains preview-only. Production CommandBox still unmounted. Apply ChangeSet unused in this batch.
- Commands and results: vitest proposal-types, contracts, selection, selection-review, command-box, command-journey, lab2-command-harness, command-eval-facade — all passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` ok=true, db.status=ok.
- Manual/browser checks: stack restart (8787/3000). Lab 2 session → `/studio/lab3`. Preview `Organize Hero Academy into a collection, cover first, in page order.` → overlay “Review selection”, 20 items, missing page 17 + duplicate page 8 chips, Already on X badges, page 1/2 (12 tiles), Escape closes to preview. Gallery not mutated. Native thumb 404s use No preview fallback (same Lab 3 derivative gap).
- Feature flags / kill switches: committed `.env.example` still has selection UX **false**. Local `.env` may set `RELAY_COMMAND_SELECTION_UX_ENABLED=true` for Lab 3 (not committed). Layer/apply local-on unchanged.
- Known risks or human gates: Do not start P7. Exclude / Approve / freeze is T03. CommandBox `selection_review` / evidence template is T04. Overlay explanation chip currently includes interpret `summary` prose; T03 can keep chips as count + warnings. Dev Ava still fails closed on Lab 2 fixture strings until P7 unless those titles exist. HUMAN-UX-SELECTION waits for T04.
- Next unblocked todo IDs: RC-P6-T03 + RC-P6-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P6-T03 + RC-P6-T04
- Completed: Exclude / restore / select-all/none; Approve freeze + frozen checksum (second approve same id). `assertNoFrozenExpansion` rejects new library hits. CommandBox `selection_approved`; Lab 3 Apply-to-library hidden until P8. Discard confirm before replacing an open proposal. Evidence template at docs/qa/RELAY_COMMAND_P6_SELECTION_EVIDENCE.md. P6 stays In progress.
- Files created/edited: src/studio/command/proposal-types.ts; src/studio/command/http-routes.ts; web/lib/relay-api.ts; web/lib/command-selection-review.ts; web/app/components/studio/command/SelectionReviewOverlay.tsx; web/app/components/studio/command/CommandBox.tsx; tests/studio/command/proposal-types.test.ts; tests/web/selection-review.test.tsx; docs/qa/RELAY_COMMAND_P6_SELECTION_EVIDENCE.md; TRACEABILITY.md; LAB3-TEST-GROUND-CONTRACT.md; BUILDER-ORIENTATION.md; EXPANSION-GONOGO.md; 00-README.md; this file
- Migration and backfill state: none. In-memory proposal store; P8 persists.
- Contracts changed: patch HTTP only. Interpret remains preview-only. Frozen set cannot expand without a new review. Production CommandBox still unmounted.
- Commands and results: focused vitest (proposal-types 6, selection-review 9, command-box/journey/harness/eval-facade) passed. tsc --noEmit 0. facade-only ok=true, db.status=ok.
- Manual/browser checks: 2026-08-30 Lab 2 session → `/studio/lab3`. Preview exact Hero Academy instruction → overlay 20 / missing 17 / duplicate 8 / Already on X. Exclude Page 8 → 19+1 excluded. Approve → 19 frozen, Apply hidden, Photo Studies-only shelf. Escape keeps `selection_approved`.
- Feature flags / kill switches: committed defaults still off.
- Known risks or human gates: **HUMAN-UX-SELECTION**. Do not start P7. Do not mark P6 Done until signed.
- Next unblocked todo IDs: HUMAN-UX-SELECTION, then RC-P7-T01 + RC-P7-T02
```

```text
Relay Command Delta Out
- Slice / claimed todos: HUMAN-UX-SELECTION
- Completed: Human signed Pass (AskQuestion: pass-start-p7, 2026-08-30). P6 → **Done**. P7 unblocked.
- Files created/edited: docs/qa/RELAY_COMMAND_P6_SELECTION_EVIDENCE.md (human verdict); 00-README.md; TRACEABILITY.md; BUILDER-ORIENTATION.md; EXPANSION-GONOGO.md; LAB3-TEST-GROUND-CONTRACT.md; this file
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: n/a (gate sign-off). Builder dry-run already recorded in the evidence file.
- Manual/browser checks: human walk of Lab 3 selection review + freeze (same path as builder dry-run).
- Feature flags / kill switches: committed defaults still off
- Known risks or human gates: P7 Batch 1 is RC-P7-T01 + RC-P7-T02. Do not start T03–T05 or P8. Native thumbs still 404 until HUMAN-MIGRATE.
- Next unblocked todo IDs: RC-P7-T01 + RC-P7-T02
```
