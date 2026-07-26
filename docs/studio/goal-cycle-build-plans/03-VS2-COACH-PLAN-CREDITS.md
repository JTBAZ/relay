# VS2 Build Plan — Coach Plan Credit Quota

## Outcome

Add a race-safe, append-only Coach Plan credit ledger with configurable grants, one-credit reservations, consume/release semantics, entitlement gating, and creator-visible usage.

## Scope

In: ledger schema, wallet projection, grants, reservations, usage API, Goal Cycle linkage, operational metrics.

Out: Stripe/Metronome top-ups, prices, raw-token billing UI, live allowance decisions.

## Dependencies and permitted parallel work

Depends on VS1. Credit schema/migration is serial after the VS1 migration. Service tests and usage UI fixture may follow in parallel after the ledger contract lands. VS4 may run in parallel. VS5 waits for exit.

## Required reading

1. [`../../COACH_PLAN_CREDIT_BUILD_PLAN.md`](../../COACH_PLAN_CREDIT_BUILD_PLAN.md)
2. [`02-VS1-GOAL-CYCLE-CORE.md`](02-VS1-GOAL-CYCLE-CORE.md)
3. `src/usage/usage-events.ts`
4. `src/usage/usage-preview-service.ts`
5. `docs/MONETIZATION_MASTER_MAP.md`
6. creator plan/entitlement models and services in `prisma/schema.prisma` and `src/`

## Data contract

Add:

- `CoachPlanCreditLedger`: creator ID, signed integer amount, kind, idempotency key unique per creator, cycle ID nullable, reservation key nullable, reason code, safe metadata JSON, occurred/created timestamps.
- `CoachPlanCreditReservation`: creator ID, cycle ID unique, status `reserved | consumed | released | expired`, amount fixed to one, reserve/settled timestamps, version.

Derive available balance from ledger sum. A wallet projection/cache is allowed only if updated in the same serializable transaction and fully reconcilable.

Allowance configuration reads existing entitlement/config infrastructure and returns nullable included allowance. No hardcoded tier values. Reservation TTL defaults to seven days from the last successful checkpoint: expiry releases the reservation, leaves the cycle resumable, and requires a fresh reservation before paid work resumes.

## Service contract

- `grantMonthly(creator, period, allowance, idempotencyKey)`
- `reserveForCycle(creator, cycle, idempotencyKey)`
- `consumeReservation(creator, cycle, approvalKey)`
- `releaseReservation(creator, cycle, reason, idempotencyKey)`
- `expireAbandoned(now, batchSize)`
- `getStatus(creator)`
- `reconcileWallet(creator)`

Silence bypasses `reserveForCycle`; upkeep and active rest use it. Retries return the existing reservation/result.

## Files

Create:

- one timestamped `prisma/migrations/*_coach_plan_credits/migration.sql`
- `src/usage/coach-plan-credit-store.ts`
- `src/usage/coach-plan-credit-service.ts`
- `src/usage/coach-plan-credit-grant-worker.ts`
- `tests/usage/coach-plan-credit-service.test.ts`
- `tests/usage/coach-plan-credit-concurrency.integration.test.ts`
- `tests/usage/coach-plan-credit-route.test.ts`

Edit:

- `prisma/schema.prisma`
- `src/server.ts`
- `src/goal-cycle/goal-cycle-service.ts`
- `web/lib/relay-api.ts`
- job registration only after service tests pass

Do not touch:

- Stripe products/prices/webhooks
- Metronome
- AI prompts
- Plan materialization
- included allowance values

## Todo work items

### VS2-T01 — Add append-only schema

Implement ledger/reservation models, relations, unique keys, nonzero/one-credit checks in migration SQL where supported, and immutable-store conventions. Add migration tests.

### VS2-T02 — Implement transactional accounting

Implement grants, reserve, consume, release, expiry, status, and reconciliation. Lock creator wallet scope or use serializable retry so one remaining credit cannot be reserved twice.

### VS2-T03 — Connect lifecycle and entitlements

Persist reservation reference on the cycle, bypass silence, reject disabled/no-credit starts with stable errors, and release only on eligible terminal/system states.

### VS2-T04 — Expose usage API

Add `GET /api/v1/creator/coach-plan-credits` using the canonical public response. Add no-credit messaging fixtures. Keep `topups_available: false`.

### VS2-T05 — Add grants and recovery jobs

Register idempotent monthly grant and abandoned-reservation recovery jobs using configurable allowance/expiry. Emit counts and reason codes without prompt data.

### VS2-T06 — Prove ledger invariants

Test concurrent reserve, duplicate grant/approval/cancel, model retry/resume/revision, silence/upkeep/active-rest, expiry race, correction, and full ledger-wallet reconciliation.

## Safe batches

- Batch 1: VS2-T01 only.
- Batch 2: VS2-T02 + VS2-T06 service-level cases.
- Batch 3: VS2-T03 + VS2-T04.
- Batch 4: VS2-T05 + remaining integration tests.

## Verification

```bash
npx prisma validate
npx vitest run tests/usage/coach-plan-credit-service.test.ts tests/usage/coach-plan-credit-route.test.ts
npx vitest run tests/usage/coach-plan-credit-concurrency.integration.test.ts
npm run typecheck
npm run build --prefix web
```

## Exit gate

One available credit survives concurrency with one reservation; the full Plan lifecycle consumes at most once; silence writes no credit movement; wallet reconciles; no top-up or allowance promise ships.

## Human stop conditions

Stop for allowance values, prices, expiration policy changes beyond configured defaults, production grants, financial accounting, or paid top-up design.

## Delta Out

Include ledger reconciliation output for fixtures, idempotency key formats, configured human gates, job registration, and the status response consumed by VS5/VS6/VS7.
