# Phase 7 — Semantic planner (selection-only)

## Outcome

Novel phrasing maps to a **validated** `CommandSelectionQuery` (or one clarification, or a bounded patch to the **active selection proposal**). The P5 service still resolves all IDs and evidence. No write capabilities. Fixture interpreter remains CI and AI-off fallback.

This phase **supersedes** deferred RC-P3-T05. Do not skip live-model eval.

## Scope

In:

- Structured output / tool-call types on `src/ai/` (Anthropic first; provider portable).
- `CommandSemanticPlanner` under `src/studio/command/`.
- Compact context only: current stage, tag/title vocabulary catalog, tool schemas, active-proposal summary, latest instruction.
- `--live-model` eval runner + held-out safety/paraphrase cases.
- HUMAN-UX-NL-LIVE on Lab 3 with non-exact sentences.
- Flags: `RELAY_COMMAND_PLANNER_ENABLED`, `RELAY_COMMAND_EVAL_MODEL` (default off). Promote `@anthropic-ai/sdk` to production `dependencies` only when the planner is wired; keep runtime skipped without key.

Out:

- Write / schedule / publish tools on the planner.
- Dumping library rows, media, URLs, PII, OAuth, or raw analytics into the model.
- Replacing `--facade-only` as the CI default.
- Production Studio flag-on.
- Choosing a second vendor bake-off before Anthropic-on-`src/ai/` is proven.

## Dependencies and permitted parallel work

Depends on **P6 Done** and **HUMAN-UX-SELECTION**. Held-out JSON may be drafted after P5 query AST is frozen. Live trials wait for HUMAN-CREDENTIALS in the local env (builder uses existing `RELAY_AI_*` names; does not invent secrets).

## Required reading

1. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) (technology lock, quantified gates)
2. [`03-PHASE-3-MCP-MODEL-EVALUATION.md`](03-PHASE-3-MCP-MODEL-EVALUATION.md) T05
3. [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md) 2026-08-30 amendment
4. `src/ai/ai-service.ts`, `src/ai/types.ts`, `src/ai/anthropic-provider.ts`, `src/ai/config.ts`
5. `src/studio/command/mcp/tool-defs.ts`, `dispatch.ts`, `redact.ts`
6. `src/studio/eval/command-harness-interpret.ts`
7. `scripts/eval-relay-command.mjs`
8. `tests/fixtures/relay-command-eval/corpus.json`
9. `src/goal-cycle/planner/planner-prompts.ts` (read: facts vs instructions)

## Locked contracts

**Planner I/O**

- Output: `clarification` | `selection_intent` (validated query) | `proposal_patch` (exclude/restore IDs already in the frozen set, or replace instruction that **re-opens selection_review** only when the artist is still in review — not silent add from the live library).
- After `selection_approved`, patches cannot add post IDs that were not in the frozen snapshot.
- One clarification max per instruction. Silent series pick is forbidden (`COMMAND_AMBIGUOUS`).

**Authority**

- Model does not call Prisma. It does not call `apply_change_set`. Optional in-process `search_library` tool returns **compact** records (cap count server-side, gallery max 100 per page analogue; prefer catalogs + query AST over dumping hits).
- Write-layer, recurrence, and apply stay out of this phase.

**Fallback**

1. Planner off / no key / skip → fixture interpreter (Lab 2) or structured error + starters (Lab 3). No guessing.
2. Invalid JSON → one retry; then error.
3. `COMMAND_AMBIGUOUS` → existing `ClarificationPrompt`.

**Eval thresholds**

- 100% forbidden-op reject (publish, other creators, gated media, SQL, unsolicited curation).
- ≥95% exact query/intent match on held-out phrases, 3 runs each.
- 100% valid schema after one retry.
- `--facade-only` still exit 0 in CI (live model optional/nightly).

**Audit**

- Hashes of instructions, not raw prompts. Existing `command_audit_events` pattern. Metering via `ai-service` `metadata.feature: "command_planner"`.

## Files

Create:

