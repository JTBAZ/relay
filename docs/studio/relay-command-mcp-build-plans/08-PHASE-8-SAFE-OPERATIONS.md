# Phase 8 — Safe operations and durable ChangeSets

## Outcome

An **approved selection snapshot** plus a named stock operation compiles to typed ChangeSet ops through existing gallery/collection/presentation services. The model does not pick write layers. MCP/in-product/HTTP apply all hit the **DB** ChangeSet engine. Proposals, ChangeSets, idempotency, and Undo **survive API restart**.

## Scope

In:

- Operation compiler: collection create/update/order, explicit tag add/remove, saved filters, correct-layer title/description revise.
- Unify MCP `apply_change_set` with `applyCommandChangeSet` in `change-set-engine.ts`.
- Persist proposal, snapshot membership/exclusions, ChangeSet, undo snapshots (Prisma + RLS SQL).
- Idempotency; visibility/access stay `review` risk and **out of apply allowlist** for this phase.
- Delete and `publish_external` remain absent.

Out:

- Recurring Automations fork.
- Extension send.
- Production CommandBox mount.
- Auto-apply during plan shaping (P9 still no rail rows until approval — P8 is the engine P9 will call on final approve).
- Hosted migrate apply (HUMAN-MIGRATE).

## Dependencies and permitted parallel work

Depends on **P7 Done** and **HUMAN-UX-NL-LIVE**. Schema/migration is a **standalone first batch** if tables are new. Do not combine migration with compiler behavior in one session unless the phase seals it (it does not).

## Required reading

1. [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) (risk classes, never list)
2. [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md) write-layer table
3. `src/studio/command/change-set-engine.ts`
4. `src/studio/command/change-set-types.ts`
5. `src/studio/command/capability-facade.ts`
6. `src/studio/command/write-router.ts`
7. `src/studio/command/mcp/dispatch.ts`
8. `src/gallery/collections-store-db.ts`
9. Bulk tags route characterization in `tests/studio/command/spine-characterization.test.ts`
10. `prisma/migrations/20260828200000_command_grants_audit/migration.sql` (pattern: RLS + REVOKE)
11. `.cursor/rules/supabase-mcp-read-check.mdc`

## Locked contracts

**Compiler**

- Input: frozen `post_ids` + op kind + artist-supplied labels (collection title, tag ids, new title).
- Output: `CommandChangeSetOp[]` with `risk_class`. Write layer from `write-router.ts` / post.source, never from the model.
- Ops only against frozen IDs. `COMMAND_STALE_SELECTION` if snapshot revision mismatches.

**Allowed execute_undo ops**

- `create_or_update_collection`, `set_collection_order`
- Tag add/remove via existing bulk-tags / override path (not canonical ingest tags)
- `revise_post` (presentation vs native_version via router)
- Saved filter create (existing `SavedFilter` if already in schema)

**Persistence**

- Replace in-memory `undoStore` / preview Map for Lab 3/production-shaped apply. Lab 2 local playground may keep memory **only** if P8 also has a DB path behind flags; prefer one DB path.
- RLS enabled; REVOKE anon/authenticated; creator-scoped indexes.
- Hosted apply HUMAN-MIGRATE / HUMAN-SECURITY.

**MCP**

- `apply_change_set` must call the same engine as HTTP. In-memory-only MCP apply is a P8 bug to close.

**Flags**

- Apply still `RELAY_COMMAND_APPLY_ENABLED`. Committed default off.

## Files

Create:

- `src/studio/command/operation-compiler.ts`
- `prisma/migrations/<timestamp>_command_proposals_changesets/migration.sql`
- `tests/studio/command/operation-compiler.test.ts`
- `tests/studio/command/change-set-engine-durable.test.ts`

Edit:

- `prisma/schema.prisma`
- `src/studio/command/change-set-engine.ts`
- `src/studio/command/change-set-types.ts`
- `src/studio/command/capability-facade.ts`
- `src/studio/command/mcp/dispatch.ts`
- `src/studio/command/http-routes.ts`
- `src/studio/command/idempotency.ts` if swapping store
- `docs/database/operations-and-security.md` (env names / RLS note; no secrets)

Do not touch:

- Automations product contract
- Extension packet shapes
- Goal Cycle / Escape Hatch
- `GalleryView.tsx` production mount

## Todo work items

### RC-P8-T01 — Operation compiler

1. Map named intents → ops. Reject publish, delete, visibility/tier, automation activate.
2. Tests: imported vs native revise; collection from frozen IDs; mixed “title everywhere” still validation error.

Acceptance: RC-DF-10 still holds; RC-CX-07 compiler portion.

### RC-P8-T02 — Stock ops via existing services

1. Reuse `DbCollectionsStore`, bulk-tags/overrides, presentation/native revise, saved filters.
2. Do not fork a second collection store.
3. CommandBox: after `selection_approved`, Organize-mode Apply may run collection compile+apply when apply flag on (Lab 3). Schedule apply waits P9.

