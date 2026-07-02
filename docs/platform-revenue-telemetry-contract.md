# Platform revenue telemetry contract (PMD-060)

Approved definitions for Phase 6 revenue dashboard cards. Parent: [`platform-metrics-dashboard-build-plan.md`](platform-metrics-dashboard-build-plan.md) Phase 6.

**Code source of truth:** [`src/platform-metrics/revenue-telemetry-contract.ts`](../src/platform-metrics/revenue-telemetry-contract.ts)

**Storage:** `platform_revenue_events` (Prisma migration `20260525190000_platform_revenue_events`)

**Related:** [`financial-atlas.md`](financial-atlas.md), [`platform-metrics-inventory.md`](platform-metrics-inventory.md)

---

## Core rule

**Never mix Patreon-upstream billing with Relay-native revenue on the same card.**

| Source label | Meaning | Dashboard use |
|--------------|---------|---------------|
| `relay_native` | Checkout, subscription, skip, storefront flows owned by Relay | Phase 6 P0 cards (`revenue.*`) |
| `patreon_upstream` | Creator billing on Patreon — informational only | Separate keys `revenue.patreon_upstream.*` only |
| `external_estimate` | Proxy/heuristic — not financial actuals | Must use `estimated` status; never labeled live |

No estimate is presented as actual revenue.

---

## Metric definitions (Relay-native)

| Key | Label | Definition | Formula | Notes |
|-----|-------|------------|---------|-------|
| `revenue.gross` | Gross revenue | Cash collected before provider fees and before refunds | `SUM(amount_cents) WHERE source_label=relay_native AND kind IN (checkout_completed, subscription_created)` minus gross refunds | UTC day boundary |
| `revenue.net` | Net revenue | Gross minus provider fees and refunds in period | `gross - fees - refunds` | Uses `net_amount_cents` when present |
| `revenue.mrr` | MRR | Monthly recurring revenue from active Relay-native subscriptions | Sum of monthly-normalized active plan amounts at snapshot time | Excludes one-time checkout |
| `revenue.arr` | ARR | Annualized run rate | `mrr * 12` | Derived only |
| `revenue.arpu` | ARPU | Net revenue per paying user | `net_revenue / paying_users` | Paying users = distinct accounts with completed checkout or active sub in window |
| `revenue.churn_rate` | Churn rate | Subscription cancels / active subs at period start | `subscription_canceled / active_start` | Windowed (default 30d) |
| `revenue.upgrades` | Upgrades | Plan upgrades in period | `COUNT(subscription_upgraded)` | Relay-native only |
| `revenue.downgrades` | Downgrades | Plan downgrades in period | `COUNT(subscription_downgraded)` | Relay-native only |
| `revenue.refunds` | Refunds | Refund value issued in period | `SUM(amount_cents) WHERE kind=refund_issued` | Reduces net |

Lifecycle counters (PMD-061):

| Key | Event kind |
|-----|------------|
| `revenue.checkout_started` | `checkout_started` |
| `revenue.checkout_completed` | `checkout_completed` |

---

## Event catalog (`platform_revenue_events`)

| Event kind | Required fields | Provider examples |
|------------|-----------------|-------------------|
| `checkout_started` | `occurred_at`, `source_label`, `creator_id` | stripe, paypal |
| `checkout_completed` | above + `amount_cents`, `currency`, `status` | stripe, paypal |
| `checkout_failed` | `occurred_at`, `source_label`, `creator_id`, `checkout_id`, `status` | stripe, paypal |
| `subscription_created` | `occurred_at`, `source_label`, `creator_id`, `subscription_id`, `amount_cents` | stripe |
| `subscription_upgraded` | above + prior plan ref in payload | stripe |
| `subscription_downgraded` | above + prior plan ref in payload | stripe |
| `subscription_canceled` | `occurred_at`, `source_label`, `creator_id`, `subscription_id` | stripe |
| `refund_issued` | `occurred_at`, `source_label`, `amount_cents`, `checkout_id` or `subscription_id` | stripe, paypal |
| `payout_settled` | `occurred_at`, `source_label`, `creator_id`, `net_amount_cents` | stripe_connect |

### Forbidden payload fields

Same privacy posture as first-party telemetry: no email, display names, raw card numbers, or OAuth tokens.

---

## Patreon-upstream (separate cards — not Phase 6 P0 live)

If shown later, use keys prefixed `revenue.patreon_upstream.*` with `source_label=patreon_upstream` and `manual_import` or dedicated API sync — never roll into `revenue.gross`.

---

## PMD-060 exit

- [x] MRR, ARR, gross/net, ARPU, churn, upgrades, downgrades, refunds defined
- [x] Provider and source labels documented
- [x] TypeScript contract + validation helper
- [x] Prisma storage model + RLS-enabled migration
- [x] Registry seed remains `deferred` until PMD-061 instrumentation

**Next:** PMD-061 — instrument checkout and subscription lifecycle.

## PMD-062 rollup status

- [x] UTC-day rollups for Relay-native gross, net, checkout starts/completions/failures, upgrades, downgrades, and refunds
- [x] Registry reads revenue rollups as `live` when generated
- [x] `revenue.gross` participates in trend/alert evaluation once rollup-backed
- [ ] MRR, ARR, ARPU, and churn require a subscription state snapshot before they can be labeled live
