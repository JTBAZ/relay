# Phase 5 — Deterministic full-corpus selection truth

## Outcome

Command search returns the **same posts the Lab 3 (and Lab 2) grid shows**, over the **whole creator corpus**, with a server-owned snapshot (`complete=true`, human-readable explanation, match evidence). No LLM. Lab 3 interpret/apply use the logged-in creator’s effective metadata, not Lab 2 JSON IDs.

## Scope

In:

- Lab 3 interpret branch: creator-scoped DB library items (RC-CX-02).
- Command loader parity with Gallery effective title/description/tags/visibility (RC-CX-01).
- Bounded boolean extension of `CommandSelectionQuery` (`all` / `any` / `not` + missing predicates).
- Complete `ResolvedSelection` snapshot (IDs, explanation, per-id evidence, warnings, checksum/revision, `complete`).
- Fail closed on truncated bounded scans; completeness/perf probe; indexes only if measured.
- Tests: overlay/presentation parity, destination-absent X, tenant isolation, stale snapshot, `eval:relay-command --facade-only` green.

Out:

- Selection review modal / freeze UX (P6).
- Hosted LLM / paraphrase (P7).
- Collection/schedule apply changes (P8/P9).
- Production `/studio` CommandBox mount (P10).
- Vector / embedding search.
- Python NLP.
- Hosted `prisma migrate deploy` (write SQL + rollback notes if T05 requires indexes; do not apply hosted).
- Changing Lab 2 fixture interpret for `/studio/lab2` (keep as CI golden path).

## Dependencies and permitted parallel work

Depends on **P4 Done**. Lab 2 `--facade-only` eval must remain green. Fixture JSON authoring for extra selection cases may start after T03 freezes the query AST. Do not start P6 until this phase’s exit gate.

Existing programs that must remain stable: Goal Cycle, Automations, Escape Hatch, Studio renovation Phases 0–6, P1–P4 signed evidence.

## Required reading

1. [`00-README.md`](00-README.md)
2. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md)
3. [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md)
4. [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md) (write-layer and NL bounds still apply)
5. [`TRACEABILITY.md`](TRACEABILITY.md) RC-CX-01, RC-CX-02
6. [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md)
7. `src/studio/command/contracts.ts` (`CommandSelectionQuery`, `ResolvedSelection`)
8. `src/studio/command/selection.ts`
9. `src/studio/command/library-items-from-db.ts`
10. `src/studio/eval/command-harness-interpret.ts`
11. `src/studio/eval/library-items-from-corpus.ts`
12. `src/studio/command/http-routes.ts` (`POST .../harness/interpret`)
13. `src/gallery/query.ts` (`effectiveTags`, `itemMatchesFreeTextQuery`, list filters)
14. `src/gallery/effective-presentation.ts`
15. `src/gallery/gallery-service.ts` (bounded fill-loop)
16. `docs/architecture/adr/005-studio-gallery-bounded-reads.md`
17. `docs/qa/STUDIO_GALLERY_SNAPPY_BUDGETS.md`
18. `docs/qa/RELAY_LAB3_LANGUAGE_UX_EVIDENCE.md` (data-plane mismatch)

## Locked contracts

**Interpret data plane**

- `surface=lab2` (or Lab 2 creator `rcx_studio_lab2` on the Lab 2 harness): keep `lookupEvalScenario` + Lab 2 JSON items.
- Lab 3 / generic `surface=studio` interpret: load items via the P5 loader for `ctx.creatorId`. Do not resolve `sl2_*` IDs for a non-Lab-2 creator.
- Apply already uses the session creator; interpret IDs must be that creator’s posts.

**Selection query (extend, do not break P1 fields)**

Keep existing optional fields. Add:

- Bounded groups: `all` (AND), `any` (OR), `not` (NOT), each a list of `CommandSelectionQuery` nodes.
- Caps: max nesting depth **2**, max **8** leaf predicates per snapshot request. Exceeding caps is `COMMAND_VALIDATION`.
- Predicates to add: `tier_ids` (OR, gallery-parity), `media_type` (MIME prefix), `publish_state`, `creative_work_id`, `text_only_posts`, sequence helpers that compose with existing `resolve_numbered_sequence` (do not invent pages).
- `description_contains` is allowed as an explicit leaf (Gallery `q` already scans description; keep the rule explainable).