Acceptance: integration tests on Lab 2 creator; Undo restores membership (engine path).

### RC-P8-T03 — Unify MCP apply with DB engine

1. `dispatch.ts` `apply_change_set` / `undo_change_set` call `applyCommandChangeSet` / `undoCommandChangeSet`.
2. Grants and flags unchanged.

Acceptance: mcp tests prove Prisma writes when apply flag on in-process; still 404 when layer off.

### RC-P8-T04 — Persist proposal / ChangeSet / undo

1. Prisma models + migration SQL + RLS. Local migrate only on developer DB when implementing.
2. Do not `prisma migrate deploy` to staging/production.
3. Supabase read-check after schema edit.

Acceptance: SQL + rollback notes in Delta Out; HUMAN-MIGRATE named. P8 not blocked on hosted apply.

### RC-P8-T05 — Idempotency + restart Undo

1. Same idempotency key + body → replay. Different body → conflict.
2. Restart-safe Undo test (rehydrate from DB, not process Map).

Acceptance: RC-DF-12 + RC-CX-07. Next unblocked P9.

## Safe batches

- Batch 1: RC-P8-T04 **alone** if schema is new (hot file `schema.prisma`)
- Batch 2: RC-P8-T01 + RC-P8-T02
- Batch 3: RC-P8-T03 + RC-P8-T05

If T04 is not needed because T01–T03 can land against existing tables, Delta Out must say why memory undo is still unacceptable — then T04 is still required before P8 Done.

## Verification

```bash
npx vitest run tests/studio/command/operation-compiler.test.ts tests/studio/command/change-set-engine.test.ts tests/studio/command/change-set-engine-durable.test.ts tests/studio/command/mcp-tools.test.ts
npm run eval:relay-command -- --facade-only
npx tsc -p tsconfig.build.json --noEmit
```

## Exit gate

- Compiler + DB apply + MCP unify + durable undo tests green
- Hosted migrate applied 2026-08-30 (HUMAN-MIGRATE)
- P8 → Done; next RC-P9-T01 + RC-P9-T02
- Visibility/delete/publish still forbidden

## Human stop conditions

- **HUMAN-MIGRATE** / **HUMAN-SECURITY** completed 2026-08-30 for command persist, grants, idempotency, and queued gallery revisions
- Product contradiction (model picking write layer)

## Delta Out

