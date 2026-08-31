# Phase 1 — Content foundation and capability contracts

## Outcome

Freeze typed Command Layer contracts, a capability facade over existing domain services, ChangeSet/idempotency/audit primitives, write-layer routing, and feature-flag defaults so Phase 2 can apply deterministic operations without an LLM and without wrapping `src/server.ts` as MCP.

## Scope

In:

- TypeScript contracts and runtime validators for the five POC capabilities plus Undo.
- Selection grammar and numbered-sequence extraction.
- ChangeSet envelope (no production apply flag on).
- Write-layer router tests against current Prisma semantics.
- Characterization of draft/update/media gaps that Phase 2 may need.
- Durable idempotency **interface** and a Postgres- or Redis-backed store if apply will be used in P2 local playground (local only; hosted migrate is HUMAN-MIGRATE).
- Creator capability context extraction (account → `creatorId` → RLS) without Express-only coupling.
- Disabled feature flags in `.env.example`.
- Alignment notes for existing HTTP draft split (`DRAFT_NOT_SUPPORTED` vs `create-relay-post.ts`).

Out:

- Lab 2 seed corpus (P2).
- MCP transport (P3).
- Studio command chrome / `GalleryView.tsx` edits (P4).
- Autonomous publish, Automations, Goal Cycle, Escape Hatch.
- Prisma-generated tools.
- Hosted `prisma migrate deploy` or RLS gap lockdown apply.

## Dependencies and permitted parallel work

Depends on no Command Layer phase. May characterize existing gallery/collection/presentation/distribution/identity code in parallel with writing new contract files. Merge contracts before any facade that imports them. P2 is unblocked only after the full exit gate.

Existing programs that must remain stable: Goal Cycle VS0–VS9, Automations VS0–VS8, Studio renovation Phases 0–6.

## Required reading

1. [`00-README.md`](00-README.md)
2. [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md)
3. [`TRACEABILITY.md`](TRACEABILITY.md)
4. [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md)
5. [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md) (IDs; P1 owns write-layer and parse facts, not UX scripts)
6. `src/goal-cycle/contracts.ts` (positive template: versioned wire, error codes, flags)
7. `src/gallery/query.ts` (`itemMatchesFreeTextQuery`, list/filter)
8. `src/gallery/effective-presentation.ts`
9. `src/distribution/effective-post-source.ts`
10. `src/relay/create-relay-post.ts` (draft `publishedAt: null`)
11. `src/server.ts` around `POST /api/v1/relay/posts` (`DRAFT_NOT_SUPPORTED`)
12. `src/middleware/idempotency-middleware.ts`, `src/middleware/idempotency-store.ts`
13. `src/identity/require-account.ts`, `prisma/schema.prisma` `SessionKind`
14. `docs/relay-artist-metadata.md`, `docs/architecture/adr/004-pilot-three-layer-permissions.md`
15. `docs/database/migration-from-relay-data.md`, `docs/database/M10_VERIFICATION.md`, `docs/database/supabase-rls-rollout-plan.md`
16. `.cursor/rules/supabase-mcp-read-check.mdc`

## Locked contracts

Create `src/studio/command/contracts.ts` *(future)* with:

**Selection**

- `CommandSelectionQuery`: optional `q` tokens, `tag_ids` exact, `title_contains`, `title_pattern`, `source`, `visibility`, `date_from`/`date_to`, `collection_id`, `destination_present` / `destination_absent`, `exclude_post_ids`.
- `ResolvedSelection`: ordered `post_ids`, `explanation` (human-readable rule, not model prose), `warnings[]`.
- Number extraction: `page` | `part` | `pg` | `p` + integer; stable `sort_key`. Unparsed titles sort after numbered ones unless `cover` flag.

**Capabilities** (names frozen for MCP later)

- `search_library`
- `resolve_numbered_sequence`
- `preview_collection` / `create_or_update_collection` / `set_collection_order`
- `preview_post_revision` / `revise_post`
- `preview_release_plan` / `create_release_plan` / `materialize_schedule`
- `prepare_destination_drafts`
- `preview_change_set` / `apply_change_set` / `undo_change_set`