**ResolvedSelection snapshot**

Extend (or wrap) `ResolvedSelection`:

- `post_ids` — complete ordered list, not a page.
- `explanation` — deterministic rule string, not model prose.
- `warnings[]` — including sequence gap/duplicate and destination-present notes when those filters were used.
- `match_evidence` — compact per `post_id` (which fields matched: tag, title, description, source, destination). No media URLs.
- `revision` / checksum of the ID list.
- `complete: boolean` — **must be `true`** for any snapshot P6 may freeze. If the bounded gallery scan would truncate before `q`/filters finish, fail closed (`COMMAND_VALIDATION` or a stable `complete=false` error). Do not silently return the first N matches as “the selection.”
- `creator_id`, `created_at` (ISO UTC).

**Loader fidelity**

`loadCommandLibraryItemsFromDb` (or a replacement used by search) **must** merge:

- `PostPresentation` title/description/order (`effective-presentation.ts`)
- `PostOverride` tag add/remove and visibility (`query.ts` `effectiveTags` / `resolveGalleryItemVisibility`)
- collection membership + theme tags when already on `GalleryItem`
- `Post.source`
- distribution summaries for destination flags

Published-only vs drafts: default published (today). `publish_state` filter may include drafts when explicitly requested.

**Indexes**

Do not add GIN/trigram/`tsvector` or map `gallery_published_at` until T05 measures a miss against Lab 2 (~112) and Dev Ava-sized corpora. No vector indexes. Hosted apply of any SQL is **HUMAN-MIGRATE**.

**Flags**

No new production flags in P5. Do not turn committed Command Layer flags on in `.env.example`.

## Files

Create:

- `src/studio/command/selection-snapshot.ts` *(or equivalent)* — snapshot + checksum helpers
- `tests/studio/command/selection-snapshot.test.ts`
- `tests/studio/command/library-items-from-db-parity.test.ts`
- `scripts/probe-command-selection.mjs` *(optional, T05)*

Edit:

- `src/studio/command/contracts.ts` — query AST + snapshot fields + validators
- `src/studio/command/selection.ts` — evaluate AST; compact records from effective items
- `src/studio/command/library-items-from-db.ts` — gallery-parity loader
- `src/studio/eval/command-harness-interpret.ts` — Lab 3/creator branch; Lab 2 fixture path unchanged
- `src/studio/command/http-routes.ts` — pass `creatorId` / surface into interpret
- `src/studio/command/mcp/dispatch.ts` — `search_library` already uses DB; must use the same loader
- `tests/studio/command/selection.test.ts` — AST + destination + completeness
- `tests/studio/eval/command-harness-interpret.test.ts` — Lab 2 fixture path still exact-match
- `.env.example` — only if a probe flag is documented; default off

Do not touch:

- `web/app/studio/GalleryView.tsx` production CommandBox mount
- Goal Cycle / Automations / Escape Hatch program files
- `change-set-engine.ts` apply semantics (except if interpret preview IDs would break apply tests — prefer not)
- Hosted database

## Todo work items

### RC-P5-T01 — Lab 3 interpret/apply data plane

1. Thread `creator_id` (already on the interpret route) into interpret so Lab 3 loads that creator’s library items from DB, not `commandLibraryItemsFromLab2Corpus`.
2. Lab 2 harness (`/studio/lab2`, Lab 2 creator) keeps fixture lookup. Document the branch in Delta Out.
3. Unknown sentences still fail closed on the fixture path. Lab 3 without a matching fixture should not invent Lab 2 IDs; it may still fail closed on unknown phrases until P7 — **but** if a later deterministic mapper exists, it must search the creator’s items. For P5, a thin path is enough: when items are DB-backed, `search_library` via `interpretScenario` is only used if a fixture matches **and** resolved IDs exist in the creator library; otherwise return a validation error that names the data-plane (do not apply foreign `sl2_*` IDs).
4. Preferred concrete split: `interpretLab2HarnessInstruction` stays fixture-only for Lab 2; add `interpretCreatorHarnessInstruction({ creatorId, instruction, items })` used by HTTP when the creator is not the Lab 2 seed creator **or** when `surface=lab3`. HTTP already has `ctx.creatorId`.

