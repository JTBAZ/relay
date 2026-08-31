# Phase 2 — Deterministic Lab 2 playground

## Outcome

Stand up a resettable ~100–120 post Postgres corpus, implement ChangeSet **apply/undo** against real Gallery/Collection/Schedule services (still no LLM), project chronological / Collections / schedule lenses in **Studio Lab 2**, and prove that scripted commands **visually** organize the grid and rail. Hand a human the running playground for **HUMAN-UX-VISUAL**.

## Scope

In:

- Lab 2 corpus JSON, validator, hash, seed apply/status/cleanup/eval (see [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md)).
- Capability facade implementations calling existing services.
- ChangeSet apply with `RELAY_COMMAND_APPLY_ENABLED` usable in local/dev when explicitly set; still default off in `.env.example`.
- Shared `StudioContentProjection` so Lab 2 stops depending on a forked fetch-only subset of Library behavior for the three lenses.
- Provisional lens switcher on `/studio/lab2` only.
- Deterministic scenario runner (no model): organize Hero Academy, watercolor collection, exclude already-on-X, undo.
- Browser/component tests plus a human visual script.

Out:

- MCP, eval paraphrases, production `GalleryView.tsx` command box (P3/P4).
- Persisted “seat memory” presets in the database (optional after human findings in P4).
- Final tab chrome. Lenses may be segmented control, toggle, or stacked panels — pick the smallest Lab 2 control; humans will refine.
- Using `web/app/components/studio-lab2/fixtures.ts` thumbs as the corpus.
- Publishing, Automations, Goal Cycle edits.

## Dependencies and permitted parallel work

Depends on **P1 Done**. Corpus JSON may be authored once P1 sequence/selection types exist. Live seed apply needs P1 facade signatures.

Studio Phase 8 media-attach may still be in progress; Command Layer schedule ops in P2 create rail slices and drafts **without** requiring event-drop attach. If `needs_media` is already on the rail payload, surface it honestly.

## Required reading

1. P1 plan + product contract + Lab 2 contract + RC-DF acceptance
2. `tests/fixtures/pilot-ux-seed.json`, `src/pilot-ux/pilot-ux-seed-spec.ts`, `src/pilot-ux/seed-pilot-ux-dev-accounts.ts`
3. `src/goal-cycle/planner/goals-lab-synthetic-metrics.ts`, `scripts/seed-goals-lab-synthetic-metrics.mjs`
4. `scripts/seed-pilot-multi-media-qa.mjs` (ingest batch + idempotency cleanup)
5. `web/app/studio/lab2/lab2-page-client.tsx`, `web/app/components/studio-lab2/StudioLab2Chassis.tsx`, `Lab2ActivePostsLive.tsx`
6. `web/app/studio/GalleryView.tsx` (read only — collection filter, pagination, grid)
7. `web/lib/active-post-linked-sets.ts`, `src/gallery/parse-query.ts` (`limit` max 100)
8. `web/components` schedule rail live host
9. `docs/architecture/RELAY_MASTER_LINEAGE.md` (do not publish to gallery from distribution)

## Locked contracts

- Dedicated creator `rcx_studio_lab2` (exact ids in Lab 2 contract). Never bind to a personal Goals Lab email.
- `RELAY_ALLOW_STUDIO_LAB2_SEED=1` required; refuse `NODE_ENV=production`.
- Corpus `eval.min_published_posts >= 100` so gallery `limit` clamp of 100 exercises a second page / Load more.
- Apply path uses ChangeSet snapshots from P1.
- Lenses: `chronological | collections | schedule` over the **same** `post_id`s.
- Collections lens must show **stacks** (grouped cards or ordered stack chrome) for command-created collections — not only a sidebar id filter with no visual grouping. If current `LinkedSetCard` is CreativeWork-only, add Collection stack presentation in Lab 2 without merging carousel ≠ linked-set rules from Studio renovation.
- Undo restores collection membership, order, and command-created rail events/drafts. Does not delete ingest posts.

## Files

Create *(future)*:

- `tests/fixtures/studio-lab2-corpus.json`
- `src/studio/lab2/corpus-spec.ts` (validator + hash)
- `src/studio/lab2/seed-studio-lab2.ts`
- `scripts/seed-studio-lab2.mjs`
- `scripts/eval-studio-lab2-corpus.mjs`
- `src/studio/command/change-set-engine.ts`
- `src/studio/projection/studio-content-projection.ts`
- `web/app/components/studio-lab2/StudioContentLensSwitcher.tsx` (Lab 2 only)
- `web/app/components/studio-lab2/CollectionStackCard.tsx` (or equivalent)
- `tests/studio/lab2/corpus-spec.test.ts`
- `tests/studio/lab2/seed-eval.integration.test.ts` (DATABASE_URL)
- `tests/studio/command/change-set-engine.test.ts`
- `tests/web/studio-lab2-lenses.test.tsx`
- `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md` (template filled at gate)

Edit:

- `package.json` — `seed:studio-lab2`, `eval:studio-lab2-corpus`
- `.env.example` — `RELAY_ALLOW_STUDIO_LAB2_SEED`
- `web/app/components/studio-lab2/StudioLab2Chassis.tsx` — lens switcher + projection
- `Lab2ActivePostsLive.tsx` — consume shared projection/pagination (or replace with a thin wrapper)
- `web/lib/relay-api.ts` — append command preview/apply client **only if** HTTP exists; P2 may call services from seed tests without public HTTP. Prefer `POST /api/v1/creator/command/preview` and `/apply` flag-gated for the human script.

Do not touch:

- `web/app/studio/GalleryView.tsx` production chrome
- `web/app/components/studio-lab2/fixtures.ts` as data source (may leave unused)
- Goal Cycle planner services except optional reuse of synthetic metric **patterns** with a new label `studio-lab2-corpus-v1`

## Todo work items

### RC-P2-T01 — Corpus JSON + validator

1. Author `studio-lab2-corpus.json` per Lab 2 contract composition table.
2. Validator: unique ids, series sort_order, tag refs, access levels, naming variants, eval block, `fixture_hash`.
3. Include Hero Academy with mixed Page/Part/Pg titles, a missing page, a duplicate page label, watercolor tags, gated originals + public covers, X-present pages 1–6.

Acceptance: `npx vitest run tests/studio/lab2/corpus-spec.test.ts` green; hash stable.

### RC-P2-T02 — Seed apply / status / cleanup

1. CLI lifecycle mirroring Goals Lab: apply, status, cleanup.
2. Ingest or Prisma upsert posts/media/tiers; then collections empty at baseline (command-created collections are the POC); then distribution attempts for “already on X”; then labeled synthetic metrics.
3. Cleanup deletes only labeled corpus rows / imports, not other tenants.

Acceptance: apply twice is idempotent; cleanup → status zeros; `eval.min_published_posts` met.

### RC-P2-T03 — Eval command

1. `eval:studio-lab2-corpus` checks counts, series, gated vs public, distribution coverage, metrics label, pagination implication (`post_count > 100`).
2. Exit code 1 on miss.

Acceptance: CI-runnable when DATABASE_URL and allow flag set.

### RC-P2-T04 — Implement search + sequence on live gallery items

1. Facade `search_library` / `resolve_numbered_sequence` using `GalleryService` / query kernel for `rcx_studio_lab2`.
2. Tests against seeded DB.

Acceptance: Hero Academy resolve returns expected ids in numeric order; gap warning includes the missing page id from eval block.

### RC-P2-T05 — Collection create/order apply

1. `create_or_update_collection` + `set_collection_order` via existing collection APIs/services.
2. ChangeSet before/after snapshots.

Acceptance: membership and order persist; second apply idempotent.

### RC-P2-T06 — Shared projection + Lab 2 pagination

1. `StudioContentProjection` yields items for all three lenses from gallery list + collections + schedule-rail month window.
2. Lab 2 fetches with cursor; does not silently drop posts 101+.
3. Collections lens renders stacks for collections with ≥2 members (visible labels).

