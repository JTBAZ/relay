# Monetization Master Map — Billing Spine + Fan Tip Economy

**Implementation canon** for how Relay's monetization is encoded end-to-end: schema, services, API, workers, webhooks, UX surfaces, and the invariants the platform must abide by.

Authority split:

- [financial-atlas.md](financial-atlas.md) — **what we charge and pay** (prices, payout rates, projections). If numbers here and there disagree, the atlas wins.
- **This document** — **how it is built**: domain model, money flow, gating, sequencing.
- [../monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md) — infra COGS guardrails and (later-phase) migration packaging. Its "creator size bands" pricing lever is **retired**; flat artist pricing is canon.
- [AUTOPOST_BUILD_PLAN.md](AUTOPOST_BUILD_PLAN.md) — the artist-tier feature ladder this map's Phase 1 entitlements gate (WI-12 lands here).
- [COACH_PLAN_CREDIT_BUILD_PLAN.md](COACH_PLAN_CREDIT_BUILD_PLAN.md) — the non-monetary Goal Cycle usage unit, quota ledger, and deferred top-up boundary.

---

## Locked decisions (July 2026 session)


| Decision                | Canon                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unlock currency name    | **Tips** (patronage framing; supersedes "Skips" in older docs)                                                                                                               |
| Fan pricing             | Supporter **$5/mo** (5 Tips) · Curator **$14.99/mo** (15 Tips + badge + perks) · Reload Pack **$5 / 10 Tips**                                                                |
| Artist payout per Tip   | **$0.33**, credited to the artist ledger at reveal time                                                                                                                      |
| Artist pricing          | Flat ladder per AUTOPOST_BUILD_PLAN: Studio Core $18 · Autopost $39 · Growth Engine $79. Never size-tiered.                                                                  |
| Schedule Rail events    | **Studio Core:** manual Create Event + one-off extension reminders; due post reminders open exact-text scheduled-post review (`/studio/distribution`). **Autopost:** Coach/Goal Cycle sequences, AI posting assistant (explicit per-destination prepare only — not on Rail authoring), future recurrence/smart timing/bulk. Gate automation, not event vocabulary. See [studio/PLAN_MANUAL_SOCIAL_EVENTS.md](studio/PLAN_MANUAL_SOCIAL_EVENTS.md). |
| Payment rails           | **Stripe** for all platform billing. Monetized fan surfaces are **SFW-only** (see Compliance).                                                                               |
| Payouts                 | **Stripe Connect at launch** (Express accounts), *after* the credit-first waterfall                                                                                          |
| Ledger settlement order | Tip earnings → **bill credit first** (up to the artist's Relay invoice) → cash balance → payout at **$20 threshold**                                                         |
| Tip expiry              | Granted (subscription) Tips **roll over, capped at 2× monthly allowance**. Purchased (Reload) Tips **never expire**.                                                         |
| v1 reveal surfaces      | **Discover grid + artist public pages**. Algorithmic Exposure Feed is a fast-follow.                                                                                         |
| Boosts                  | **Deferred** to the Exposure Feed phase. v1 status layer = Curator badge + perks.                                                                                            |
| Coach Plan credits      | Entitlement/quota unit for bounded Goal Cycle planning; **not Tips, money, or stored value**. Included allowances stay configurable pending pilot COGS; paid top-ups are deferred. |
| Build order             | **Phase 1** artist billing spine → **Phase 2** free-Tip instrumented beta → **Phase 3** paid fan tiers + waterfall + payouts → **Phase 4** frontend monetization integration |
| Escape Hatch            | Separate one-time independence product; creator owns generated site, infrastructure, processor, and subscription revenue. Price remains configurable pending delivery COGS. |
| Managed Patreon verification | Optional monthly Relay add-on for OAuth mediation/token upkeep/site-scoped entitlement assertions; creator-owned OAuth remains the replaceable independence path. |
| Escape Hatch maintenance | Delivery defects covered for 90 days; post-warranty upgrades, provider migration, operations, and future managed hosting are separately priced. |


---

## Coach Plan credit boundary

Coach Plan credits meter creator-side AI planning and are deliberately separate from the fan Tip economy and both financial ledgers.

- One credit covers research, one initial Plan, and up to two AI revisions; complete silence is free.
- The credit ledger is append-only and idempotent, but it does not emit money/revenue events or create a redeemable balance.
- Internal AI/provider units continue through `UsageEvent` for COGS.
- `CreatorPlanEntitlement` or equivalent configuration supplies included allowances; Product/Finance must set values after pilot cost evidence.
- No checkout, Reload-style pack, Stripe customer-balance treatment, payout, transfer, or cash value exists for Coach Plan credits.
- A later paid top-up program requires its own SKU, tax/refund/accounting, abuse, and support contract. The Goal Cycle program explicitly defers it.

See the dependency-ordered implementation packs at [`studio/goal-cycle-build-plans/00-README.md`](studio/goal-cycle-build-plans/00-README.md).

---

## Escape Hatch billing boundary

The construction and agent contract is [`studio/escape-hatch-build-plans/00-README.md`](studio/escape-hatch-build-plans/00-README.md). Escape Hatch does not use the Tip economy or artist-earnings ledger for the creator's independent website.

### Revenue products

1. **Construction fee:** one-time Relay checkout for assembly, migration, guided deployment, verification, and ownership handoff. Price is configurable; no patron-count bands or percentage of creator subscription revenue.
2. **Managed Patreon verification:** optional recurring Relay line item. Entitles a registered generated site to Relay-mediated OAuth/token maintenance and short-lived site-scoped Patreon entitlement assertions.
3. **Maintenance/hosting:** future or quoted services for post-warranty upgrades, provider changes, hands-on operations, and optional managed hosting. Not bundled silently into construction.

### Managed connector implementation

- Use the existing Relay creator billing spine (`BillingCustomer` / `PlanSubscription` or the final generalized product-entitlement abstraction), not the independent site's billing account.
- Give the connector its own configurable price ID/product key, subscription item, entitlement, feature flag, webhook/idempotency handling, grace/cancellation state, and invoice copy.
- Keep connector status separate from Studio Core/Autopost/Growth Engine feature ladders unless Finance explicitly chooses bundling later.
- Cancellation stops new managed verification after the disclosed service/grace date; it never deletes the generated site's users, media, native posts, independent subscriptions, or admin.
- The site must support migration to creator-owned Patreon OAuth without rebuild.
- Meter service health/usage for COGS, but do not turn Patreon patrons or revenue into billable units.

### Independent-site money flow

- The creator opens and owns the processor account and is the business patrons pay.
- Relay takes no application fee or revenue percentage in v1.
- Stripe is offered only to eligible creator businesses. Lawful categories Stripe prohibits require a separately approved billing adapter; Relay never hides or misclassifies content.
- Provider charges, tax, refunds, disputes, and negative balances belong to the creator/provider relationship.

### Finance gates

Do not set public prices until cohort evidence covers construction labor, media transfer, support, warranty reserve, connector infrastructure, incident/privacy burden, attach rate, churn, and margin. Update [`financial-atlas.md`](financial-atlas.md) when those prices are locked.

---

## Platform invariants (the format the app must abide by)

These are non-negotiable rules enforced in code review and tests, not just convention:

1. **Integer money.** All currency amounts are integer cents (`amountCents`, matching `PlatformRevenueEvent`). All Tip quantities are integer counts. No floats anywhere in the money path.
2. **The ledger is truth; balances are caches.** `TipLedgerEntry` and `ArtistLedgerEntry` are append-only. `TipWallet` / `ArtistBalance` rows are materialized aggregates that must always be recomputable from entries. Corrections are new `adjust`/`clawback` entries, never updates or deletes.
3. **One writer.** Only `src/ledger/` services mutate ledger tables and balance caches. Billing, reveals, settlement, and payouts all call through it. No route handler touches these tables directly.
4. **Every ledger mutation emits events.** One `PlatformRevenueEvent` (audit/finance) and one `UsageEvent` (per-tenant metering) per mutation, written in the same transaction or via `OutboxEvent`.
5. **Idempotency everywhere money moves.** Every Stripe webhook, Tip spend, grant, and payout carries an idempotency key with a unique constraint (pattern: `IngestIdempotencyKey`). Replays are no-ops.
6. **Server-side gating only.** Plan entitlements are enforced at the API (extending the WI-12 principle and `requireAccountMatchesCreator` guards). UI hiding is presentation, never security.
7. **SFW gate on monetized surfaces.** A post is ineligible for Tip reveals, Offers-in-reveal, and any paid placement when `isPostMatureFromPatronSurfaces` resolves true (`GalleryVisibility.review` = Adult 18+, `src/gallery/mature-post-ids.ts`). Enforced at **both** promo-eligibility read time and reveal spend time. Artist SaaS billing carries no content restriction.
8. **Patreon-origin bedrock.** The economy attaches to Relay-owned surfaces (promo slots, reveals, offers). It never mutates imported Patreon snapshots (`.cursor/rules/patreon-origin-relay-bedrock.mdc`).
9. **No tax on creator subscription revenue.** No percentage of Patreon income, no ledger debits against Patreon earnings, ever (atlas ruled-out list).
10. **Accurate money copy.** "Artists earn $0.33 per preview" — never "100% of Tip value." Paid/boosted placement is always labeled.
11. **Staged rollout behind flags.** Every phase ships dark behind `CreatorFeatureFlag` (artist side) and a fan-side plan/flag check, enabled per tenant before general release.
12. **Escape Hatch independence.** Construction, optional OAuth mediation, and maintenance are disclosed service charges. Relay never takes a cut of the generated site's patron subscriptions, and optional Relay-service cancellation cannot disable native site operation.

---

## Domain model (new Prisma)

Follows repo conventions: cuid ids, `@map` snake_case, `@@map` plural tables. Sketches below are the contract; exact migrations go through the normal Prisma + Supabase read-check process.

### Billing spine (Phase 1)

```prisma
enum CreatorPlan {
  studio_core
  autopost
  growth_engine
}

enum FanPlan {
  free
  supporter
  curator
}

enum SubscriptionStatus {
  active
  past_due
  canceled
  incomplete
  trialing
}

/// One Stripe customer per Relay account (artist and fan billing share it).
model BillingCustomer {
  accountId        String   @id @map("account_id")
  stripeCustomerId String   @unique @map("stripe_customer_id")
  livemode         Boolean  @default(false)
  createdAt        DateTime @default(now()) @map("created_at")

  @@map("billing_customers")
}

/// Mirror of a Stripe subscription. Scope tells us which ladder it belongs to.
model PlanSubscription {
  id                   String             @id @default(cuid())
  accountId            String             @map("account_id")
  scope                String             // "creator" | "fan"
  creatorPlan          CreatorPlan?       @map("creator_plan")
  fanPlan              FanPlan?           @map("fan_plan")
  stripeSubscriptionId String             @unique @map("stripe_subscription_id")
  status               SubscriptionStatus
  currentPeriodStart   DateTime           @map("current_period_start")
  currentPeriodEnd     DateTime           @map("current_period_end")
  cancelAtPeriodEnd    Boolean            @default(false) @map("cancel_at_period_end")
  updatedAt            DateTime           @updatedAt @map("updated_at")

  @@index([accountId, scope])
  @@map("plan_subscriptions")
}

/// Resolved entitlement snapshot (degraded-mode safe, mirrors PatronEntitlementSnapshot pattern).
/// WI-12 gates Better/Best Autopost features against this table.
model CreatorPlanEntitlement {
  creatorId   String      @id @map("creator_id")
  plan        CreatorPlan
  source      String      // "stripe" | "operator_grant" | "pilot"
  effectiveAt DateTime    @map("effective_at")
  expiresAt   DateTime?   @map("expires_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@map("creator_plan_entitlements")
}
```

### Tip economy (Phases 2–3)

```prisma
enum TipEntryKind {
  grant      // monthly allowance from a fan subscription
  purchase   // Reload Pack
  spend      // reveal
  expire     // rollover-cap trim at grant time
  clawback   // refund/chargeback reversal
  adjust     // operator correction (audited)
}

/// Append-only fan Tip ledger. Balances live on TipWallet; this is the truth.
model TipLedgerEntry {
  id             String       @id @default(cuid())
  accountId      String       @map("account_id")
  entryKind      TipEntryKind @map("entry_kind")
  /// Signed. grant/purchase positive; spend/expire/clawback negative.
  tips           Int
  /// "granted" | "purchased" — which bucket this entry moves.
  bucket         String
  revealId       String?      @map("reveal_id")
  stripeRef      String?      @map("stripe_ref")
  periodKey      String?      @map("period_key") // e.g. "2026-09" for grants
  idempotencyKey String       @unique @map("idempotency_key")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@index([accountId, createdAt])
  @@map("tip_ledger_entries")
}

/// Materialized wallet. grantedBalance obeys the 2x-allowance rollover cap;
/// purchasedBalance never expires. Spend order: granted first, then purchased.
model TipWallet {
  accountId        String   @id @map("account_id")
  grantedBalance   Int      @default(0) @map("granted_balance")
  purchasedBalance Int      @default(0) @map("purchased_balance")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("tip_wallets")
}

/// A Tip spend: timed access window to one post's media for one fan.
model TipReveal {
  id              String   @id @default(cuid())
  patronAccountId String   @map("patron_account_id")
  creatorId       String   @map("creator_id")
  postId          String   @map("post_id")
  promoSlotId     String?  @map("promo_slot_id")
  offerId         String?  @map("offer_id") // PostMarketingOffer shown in the reveal modal
  surface         String   // "discover" | "artist_page" | (later) "exposure_feed"
  tipsSpent       Int      @default(1) @map("tips_spent")
  revealedAt      DateTime @default(now()) @map("revealed_at")
  expiresAt       DateTime @map("expires_at") // Supporter 14d, Curator 30d
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([patronAccountId, postId, revealedAt])
  @@index([patronAccountId, expiresAt])
  @@index([creatorId, revealedAt])
  @@map("tip_reveals")
}

enum ArtistLedgerEntryKind {
  tip_earned
  bill_credit  // applied to the artist's Relay invoice (Stripe customer balance)
  payout       // Stripe Connect transfer
  clawback
  adjust
}

/// Append-only artist earnings ledger, denominated in cents.
model ArtistLedgerEntry {
  id             String                @id @default(cuid())
  creatorId      String                @map("creator_id")
  entryKind      ArtistLedgerEntryKind @map("entry_kind")
  /// Signed cents. tip_earned positive (+33); bill_credit/payout negative.
  amountCents    Int                   @map("amount_cents")
  revealId       String?               @map("reveal_id")
  payoutId       String?               @map("payout_id")
  invoiceRef     String?               @map("invoice_ref")
  idempotencyKey String                @unique @map("idempotency_key")
  createdAt      DateTime              @default(now()) @map("created_at")

  @@index([creatorId, createdAt])
  @@map("artist_ledger_entries")
}

/// Materialized artist balance.
model ArtistBalance {
  creatorId      String   @id @map("creator_id")
  availableCents Int      @default(0) @map("available_cents")
  lifetimeCents  Int      @default(0) @map("lifetime_cents")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("artist_balances")
}

/// Stripe Connect Express account for cash payouts (overflow beyond bill credit).
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

  @@index([creatorId, requestedAt])
  @@map("artist_payouts")
}
```

### Extensions to existing models

- `PlatformRevenueEventKind`: add `tip_purchase`, `tip_spend`, `tip_grant`, `bill_credit_applied`, `payout_requested` (existing `payout_settled`, `refund_issued`, subscription kinds are reused).
- `NotificationKind`: add `reveal_expiring` (day-before "closing soon" — the atlas conversion hook) and `tips_granted`.
- `CreatorPromoSlot`: add `tipEligible Boolean` (computed default: true when not mature and no active storefront listing — atlas storefront-protection rule).
- **Reused as-is:** `PostMarketingOffer` + `MarketingOfferClickEvent` (the offer shown inside the reveal modal and its telemetry), `CreatorPatreonDiscountCode`, `UsageEvent`, `JobRun`, `OutboxEvent`, `IngestIdempotencyKey` pattern.

---

## Money flow — the blood vessels, end to end

```
 FAN SIDE                                          ARTIST SIDE
 ────────                                          ───────────
 Stripe Checkout (fan plan / Reload Pack)
        │  webhook: invoice.paid / checkout.completed
        ▼
 src/billing/webhook-router ──────────────────────► PlatformRevenueEvent
        │ idempotent
        ▼
 src/ledger/tip-ledger-service
   grant N Tips (rollover cap trims excess          
   as an `expire` entry) / add purchased Tips
        │
        ▼
 Fan browses Discover / artist page
   blurred SFW promo tile + Tip CTA
        │  POST /api/v1/tips/reveals
        ▼
 src/tips/reveal-service
   1. SFW check (isPostMatureFromPatronSurfaces)
   2. wallet check (granted first, then purchased)
   3. create TipReveal (14d/30d window)
   4. TipLedgerEntry(spend, −1)
   5. ArtistLedgerEntry(tip_earned, +33¢) ────────► artist earnings dashboard
   6. PlatformRevenueEvent + UsageEvent
        │
        ▼
 Reveal modal: full media + PostMarketingOffer
   CTA (tracked offer link / storefront code)
        │
        ▼                                           monthly, on artist billing anchor:
 reveal-expiry worker                               src/ledger settlement worker
   day-29 `reveal_expiring` notification              ArtistBalance → Stripe customer
   window closes → re-blur, "Tip again"               balance credit, up to invoice
                                                      (ArtistLedgerEntry bill_credit)
                                                            │ overflow stays available
                                                            ▼
                                                    payout worker (balance ≥ $20 and
                                                    PayoutAccount.payoutsEnabled)
                                                      → Stripe Connect transfer
                                                      → ArtistLedgerEntry(payout)

 Refund/chargeback webhook → clawback entries on both ledgers (never edits history).
```

**Bill-credit mechanics:** credits apply via Stripe **customer balance transactions** on the artist's `BillingCustomer`, so Stripe automatically nets them against the next invoice — no invoice surgery, and the artist sees "Your fans covered $X of this month's bill" both in Studio and on the Stripe invoice itself.

**Spend-order rule:** granted (expiring-ish) Tips spend before purchased (never-expiring) Tips, minimizing stored-value liability while feeling fair.

---

## Services and API surface

New modules (existing `src/payments/` clone-checkout stubs stay untouched; SaaS billing is a separate concern):


| Module         | Responsibility                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/billing/` | Stripe client, webhook router, Checkout session creation, `PlanSubscription`/`CreatorPlanEntitlement` sync, customer-balance credits |
| `src/ledger/`  | **Sole writer** for both ledgers + balance caches; settlement waterfall; clawbacks                                                   |
| `src/tips/`    | Reveal service (SFW + wallet + window), grant service, expiry logic, wallet reads                                                    |
| `src/payouts/` | Connect Express onboarding, payout requests, transfer reconciliation                                                                 |


Routes (all gated server-side; consumer routes require patron session, studio routes pass `requireAccountMatchesCreator`):

- `POST /api/v1/billing/checkout` — start Stripe Checkout (artist plan, fan plan, or Reload Pack)
- `POST /api/v1/billing/webhook` — Stripe events (signature-verified, idempotent)
- `GET /api/v1/billing/subscription` — current plan + period for the session account
- `GET /api/v1/tips/wallet` — balances + next grant date
- `POST /api/v1/tips/reveals` — spend a Tip (body: postId, surface)
- `GET /api/v1/tips/reveals` — active windows for the fan (drives "expiring soon" UI)
- `GET /api/v1/creator/earnings` — balance, ledger page, bill-credit history
- `POST /api/v1/creator/payouts/onboard` — Connect onboarding link
- `POST /api/v1/creator/payouts` — request payout (threshold-checked)

Workers (registered in `src/main.ts` / `src/worker.ts`, `JobRun`-tracked like the posting-goal worker):

- `reveal-expiry-worker` — daily: day-before `reveal_expiring` notifications; closes windows.
- `ledger-settlement-worker` — on artist billing anchor: waterfall step (balance → customer credit).
- `payout-reconcile-worker` — confirms Connect transfer settlement, marks `ArtistPayout` settled.

(Tip grants are webhook-driven on `invoice.paid`, not cron — no drift between payment and allowance.)

---

## UX surfaces

**Fan (`web/app/(consumer)/`):**

- **Plans page** — Free / Supporter / Curator comparison; Stripe Checkout hand-off; Reload Pack purchase for existing premium users.
- **Wallet chip** in the consumer header — Tip count, tap for grant date + reveal windows.
- **Blurred promo tiles** on Discover and artist public pages — SFW promo-pool items render blurred/watermarked with a Tip CTA (free users see an upgrade prompt).
- **Reveal modal** — full media, access-window countdown, artist's `PostMarketingOffer` CTA, "subscribe on Patreon" tracked link, "Tip funds this artist: $0.33" disclosure line.
- **Expiring-access notifications** — day-29 nudge with the artist's offer attached (the atlas conversion hook).

**Artist (`web/app/studio/`):**

- **Earnings dashboard** — balance, lifetime, ledger, and the hero stat: *"Your fans covered $X of your bill this month."*
- **Promo Pool manager additions** — per-item Tip-eligibility state with plain-language reasons ("Rated 18+ — not eligible for the Tip economy", "Storefront listing — excluded by default").
- **Payout center** — Connect onboarding, threshold progress, payout history.

**Ops:** feature-flag flips per tenant (existing script pattern), revenue-event visibility through existing operator surfaces.

---

## Compliance guardrails

- **Stripe posture.** Artist SaaS billing = software fees, no content restriction. Fan-side monetized surfaces = **SFW only** (invariant 7); a fan transaction that unlocks adult content would make Relay an adult-content merchant under card-network rules. This boundary is what keeps the platform on mainstream rails. Revisit with a high-risk secondary rail (CCBill/Segpay) only as a deliberate later decision.
- **Stored value.** Purchased Tips never expire (gift-card law). Granted Tips are a subscription benefit, not purchased value — rollover cap and expiry are lawful and disclosed. Tips are non-transferable and non-redeemable for cash by fans (keeps Relay out of money-transmitter territory).
- **Refunds/chargebacks.** Clawback entries reverse grants and, where reveals were consumed, net against artist balances. Artist balances can go negative only via clawback; settlement pauses until positive.
- **Payout KYC.** Stripe Connect Express handles identity, W-8BEN, and tax forms at onboarding. Bill credit requires **no** payout onboarding — an artist can earn and ride free without ever doing KYC.
- **Disclosure.** "$0.33 per preview goes to the artist" (accurate spread framing per the atlas); paid placement always labeled; offer links tracked transparently.

---

## Phased work items

Each phase has an itemized, worker-agent-iterable build plan with frozen contracts, acceptance criteria, and inline status tracking. **The build plans are the execution canon**; the tables below are the summary index. Where a build plan's contract differs from a sketch in this document, the build plan wins.

### Phase 1 — Artist billing spine (prerequisite for everything)

**Build plan: [BILLING_SPINE_BUILD_PLAN.md](BILLING_SPINE_BUILD_PLAN.md)**


| ID                           | Goal                                                                                                                                                                                     | Key paths                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| MB-1 `stripe-foundation`     | Stripe SDK, env + kill-switch, `BillingCustomer`, signature-verified webhook route, `PlatformRevenueEvent` wiring                                                                        | `src/billing/`, `.env.example`, `src/server.ts` |
| MB-2 `artist-plans-checkout` | Products/prices for $18/$39/$79, Checkout flow, `PlanSubscription` sync                                                                                                                  | `src/billing/`, `web/app/studio/settings/`      |
| MB-3 `plan-entitlements`     | `CreatorPlanEntitlement` + resolution service + degraded mode; **implements Autopost WI-12** server-side gating; AI-token `UsageEvent` metering (closes the `src/ai/ai-service.ts` TODO) | `src/billing/`, `src/ai/`, `src/usage/`         |
| MB-4 `billing-ux`            | Plan management UI, dunning states, operator grant path (pilot artists ride free via `operator_grant`)                                                                                   | `web/app/studio/`, ops script                   |


### Phase 2 — Tip beta (free, instrumented — measures the one number we lack)

**Build plan: [TIP_BETA_BUILD_PLAN.md](TIP_BETA_BUILD_PLAN.md)**


| ID                       | Goal                                                                                                            | Key paths                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| MB-5 `tip-ledger-core`   | Ledgers, wallets, reveal service, SFW gate, idempotency; granted-only Tips via operator flag                    | `src/ledger/`, `src/tips/`, migration                   |
| MB-6 `reveal-ux`         | Blurred tiles on Discover + artist pages, reveal modal with `PostMarketingOffer` CTA, wallet chip               | `web/app/(consumer)/`, `src/patron/discover-service.ts` |
| MB-7 `promo-eligibility` | `tipEligible` on promo slots, storefront exclusion default, Studio eligibility UI                               | `src/marketing/`, `web/app/studio/promos/`              |
| MB-8 `beta-telemetry`    | Reveal/engagement funnels via `RelayEngagementEvent` + `UsageEvent`; engagement dashboard for release iteration | `src/analytics/`                                        |


**Phase 2 → 3 strategy:** build Phase 3 on the atlas guess; use the tip funnel (≥15% of active fans spend ≥1 free Tip/mo) to **observe and adjust** after release. Do not chicken-and-egg the paid system over waiting for beta data. Cold engagement → iterate supply, surfaces, or pricing — not a build stop.

### Phase 3 — Paid fan tiers + waterfall + payouts

**Build plan: [FAN_PREMIUM_BUILD_PLAN.md](FAN_PREMIUM_BUILD_PLAN.md)** (Phase 2 tip modules are prerequisites; engagement metric is observe-and-adjust, not a hard gate)


| ID                            | Goal                                                                                   | Key paths                        |
| ----------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| MB-9 `fan-plans`              | Supporter/Curator Checkout, grant-on-invoice webhook, rollover cap, Reload Packs       | `src/billing/`, `src/ledger/`    |
| MB-10 `artist-earnings`       | $0.33 earning per reveal, earnings dashboard, "fans covered $X" stat                   | `src/ledger/`, `web/app/studio/` |
| MB-11 `bill-credit-waterfall` | Settlement worker → Stripe customer-balance credits on billing anchor                  | `src/ledger/`, `src/billing/`    |
| MB-12 `connect-payouts`       | Express onboarding, $20 threshold, transfer + reconciliation, clawback handling        | `src/payouts/`                   |
| MB-13 `windows-and-nudges`    | Reveal expiry worker, day-29 `reveal_expiring` notification with offer attach          | `src/jobs/`, `src/patron/`       |
| MB-14 `curator-perks`         | Badge, perks-for-your-artist surface (Boost mechanics deferred to Exposure Feed phase) | `web/app/(consumer)/`            |


### Phase 4 — Frontend monetization integration

**Build plan: [FRONTEND_MONETIZATION_BUILD_PLAN.md](FRONTEND_MONETIZATION_BUILD_PLAN.md)** (MB-1–14 are prerequisites; this phase connects the completed rails to entitlement-aware product journeys)


| ID                                        | Goal                                                                                                              | Key paths                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| MB-15 `frontend-monetization-integration` | Studio entitlement walls + billing deep-links, consumer plan funnel, onboarding plan steps, and Connect payout UI | `src/billing/`, `src/server.ts`, `web/app/studio/`, `web/app/(consumer)/`, `web/app/components/onboarding/`, `web/lib/` |


**Mandatory frontend canon:** builders must read [RELAY_DESIGN_CODE.md](RELAY_DESIGN_CODE.md) in full before changing `web/`.

**Separate construction program:** Escape Hatch packaging, hard paywall, independent billing adapters, deployment, ownership handoff, and managed Patreon verification are specified in [`studio/escape-hatch-build-plans/`](studio/escape-hatch-build-plans/00-README.md). Its Relay invoice items reuse the billing spine but do not share the independent site's money flow.

---

## Return-to list

- **Adult-segment monetization rail** — dual-rail high-risk processor decision, deliberately deferred; SFW-only boundary holds until then.
- **Escape Hatch lawful alternate billing adapter** — separate from Relay fan monetization; requires provider-policy, sandbox, security, and human approval before the wizard advertises it.
- **Reload Pack pricing sanity** — re-verify $5/10 against observed reveal demand before enabling purchase.
- **Boost economics** — funded by Premium subscriptions per the atlas; design against real feed-ranking when the Exposure Feed lands.
- **Revenue recognition** — bill credits net against SaaS MRR; align bookkeeping treatment before scale.
- **RLS posture** — app tables currently rely on application-scoped filters (MIG-50); revisit whether ledger tables warrant DB-level policies given their sensitivity.

---

*Created July 2026 from the fan-economy structuring session. Update alongside `financial-atlas.md` when pricing or payout mechanics change.*