Acceptance: Lab 3 interpret never returns `sl2_*` post IDs for Dev Ava. Lab 2 fixture Script B strings still interpret. RC-CX-02.

### RC-P5-T02 — Effective-metadata command loader

1. Wrap or replace `loadCommandLibraryItemsFromDb` so compact records use the same effective title, description, tags, and visibility as `buildGalleryItems` / `mergePostPresentation` / `effectiveTags`.
2. Keep `source`, collection ids, and `distribution_summary` / destination flags.
3. Do not dump media bytes or URLs into compact records (empty path fields are fine).

Acceptance: a post whose title/tags exist only on `PostPresentation` / `PostOverride` matches command search the same way it matches Gallery. Unit or integration test with fixtures. RC-CX-01.

### RC-P5-T03 — Bounded boolean AST + missing predicates

1. Extend validators in `contracts.ts`. Reject unknown keys. Cap depth/leaves.
2. Implement evaluation in `selection.ts`. Preserve P1 AND semantics for the flat object (existing tests).
3. Add `tier_ids`, `media_type`, `publish_state`, `creative_work_id`, `text_only_posts` with Gallery-parity meaning where those fields exist on the loader item. If `creative_work_id` is missing on the loader, add it in T02/T03 together.

Acceptance: fixture tests for OR tags via `any`, NOT exclude, nested cap failures. Existing watercolor AND still passes.

### RC-P5-T04 — Complete snapshot

1. `search_library` (facade + harness preview) returns the snapshot shape. `complete` must be true or the call errors.
2. Checksum/revision over ordered `post_ids`. Stale compare helper for P6 (`COMMAND_STALE_SELECTION` already exists).
3. Warnings: sequence gap/duplicate when sequence was requested; destination-present notes when `destination_present`/`absent` used.
4. Do not page the ID list. Tile paging is P6 over a frozen ID list.

Acceptance: tests refuse a truncated scan; checksum changes if one ID is dropped.

### RC-P5-T05 — Completeness / perf probe

1. Probe Lab 2 corpus and at least one Dev Ava-sized local corpus: count posts vs snapshot size for `q`, `tag_ids`, date range.
2. If p95 exceeds warm gallery budget or completeness fails, propose GIN/trigram/`tsvector` or `gallery_published_at` mapping with rollback SQL. Do not apply hosted. Local `migrate dev` only if the user asked for implementation and T05 recorded a miss.
3. No embeddings.

Acceptance: Delta Out records counts, timing, and “no index” or “SQL written, hosted HUMAN-MIGRATE.”

### RC-P5-T06 — Tests and facade eval

1. Parity, tenant (foreign creator empty/403), destination-absent X, stale snapshot, `complete=true`.
2. `npm run eval:relay-command -- --facade-only` exit 0 on seeded Lab 2.
3. Typecheck command/eval packages. Restart stack if HTTP interpret behavior changed.

Acceptance: focused vitest green; facade eval green; Delta Out names next batch **RC-P6-T01 + RC-P6-T02** only after exit gate.

## Safe batches

- Batch 1: RC-P5-T01 + RC-P5-T02
- Batch 2: RC-P5-T03 + RC-P5-T04
- Batch 3: RC-P5-T05 + RC-P5-T06

If T05 requires a migration, split it as its own batch before claiming P5 Done.

## Verification

```bash
npx vitest run tests/studio/command/selection.test.ts tests/studio/command/selection-snapshot.test.ts tests/studio/command/library-items-from-db-parity.test.ts tests/studio/command/selection-p5-exit.test.ts tests/studio/eval/command-harness-interpret.test.ts tests/studio/eval/command-eval-facade.test.ts tests/studio/eval/command-selection-probe.test.ts
npm run probe:command-selection
npm run eval:relay-command -- --facade-only
npx tsc -p tsconfig.build.json --noEmit
```

After interpret HTTP changes: `npm run dev:stack:restart` and confirm API **8787** + web **3000**.

## Exit gate

- All todos accepted
- Lab 3 interpret IDs are the session creator’s posts
- Loader matches effective Gallery metadata
- Snapshots are complete or fail closed
- Lab 2 fixture eval green
- `00-README.md` P5 → Done; P6 unblocked
- Next unblocked: RC-P6-T01 + RC-P6-T02

