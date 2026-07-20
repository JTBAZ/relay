# Coach Plan Credit Build Plan

**Status:** Product unit and accounting contract locked; allowance values and paid top-ups are human gates  
**Owning slice:** [`studio/goal-cycle-build-plans/03-VS2-COACH-PLAN-CREDITS.md`](studio/goal-cycle-build-plans/03-VS2-COACH-PLAN-CREDITS.md)  
**Monetization context:** [`MONETIZATION_MASTER_MAP.md`](MONETIZATION_MASTER_MAP.md)

## Customer-facing unit

One **Coach Plan credit** buys one bounded Goal Cycle planning run:

- approved trend/history research;
- one initial structured Plan;
- up to two AI revision rounds;
- deterministic fallback if model formatting fails.

It does not buy eight independent posts, publishing, or unlimited chat. A complete-silence break is free. Social-upkeep and active-rest Plans consume one credit.

Internal AI tokens and provider units continue through existing `UsageEvent` metering. They are not shown as the customer unit.

## Ledger model

Use an append-only creator-scoped ledger and a derived wallet balance. Never store balance as the only truth.

Canonical entry kinds:

- `monthly_grant`
- `admin_grant`
- `reserve`
- `consume`
- `release`
- `expire`
- `correction`

Each row contains creator ID, amount in integer credits, entry kind, idempotency key, source/reference, occurred time, and non-sensitive metadata. Reserve and consume are negative movements; release is the matching positive movement.

## Reservation lifecycle

1. Start/resume checks entitlement and available balance.
2. `complete_silence` bypasses reservation.
3. Starting paid research creates one reservation using a cycle-derived idempotency key.
4. Research, initial generation, retry, and two revisions reuse that reservation.
5. Approval atomically consumes the reservation.
6. Creator cancellation before a usable Plan, permanent provider failure, or unrecoverable system failure releases it.
7. Closing the UI or transient retries do not release it.
8. Default reservation TTL is seven days after the last successful checkpoint. Expiry releases the credit but does not delete/cancel the cycle; a later resume must acquire a fresh reservation before paid work continues. The TTL remains entitlement configuration, and the expiry job is idempotent.

Concurrent starts must not overspend the wallet.

## Entitlements and allowances

Use existing creator plan/entitlement configuration to determine:

- whether Goal Cycle is enabled;
- included credits per grant period;
- reservation expiry;
- optional staff/admin grants.

Allowance values are configuration, not schema constants. Product/Finance will set them after pilot token, provider, and support-cost data. Do not imply a purchasable monetary balance.

## API contract

The creator-facing usage response includes:

```ts
type CoachPlanCreditStatus = {
  enabled: boolean;
  available: number;
  reserved: number;
  included_per_period: number | null;
  period_started_at: string | null;
  period_ends_at: string | null;
  next_grant_at: string | null;
  topups_available: false;
};
```

Mutation responses include the current reservation state and stable retry keys. Conflict responses explain “another Plan is active” separately from “no credit available.”

## UX requirements

- Show available/reserved credits before paid research begins.
- Explain exactly what one credit includes.
- Show that complete silence is free.
- At zero balance, preserve the creator’s entered context and offer return/notification behavior; do not show a top-up CTA before top-ups ship.
- Do not expose raw token counts or imply unused revision rounds are refundable fractions.
- Admin corrections remain operational tooling, not a creator UI.

## Idempotency and audit

- Every grant, reserve, consume, release, expiry, and correction has a unique idempotency key.
- Approval retries cannot consume twice.
- Failed transaction retries cannot leave both a consumed and reserved credit.
- Audit metadata may include cycle ID, model class, provider class, and reason code; never prompt text or provider excerpts.
- Ledger rows are immutable. Corrections use compensating entries.

## Observability and pilot metrics

Track:

- Plans started, approved, cancelled, and abandoned;
- credits granted, reserved, consumed, released, expired;
- average model/provider cost per consumed credit;
- revision-round distribution;
- fallback rate;
- reservation conflicts and stale-reservation recovery;
- customer-facing zero-balance frequency.

These metrics inform allowance and future top-up decisions. They do not authorize a builder to select prices.

## Deferred paid top-ups

Paid top-ups require a separate approved program covering SKU/pricing, Stripe/Metronome integration, tax/refund treatment, expiry, financial ledger reconciliation, abuse controls, and customer support. No Goal Cycle slice should add checkout or a “buy credits” promise.

## Verification gate

- Parallel reserve attempts with one remaining credit yield exactly one success.
- Start/retry/resume/revise never add a second reservation.
- Approval consumes once.
- Cancellation/system failure release once.
- Silence path creates no ledger row.
- Upkeep/active-rest use the standard one-credit path.
- Monthly grants are idempotent across job retries.
- Wallet and ledger reconcile for every fixture creator.