Acceptance: component tests + RC-DF-04/14 automated pieces. **Visible behavior:** stacks and labels, not only `collection_ids` in JSON.

### RC-P2-T07 — Lens switcher (provisional)

1. Lab 2 control to switch chronological / Collections / schedule without changing data ownership.
2. Keyboard reachable; does not unmount the schedule rail column.
3. No DB preset persistence.

Acceptance: same `post_id` appears in chrono and in its collection stack; schedule lens lists command-created events after T08.

### RC-P2-T08 — ChangeSet apply, schedule drafts, undo

1. Enable apply when `RELAY_COMMAND_APPLY_ENABLED=1` **and** command layer enabled.
2. Scenarios: watercolor collection newest-first; Hero Academy collection cover-first; weekly X plan skipping present pages; prepare drafts without publish.
3. Undo reverts those ops.
4. Native vs imported revise: at least one RELAY post and one PATREON post in corpus for RC-DF-10.

Acceptance: integration tests for RC-DF-05–13 except human visual. No `Post.publishState` flip to published for drafts that were unpublished; no distribution attempt `completed` from command apply.

### RC-P2-T09 — Flag-gated HTTP preview/apply + human script wiring

1. Creator-scoped POST preview/apply with session match, idempotency key, audit log line (existing identity audit or new table from P1).
2. Fill `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md` template with reset recipe and RC-DF-01/04/14 steps.
3. Restart local stack. **Stop for HUMAN-UX-VISUAL.**

Acceptance: builder can demonstrate deterministic apply via HTTP or documented service CLI; human script does not require Cursor. Phase is not Done until the human records visual pass/fail.

## Safe batches

- Batch 1: RC-P2-T01
- Batch 2: RC-P2-T02 + RC-P2-T03
- Batch 3: RC-P2-T04 + RC-P2-T05
- Batch 4: RC-P2-T06 + RC-P2-T07
- Batch 5: RC-P2-T08
- Batch 6: RC-P2-T09 → human gate

## Verification

```bash
npx vitest run tests/studio/lab2/corpus-spec.test.ts tests/studio/command/change-set-engine.test.ts tests/web/studio-lab2-lenses.test.tsx
# with DATABASE_URL + RELAY_ALLOW_STUDIO_LAB2_SEED=1:
npx vitest run tests/studio/lab2/seed-eval.integration.test.ts
npm run seed:studio-lab2 -- apply
npm run eval:studio-lab2-corpus
npm run typecheck
npm run dev:stack:restart
```

Manual (human): Lab 2 contract **Visual script A**.

## Exit gate

- Corpus eval green
- Deterministic scenarios green
- Lab 2 lenses ship as capacity
- HUMAN-UX-VISUAL evidence filed (pass)
- `00-README.md` P2 → Done
- Next: RC-P3-T01

## Human stop conditions

- **HUMAN-UX-VISUAL** (required)
- HUMAN-MIGRATE if seed needs new tables beyond P1
- Seed targeting a non-lab creator
- Any urge to “improve” production Library layout in this phase — stop and use Lab 2 only

## Delta Out

