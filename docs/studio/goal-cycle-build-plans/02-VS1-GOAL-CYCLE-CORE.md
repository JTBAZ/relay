# VS1 Build Plan — Goal Cycle Core and Checkpoints

## Outcome

Persist creator-scoped Goal Cycles and expose start, hydrate, resume, answer, cancel, completion-suggest, and creator-confirmed completion APIs with one-active-cycle enforcement.

## Scope

In: Prisma models/migration, service/store, authorization, lifecycle APIs, checkpoint/version concurrency, Library/audit hydration.

Out: credits, trend calls, Plan generation, materialization, outcomes calculation, frontend.

## Dependencies and permitted parallel work

Depends on VS0. Schema/service and API fixture clients are serial because they share the wire contract. VS3 may run in parallel. VS2 and VS4 wait for this exit gate.

## Required reading

1. [`01-VS0-BASELINE-CONTRACTS.md`](01-VS0-BASELINE-CONTRACTS.md)
2. `prisma/schema.prisma`
3. `src/distribution/coach-checkpoint-service.ts`
4. `src/autopost/posting-goal-service.ts`
5. `src/server.ts` account/creator route patterns
6. `web/lib/relay-api.ts`
7. `tests/coach-checkpoint-service.test.ts`
8. `tests/creator-posting-goal-route.test.ts`

## Data contract

Add creator-owned models:

- `CreatorGoalCycle`: ID, creator ID, state, phase, goal kind, break mode, period key, creator time zone, context JSON, active marker, version, reservation reference nullable, approved/materialized/completion timestamps, cancel reason, created/updated.
- `CreatorGoalCycleCheckpoint`: cycle ID unique, phase, latest valid structured state JSON, version, updated.
- `CreatorGoalCycleRevision`: cycle ID, ordinal, kind `initial | ai_revision | manual_edit`, request/response summary JSON, plan JSON, created. Unique `(cycle_id, ordinal)`.
- `CreatorGoalCycleSlot`: cycle ID, stable slot key, rank, intent/format/title/draft, linked destination IDs JSON, local/UTC schedule, media state, downstream IDs nullable, status. Unique `(cycle_id, slot_key)`.
- `CreatorGoalCycleProgress`: cycle ID, monotonically increasing sequence, phase, message code, safe metadata JSON, created. Unique `(cycle_id, sequence)`.
- `CreatorGoalCycleOutcome`: one cycle-owned snapshot shell for VS4/VS9 to extend; target JSON, actual JSON nullable, confidence, freshness, suggested completion, confirmed timestamp.

Use one DB-enforced active marker per creator: nullable `active_scope` set to `"active"` for nonterminal rows plus unique `(creator_id, active_scope)`. Terminal transitions clear it in the same transaction.

## API contract

- `POST /api/v1/creator/goal-cycles` — start with goal, optional break mode, timezone, bounded context, idempotency key.
- `GET /api/v1/creator/goal-cycles/active`
- `GET /api/v1/creator/goal-cycles?cursor=&limit=`
- `GET /api/v1/creator/goal-cycles/:id`
- `PATCH /api/v1/creator/goal-cycles/:id/checkpoint` — expected version plus validated partial checkpoint.
- `POST /api/v1/creator/goal-cycles/:id/cancel`
- `POST /api/v1/creator/goal-cycles/:id/suggest-completion` — service/internal authenticated path only.
- `POST /api/v1/creator/goal-cycles/:id/confirm-completion`

Start returns the existing active cycle on an identical idempotency retry; otherwise a second active start returns 409 `GOAL_CYCLE_ACTIVE_EXISTS`.

## Files

Create:

- one timestamped `prisma/migrations/*_creator_goal_cycles/migration.sql`
- `src/goal-cycle/goal-cycle-store.ts`
- `src/goal-cycle/goal-cycle-service.ts`
- `src/goal-cycle/goal-cycle-routes.ts`
- `tests/goal-cycle/goal-cycle-service.test.ts`
- `tests/goal-cycle/goal-cycle-routes.test.ts`
- `tests/goal-cycle/goal-cycle-isolation.integration.test.ts`

Edit:

- `prisma/schema.prisma`
- `src/server.ts`
- `web/lib/relay-api.ts`

Do not touch:

- Coach proposal prompt/service
- credit ledger
- `GalleryView.tsx`
- distribution/materialization services

## Todo work items

### VS1-T01 — Add schema and migration

Implement models, relations, indexes, active uniqueness, creator cascade policy, and migration SQL. Add a migration smoke test. Do not backfill existing posting goals into cycles.

### VS1-T02 — Implement lifecycle store/service

Implement transactional start, versioned checkpoint patch, cancel, internal completion suggestion, creator confirmation, summaries, detail hydration, and cursor history. Enforce transition table and one-active invariant.

### VS1-T03 — Register authenticated routes

Use existing creator/account guards, runtime validators, stable errors, idempotency header/body rules, and structured audit logging. GET routes remain read-only.

### VS1-T04 — Add typed web client and fixtures

Add API methods/types by importing or mirroring the VS0 public contract without DB fields. Include 404, 409 version, active-exists, and resume fixtures.

### VS1-T05 — Prove concurrency and isolation

Test simultaneous starts, simultaneous checkpoint versions, terminal transition/restart, creator-local month history, and cross-tenant 404/deny behavior.

## Safe batches

- Batch 1: VS1-T01 only.
- Batch 2: VS1-T02 + focused service tests.
- Batch 3: VS1-T03 + VS1-T04.
- Batch 4: VS1-T05 only.

## Verification

```bash
npx prisma validate
npx vitest run tests/goal-cycle/goal-cycle-service.test.ts tests/goal-cycle/goal-cycle-routes.test.ts
npx vitest run tests/goal-cycle/goal-cycle-isolation.integration.test.ts
npm run typecheck
npm run build --prefix web
```

## Exit gate

With a real test DB, two starts yield one active cycle; checkpoint retries are version-safe; terminal confirmation permits a later same-month cycle; hydration is creator-scoped; all flags remain off.

## Human stop conditions

Stop before a production migration, destructive migration rewrite, or any choice to merge historical `CreatorPostingGoal` rows automatically.

## Delta Out

Include migration name, rollback implications, route inventory, transition table, and the exact wire fixture version consumed by VS2/VS4/VS5/VS6.