**ChangeSet**

- `change_set_id`, `idempotency_key`, `instruction`, `resolved_post_ids`, `ops[]`, `risk_class` per op (`execute_undo` | `review` | `publish_confirm`), `expected_revisions`, `before_snapshot_ref`, `after_summary`, `access_implications`, `status`.
- Ops may not include `publish_external` in P1–P4 allowlist.

**Errors** (stable codes)

`COMMAND_VALIDATION`, `COMMAND_NOT_FOUND`, `COMMAND_VERSION_CONFLICT`, `COMMAND_AMBIGUOUS`, `COMMAND_SEQUENCE_GAP`, `COMMAND_SEQUENCE_DUPLICATE`, `COMMAND_WRONG_WRITE_LAYER`, `COMMAND_GATED_MEDIA`, `COMMAND_IDEMPOTENT_REPLAY`, `COMMAND_FORBIDDEN`, `COMMAND_APPLY_DISABLED`, `COMMAND_STALE_SELECTION`.

**Flags** (all default off except as noted)

- `RELAY_COMMAND_LAYER_ENABLED=false`
- `RELAY_COMMAND_APPLY_ENABLED=false`
- `RELAY_COMMAND_MCP_ENABLED=false`
- `RELAY_COMMAND_STUDIO_UX_ENABLED=false`
- `RELAY_ALLOW_STUDIO_LAB2_SEED` — documented; seed code is P2

**Auth types**

- `CommandGrantScope`: `library:read`, `drafts:write`, `collections:write`, `schedule:write`, `command:apply` (no `publish:execute` in this program).
- `SessionKind` extension is specified here; Prisma enum change is a P1 batch if required, hosted apply HUMAN-MIGRATE.

## Files

Create *(future, this phase)*:

- `src/studio/command/contracts.ts`
- `src/studio/command/selection.ts`
- `src/studio/command/sequence.ts`
- `src/studio/command/write-router.ts`
- `src/studio/command/change-set-types.ts`
- `src/studio/command/capability-facade.ts` (signatures + not-implemented or in-memory preview)
- `src/studio/command/creator-context.ts`
- `src/studio/command/flags.ts`
- `tests/studio/command/contracts.test.ts`
- `tests/studio/command/selection.test.ts`
- `tests/studio/command/sequence.test.ts`
- `tests/studio/command/write-router.test.ts`
- `tests/studio/command/spine-characterization.test.ts`

Edit only if needed:

- `.env.example` — flag names and comments
- `src/middleware/idempotency-store.ts` — shared durable store interface; keep in-memory as default for tests
- `prisma/schema.prisma` — only if `SessionKind.mcp`, `CommandAuditEvent`, or idempotency table is required for P2 local apply. Prefer deferring MCP session enum to P3 if P2 can use existing creator session + flag for playground apply.

Do not touch:

- `web/app/studio/GalleryView.tsx`
- `web/app/components/studio-lab2/*`
- Goal Cycle / Automations / Escape Hatch program files
- Hosted database

## Todo work items

### RC-P1-T01 — Characterize the existing spine

1. Add read-only tests documenting gallery search, collection CRUD, presentation PATCH, native create, distribution plan create, schedule-rail events, and the HTTP draft rejection.
2. Record every seam P2 must call versus gaps (no native PATCH, in-memory idempotency, dual `RELAY_DB_STORE_*`).
3. Do not “fix” product behavior here except where a one-line comment points at the owning later todo.

Acceptance: Delta Out names reusable services and conflicts. RC-DF-10 write-layer facts are written down.

### RC-P1-T02 — Freeze shared wire and errors

1. Implement types, validators, capability names, error codes, and flag readers.
2. Assert capability allowlist rejects `publish_external`.
3. Mirror Goal Cycle style: opaque IDs, ISO-8601 UTC, no Prisma row shapes on the wire.
4. Freeze the analytics **fact-pack shape** (coverage, confidence, window suggestion, `weak` | `ordinary` | `clustered` | `unavailable`). P2 binds Lab 2 synthetic rows; the model never receives raw metric dumps.

