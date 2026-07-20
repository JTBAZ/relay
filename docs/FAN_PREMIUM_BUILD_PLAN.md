# Fan Premium — Build Plan (Monetization Phase 3)

**Status:** MB-14 **done** — Phase 3 module exit (MB-9–14). Phase 2 tip funnel remains the **observe-and-adjust** instrument — not a build stop. Strategy: ship the locked atlas guess, log behavior, adjust on release.
**Human note (MB-12):** Connect Express code ships build-dark. Provisioning the Stripe Connect platform profile remains a human dashboard gate before live payouts.
**Scope:** Money enters the fan economy: Supporter/Curator subscriptions, Reload Packs, $0.33/Tip artist earnings, the credit-first bill waterfall, Stripe Connect cash payouts, expiry/nudge conversion hooks, and Curator perks.
**Related:**

- Canon: [MONETIZATION_MASTER_MAP.md](MONETIZATION_MASTER_MAP.md) (invariants + locked decisions). Numbers: [financial-atlas.md](financial-atlas.md) — Supporter $5/5 Tips/14-day windows; Curator $14.99/15 Tips/30-day windows; Reload $5/10; $0.33/Tip; $20 payout threshold.
- Prerequisites: [BILLING_SPINE_BUILD_PLAN.md](BILLING_SPINE_BUILD_PLAN.md) (Stripe foundation, `BillingCustomer`, `PlanSubscription.fanPlan`, webhook router), [TIP_BETA_BUILD_PLAN.md](TIP_BETA_BUILD_PLAN.md) (ledger, wallet, reveals, eligibility — reused unchanged).
- Next integration slice: [FRONTEND_MONETIZATION_BUILD_PLAN.md](FRONTEND_MONETIZATION_BUILD_PLAN.md) (MB-15 entitlement walls, plan discoverability, onboarding, and Connect payout UI).

**Contract authority:** Contracts below are frozen for Phase 3; they extend (never fork) the Phase 1/2 contracts. Master map sketches are illustrative; this doc wins within Phase 3 scope.

---

## Worker-agent session protocol

Same as Phase 1/2: read canon → claim one item → update status cell → verify (`npm run test`, `npm run build` root + `web/`, Supabase read-check on migrations) → restart dev stack when needed (`.cursor/rules/rescue-workflow-always.mdc`).

## Human gates (stop conditions)

- **Stripe fan-plan price IDs** (`STRIPE_PRICE_SUPPORTER`, `STRIPE_PRICE_CURATOR`, `STRIPE_PRICE_RELOAD_PACK`) — created by a human in the dashboard. Build dark against env stubs; do not invent live price IDs.
- **Stripe Connect platform profile** — enabling Connect, platform branding, and the payout descriptor are dashboard/human steps. Build against Connect test mode; stop and report if the platform profile is not provisioned (MB-12).
- **Live mode** — everything ships in test mode; flipping live keys is a human launch decision with the master map compliance section reviewed.
- **SFW boundary changes** — any request to make mature content Tip-eligible is a strategy change (card-network posture); stop and escalate.
- **Tip engagement metric** — MB-8 funnel stays on; below-target conversion is a product iteration signal after release, not a build stop.

## Non-goals (Phase 3)

- No Exposure Feed, no Boost ranking (fast-follow after this phase; MB-14 ships the *status* layer only).
- No storefront checkout (separate workstream; `isStorefrontListed` stub remains).
- No high-risk processor rail (deliberate deferral — master map Return-to).
- No changes to artist SaaS pricing/entitlements (Phase 1 owns those).

---

## Frozen contracts

### Environment

```
# --- Fan Premium (FAN_PREMIUM_BUILD_PLAN.md) ---
# RELAY_FAN_PREMIUM_ENABLED — master switch. Default off: fan plan routes 404, Tip beta behavior persists.
# STRIPE_PRICE_SUPPORTER / STRIPE_PRICE_CURATOR — recurring price IDs.
# STRIPE_PRICE_RELOAD_PACK — one-time price ID ($5 / 10 Tips).
# RELAY_TIP_ARTIST_PAYOUT_CENTS — default 33. Read from env so the atlas rate is not hardcoded.
# RELAY_PAYOUT_THRESHOLD_CENTS — default 2000 ($20).
```

### Plan parameters (single constants module: `src/billing/fan-plan-config.ts`)