Include seed status JSON, fixture hash, apply flag state, and the exact URL `http://localhost:3000/studio/lab2` (or current web port) plus lab creator login recipe.

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P2-T01 through RC-P2-T09 (Batches 1–6). Phase not Done.
- Completed: Lab 2 corpus JSON + validator + stable fixture_hash; seed apply/status/cleanup/eval on dedicated creator rcx_studio_lab2; labeled Insights metrics (studio-lab2-corpus-v1, not Goals Lab and not unconstrained ExternalPostMetricSnapshot rows); live search/sequence against seeded posts; collection create/order via ChangeSet engine; StudioContentProjection + Lab 2 chrono pagination (limit 100 + next_cursor); provisional lens switcher with stacks; apply/undo when both command flags are on (collections, native append PostVersion, imported presentation overlay, schedule events + destination drafts, no distribution posted from apply); flag-gated POST /api/v1/creator/command/preview|apply|undo; HUMAN-UX-VISUAL evidence template filled with reset recipe.
- Files created/edited: tests/fixtures/studio-lab2-corpus.json; src/studio/lab2/*; src/studio/command/library-items-from-db.ts, native-revise.ts, change-set-engine.ts, http-routes.ts; src/studio/projection/studio-content-projection.ts; scripts/seed-studio-lab2.mjs, scripts/eval-studio-lab2-corpus.mjs; web/app/components/studio-lab2/{StudioContentLensSwitcher,CollectionStackCard,Lab2CollectionsLens,Lab2ScheduleLens}.tsx and chassis/live pagination; web/lib/relay-api.ts command clients; tests/studio/lab2/*, tests/studio/command/change-set-engine.test.ts, tests/studio/projection/*, tests/web/studio-lab2-lenses.test.tsx; package.json scripts; .env.example; docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md; 00-README.md (P2 → In progress); this file
- Migration and backfill state: none. Reused existing PatreonInsightsImport / PostVersion / LibraryCollection / CreatorScheduleEvent / AutopostDraft. No HUMAN-MIGRATE.
- Contracts changed: none expected. Metrics ingest reuses Insights CSV with Lab 2 label only.
- Commands and results: npx vitest run tests/studio/lab2/corpus-spec.test.ts tests/studio/lab2/seed-eval.integration.test.ts tests/studio/command/change-set-engine.test.ts tests/studio/projection/studio-content-projection.test.ts tests/web/studio-lab2-lenses.test.tsx tests/web/studio-lab2-chassis.test.tsx → 17 passed (integration 144959ms). Seed remaining in local DB after the integration re-apply (baseline collections empty). `npx tsc -p tsconfig.build.json --noEmit` green after narrowing native revise to `native_version` and widening Lab 2 vs Goals Lab label guards. npm run typecheck: repo-wide tsc already red on unrelated files.
- Manual/browser checks: builder did not fill HUMAN-UX-VISUAL pass/fail. Playground URL http://localhost:3000/studio/lab2. Login: studio-lab2@relay.test / RELAY_STUDIO_LAB2_DEV_PASSWORD or default studio-lab2-dev-only. Visual script: docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md (Lab 2 contract Script A). `npm run dev:stack:restart`: web Ready on :3000; API listen was delayed until local Redis on :6379 was up (Docker Desktop + relay-redis). Both now listening.
- Feature flags / kill switches: .env.example keeps RELAY_COMMAND_LAYER_ENABLED=false, RELAY_COMMAND_APPLY_ENABLED=false, RELAY_ALLOW_STUDIO_LAB2_SEED commented off. Local visual pass must set layer + apply true (HTTP 404s if layer off). Seed requires RELAY_ALLOW_STUDIO_LAB2_SEED=1 and refuses NODE_ENV=production.
- Seed status (after integration re-apply): email studio-lab2@relay.test; creator_id rcx_studio_lab2; label studio-lab2-corpus-v1; fixture_hash 7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a; post_count 112; collection_count 0; metrics_label studio-lab2-corpus-v1.
- Known risks or human gates: HUMAN-UX-VISUAL required. Phase is not Done. Do not start P3. Local .env did not yet contain Command Layer flags at handoff — set them before HTTP apply. Chassis mock still warns that the rail mock is not forwardRef (pre-existing).
- Next unblocked todo IDs: none until a human records pass on docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md. Then RC-P3-T01.
```

```text
Relay Command Delta Out
- Slice / claimed todos: HUMAN-UX-VISUAL
- Completed: Human recorded Pass on docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md (2026-08-28). P2 exit gate met.
- Files created/edited: docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md; 00-README.md P2 → Done
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: n/a (gate)
- Manual/browser checks: Lab 2 playground approved as test ground
- Feature flags / kill switches: unchanged
- Known risks or human gates: none remaining for P2. Next RC-P3-T01 + RC-P3-T03.
- Next unblocked todo IDs: RC-P3-T01 + RC-P3-T03
```