Acceptance: invalid fixtures fail with stable codes; no HTTP server required for these tests.

### RC-P1-T03 — Selection grammar

1. Implement deterministic `search_library` over in-memory `GalleryItem`-shaped fixtures (and optional Prisma later).
2. Exact tags AND together; title/pattern filters; exclude lists; destination present/absent using distribution summary fields already on gallery items.
3. Return compact records only.

Acceptance: fixture tests cover watercolor-tag, date range, exclude already-on-X. No embedding/LLM.

### RC-P1-T04 — Numbered sequence extraction

1. Parse Page/Part/Pg/P variants, zero-padding, and cover detection from titles (and optional `member_label` when present).
2. Sort numerically. Report gaps and duplicates without filling them.
3. Ambiguous matches (two series tokens) return `COMMAND_AMBIGUOUS` with candidate labels — do not pick.

Acceptance: “Hero Academy Page 2”, “Part 2”, “Pg. 2” share sort key 2; “Page 10” after “Page 2”; missing 17 yields `COMMAND_SEQUENCE_GAP`.

### RC-P1-T05 — Write-layer router

1. Given `post.source`, route revise ops: `PATREON`/`SUBSCRIBESTAR` → presentation fields; `RELAY` → append version intent; collection ops never touch versions.
2. Tests fail closed on mixed “change title everywhere” without an explicit destination list (out of POC; return validation error).

Acceptance: RC-DF-10 unit coverage. No DB writes required if fixtures stub source.

### RC-P1-T06 — ChangeSet types and preview-only engine stub

1. Define envelope, op union, status machine, undo payload shape.
2. `preview_change_set` validates ops against contracts. `apply_change_set` returns `COMMAND_APPLY_DISABLED` while `RELAY_COMMAND_APPLY_ENABLED` is false.
3. Snapshot `resolved_post_ids` on preview so later apply cannot silently retarget.

Acceptance: stale selection (caller mutates ids after preview) is `COMMAND_STALE_SELECTION` in tests.

### RC-P1-T07 — Idempotency and creator context

1. Extend or wrap `IdempotencyStore` so P2 can swap memory → Postgres/Redis without changing callers.
2. `resolveCreatorCommandContext(token)` → `{ accountId, creatorId, traceId }` using existing `requireAccount` patterns, testable without a full Express app where practical.
3. Document that MCP grants are P3; P1 only types scopes.

Acceptance: duplicate key + same body hash replays; different body conflicts. Missing prisma fails closed (do not copy `requireAccountMatchesCreator` skip when `!prisma` into the facade).

### RC-P1-T08 — Tenant + flag + draft-gap note

1. Isolation characterization: existing `tests/relay-creator-tenant-authz.test.ts` remains canonical; command context must call the same match.
2. Flags in `.env.example`.
3. Written gap: native draft HTTP vs service — P2 may add `PATCH`/`publish:false` **only** if native revise in the playground needs it; otherwise presentation-only corpus posts are enough for imported rename scenarios. Decide in Delta Out which P2 path is taken (prefer imported presentation + a few RELAY posts via existing create-with-publish if draft HTTP stays blocked).

Acceptance: P2 can implement apply without inventing wire fields.

## Safe batches

- Batch 1: RC-P1-T01 + RC-P1-T02
- Batch 2: RC-P1-T03 + RC-P1-T04
- Batch 3: RC-P1-T05 + RC-P1-T06
- Batch 4: RC-P1-T07 + RC-P1-T08

If a Prisma migration is required, split it as its own batch **before** Batch 4 and stop for HUMAN-MIGRATE before any hosted deploy. Local `migrate dev` on a developer database is allowed when the user asked for implementation; this planning pack does not run it.

## Verification

```bash
npx vitest run tests/studio/command/contracts.test.ts tests/studio/command/selection.test.ts tests/studio/command/sequence.test.ts tests/studio/command/write-router.test.ts tests/studio/command/spine-characterization.test.ts
npm run typecheck
```

If schema changed:

- Read-check via Supabase MCP per `.cursor/rules/supabase-mcp-read-check.mdc`
- Record rollback SQL in the Delta Out
- Do not `prisma migrate deploy` to staging/production

## Exit gate

- All todos accepted
- Flags default off
- Capability names frozen
- Write router and sequence tests green
- Apply disabled by default
- `00-README.md` P1 status → Done
- Next unblocked: RC-P2-T01

## Human stop conditions

- HUMAN-MIGRATE / HUMAN-SECURITY if new tables, `SessionKind`, or RLS-adjacent grants
- Product contradiction (for example a requirement to guess series membership)
- Do **not** stop for UX — there is no P1 playground

## Delta Out

Use the Relay Command Delta Out template in [`BUILDER-ORIENTATION.md`](BUILDER-ORIENTATION.md).

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P1-T01 + RC-P1-T02 (Batch 1)
- Completed: spine characterization (gallery search, collections, presentation PATCH, native create vs HTTP DRAFT_NOT_SUPPORTED, distribution plans, schedule-rail, in-memory idempotency, tenant fail-open when !prisma); frozen wire version, capability names, error codes, grant scopes, fact-pack shape, ChangeSet envelope validator, flag readers. Flags added to .env.example defaulting off.
- Files created/edited: src/studio/command/contracts.ts, src/studio/command/flags.ts, tests/studio/command/contracts.test.ts, tests/studio/command/spine-characterization.test.ts, .env.example, docs/studio/relay-command-mcp-build-plans/00-README.md (P1 → In progress), this file
- Migration and backfill state: none (SessionKind mcp deferred to P3; no Prisma edits)
- Contracts changed: new Relay Command wire freeze (relay-command-wire-v1). Goal Cycle / Automations / Escape Hatch untouched.
- Commands and results: npx vitest run tests/studio/command/contracts.test.ts tests/studio/command/spine-characterization.test.ts → 20 passed. npm run typecheck: repo-wide tsc already red on unrelated files; no errors under src/studio/command or tests/studio/command.
- Manual/browser checks: n/a (contract-only; no stack restart)
- Feature flags / kill switches: RELAY_COMMAND_LAYER_ENABLED, RELAY_COMMAND_APPLY_ENABLED, RELAY_COMMAND_MCP_ENABLED, RELAY_COMMAND_STUDIO_UX_ENABLED all false; RELAY_ALLOW_STUDIO_LAB2_SEED documented commented-off
- Known risks or human gates: none fired. P2 gaps recorded in characterization: GalleryItem has no Post.source; no native PATCH / append-PostVersion service; HTTP drafts DRAFT_NOT_SUPPORTED while createRelayPostTransaction allows publish:false; collection reorder() is collection-list not membership order (set_collection_order needs a store method); requireAccountMatchesCreator returns true when !prisma — facade must fail closed (T07). Prefer imported presentation + a few RELAY posts via publish:true for Lab 2 unless native revise needs append-version (T08).
- Next unblocked todo IDs: RC-P1-T03 + RC-P1-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P1-T03 + RC-P1-T04 (Batch 2)
- Completed: deterministic search_library over GalleryItem-shaped fixtures (tag AND, date range, destination present/absent using attempt_status=posted|external_url, exclude lists, title glob, compact records). Numbered sequence parse for Page/Part/Pg/P/zero-pad/cover; numeric sort; gap/duplicate report; COMMAND_AMBIGUOUS on mixed series labels.
- Files created/edited: src/studio/command/selection.ts, src/studio/command/sequence.ts, tests/studio/command/selection.test.ts, tests/studio/command/sequence.test.ts, this file
- Migration and backfill state: none
- Contracts changed: none (consumed T02 wire). Compact records fill page_number from sequence parse.
- Commands and results: npx vitest run tests/studio/command/contracts.test.ts tests/studio/command/selection.test.ts tests/studio/command/sequence.test.ts tests/studio/command/spine-characterization.test.ts → 33 passed. tsc: no errors under src/studio/command or tests/studio/command.
- Manual/browser checks: n/a
- Feature flags / kill switches: unchanged (all off)
- Known risks or human gates: none. source filter requires CommandLibraryItem.source (Prisma Post.source) — GalleryItem still lacks it.
- Next unblocked todo IDs: RC-P1-T05 + RC-P1-T06
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P1-T05 + RC-P1-T06 (Batch 3)
- Completed: write-layer router (PATREON/SUBSCRIBESTAR → presentation relay_* fields; RELAY → native_version append intent; collections never touch versions; everywhere/destination-list title edits fail COMMAND_VALIDATION). ChangeSet preview stub freezes resolved_post_ids; apply/undo return COMMAND_APPLY_DISABLED while the apply flag is off; mutated ids after preview are COMMAND_STALE_SELECTION. Capability facade signatures; collection/plan apply not implemented.
- Files created/edited: src/studio/command/write-router.ts, src/studio/command/change-set-types.ts, src/studio/command/capability-facade.ts, tests/studio/command/write-router.test.ts, this file
- Migration and backfill state: none
- Contracts changed: none (op union + undo payload live in change-set-types.ts, envelope still owned by contracts.ts)
- Commands and results: named vitest files → 42 passed at Batch 3. tsc: no errors under src/studio/command or tests/studio/command.
- Manual/browser checks: n/a
- Feature flags / kill switches: apply remains off; apply_change_set fails closed
- Known risks or human gates: none. P2 still needs append-PostVersion service for native revise and a collection membership-order store method.
- Next unblocked todo IDs: RC-P1-T07 + RC-P1-T08
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P1-T07 + RC-P1-T08 (Batch 4)
- Completed: IdempotencyStore wrapper (replay same key+body; body mismatch COMMAND_VALIDATION). resolveCreatorCommandContext fail-closed without Prisma; creator_id must match Account.primaryRelayCreatorId (same rule as tests/relay-creator-tenant-authz.test.ts). Flags confirmed in .env.example. P2 draft HTTP decision: keep DRAFT_NOT_SUPPORTED; imported rename = presentation PATCH; native Lab 2 posts = create with publish:true; native revise = append PostVersion behind write router (not HTTP draft).
- Files created/edited: src/studio/command/idempotency.ts, src/studio/command/creator-context.ts, tests/studio/command/spine-characterization.test.ts, docs/studio/relay-command-mcp-build-plans/00-README.md (P1 → Done), this file
- Migration and backfill state: none. SessionKind.mcp deferred to P3. No HUMAN-MIGRATE.
- Contracts changed: none
- Commands and results: npx vitest run tests/studio/command/contracts.test.ts tests/studio/command/selection.test.ts tests/studio/command/sequence.test.ts tests/studio/command/write-router.test.ts tests/studio/command/spine-characterization.test.ts → 45 passed. npm run typecheck: repo-wide tsc already red on unrelated files; zero errors under src/studio/command and tests/studio/command. DATABASE_URL not required for these tests.
- Manual/browser checks: n/a (no API/web behavior change; stack not restarted)
- Feature flags / kill switches: all Command Layer flags default off; apply disabled by default
- Known risks or human gates: P1 exit gate met. Do not start P2 in this session. No HUMAN-MIGRATE / HUMAN-SECURITY.
- Next unblocked todo IDs: RC-P2-T01
```

```text
Relay Command Delta Out
- Slice / claimed todos: P1 follow-up from characterization notes (no new todos)
- Completed: recorded two extra P2-critical spine facts already implied by T01/T05: presentation PATCH has no Post.source gate (must not be used for RELAY revise); POST /api/v1/relay/posts publish:true is one-shot Relay publish (publish_confirm; not apply). createScheduledPostForRail already bypasses DRAFT_NOT_SUPPORTED via the service.
- Files created/edited: tests/studio/command/spine-characterization.test.ts, this file
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: npx vitest run tests/studio/command/spine-characterization.test.ts → 15 passed
- Manual/browser checks: n/a
- Feature flags / kill switches: unchanged
- Known risks or human gates: none. P1 remains Done. Next unblocked is still RC-P2-T01.
- Next unblocked todo IDs: RC-P2-T01
```