| Plan | Monthly Tips | Reveal window | Free-preview window | Rollover cap |
|---|---|---|---|---|
| `free` | 0 (beta grant retired at launch — see MB-9) | — | 7 days | — |
| `supporter` | 5 | 14 days | 7 days | 10 |
| `curator` | 15 | 30 days | 14 days | 30 |

One module owns these; services read from it, never inline. (Window length now derives from plan, superseding `RELAY_TIPS_REVEAL_WINDOW_DAYS`.)

### Prisma (migration `*_fan_premium`, MB-9/MB-10/MB-12)

Phase 2 tables are reused unchanged. New:

```prisma
enum ArtistLedgerEntryKind {
  tip_earned
  bill_credit  // applied to the artist's Relay invoice via Stripe customer balance
  payout       // Stripe Connect transfer
  clawback
  adjust
}

/// Append-only artist earnings ledger, integer cents. ArtistBalance is the cache.
model ArtistLedgerEntry {
  id             String                @id @default(cuid())
  creatorId      String                @map("creator_id")
  entryKind      ArtistLedgerEntryKind @map("entry_kind")
  /// Signed cents: tip_earned +33; bill_credit/payout negative; clawback negative.
  amountCents    Int                   @map("amount_cents")
  revealId       String?               @map("reveal_id")
  payoutId       String?               @map("payout_id")
  /// Stripe customer balance transaction / invoice reference for bill_credit rows.
  stripeRef      String?               @map("stripe_ref")
  idempotencyKey String                @unique @map("idempotency_key")
  createdAt      DateTime              @default(now()) @map("created_at")

  @@index([creatorId, createdAt])
  @@map("artist_ledger_entries")
}

model ArtistBalance {
  creatorId      String   @id @map("creator_id")
  /// Can go negative only via clawback; settlement pauses until positive again.
  availableCents Int      @default(0) @map("available_cents")
  lifetimeCents  Int      @default(0) @map("lifetime_cents")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("artist_balances")
}

model PayoutAccount {
  creatorId              String   @id @map("creator_id")
  stripeConnectAccountId String   @unique @map("stripe_connect_account_id")
  onboardingStatus       String   @map("onboarding_status") // "pending" | "complete" | "restricted"
  payoutsEnabled         Boolean  @default(false) @map("payouts_enabled")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("payout_accounts")
}

model ArtistPayout {
  id               String    @id @default(cuid())
  creatorId        String    @map("creator_id")
  amountCents      Int       @map("amount_cents")
  status           String    // "requested" | "in_transit" | "settled" | "failed"
  stripeTransferId String?   @map("stripe_transfer_id")
  requestedAt      DateTime  @default(now()) @map("requested_at")
  settledAt        DateTime? @map("settled_at")
  failureReason    String?   @map("failure_reason")

  @@index([creatorId, requestedAt])
  @@index([status])
  @@map("artist_payouts")
}
```

Extensions in the same migration:

- `PlatformRevenueEventKind` add: `tip_purchase`, `bill_credit_applied`, `payout_requested` (Phase 2 added `tip_grant`/`tip_spend`; `payout_settled`, `refund_issued` already exist).
- `NotificationKind` add: `reveal_expiring` (fan, day-before close) and `tips_granted` (fan, monthly allowance landed).

### The waterfall (frozen semantics — master map locked decision)

Monthly, per creator, on their **artist billing anchor** (Phase 1 `PlanSubscription.currentPeriodEnd`, creator scope):

1. `credit = min(availableCents, upcoming invoice amount)`.
2. Apply as a Stripe **customer balance credit** on the artist's `BillingCustomer` → write `ArtistLedgerEntry(bill_credit, −credit, stripeRef)` + `PlatformRevenueEvent(bill_credit_applied)`.
3. Remainder stays in `availableCents` (cash-eligible).
4. Cash payout is **artist-initiated** (not automatic): requires `payoutsEnabled` and `availableCents ≥ RELAY_PAYOUT_THRESHOLD_CENTS`.
5. Artists with no paid Relay plan skip step 1–2 entirely (nothing to credit); earnings accrue as cash balance.

An artist can therefore earn, ride free, and never touch KYC unless they want cash out (master map compliance section).

### Clawback semantics (frozen)

- Fan subscription refund/chargeback (`charge.refunded`, `charge.dispute.*` webhooks): reverse **unspent** granted Tips from that invoice (`TipLedgerEntry(clawback)`); Tips already spent stay spent, and the corresponding `tip_earned` artist entries are **not** reversed for ordinary refunds (platform absorbs — fan-side margin covers it; atlas margins assume this).
- Chargeback on a Reload Pack: reverse unspent purchased Tips; spent portion → `ArtistLedgerEntry(clawback)` capped at that pack's earnings (fraud path, expected rare; audited).
- `ArtistBalance` negative only via clawback; waterfall and payout requests no-op until positive.