Use the template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md).

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P8-T01 + RC-P8-T02
- Completed: `operation-compiler.ts` maps frozen snapshot + named stock kind to ChangeSet ops via write-router. Forbidden publish/delete/visibility/automation. Schedule kinds return COMMAND_VALIDATION with ORGANIZE_APPLY_SCHEDULE_BLOCKED. Engine apply/undo for add_post_tags, remove_post_tags (override layer only), create_saved_filter. Lab 3 Apply after selection_approved compiles from frozen IDs and ignores client ops. MCP tool stubs 1:1 with the new capability names; apply_change_set still in-memory (T03). P8 remains In progress.
- Files created/edited: src/studio/command/operation-compiler.ts; src/studio/command/change-set-engine.ts; src/studio/command/change-set-types.ts; src/studio/command/contracts.ts; src/studio/command/capability-facade.ts; src/studio/command/mcp/dispatch.ts; src/studio/command/mcp/tool-defs.ts; src/studio/command/http-routes.ts; web/lib/command-selection-review.ts; web/app/components/studio/command/CommandBox.tsx; web/app/components/studio/command/SelectionReviewOverlay.tsx; tests/studio/command/operation-compiler.test.ts; tests/studio/command/change-set-engine.test.ts; tests/studio/command/command-apply-proposal-http.test.ts; tests/web/selection-review.test.tsx; tests/fixtures/relay-command-mcp-tool-schemas.json; 00-README.md; TRACEABILITY.md; BUILDER-ORIENTATION.md; this file
- Migration and backfill state: none. Memory undo remaining is unacceptable for P8 Done — T04 still required (proposals, ChangeSets, undo snapshots must survive API restart). T01–T02 land on existing collection/override/saved-filter tables.
- Contracts changed: new capabilities add_post_tags, remove_post_tags, create_saved_filter. Lab 3 Organize Apply is collection-only. Schedule apply waits P9. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: vitest operation-compiler, change-set-engine, mcp-tools, command-apply-proposal-http, selection-review, command-box, mcp-grants, write-router — passed. `npx tsc -p tsconfig.build.json --noEmit` exit 0. `npm run eval:relay-command -- --facade-only` scenarios 13/13 ok; overall ok=false from local `db.status=blocked` (metrics label studio-lab2-corpus-v1 missing) — not caused by this compiler batch. live_model=skipped.
- Manual/browser checks: stack restart after apply HTTP + overlay Apply
- Feature flags / kill switches: committed `.env.example` layer/apply/selection UX **false**. Local Lab 3 may enable layer + selection UX + apply.
- Known risks or human gates: Next is RC-P8-T04 alone (schema.prisma). Do not combine T04 with T03. Do not start P9. Do not HUMAN-MIGRATE hosted DBs. Do not flip committed flags.
- Next unblocked todo IDs: RC-P8-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P8-T04
- Completed: Durable proposal / ChangeSet / undo tables + RLS SQL. Engine and HTTP hydrate from Postgres on process Map miss; persist after apply/preview/proposal mutate. MCP apply still in-memory (T03). Idempotency store still in-memory (T05). P8 remains In progress. Hosted migrate not applied.
- Files created/edited: prisma/schema.prisma; prisma/migrations/20260831010000_command_proposals_changesets/migration.sql; src/studio/command/command-durable-store.ts; src/studio/command/change-set-engine.ts; src/studio/command/change-set-types.ts; src/studio/command/proposal-types.ts; src/studio/command/http-routes.ts; tests/studio/command/change-set-engine-durable.test.ts; docs/database/operations-and-security.md; control-plane status files
- Migration and backfill state: SQL ready. **HUMAN-MIGRATE / HUMAN-SECURITY** for hosted apply. Did not `prisma migrate deploy` to the linked Supabase project. Rollback: DROP the three tables; `npx prisma migrate resolve --rolled-back 20260831010000_command_proposals_changesets` if needed.
- Contracts changed: none. Persist is transparent to existing envelopes. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: `npx tsc -p tsconfig.build.json --noEmit` exit 0. vitest focused Command files 36 passed / 2 skipped (T04 durable tests skip until hosted tables exist). facade-only eval 13/13 scenarios ok; overall ok=false from pre-existing Lab 2 metrics gap. Supabase read-check: hosted public schema does not include the three T04 tables.
- Manual/browser checks: stack restart after HTTP persist
- Feature flags / kill switches: committed flags still off
- Known risks or human gates: Until HUMAN-MIGRATE, hosted API restart still loses proposals/undo. Next is T03+T05, not P9.
- Next unblocked todo IDs: RC-P8-T03 + RC-P8-T05
```

```text
Relay Command Delta Out
- Slice / claimed todos: HUMAN-MIGRATE + RC-P8-T03 + RC-P8-T05
- Completed: Hosted `prisma migrate deploy` applied pending revisions including command grants, proposals/ChangeSets/undo, and command_idempotency_keys (also studio gallery snappy + gallery_published_at which were earlier in the Prisma queue). MCP apply_change_set / undo_change_set call applyCommandChangeSet / undoCommandChangeSet. HTTP idempotency uses Postgres. Restart-safe undo and same-key/body replay tests green. P8 → Done.
- Files created/edited: prisma/schema.prisma; prisma/migrations/20260831020000_command_idempotency/migration.sql; src/studio/command/mcp/dispatch.ts; src/studio/command/mcp/http-routes.ts; src/studio/command/http-routes.ts; src/studio/command/idempotency.ts; src/studio/command/command-idempotency-store.ts; tests/studio/command/mcp-apply-engine.test.ts; tests/studio/command/change-set-engine-durable.test.ts; docs/database/operations-and-security.md; control-plane status files
- Migration and backfill state: Hosted applied 20260827210000_studio_gallery_snappy, 20260828120000_gallery_published_at, 20260828200000_command_grants_audit, 20260831010000_command_proposals_changesets, 20260831020000_command_idempotency. Tables present with RLS enabled; REVOKE anon/authenticated. Rollback for Command persist: DROP TABLE command_idempotency_keys, command_change_set_undos, command_change_sets, command_selection_proposals;
- Contracts changed: MCP apply/undo require Prisma. Facade in-memory apply remains for facade-only eval. Production CommandBox still unmounted. Committed flags still off.
- Commands and results: `npx prisma migrate deploy` applied 5 pending. `npx tsc -p tsconfig.build.json --noEmit` exit 0. vitest durable + mcp-apply-engine + compiler/engine/mcp-tools/grants/apply-http passed. facade-only eval 13/13 scenarios ok; overall ok=false from pre-existing Lab 2 metrics gap. user-supabase list_tables: command_* and media_derivatives present, rls_enabled true.
- Manual/browser checks: stack restart after MCP/HTTP persist wiring
- Feature flags / kill switches: committed flags still off
- Known risks or human gates: Next is P9 (HUMAN-UX-PLAN at phase end). Do not flip committed flags. Do not mount production CommandBox. Security advisor INFO rls_enabled_no_policy on these tables is expected (deny default + REVOKE, no USING true).
- Next unblocked todo IDs: RC-P9-T01 + RC-P9-T02
```