- `src/studio/command/command-semantic-planner.ts`
- `src/studio/command/command-planner-context.ts`
- `src/studio/eval/command-planner-eval.ts`
- `tests/fixtures/relay-command-eval/held-out-nl.json`
- `tests/studio/command/command-semantic-planner.test.ts`
- `tests/studio/command/command-planner-context.test.ts`
- `tests/studio/eval/command-planner-eval.test.ts`
- `docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md` *(T05)*

Edit:

- `src/ai/types.ts`, `src/ai/ai-service.ts`, `src/ai/anthropic-provider.ts` as needed for structured/tool results
- `package.json` — SDK dependency when enabling prod AI path
- `src/studio/eval/command-harness-interpret.ts` / HTTP interpret — branch on `RELAY_COMMAND_PLANNER_ENABLED`
- `scripts/eval-relay-command.mjs` — `--live-model` runs held-out planner eval or skips (exit 0)
- `.env.example` — flag **names** only
- `src/studio/command/flags.ts`

Do not touch:

- Goal Cycle planner prompts except as a read reference
- P8 apply engine
- Production GalleryView mount
- Automations / Escape Hatch

## Todo work items

### RC-P7-T01 — AI structured-output / tool-call types

1. Extend `AiProvider` without breaking `generateText` callers.
2. Disabled/mock providers return skipped/error, never invented tools.
3. Metering stays in `ai-service.ts`.

Acceptance: unit tests; existing posting-assistant/coach callers unchanged.

### RC-P7-T02 — CommandSemanticPlanner (selection-only)

1. System rules: artist meaning / Relay mechanics; no ontology invention; no publish.
2. Validate output through `validateCommandSelectionQuery` then P5 `search_library`.
3. Wire Lab 3 interpret when planner flag on.

Acceptance: mock provider golden tests for watercolor / Academy clarification / Hero Academy query AST.

### RC-P7-T03 — Fixture fallback + compact context

1. Planner off → existing fixture path.
2. Context builder: tag catalog, collection titles, destination names, proposal summary — not media, not patron PII.
3. Redact reuse from `mcp/redact.ts`.

Acceptance: redaction tests; no URL/email in planner payload.

### RC-P7-T04 — Live-model eval + held-out safety

1. `--live-model` with `RELAY_COMMAND_EVAL_MODEL=1` and keys; skip cleanly when absent.
2. Held-out: colloquial, compound, typo, ambiguity, prompt-injection, gated-media, cross-tenant.
3. Record model/version, schema version, latency, tokens, outcome. No secrets in artifacts.

Acceptance: documented skip vs run; thresholds in Delta Out. Do not lower thresholds to force Done.

### RC-P7-T05 — HUMAN-UX-NL-LIVE

1. Evidence script: non-exact sentences on Lab 3 that match P6 review; Academy-class clarification once; unknown publish request fails closed; Lab 2 exact fixture still works.
2. Human signed **Pass** 2026-08-30 (Script A). Script B live planner not claimed. P8 T01+T02 started after the gate.

Acceptance: signed evidence; P7 → Done only after Pass.

## Safe batches

- Batch 1: RC-P7-T01 + RC-P7-T02
- Batch 2: RC-P7-T03 + RC-P7-T04
- Batch 3: RC-P7-T05 (gate)

## Verification

```bash
npx vitest run tests/studio/command/command-semantic-planner.test.ts tests/studio/command/command-planner-context.test.ts tests/studio/eval/command-planner-eval.test.ts tests/studio/eval/command-eval-facade.test.ts tests/studio/eval/command-harness-interpret.test.ts
npm run eval:relay-command -- --facade-only
npm run eval:relay-command -- --live-model
npx tsc -p tsconfig.build.json --noEmit
```

Live `--live-model` skips (exit 0) unless `RELAY_COMMAND_EVAL_MODEL=1` and a usable AI key exist. Do not lower thresholds to force Done.

## Exit gate

- Facade eval green
- Planner selection-only
- HUMAN-UX-NL-LIVE Pass
- Next: RC-P8-T01 + RC-P8-T02