### API surface

| Route | Auth | Contract |
|---|---|---|
| `POST /api/v1/billing/checkout` (extend Phase 1) | patron session allowed | body adds `{ plan: "supporter" \| "curator" }` and `{ reload_pack: true }` (one-time mode) |
| `GET /api/v1/tips/wallet` (extend) | patron session | adds `{ plan, monthly_allowance, rollover_cap, next_grant_at }` |
| `GET /api/v1/creator/earnings` | creator session | `{ available_cents, lifetime_cents, this_month: { tips, earned_cents }, bill_credits: [...], entries: [...paged] }` |
| `POST /api/v1/creator/payouts/onboard` | creator session | → `{ onboarding_url }` (Connect Express account link) |
| `POST /api/v1/creator/payouts` | creator session | → 201 `{ payout_id, amount_cents }`; 409 `{ error: "below_threshold" \| "payouts_not_enabled" \| "balance_not_positive" }` |
| `GET /api/v1/creator/payouts` | creator session | payout history |

Webhook additions (Phase 1 router): `invoice.paid` (fan scope) → grant Tips per plan; `charge.refunded` / `charge.dispute.funds_withdrawn` → clawback flow; `account.updated` (Connect) → `PayoutAccount` status sync; `transfer` lifecycle → `ArtistPayout` status.

---

## Work items

| # | ID | Depends on | Goal | Key paths | Status |
|---|---|---|---|---|---|
| MB-9 | `fan-plans` | Phase 1 + 2 module exits | Supporter/Curator checkout, grant-on-invoice, plan-aware rollover caps + windows, Reload Packs, beta-grant retirement | `src/billing/`, `src/ledger/tip-ledger-service.ts`, `src/billing/fan-plan-config.ts`, `web/app/(consumer)/plans/` | **done** |
| MB-10 | `artist-earnings` | MB-9 | $0.33 `tip_earned` per reveal, artist ledger + balance, earnings dashboard | `src/ledger/artist-ledger-service.ts`, `src/tips/reveal-service.ts`, `web/app/studio/earnings/` | **done** |
| MB-11 | `bill-credit-waterfall` | MB-10 | Settlement worker → Stripe customer-balance credits on billing anchor | `src/ledger/settlement-service.ts`, `src/jobs/` | **done** |
| MB-12 | `connect-payouts` | MB-10 | Express onboarding, threshold payouts, transfer reconciliation, clawbacks | `src/payouts/`, `src/billing/webhook-router.ts` | **done** |
| MB-13 | `windows-and-nudges` | MB-9 | Plan-length windows, expiry worker upgrade, day-before `reveal_expiring` notification with offer attach | `src/tips/`, `src/jobs/`, `src/patron/notification-mapper.ts` | **done** |
| MB-14 | `curator-perks` | MB-9 | Curator badge + perks surface (no Boost ranking) | `web/app/(consumer)/`, `src/patron/` | **done** |

Recommended slicing: MB-9 → MB-10 are the vertical spine (money in → artist value visible); MB-11/MB-12/MB-13 can then proceed in parallel; MB-14 last.

---

## MB-9 `fan-plans`

Steps:

1. `src/billing/fan-plan-config.ts` per frozen plan-parameter table.
2. Extend Phase 1 checkout service for patron sessions: subscription mode (fan prices, `PlanSubscription.scope: "fan"`) and one-time mode (Reload Pack). Reload Pack fulfillment on `checkout.session.completed`: `TipLedgerEntry(purchase, +10, bucket: "purchased")` — purchased Tips never expire (master map compliance).
3. `invoice.paid` (fan scope) handler → `grantTips` with the plan's allowance; rollover cap becomes plan-dependent (cap parameter passed by caller; Phase 2 service signature already takes it — verify, adjust if it read env).
4. Plans page `web/app/(consumer)/plans/` — Free/Supporter/Curator comparison, patronage framing copy (master map: unlock currency + offer savings + "every Tip pays an artist" — never "pay for promos"), checkout hand-off, Reload Pack purchase for premium users.
5. Beta-grant retirement: the Phase 2 free monthly grant worker stops granting when `RELAY_FAN_PREMIUM_ENABLED` (free fans keep Free-Preview windows only). Grandfather any unspent beta Tips (they simply remain spendable; no clawback).

