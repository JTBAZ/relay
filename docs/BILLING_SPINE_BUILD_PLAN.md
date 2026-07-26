# Billing Spine — Build Plan (Monetization Phase 1)

**Status:** MB-1 **done**. MB-2 **done**. MB-3 **done**. MB-4 **done**.
**Scope:** Stripe foundation + artist SaaS subscriptions ($18/$39/$79) + server-side plan entitlements (implements Autopost WI-12) + AI token metering. No fan-side money, no Tips, no payouts.
**Related:**

- Canon for decisions + invariants: [MONETIZATION_MASTER_MAP.md](MONETIZATION_MASTER_MAP.md) — read the **Platform invariants** and **Locked decisions** sections before any work item.
- Prices and payout rates: [financial-atlas.md](financial-atlas.md)
- Tier → feature mapping this plan gates: [AUTOPOST_BUILD_PLAN.md](AUTOPOST_BUILD_PLAN.md) (Good/Better/Best table, WI-12)
- Next phases: [TIP_BETA_BUILD_PLAN.md](TIP_BETA_BUILD_PLAN.md) (Phase 2), [FAN_PREMIUM_BUILD_PLAN.md](FAN_PREMIUM_BUILD_PLAN.md) (Phase 3), [FRONTEND_MONETIZATION_BUILD_PLAN.md](FRONTEND_MONETIZATION_BUILD_PLAN.md) (MB-15 presentation + onboarding integration).

**Contract authority:** The schema/API/webhook contracts in this document are the frozen implementation contracts for Phase 1. The master map's Prisma sketches are illustrative; where they differ, this document wins. Do not change a frozen contract mid-phase — if a contract must change, update this doc first and note it in the Return-to list.

---

## Worker-agent session protocol

1. Read this doc top to bottom, then the master map invariants, then the key paths of your work item.
2. Claim exactly one work item (or one sub-item). Set its status cell to `**in progress`** in the table below; set `**done**` only when all acceptance criteria pass.
3. Verify before marking done: `npm run test`, `npm run build` from repo root; migrations applied through the normal Prisma + Supabase read-check process (`.cursor/rules/supabase-mcp-read-check.mdc`).
4. If backend/web/env changed, restart the dev stack per `.cursor/rules/rescue-workflow-always.mdc` (`npm run dev:stack:restart`).
5. If you hit a human gate (below), stop and report — do not improvise around it.

## Human gates (stop conditions)