## Human stop conditions

- HUMAN-MIGRATE if T05 writes hosted-bound SQL
- Product contradiction (embeddings, silent partial select, Lab 2 corpus mutation)
- Do **not** stop for P6 UX — there is no selection modal in P5
- Optional live parity walk (same query IDs vs grid) may be recorded in the Delta Out; it does not sign Lab 3 visual Gates 1–2

## Delta Out

Use the Relay Command Delta Out template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md). Name exactly one next unblocked batch.

```text
Relay Command Delta Out
- Slice / claimed todos:
- Completed:
- Files created/edited:
- Migration and backfill state:
- Contracts changed:
- Commands and results:
- Manual/browser checks:
- Feature flags / kill switches:
- Known risks or human gates:
- Next unblocked todo IDs:
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P5-T01 + RC-P5-T02
- Completed: Lab 3 interpret uses the session creator’s DB library items (Gallery-effective title/tags/visibility). Lab 2 `/studio/lab2` stays fixture-only. Dev Ava interpret never returns `sl2_*` post IDs. P5 remains In progress (T03–T06 open).
- Files created/edited: src/studio/eval/command-harness-interpret.ts (surface branch helpers); src/studio/eval/command-harness-interpret-creator.ts; src/studio/command/library-items-from-db.ts; src/studio/command/http-routes.ts; src/gallery/query.ts (export row-tag helpers); web/app/components/studio/command/CommandBox.tsx; web/app/studio/GalleryView.tsx (Lab 3 surface only); web/lib/relay-api.ts; tests/studio/eval/command-harness-interpret-creator.test.ts; tests/studio/command/library-items-from-db-parity.test.ts; tests/web/command-box.test.tsx; LAB3-TEST-GROUND-CONTRACT.md; TRACEABILITY.md; this file; 00-README.md
- Migration and backfill state: none
- Contracts changed: none. Query AST and snapshot completeness still T03–T04. Production `/studio` CommandBox still unmounted.
- Commands and results: vitest library-items-from-db-parity, command-harness-interpret, command-harness-interpret-creator, selection, command-box; JSON `--facade-only` scenarios green; `npx tsc -p tsconfig.build.json --noEmit` exit 0. Seeded-DB facade eval blocked on leftover Lab 2 playground collection_count=2 (watercolor collection present at baseline) — not introduced by this batch.
- Manual/browser checks: stack restart after HTTP interpret change (8787/3000).
- Feature flags / kill switches: committed Command Layer defaults still off
- Known risks or human gates: watercolor/Hero Academy fixture tag/title queries still fail closed on Dev Ava until P7. Do not start P6. Next batch is query AST + complete snapshot.
- Next unblocked todo IDs: RC-P5-T03 + RC-P5-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P5-T03 + RC-P5-T04
- Completed: Bounded boolean AST + missing predicates; complete `ResolvedSelection` snapshot with checksum/stale helper. P5 remains In progress (T05–T06 open). P6 still blocked.
- Files created/edited: src/studio/command/contracts.ts; src/studio/command/selection.ts; src/studio/command/selection-snapshot.ts; src/studio/command/library-items-from-db.ts (`publish_state`, `creative_work_id`, optional `includeDrafts`); src/studio/command/capability-facade.ts; src/studio/command/mcp/tool-defs.ts; src/studio/command/mcp/dispatch.ts; src/studio/command/mcp/http-routes.ts; src/studio/eval/command-eval-runner.ts; src/studio/eval/command-harness-interpret-creator.ts; tests/studio/command/selection.test.ts; tests/studio/command/selection-snapshot.test.ts; tests/studio/command/contracts.test.ts; tests/studio/command/library-items-from-db-parity.test.ts; tests/fixtures/relay-command-mcp-tool-schemas.json; LAB3-TEST-GROUND-CONTRACT.md; TRACEABILITY.md; 00-README.md; this file
- Migration and backfill state: none
- Contracts changed: `CommandSelectionQuery` now accepts `all`/`any`/`not` (max depth 2, max 8 leaf predicates) and new Gallery-parity leaves. Unknown keys are `COMMAND_VALIDATION`. `ResolvedSelection` always has `complete: true`, `revision`, `match_evidence`, `creator_id`, `created_at`. Truncated catalogs throw `{ field: "complete", issue: "false" }`. `assertSelectionRevision` throws `COMMAND_STALE_SELECTION` for P6. Drafts load only when the query tree asks `publish_state: "draft"`.
- Commands and results: `npx vitest run tests/studio/command/selection.test.ts tests/studio/command/selection-snapshot.test.ts tests/studio/command/library-items-from-db-parity.test.ts tests/studio/eval/command-harness-interpret.test.ts tests/studio/eval/command-eval-facade.test.ts` — JSON facade-only green; seeded-DB scenario still blocked on leftover Lab 2 watercolor collection (pre-existing). `npx tsc -p tsconfig.build.json --noEmit` exit 0.
- Manual/browser checks: stack restart after MCP search_library snapshot shape + optional draft load.
- Feature flags / kill switches: committed Command Layer defaults still off
- Known risks or human gates: Do not add GIN/trigram until T05 measures a miss. Do not start P6. Tile paging stays over a frozen ID list in P6.
- Next unblocked todo IDs: RC-P5-T05 + RC-P5-T06
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P5-T05 + RC-P5-T06
- Completed: Completeness/perf probe (Lab 2 JSON + Lab 2 DB + Dev Ava DB) with independent matcher vs snapshot IDs; `complete=true` on all cases; search p95 well under the 1000 ms warm budget; **no index**. Seeded `--facade-only` is green (`db.status=ok`) after eval restores Lab 2 playground baseline before DB assertions. P5 → **Done**. P6 unblocked.
- Files created/edited: src/studio/eval/command-selection-probe.ts; scripts/probe-command-selection.mjs; tests/studio/eval/command-selection-probe.test.ts; tests/studio/command/selection-p5-exit.test.ts; src/studio/eval/command-eval-runner.ts (Lab 2 playground restore before DB assertions); package.json (`probe:command-selection`); LAB3-TEST-GROUND-CONTRACT.md; TRACEABILITY.md; BUILDER-ORIENTATION.md; EXPANSION-GONOGO.md; 00-README.md; this file
- Migration and backfill state: none. `index_recommendation: no_index`. Proposed GIN/trigram SQL remains constants-only in the probe module and was not written as a Prisma migration. Hosted apply still HUMAN-MIGRATE if a later corpus records a miss.
- Contracts changed: none. Query AST and snapshot shape stay as T03–T04. Production `/studio` CommandBox still unmounted. Committed Command Layer flags still off.
- Commands and results: `npx vitest run` selection, selection-snapshot, library-items-from-db-parity, selection-p5-exit, command-harness-interpret, command-eval-facade, command-selection-probe — 7 files, 40 tests, all passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run probe:command-selection` ok=true, index_recommendation=no_index. lab2_json: 112 posts / 136 rows; q_hero 21/21 p95=2ms; watercolor+landscape 18/18 p95=0ms; date 2025–2026 112/112 p95=0ms. lab2_db: 112 published, loader_complete, load_ms=1047 (one-shot Prisma catalog fetch, not search p95); search p95 0–1ms, same match counts. dev_ava_db: 5 published, q_hero 0/0, watercolor 0/0, date 5/5, all complete. `npm run eval:relay-command -- --facade-only` ok=true, 13 scenarios, paraphrase_count=39, db.status=ok, errors=[].
- Manual/browser checks: none this batch (CLI probe + eval only; HTTP interpret/MCP unchanged). No stack restart.
- Feature flags / kill switches: committed Command Layer defaults still off
- Known risks or human gates: Seeded eval now calls `restoreStudioLab2PlaygroundBaseline` before Lab 2 DB assertions — that wipes leftover playground command collections (the prior watercolor `collection_count=2` blocker). Dev Ava still has no Hero Academy / watercolor titles, so those fixture strings fail closed until P7. First Lab 2 DB catalog load was 1047 ms vs the 1000 ms *warm gallery TTFB* budget; search itself is in-memory and within budget; GIN would not change the loader merge. Do **not** start P7. P6 Batch 1 may proceed. HUMAN-UX-SELECTION is the P6 human gate, not a P5 blocker.
- Next unblocked todo IDs: RC-P6-T01 + RC-P6-T02
```