**Acceptance criteria:**

- Webhook lifecycle tests: subscribe Supporter → 5 Tips granted, cap 10; upgrade to Curator mid-cycle → plan updates, next grant 15/cap 30 (no mid-cycle re-grant); cancel → no further grants, balance remains spendable.
- Reload Pack: purchase → +10 purchased; duplicate webhook → single grant.
- Beta-off/premium-on transition covered by an explicit test (no double economy).
- Plans page web tests: all three plan states + premium-user reload CTA.

**Tests:** `tests/fan-plan-checkout.test.ts`, `tests/fan-plan-grants.test.ts`, `tests/web/fan-plans-page.test.tsx`.

## MB-10 `artist-earnings`

Steps:

1. `src/ledger/artist-ledger-service.ts` — mirror of the Tip ledger service (append entry + balance cache in one transaction, idempotency keys, `recomputeArtistBalance` oracle, `PlatformRevenueEvent` on every mutation). Only writer for artist money (invariant 3).
2. Reveal integration: `revealPost` (Phase 2) gains one step — after the spend entry, `ArtistLedgerEntry(tip_earned, +RELAY_TIP_ARTIST_PAYOUT_CENTS, revealId)` in the same transaction. Reveals by fans on the **free** plan (Free-Preview surfaces, no Tip spent) earn nothing.
3. `GET /api/v1/creator/earnings` per frozen contract.
4. Studio earnings dashboard `web/app/studio/earnings/`: balance, lifetime, this-month Tips, ledger table, and the hero stat placeholder "Fans covered $X of your bill" (populated by MB-11; renders $0 state until then). Reveal disclosure copy updates to "$0.33 goes to [artist]" in the reveal modal (MB-6 component).

**Acceptance criteria:**

- One reveal → exactly one `spend` (fan) + one `tip_earned` (artist) entry, same transaction (failure-injection test: artist entry failure rolls back the spend).
- Balance oracle test (recompute = cache) across earn/credit/payout/clawback interleavings.
- Earnings route: creator-scoped only (cross-tenant access 403 — `requireAccountMatchesCreator` pattern).

**Tests:** `tests/artist-ledger-service.test.ts`, `tests/reveal-earning-integration.test.ts`, `tests/creator-earnings-route.test.ts`, `tests/web/earnings-dashboard.test.tsx`.

## MB-11 `bill-credit-waterfall`

Steps:

1. `src/ledger/settlement-service.ts` — `settleCreatorOnce(prisma, stripe, creatorId)` implementing the frozen waterfall: read upcoming invoice (Stripe `invoices.retrieveUpcoming`), compute credit, create customer balance transaction (negative amount = credit), write `bill_credit` entry with `stripeRef`, emit events. Idempotency key = `(creatorId, billing period)`.
2. Settlement worker: new queue + repeat schedule (daily sweep selecting creators whose anchor falls due; mirror Phase 2 worker wiring in `src/jobs/`).
3. Earnings dashboard: populate "Fans covered $X of your bill this month" + bill-credit history rows.
4. Edge handling per frozen semantics: no paid plan → skip; negative balance → skip; credit > invoice → cap at invoice.

**Acceptance criteria:**

- Fixture matrix: balance < invoice, = invoice, > invoice, zero, negative, no-plan — each produces the exact expected entry set (or none).
- Re-running settlement for the same period is a no-op (idempotency test).
- Stripe unavailable → worker logs failure, no ledger entry written (never write `bill_credit` without a successful customer-balance transaction — order of operations test).

**Tests:** `tests/settlement-service.test.ts`, `tests/settlement-worker.test.ts` (Stripe mocked; contract assertions on the balance-transaction call).

## MB-12 `connect-payouts`

Steps:

1. `src/payouts/connect-onboarding-service.ts` — create Express account (creator's country/email), mint account links, sync `PayoutAccount` from `account.updated` webhooks.
2. `src/payouts/payout-service.ts` — `requestPayout(creatorId)`: threshold + enabled + positive checks → `ArtistPayout(requested)` + `ArtistLedgerEntry(payout, −amount)` + Stripe transfer, then reconcile status from transfer webhooks. Failure path restores balance via `adjust` entry with the failure reference (audited).
3. Clawback handlers per frozen semantics (fan refund/dispute webhooks → Tip + artist ledger reversals).
4. Payout center UI in the earnings dashboard: onboarding CTA ("Cash payouts are optional — bill credit needs no setup"), threshold progress bar, request button, history.

**Acceptance criteria:**

- Payout below threshold / not-enabled / negative balance → the three 409 wire errors.
- Transfer failure webhook → balance restored, `ArtistPayout.failed` with reason; no money leak (oracle test).
- Refund of a fan invoice with partially spent Tips → only unspent Tips clawed back; artist entries untouched (frozen semantics test).
- Connect never required for bill credit (an artist with no `PayoutAccount` still settles via MB-11 — integration test).

**Tests:** `tests/connect-onboarding.test.ts`, `tests/payout-service.test.ts`, `tests/clawback-flows.test.ts`.

## MB-13 `windows-and-nudges`

**Status:** **done**

Steps:

1. Window length from plan at reveal time (`fan-plan-config.ts`), stamped on `TipReveal.expiresAt` (never recomputed later — plan changes don't retro-shorten open windows).
2. Expiry worker (extend Phase 2 closer): day-before-expiry pass emits `OutboxEvent` → `reveal_expiring` notification per open reveal expiring within 24h (once per reveal — dedupe via `clusterKey` = reveal id in the mapper, `src/patron/notification-mapper.ts`); close pass sets `closedAt`.
3. Notification payload carries the post's active offer when present, enabling the atlas conversion hook copy ("Your access to [Artist]'s piece closes tomorrow — [offer]"). Respect existing `NotificationPreference` machinery; add the new kinds to preference defaults.
4. "Tip again to re-open" state on the re-blurred tile (fan UI) — the re-Skip economy loop (atlas).

**Acceptance criteria:**

- Clock-injected tests: notification exactly once at T−24h±sweep, close at T, re-Tip creates a fresh reveal + fresh earning.
- Supporter (14d) and Curator (30d) windows verified; upgrading plan mid-window does not alter an open window.
- Notification renders in the existing patron notification feed with offer attach (mapper test).

**Tests:** `tests/reveal-expiry-worker.test.ts`, extend notification mapper tests, `tests/web/reveal-expiring-states.test.tsx`.

## MB-14 `curator-perks`

**Status:** **done**

Steps:

1. Curator badge: plan-derived flag in patron profile wire payloads; badge rendered next to the fan's name on comments and public patron surfaces (`web/app/(consumer)/`, comment components).
2. Perks surface: "Your support this month" card (Tips spent, artists supported, cents routed to artists) — patronage status framing, no Boost mechanics.
3. Feature-flagged copy hook for future Boosts ("Boosts are coming for Curators") — copy only, no schema.

**Acceptance criteria:**

- Badge appears for active Curators only (lapsed → gone next payload; no stale caching).
- Perks card numbers derive from ledger truth (test against fixtures).

**Tests:** `tests/web/curator-badge.test.tsx`, `tests/curator-perks-payload.test.ts`.

---

## Exit checklist (Phase 3)

- [x] All six items `**done**`; root + `web/` test/build green; Supabase read-check on migrations.
- [ ] `RELAY_FAN_PREMIUM_ENABLED` off → Phase 2 beta behavior fully intact (regression sweep).
- [ ] End-to-end manual pass (Stripe test mode): fan subscribes Curator → 15 Tips → reveal (SFW check live) → artist earnings +$0.33 → settlement credits artist invoice → overflow payout to Connect test account → refund clawback verified.
- [ ] Double-entry audit clean: for the manual pass, `SUM(TipLedgerEntry)` and `SUM(ArtistLedgerEntry)` reconcile with `PlatformRevenueEvent` rows (write the reconciliation query into the ops route or a script).
- [ ] Dunning, duplicate-webhook, and dispute paths tested.
- [ ] Human launch review: compliance section of the master map re-read; live keys, Connect profile, plan copy ("$0.33 per preview" accuracy) signed off.

## Return to (deferred)

- **Exposure Feed + Boosts** — next workstream; `TipReveal.surface` and MB-14's copy hook are the integration points.
- **Server-side blur derivative** — must land before paid launch (carried from Phase 2 Return-to; verify).
- **Reload Pack demand check** — revisit $5/10 after 60 days of paid data (atlas Return-to).
- **Adult-segment rail** — high-risk processor decision remains deliberately open.
- **Revenue recognition** — bill credits net against SaaS MRR; align bookkeeping before scale (master map Return-to).
- **1099-K / tax reporting** for artist payouts at IRS thresholds — Stripe Connect handles filing; confirm platform settings at launch review.