- **Stripe account + test-mode API keys** do not exist in the repo. If `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are absent from the environment, build against the documented contract with the SDK in test mode expectations, keep all code paths behind `RELAY_BILLING_ENABLED`, and report the missing keys — never fabricate keys or skip signature verification.
- **Price IDs** (`STRIPE_PRICE_STUDIO_CORE` etc.) are created by a human in the Stripe dashboard. Code reads them from env; never hardcode price amounts in code (amounts live in Stripe + financial atlas).
- **Live payments stay off.** `RELAY_ALLOW_LIVE_PAYMENTS` is owned by the legacy clone-checkout stubs (`src/payments/`) and is out of scope here; the new billing module has its own `RELAY_BILLING_ENABLED` switch, default off. Never enable live mode.
- Webhook endpoint registration in the Stripe dashboard is a human step; document the URL, don't attempt it.

## Non-goals (Phase 1)

- No fan plans, Tips, wallets, reveals (Phase 2/3).
- No Stripe Connect, payouts, or bill-credit waterfall (Phase 3) — but see MB-1: `BillingCustomer` is shared with fan billing later, so its shape is frozen here.
- No changes to `src/payments/` (clone-site checkout stubs — different concern, leave untouched).
- No proration/seat logic — plans are flat, one subscription per creator account.

---

## Frozen contracts

### Environment (`.env.example` additions — MB-1)

```
# --- Relay SaaS billing (Stripe) — Phase 1 (BILLING_SPINE_BUILD_PLAN.md) ---
# RELAY_BILLING_ENABLED — master switch (1/true). Default off: all billing routes 404, no Stripe calls.
# STRIPE_SECRET_KEY — test-mode key (sk_test_...) until launch review.
# STRIPE_WEBHOOK_SECRET — endpoint signing secret (whsec_...); webhook handler MUST verify signatures.
# STRIPE_PRICE_STUDIO_CORE / STRIPE_PRICE_AUTOPOST / STRIPE_PRICE_GROWTH_ENGINE — recurring price IDs.
# RELAY_BILLING_PORTAL_RETURN_URL — where Stripe Billing Portal sends the artist back (Studio settings).
```

### Prisma (migration `*_billing_spine`, MB-1 + MB-3)

Conventions: cuid ids, `@map` snake_case columns, `@@map` plural snake_case tables — match `prisma/schema.prisma` style.

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

/// One Stripe customer per Relay Account. Shared by artist (Phase 1) and fan (Phase 3) billing.
model BillingCustomer {
  accountId        String   @id @map("account_id")
  stripeCustomerId String   @unique @map("stripe_customer_id")
  livemode         Boolean  @default(false)
  createdAt        DateTime @default(now()) @map("created_at")

  @@map("billing_customers")
}

/// Local mirror of a Stripe subscription. `scope` discriminates the artist vs fan ladder.
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
  createdAt            DateTime           @default(now()) @map("created_at")
  updatedAt            DateTime           @updatedAt @map("updated_at")

  @@index([accountId, scope])
  @@index([status])
  @@map("plan_subscriptions")
}

/// Resolved creator entitlement (WI-12 gate target). One row per creator; degraded-mode-safe read.
model CreatorPlanEntitlement {
  creatorId   String      @id @map("creator_id")
  plan        CreatorPlan
  source      String      // "stripe" | "operator_grant" | "pilot"
  effectiveAt DateTime    @map("effective_at")
  expiresAt   DateTime?   @map("expires_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@map("creator_plan_entitlements")
}

/// Idempotent webhook ingestion (unique on Stripe event id).
model BillingWebhookEvent {
  stripeEventId String   @id @map("stripe_event_id")
  eventType     String   @map("event_type")
  processedAt   DateTime @default(now()) @map("processed_at")

  @@index([eventType, processedAt])
  @@map("billing_webhook_events")
}
```

### Stripe webhook events handled (MB-2)


| Event                           | Effect                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | Ensure `BillingCustomer`; create/refresh `PlanSubscription`; upsert `CreatorPlanEntitlement`                    |
| `customer.subscription.updated` | Sync status/period/plan; re-resolve entitlement (upgrade/downgrade)                                             |
| `customer.subscription.deleted` | Mark `canceled`; entitlement falls back to `studio_core`-if-paid-else-none resolution                           |
| `invoice.paid`                  | `PlatformRevenueEvent(subscription_created | checkout_completed)` + `UsageEvent` (Phase 3 adds Tip grants here) |
| `invoice.payment_failed`        | Status `past_due`; dunning surface in Studio (MB-4)                                                             |


Every handler: verify signature with `STRIPE_WEBHOOK_SECRET`; insert `BillingWebhookEvent` first (unique violation = already processed = 200 no-op); write `PlatformRevenueEvent` rows (`prisma/schema.prisma` → `PlatformRevenueEvent`, integer cents, `sourceLabel: relay_native`, `provider: "stripe"`).

### API surface (all JSON; wire fields snake_case like existing wire types)