## Human stop conditions

- **HUMAN-UX-NL-LIVE** (required)
- **HUMAN-CREDENTIALS** for shared-host keys (do not put keys in Git)
- HUMAN-FLAG not required for Lab 3 local planner
- Jailbreak/publish/other-creator: fail closed

## Delta Out

Use the template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md). Record whether live model ran or skipped.

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P7-T01 + RC-P7-T02
- Completed: `AiProvider.generateStructured` (Anthropic forced tool-use; mock/disabled skip, never invent tools). Metering in `ai-service`. `CommandSemanticPlanner` validates query AST then P5 `search_library`. Lab 3 interpret uses planner only when the sentence is not an eval fixture and `RELAY_COMMAND_PLANNER_ENABLED` is on. Lab 2 stays fixture-only. P7 remains In progress (T03–T05 open). Live model skipped.
- Files created/edited: src/ai/types.ts; src/ai/ai-service.ts; src/ai/anthropic-provider.ts; src/ai/mock-provider.ts; src/ai/disabled-provider.ts; src/studio/command/command-semantic-planner.ts; src/studio/command/flags.ts; src/studio/command/proposal-types.ts (`applyPlannerSelectionPatch`); src/studio/eval/command-harness-interpret-creator.ts; src/studio/command/http-routes.ts; package.json + package-lock.json (`@anthropic-ai/sdk` production dependency); .env.example (`RELAY_COMMAND_PLANNER_ENABLED=false`, eval-model name); tests/ai-service.test.ts; tests/studio/command/command-semantic-planner.test.ts; tests/studio/command/contracts.test.ts; tests/studio/eval/command-harness-interpret-creator.test.ts; TRACEABILITY.md; LAB3-TEST-GROUND-CONTRACT.md; 00-README.md; this file
- Migration and backfill state: none
- Contracts changed: `generateStructured` on `AiProvider`. Server flag `planner_enabled` (not public Studio flags). Planner output kinds: clarification | selection_intent | proposal_patch | refuse. Interpret remains preview-only. Production CommandBox still unmounted. `--live-model` still T04.
- Commands and results: vitest command-semantic-planner, ai-service, contracts, command-harness-interpret, command-harness-interpret-creator, command-eval-facade, proposal-types, command-box, command-journey, lab2-command-harness — passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` ok=true, db.status=ok, live_model=skipped.
- Manual/browser checks: none this batch (no live model; T05 is HUMAN-UX-NL-LIVE). Stack restart after interpret HTTP async + planner wire.
- Feature flags / kill switches: committed `.env.example` planner **false**. Local `.env` may enable it with `RELAY_AI_*` for later T04/T05; mock provider still skips structured output.
- Known risks or human gates: Compact tag/title catalogs are T03. `--live-model` + held-out JSON is T04. HUMAN-UX-NL-LIVE is T05. Do not start P8. Do not enable committed flags. Invalid JSON retries once then errors. Planner skip (no key) fails closed with fixture miss + “Planner unavailable.”
- Next unblocked todo IDs: RC-P7-T03 + RC-P7-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P7-T03 + RC-P7-T04
- Completed: Compact planner context (tags, collection titles, destination names, title vocabulary, proposal summary) with redact reuse; titles that look like email/URL are dropped. Planner off still uses the fixture-miss path (generate stub ignored). `--live-model` runs held-out NL (colloquial, compound, typo, ambiguity, prompt-injection, gated-media, cross-tenant) when `RELAY_COMMAND_EVAL_MODEL` is on and the provider is usable; otherwise skip is exit 0. Report hashes instructions and records model, schema version, latency, tokens, outcome — no raw prompts or secrets. Thresholds unchanged: match ≥95% (non-safety), safety reject 100%. P7 remains In progress (T05 HUMAN-UX-NL-LIVE). Live model **skipped** (`RELAY_COMMAND_EVAL_MODEL is off.`).
- Files created/edited: src/studio/command/command-planner-context.ts; src/studio/eval/command-planner-eval.ts; tests/fixtures/relay-command-eval/held-out-nl.json; tests/studio/command/command-planner-context.test.ts; tests/studio/eval/command-planner-eval.test.ts; src/studio/command/command-semantic-planner.ts (catalog + second redact); src/studio/eval/command-harness-interpret-creator.ts (Lab 2 collection catalog on planner path); src/studio/command/flags.ts (`eval_model_enabled`, not public); scripts/eval-relay-command.mjs; .env.example (`RELAY_COMMAND_EVAL_MODEL=false`); tests/studio/command/contracts.test.ts; TRACEABILITY.md; BUILDER-ORIENTATION.md; LAB3-TEST-GROUND-CONTRACT.md; 00-README.md; this file
- Migration and backfill state: none
- Contracts changed: Compact `CommandPlannerContext` is the only model catalog. `eval_model_enabled` is server-only (not in `publicCommandFlags`). `--live-model` is implemented; CI still `--facade-only`. Interpret remains preview-only. Production CommandBox still unmounted. Exact eval fixture strings stay exact-match.
- Commands and results: vitest command-semantic-planner, command-planner-context, command-planner-eval, contracts, command-eval-facade, command-harness-interpret, command-harness-interpret-creator — passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` ok=true, db.status=ok, live_model=skipped. `npm run eval:relay-command -- --live-model` ok=true, live_model=skipped, live_model_skip_reason=`RELAY_COMMAND_EVAL_MODEL is off.`, planner_eval.ok=true, case_count=0. Thresholds recorded 0.95 / 1.0; not lowered.
- Manual/browser checks: none this batch (T05 is HUMAN-UX-NL-LIVE). Stack restart after API/eval compile.
- Feature flags / kill switches: committed `.env.example` planner **false**, `RELAY_COMMAND_EVAL_MODEL=false`. Local `.env` had no eval-model flag (skip). Do not enable committed flags.
- Known risks or human gates: HUMAN-UX-NL-LIVE is T05; do not mark P7 Done. Do not start P8. Live-model quality (typos, ≥95% on a real vendor) is not claimed — this batch recorded skip. Mock `generateStructured` still skips. In-memory proposal store still dies on API restart (P8). Native thumbs 404 until HUMAN-MIGRATE.
- Next unblocked todo IDs: RC-P7-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: P7 selection workbench UX (contact-sheet + conversational refine) ahead of RC-P7-T05
- Completed: Lab 3 selection overlay is a contact-sheet workbench: mint frame + check when included, click to Drop (fade/shrink + Dropped label), restore on click-again. Cleanup: Drop already-posted by destination, Review duplicates (filter only, no silent winner), Restore dropped, All/Selected/Dropped/Needs review. Pinned Refine selection composer + sticky Use N selected / Cancel. Bounded POST refine path maps planner proposal_patch only (no new-selection swap, no frozen expansion). P7 remains In progress. Do not start P8.
- Files created/edited: web/lib/command-selection-review.ts; web/app/components/studio/command/SelectionReviewOverlay.tsx; web/app/components/studio/command/CommandBox.tsx; web/lib/relay-api.ts; src/studio/command/command-proposal-refine.ts; src/studio/command/proposal-types.ts; src/studio/command/http-routes.ts; tests/web/selection-review.test.tsx; tests/studio/command/command-proposal-refine.test.ts; docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md; 00-README.md; this file
- Migration and backfill state: none. In-memory proposal store; P8 persists.
- Contracts changed: refine POST is preview-only membership patch. Interpret still does not mutate the Library. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: vitest selection-review, command-proposal-refine, proposal-types, contracts, command-box, command-journey, lab2-command-harness — passed. tsc and facade-only recorded in the same session.
- Manual/browser checks: stack restart; Lab 3 overlay dry-run on Hero Academy fixture (desktop + ~390px).
- Feature flags / kill switches: committed planner / eval-model / selection UX **false**. Local Lab 3 may enable layer + selection UX.
- Known risks or human gates: HUMAN-UX-NL-LIVE is T05. Novel wording still needs planner + real key. Native thumbs 404 until HUMAN-MIGRATE. In-memory proposal dies on API restart.
- Next unblocked todo IDs: RC-P7-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: P7 selection workbench conflict resolution (ahead of RC-P7-T05)
- Completed: Lab 3 CommandBox no longer leaves “An active selection proposal already exists” with only Retry. Review existing selection fetches the open proposal and reopens the overlay; Discard and start this command cancels it then creates from the pending preview. GET `/api/v1/creator/command/selection-proposal` is read-only. P7 remains In progress. Do not start P8.
- Files created/edited: web/app/components/studio/command/CommandBox.tsx; web/lib/command-selection-review.ts; web/lib/relay-api.ts; src/studio/command/http-routes.ts; src/studio/command/proposal-types.ts; tests/web/selection-review.test.tsx; tests/studio/command/command-proposal-refine-http.test.ts; tests/studio/command/proposal-types.test.ts; docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md; 00-README.md; this file
- Migration and backfill state: none. In-memory proposal store; P8 persists.
- Contracts changed: GET active selection proposal (side-effect-free). Create conflict still COMMAND_VALIDATION. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: vitest selection-review, command-proposal-refine-http, proposal-types (this batch).
- Manual/browser checks: Lab 3 watercolor-after-Hero-Academy conflict: Review opens existing overlay; Discard opens the new selection.
- Feature flags / kill switches: committed flags still off
- Known risks or human gates: HUMAN-UX-NL-LIVE is T05. In-memory proposal dies on API restart.
- Next unblocked todo IDs: RC-P7-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: P7 selection workbench pager + posted-cleanup phrase (ahead of RC-P7-T05)
- Completed: Page Back/Next is pinned in the sticky review footer (always visible on page 2+). `Remove anything already on X.` is a TypeScript posted-flag cleanup (no planner). Watercolor 18 has no Lab 2 posted-X rows; overlay explains the miss. P7 remains In progress. Do not start P8.
- Files created/edited: web/app/components/studio/command/SelectionReviewOverlay.tsx; web/app/components/studio/command/CommandBox.tsx; src/studio/command/command-proposal-refine.ts; tests/web/selection-review.test.tsx; tests/studio/command/command-proposal-refine.test.ts; tests/studio/command/command-proposal-refine-http.test.ts; docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md; 00-README.md; this file
- Migration and backfill state: none. In-memory proposal store; P8 persists.
- Contracts changed: Exact posted-cleanup phrases (`remove`/`drop` … `already on` destination) apply destination_flags without the planner. Novel wording still planner-gated. Lab 2 `already_on_x_post_ids` still Hero Academy p01–p06 only. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: vitest selection-review, command-proposal-refine, command-proposal-refine-http (this batch).
- Manual/browser checks: Lab 3 watercolor page 2 Back; submit already-on-X on watercolor (none marked); Hero Academy Drop already on X still present.
- Feature flags / kill switches: committed flags still off. Local planner still off.
- Known risks or human gates: HUMAN-UX-NL-LIVE is T05. Novel wording still needs planner + real key. Placeholder is not auto-run. Native thumbs 404 until HUMAN-MIGRATE.
- Next unblocked todo IDs: RC-P7-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P7-T05
- Completed: HUMAN-UX-NL-LIVE Pass. Script A (deterministic workbench) accepted. Script B not claimed (local planner off / mock). P7 is Done.
- Files created/edited: docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md; 00-README.md; TRACEABILITY.md; BUILDER-ORIENTATION.md; this file
- Migration and backfill state: none. In-memory proposal store; P8 persists.
- Contracts changed: none (gate only)
- Commands and results: human signed Pass 2026-08-30
- Manual/browser checks: Lab 3 workbench usable enough to iterate later
- Feature flags / kill switches: committed flags still off
- Known risks or human gates: Novel wording still needs planner + real key. Next was RC-P8-T01 + RC-P8-T02.
- Next unblocked todo IDs: RC-P8-T01 + RC-P8-T02
```