| Route                                 | Auth                                                                                   | Contract                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/billing/checkout`       | creator session (`requireAccountMatchesCreator` pattern)                               | body `{ plan: "studio_core" | "autopost" | "growth_engine" }` → `{ checkout_url }`                                                 |
| `POST /api/v1/billing/portal`         | creator session                                                                        | → `{ portal_url }` (Stripe Billing Portal session)                                                                                 |
| `GET /api/v1/billing/subscription`    | creator session                                                                        | → `{ scope, plan, status, current_period_end, cancel_at_period_end }` or `{ plan: null }`                                          |
| `POST /api/v1/billing/webhook`        | Stripe signature only (no session; raw body)                                           | 2xx on handled/duplicate; 400 on bad signature                                                                                     |
| `POST /api/v1/ops/creator-plan-grant` | operator auth (mirror existing ops route pattern for feature flags in `src/server.ts`) | body `{ creator_id, plan, expires_at? }` → entitlement row (`source: "operator_grant"`), audited via `PlatformOperatorAccessAudit` |


### Entitlement resolution (MB-3, frozen semantics)

`resolveCreatorPlan(prisma, creatorId)` in `src/billing/creator-plan-entitlement-service.ts`:

1. Non-expired `operator_grant`/`pilot` row wins (manual override, pilot artists ride free).
2. Else active/trialing `PlanSubscription` (scope `creator`) via the creator's `Account`.
3. Else `null` (no paid plan — free sync/backup/basic gallery per master map freemium boundary).
4. Result is written back to `CreatorPlanEntitlement` (snapshot pattern, cf. `PatronEntitlementSnapshot`) so reads never depend on Stripe availability (degraded mode).

Gate helper (used by routes): `requireCreatorPlanAtLeast(plan)` — ladder order `studio_core < autopost < growth_engine`. HTTP 402 with wire body `{ error: "plan_required", required_plan }` when unmet. **Server-side only; UI hiding is presentation** (master map invariant 6).

Relationship to `CreatorFeatureFlag`: the existing `posting_assistant_enabled` flag becomes an *additional* override on top of plan gating during migration (flag OR plan unlocks Coach), so pilot creators don't lose access the day this lands. Retire the flag in a later cleanup (Return-to).

---

## Work items


| #    | ID                      | Depends on | Goal                                                                                                                         | Key paths                                                                                                                                             | Status   |
| ---- | ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| MB-1 | `stripe-foundation`     | —          | Stripe SDK, env switch, `BillingCustomer`, webhook route skeleton with signature verification + idempotency, migration       | `src/billing/stripe-client.ts`, `src/billing/webhook-router.ts`, `prisma/`, `src/server.ts`, `.env.example`                                           | **done** |
| MB-2 | `artist-plans-checkout` | MB-1       | Checkout + portal sessions, subscription sync from webhooks, `PlatformRevenueEvent` wiring                                   | `src/billing/checkout-service.ts`, `src/billing/subscription-sync.ts`, `src/server.ts`                                                                | **done** |
| MB-3 | `plan-entitlements`     | MB-1       | Entitlement resolution + gate helper; wire gates onto Better/Best surfaces (WI-12); AI token metering in the `src/ai` facade | `src/billing/creator-plan-entitlement-service.ts`, `src/middleware/`, `src/ai/ai-service.ts`, `src/usage/usage-events.ts` call sites, `src/server.ts` | **done** |
| MB-4 | `billing-ux`            | MB-2, MB-3 | Studio plan page (current plan, upgrade, portal link, dunning banner), operator grant route + script                         | `web/app/studio/settings/billing/`, `web/lib/relay-api.ts`, `src/server.ts`, `scripts/grant-creator-plan.mjs`                                         | **done** |


---

## MB-1 `stripe-foundation`

**Goal:** the repo can talk to Stripe safely, or not at all — nothing half-configured.

Steps:

1. `npm install stripe` (runtime dependency, repo root).
2. `src/billing/config.ts` — resolve `RELAY_BILLING_ENABLED`, keys, price IDs from env; export `isBillingEnabled(env)`. Missing keys while enabled → log once + treat as disabled (never throw at boot; mirrors `src/ai/config.ts` posture).
3. `src/billing/stripe-client.ts` — lazy singleton Stripe client (test mode).
4. Migration `*_billing_spine` with the frozen Prisma contract above (all five models/enums — MB-3 consumes `CreatorPlanEntitlement`; one migration avoids churn).
5. `src/billing/webhook-router.ts` — Express handler: raw-body signature verification, `BillingWebhookEvent` idempotency insert, event switch (handlers stubbed until MB-2, but unknown-event 200 + logging works now). Mount in `src/server.ts` at `POST /api/v1/billing/webhook` **before** JSON body parsing middleware (Stripe needs the raw body).
6. `.env.example` block per frozen contract.

**Acceptance criteria:**

- With `RELAY_BILLING_ENABLED` unset: no Stripe import executed at boot, billing routes return 404, `npm run test` green.
- Webhook: bad signature → 400; valid duplicate event id → 200 no-op with no second processing (unit test with Stripe's signed-payload test helper).
- Prisma migration applies cleanly; Supabase read-check performed.

**Tests:** `tests/billing-webhook-router.test.ts` (signature verify, idempotency, disabled-mode 404), `tests/billing-config.test.ts`.

## MB-2 `artist-plans-checkout`

**Goal:** an artist can subscribe to Studio Core / Autopost / Growth Engine and the local mirror stays true.

Steps:

1. `src/billing/checkout-service.ts` — `createCreatorCheckoutSession(prisma, { accountId, plan })`: ensure `BillingCustomer` (create Stripe customer with `metadata.relay_account_id`), create subscription-mode Checkout Session with the plan's price ID, `success_url`/`cancel_url` back to Studio billing page. `createPortalSession(prisma, { accountId })` for plan changes/cancellation (Stripe Billing Portal handles proration UI — we don't).
2. `src/billing/subscription-sync.ts` — `syncSubscriptionFromStripe(prisma, stripeSubscription)`: upsert `PlanSubscription` (map price ID → `CreatorPlan`), then call MB-3's `resolveCreatorPlan` for the owning creator. Called from webhook handlers for the three subscription events.
3. Fill in webhook handlers (MB-1 switch): the five events in the frozen table, each writing its `PlatformRevenueEvent` (integer cents from `invoice.amount_paid`) and a `UsageEvent` (`billing.invoice.paid`, `quantity: amount_cents`) via `scheduleUsageEvent` (`src/usage/usage-events.ts`).
4. Routes in `src/server.ts`: `POST /api/v1/billing/checkout`, `POST /api/v1/billing/portal`, `GET /api/v1/billing/subscription` per frozen contract, guarded by the existing creator-session middleware.

**Acceptance criteria:**

- Full webhook-driven lifecycle covered by tests with synthetic Stripe event payloads: subscribe → `PlanSubscription` active + entitlement row; upgrade $18→$39 → entitlement `autopost`; cancel → status `canceled`, entitlement falls back per resolution rules.
- Duplicate webhook delivery causes no double `PlatformRevenueEvent`.
- `GET /api/v1/billing/subscription` returns `{ plan: null }` for a creator with no subscription (not 404, not 500).
- No price amounts hardcoded anywhere (`Grep` for `1800|3900|7900` in `src/billing/` returns nothing).

**Tests:** `tests/billing-checkout-service.test.ts`, `tests/billing-subscription-sync.test.ts`, `tests/billing-routes.test.ts`.

## MB-3 `plan-entitlements`

**Goal:** Better/Best features are enforceable server-side (WI-12), and every AI call is metered.

Steps:

1. `src/billing/creator-plan-entitlement-service.ts` — `resolveCreatorPlan`, `getCreatorPlanEntitlement` (snapshot read, no Stripe dependency), `requireCreatorPlanAtLeast` per frozen semantics.
2. Wire gates (server-side, 402 wire contract) onto the Better surfaces that exist today — Autopost draft/compose routes and the Coach/posting-assistant routes in `src/server.ts` (find call sites of `isPostingAssistantAllowedForCreator` in `src/creator/creator-feature-flags-service.ts` usage). Gate = plan `autopost`+ **OR** legacy `posting_assistant_enabled` flag (migration bridge, see frozen contract).
3. AI metering (closes the WI-12 TODO in `src/ai/ai-service.ts`): in the `generateText` facade only — after an `ok` result, `scheduleUsageEvent` twice: metrics `ai.tokens.input` and `ai.tokens.output`, `quantity` from `result.usage`, `meta: { feature: input.metadata.feature, model_tier: input.tier }`, `relayCreatorId` from new optional `input.metadata.creatorId`. Thread `creatorId` through existing call sites (`src/autopost/autopost-draft-ai.ts`, `src/distribution/posting-assistant-service.ts`, `src/distribution/coach-propose-service.ts`). Never meter inside providers or feature modules (facade-only rule in the file header comment).
4. Ops grant route `POST /api/v1/ops/creator-plan-grant` (operator-auth pattern + `PlatformOperatorAccessAudit` row, mirroring the feature-flag ops route).

**Acceptance criteria:**

- A creator with no plan and no flag gets 402 `{ error: "plan_required", required_plan: "autopost" }` on a gated route; with an `operator_grant` row they get 200. Route-level tests, not just service tests.
- Entitlement reads hit only Postgres (no Stripe call in the request path) — degraded-mode test with Stripe client absent.
- `generateText` ok-result emits exactly two `UsageEvent` rows with correct quantities; `skipped`/error results emit none. Existing `tests/ai-service.test.ts` still green.
- Pilot bridge verified: flag-only creator retains Coach access.

**Tests:** `tests/creator-plan-entitlement-service.test.ts`, `tests/plan-gating-routes.test.ts`, extend `tests/ai-service.test.ts`.

## MB-4 `billing-ux`

**Goal:** an artist can see, buy, change, and worry about their plan without leaving Studio; operators can grant plans.

Steps:

1. `web/app/studio/settings/billing/page.tsx` (+ client component) — current plan card ("Good/Better/Best" names + prices quoted from a single constants module in `web/lib/`, sourced from the atlas), upgrade buttons → `POST /api/v1/billing/checkout` redirect, "Manage subscription" → portal redirect, `past_due` dunning banner ("Payment failed — update your card" → portal).
2. `web/lib/relay-api.ts` — typed client functions for the three billing routes.
3. `scripts/grant-creator-plan.mjs` — CLI wrapper for the ops grant route (mirror `scripts/set-creator-feature-flag.mjs`).
4. Empty-state: no plan → pitch card per master map freemium boundary copy ("Free: sync, backup, basic gallery. Studio Core: …"). No fake "trial" language.

**Acceptance criteria:**

- Web tests (pattern: `tests/web/*.test.tsx`) cover: no-plan state, active-plan state, `past_due` banner, upgrade click calls checkout with the right plan.
- `npm run lint` and `npm run build` in `web/` green.
- Grant script round-trips against a dev server (manual verification note in session report).

---

## Exit checklist (Phase 1)

- All four items `**done`**; root `npm run test` (billing + gating + AI) + `npm run build` green. Web: MB-4 files lint clean + `tests/web/billing-settings.test.tsx` green; full `web/` `npm run lint` / `npm run build` still fail on **pre-existing** ESLint errors outside billing (see session note).
- Webhook lifecycle test matrix (subscribe/upgrade/cancel/dunning/duplicate) passing.
- Gated Autopost/Coach routes return 402 without plan/flag/grant; 200/201 with each.
- AI calls emit `ai.tokens.`* usage events from `generateText` facade (unit-tested).
- `RELAY_BILLING_ENABLED` off → billing routes 404 (covered by billing-routes tests).
- Human has: created Stripe products/prices, registered the webhook endpoint, stored keys in env (documented, not committed).
- Supabase read-check on billing spine tables (MB-1).

## Return to (deferred)

- Retire `CreatorFeatureFlag.posting_assistant_enabled` once all pilot creators hold `operator_grant`/paid entitlements.
- Annual pricing (atlas mentions annual discounts) — new price IDs only, no schema change expected.
- Growth Engine ($79) checkout can ship dark until Best-tier features (AUTOPOST WI-9/10/11) exist; decide whether to hide the button in MB-4 UI at launch.
- Tax handling (Stripe Tax) before live mode.
- `docs/database/usage-events-rollups.md` — add `ai.tokens.*` and `billing.*` metrics to the rollup catalog.

