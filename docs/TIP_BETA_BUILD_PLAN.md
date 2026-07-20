# Tip Beta — Build Plan (Monetization Phase 2)

**Status:** Phase 2 MB-5–MB-8 **done**. Does not require Stripe keys to run. Tip funnel (≥15% converters / active fans) is an **observe-and-adjust** instrument for release — Phase 3 build is **not** blocked on it.
**Scope:** The Tip economy's product mechanics with **zero money movement**: ledgers, wallets, timed reveals, SFW/storefront eligibility, and the instrumented free-Tip beta that measures engagement. Fans spend *granted free* Tips; no artist earnings accrue yet.
**Related:**

- Canon: [MONETIZATION_MASTER_MAP.md](MONETIZATION_MASTER_MAP.md) (invariants 1–11; locked decisions). Numbers: [financial-atlas.md](financial-atlas.md).
- Phase 1 (prerequisite migration/module conventions): [BILLING_SPINE_BUILD_PLAN.md](BILLING_SPINE_BUILD_PLAN.md)
- Phase 3 (consumes everything here): [FAN_PREMIUM_BUILD_PLAN.md](FAN_PREMIUM_BUILD_PLAN.md)

**Contract authority:** Contracts below are frozen for Phase 2 and are **shared with Phase 3** (paid tiers reuse the same ledger/wallet/reveal tables — no beta-only throwaway schema). Where the master map sketches differ, this doc wins.

**Why beta-first instrumentation:** reveal engagement had zero data behind it. MB-8 measures **≥15% of active fans spend ≥1 free Tip/month** so post-release pricing/supply can be adjusted. Build Phase 3 on the atlas guess; do not chicken-and-egg the system over waiting for the number.

---

## Worker-agent session protocol

Same as [BILLING_SPINE_BUILD_PLAN.md](BILLING_SPINE_BUILD_PLAN.md): read canon → claim one item → update the status cell (`**in progress**` / `**done**`) → verify (`npm run test`, `npm run build`, Supabase read-check on migrations) → restart dev stack when backend/web changed (`.cursor/rules/rescue-workflow-always.mdc`).

## Human gates (stop conditions)

- Enabling the beta for real fan accounts (flipping `RELAY_TIPS_BETA` in a deployed environment) is a human decision — build and test dark.
- Any request to attach cash value, paid tiers, or artist earnings to Tips in this phase → out of scope, stop and point to Phase 3.

## Non-goals (Phase 2)

- No Stripe, no Reload Packs, no paid Supporter/Curator tiers, no `ArtistLedgerEntry`/earnings, no payouts, no bill credit.
- No algorithmic Exposure Feed and no Boosts (post-Phase-3 fast-follow). Surfaces are Discover v1 (`src/patron/discover-service.ts`) and artist public pages (`web/app/[handle]/`).
- No change to Patreon entitlement gating: a Tip reveal is an **additional** grant for one post, never a replacement for tier entitlements, and never mutates Patreon-origin snapshots (`.cursor/rules/patreon-origin-relay-bedrock.mdc`).

---

## Frozen contracts

### Environment

```
# --- Tip beta (TIP_BETA_BUILD_PLAN.md) ---
# RELAY_TIPS_BETA — master switch (1/true). Default off: tip routes 404, no blurred tiles rendered.
# RELAY_TIPS_BETA_MONTHLY_GRANT — free Tips granted per fan per month during beta (default 3).
# RELAY_TIPS_REVEAL_WINDOW_DAYS — beta access window (default 14; Phase 3 makes this plan-dependent).
```

### Prisma (migration `*_tip_economy_core`, MB-5)

```prisma
enum TipEntryKind {
  grant      // beta: monthly free allowance; Phase 3: subscription allowance
  purchase   // Phase 3 only (Reload Pack) — enum value reserved now
  spend      // reveal
  expire     // rollover-cap trim applied at grant time
  clawback   // Phase 3: refund/chargeback reversal — reserved now
  adjust     // operator correction (audited)
}

/// Append-only fan Tip ledger — the truth. TipWallet is a recomputable cache.
model TipLedgerEntry {
  id             String       @id @default(cuid())
  accountId      String       @map("account_id")
  entryKind      TipEntryKind @map("entry_kind")
  /// Signed integer Tips. grant/purchase > 0; spend/expire/clawback < 0; adjust either.
  tips           Int
  /// "granted" | "purchased" — which wallet bucket this entry moves.
  bucket         String
  revealId       String?      @map("reveal_id")
  stripeRef      String?      @map("stripe_ref")
  /// Grant period, e.g. "2026-09" — one grant per account per period (partial unique below).
  periodKey      String?      @map("period_key")
  idempotencyKey String       @unique @map("idempotency_key")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@unique([accountId, entryKind, periodKey])
  @@index([accountId, createdAt])
  @@map("tip_ledger_entries")
}

/// Materialized balances. Invariant: equals SUM(entries) per bucket at all times
/// (updated in the same transaction as the entry; recompute job as safety net).
model TipWallet {
  accountId        String   @id @map("account_id")
  grantedBalance   Int      @default(0) @map("granted_balance")
  purchasedBalance Int      @default(0) @map("purchased_balance")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("tip_wallets")
}

/// One Tip spend = timed access to one post's entitled media for one fan.
model TipReveal {
  id              String    @id @default(cuid())
  patronAccountId String    @map("patron_account_id")
  creatorId       String    @map("creator_id")
  postId          String    @map("post_id")
  promoSlotId     String?   @map("promo_slot_id")
  offerId         String?   @map("offer_id")
  surface         String    // "discover" | "artist_page" (Phase 3+: "exposure_feed")
  tipsSpent       Int       @default(1) @map("tips_spent")
  revealedAt      DateTime  @default(now()) @map("revealed_at")
  expiresAt       DateTime  @map("expires_at")
  /// Set by the expiry worker when the window closes (drives re-blur + "Tip again").
  closedAt        DateTime? @map("closed_at")

  @@index([patronAccountId, expiresAt])
  @@index([patronAccountId, postId])
  @@index([creatorId, revealedAt])
  @@map("tip_reveals")
}
```

Note: the `@@unique([accountId, entryKind, periodKey])` guard makes monthly grants idempotent by construction (nullable `periodKey` rows are exempt per Postgres null semantics).

### Ledger service (MB-5 — the only writer, master map invariant 3)

`src/ledger/tip-ledger-service.ts` exports (all take `PrismaClient`, run entry + wallet update in one transaction):

- `grantTips({ accountId, tips, periodKey, idempotencyKey })` — applies the **rollover cap** at grant time: cap = 2 × monthly allowance; if `grantedBalance + tips` exceeds cap, write the `grant` entry plus an `expire` entry trimming to cap (invariant: history explains every balance).
- `spendTip({ accountId, revealId, idempotencyKey })` — spend order **granted first, then purchased**; throws typed `InsufficientTipsError`.
- `adjustTips({ accountId, tips, bucket, reason, operatorAccountId, idempotencyKey })` — writes `PlatformOperatorAccessAudit`.
- `getWallet(accountId)` / `recomputeWallet(accountId)` (safety net; used by tests and an ops route).

Duplicate `idempotencyKey` → return the existing outcome, never double-apply.

### Eligibility rule (MB-7 — frozen, enforced in two places)

A target (post or media) is **Tip-eligible** iff ALL of:

1. Listed in the creator's Promo Pool (`CreatorPromoSlot` row).
2. **Not mature:** `isPostMatureFromPatronSurfaces` (`src/gallery/mature-post-ids.ts`) is false — SFW gate, master map invariant 7 (Stripe/card-network posture).
3. **Not storefront-listed** (atlas storefront-protection rule) — until storefronts exist this check is a constant `true` placeholder with a named helper so Phase 3+ has one place to wire it.
4. Creator has not toggled the slot off (`tip_eligible` flag below).
5. The viewing fan is not already entitled to the post via Patreon tiers (already-entitled content renders normally, never blurred).

Enforced at **read time** (eligible-tiles queries, MB-6) and again at **spend time** inside `revealPost` (MB-5) — a stale client can never Tip-reveal an ineligible post.

`CreatorPromoSlot` gains one column (same migration): `tipEligible Boolean @default(true) @map("tip_eligible")`.

### API surface (wire fields snake_case)

| Route | Auth | Contract |
|---|---|---|
| `GET /api/v1/tips/wallet` | patron session | `{ granted_balance, purchased_balance, next_grant_period, beta: true }` |
| `POST /api/v1/tips/reveals` | patron session | body `{ post_id, surface }` → `201 { reveal_id, expires_at, media: <entitled projection> }`; `402 { error: "insufficient_tips" }`; `409 { error: "not_eligible", reason }`; `200` existing reveal if window still open (idempotent re-request) |
| `GET /api/v1/tips/reveals` | patron session | active (non-closed) reveals: `[{ reveal_id, post_id, creator_id, expires_at }]` |
| `GET /api/v1/patron/discover` (extend) | patron session | existing Discover payload + `tip_gated: [{ post_id, creator_id, blur_thumb_url, tip_cost: 1 }]` when `RELAY_TIPS_BETA` |
| `PATCH /api/v1/creator/promo-slots/:id` (extend) | creator session | accepts `tip_eligible`; response includes computed `tip_eligibility: { eligible, reasons: ["mature", "storefront", "disabled"] }` |

### Media access integration (MB-6 — the critical vessel)

An open `TipReveal` (now < `expiresAt`, `closedAt` null) grants **view-only access to that post's media** through the existing entitlement path. Implementation point: the viewer-entitlement resolution used by patron media routes (`src/patron/viewer-entitlement.ts` + `src/gallery/patron-media-access.ts`) gains a reveal lookup as an additional access source, scoped to `(patronAccountId, postId)`. Full-resolution export/zip paths do **not** honor reveals (view access, not export access — check `src/gallery/media-export-access-context.ts` treats reveals as no-access).

### Telemetry contract (MB-8 — feeds the go/no-go)

- `UsageEvent` metrics (via `scheduleUsageEvent`, `src/usage/usage-events.ts`): `tips.granted`, `tips.spent`, `tips.reveal.blocked` (meta: reason), attributed to the **creator's** tenant via `relayCreatorId` (consistent with existing per-tenant metering).
- `RelayEngagementEvent` rows with existing `reveal_interaction` type on: blurred-tile impression click, reveal completed, offer CTA click-through (offer clicks additionally flow through the existing `/go/:slug` redirect logging — `MarketingOfferClickEvent`).
- Funnel definition (SQL over these tables, MB-8): active fan = patron account with ≥1 session in month; **converter = active fan with ≥1 `spend` entry in month**. Gate metric = converters / active fans.

---

## Work items

| # | ID | Depends on | Goal | Key paths | Status |
|---|---|---|---|---|---|
| MB-5 | `tip-ledger-core` | Phase 1 MB-1 (module layout only) | Migration + ledger service + reveal service + grant worker + routes | `prisma/`, `src/ledger/tip-ledger-service.ts`, `src/tips/reveal-service.ts`, `src/tips/tip-grant-worker.ts`, `src/server.ts`, `src/jobs/` | **done** |
| MB-6 | `reveal-ux` | MB-5 | Blurred tiles (Discover + artist pages), reveal modal with offer CTA, wallet chip, media-access integration | `web/app/(consumer)/`, `web/app/[handle]/`, `src/patron/discover-service.ts`, `src/patron/viewer-entitlement.ts`, `src/gallery/patron-media-access.ts`, `web/lib/relay-api.ts` | **done** |
| MB-7 | `promo-eligibility` | MB-5 | Eligibility rule wired end-to-end + Studio promo manager UI states | `src/marketing/`, `src/tips/tip-eligibility.ts`, `web/app/studio/promos/`, `src/server.ts` | **done** |
| MB-8 | `beta-telemetry` | MB-5, MB-6 | Funnel events, go/no-go rollup + Studio/ops read-out | `src/analytics/`, `src/usage/`, `docs/database/usage-events-rollups.md` | **done** |

---

## MB-5 `tip-ledger-core`

Steps:

1. Migration `*_tip_economy_core` per frozen contract (+ `CreatorPromoSlot.tipEligible`).
2. `src/ledger/tip-ledger-service.ts` per frozen service contract. Wallet update and ledger insert in one `prisma.$transaction`; every mutation also writes `PlatformRevenueEvent` (add enum values `tip_grant`, `tip_spend` to `PlatformRevenueEventKind` in the same migration; `amountCents: null` in beta) and schedules a `UsageEvent`.
3. `src/tips/reveal-service.ts` — `revealPost({ patronAccountId, postId, surface })`: eligibility re-check (MB-7 helper) → open-reveal idempotency (return existing if window open) → `TipReveal` insert + `spendTip` in one transaction → return entitled media projection via the existing patron media path.
4. `src/tips/tip-grant-worker.ts` — monthly grant sweep for beta-eligible patron accounts (`RELAY_TIPS_BETA_MONTHLY_GRANT`, `periodKey` = `YYYY-MM`): new queue name in `src/jobs/queue-names.ts`, worker in `src/jobs/register-workers.ts`, repeat schedule in `src/jobs/schedule-bullmq-repeat.ts` (mirror `POSTING_GOAL_NUDGE` wiring exactly).
5. Routes per frozen API table, mounted in `src/server.ts` behind `RELAY_TIPS_BETA` (off → 404).

**Acceptance criteria:**

- Property-style test: any interleaving of grant/spend/expire/adjust leaves `TipWallet` equal to entry sums (use `recomputeWallet` as oracle).
- Rollover cap: fan at cap receives grant → `grant` + `expire` entries, balance stays at cap.
- Duplicate grant for same `(account, period)` and duplicate spend `idempotencyKey` are no-ops.
- Spend at zero balance → 402 wire error; concurrent double-spend race (two parallel reveals, one Tip) leaves exactly one reveal + one spend entry (transaction test).
- Worker registered and visible in `tests/register-workers.test.ts` pattern.

**Tests:** `tests/tip-ledger-service.test.ts`, `tests/tip-reveal-service.test.ts`, `tests/tip-grant-worker.test.ts`, `tests/tips-routes.test.ts`.

## MB-6 `reveal-ux`

Steps:

1. **Media access:** add the reveal lookup to viewer entitlement resolution (frozen contract above). This lands first — it's the vessel everything else renders through.
2. Discover: extend `src/patron/discover-service.ts` with the `tip_gated` section (eligible, non-entitled, SFW-only per MB-7 helper; respects `hideMatureContent` by construction since mature is never eligible). Blurred-tile component in `web/app/(consumer)/` — blur via CSS on the existing thumb variant, no new media derivative in beta.
3. Artist public pages (`web/app/[handle]/`): eligible non-entitled promo items render the same blurred tile.
4. Reveal modal: full entitled media view + window countdown ("Open for 14 days") + the post's active `PostMarketingOffer` CTA when present (render `headline`/`ctaText`, link via `/go/:slug` redirect so clicks log) + disclosure line **"Tipping supports this artist"** (beta copy; Phase 3 adds "$0.33 goes to [artist]").
5. Wallet chip in the consumer header (`web/app/(consumer)` layout): balance + tooltip with next grant date; hidden when `RELAY_TIPS_BETA` off (server-driven flag in payload, no client env checks).

**Acceptance criteria:**

- A fan with Tips can: see blurred tile → confirm spend → view media → still view tomorrow (window open) → sees it re-blurred after `expiresAt` (test by clock injection, not sleeping).
- A Patreon-entitled fan never sees the blurred tile for content they already have.
- Media URLs for revealed posts are the standard entitled projections (no new unauthenticated URL shape); export/zip remains blocked.
- Web tests: blurred tile, modal with/without offer, wallet chip states, beta-off renders nothing.

**Tests:** `tests/tip-reveal-entitlement.test.ts`, `tests/web/tip-reveal-modal.test.tsx`, `tests/web/tip-wallet-chip.test.tsx`, extend `tests/patron-media-access`-adjacent coverage.

## MB-7 `promo-eligibility`

Steps:

1. `src/tips/tip-eligibility.ts` — `resolveTipEligibility(prisma, { creatorId, postId })` implementing the frozen 5-condition rule; returns `{ eligible, reasons }`. Single source; both read paths (MB-6) and spend path (MB-5) call it.
2. Storefront check stub: named helper `isStorefrontListed()` returning `false` (not listed) with a `// Phase 3+: storefront integration point` comment.
3. Promo-slot route extension (`PATCH` accepts `tip_eligible`; `GET` returns computed `tip_eligibility`) — existing promo slot routes/tests: `tests/creator-promo-slots-route.test.ts`.
4. Studio promos UI (`web/app/studio/promos/`): per-slot eligibility badge + toggle; ineligible reasons in plain language ("Rated 18+ — not eligible for Tips", "You've turned Tips off for this piece").

**Acceptance criteria:**

- Mature post (visibility `review`) is never eligible regardless of toggle; toggling `tip_eligible` off blocks spend with 409 even if a tile was already rendered (spend-time re-check test).
- Reasons array is exact and stable (UI copy keys off it).
- Studio UI reflects all three ineligible reasons + the eligible state.

**Tests:** `tests/tip-eligibility.test.ts`, extend `tests/creator-promo-slots-route.test.ts`, `tests/web/promo-tip-eligibility.test.tsx`.

## MB-8 `beta-telemetry`

Steps:

1. Emit the frozen telemetry contract from MB-5/MB-6 code paths (verify all emission points; add any missing).
2. Go/no-go rollup: `src/analytics/tip-beta-funnel-service.ts` — monthly `{ active_fans, converters, conversion_rate, reveals, reveals_per_converter, offer_ctr }` from `TipLedgerEntry`/`TipReveal`/`RelayEngagementEvent`/`MarketingOfferClickEvent`. Expose via an operator route (existing operator-auth + audit pattern).
3. Artist-facing read-out: reveals + offer CTR on their promo pieces in Studio analytics (extend an existing analytics surface in `web/app/studio/analytics/` minimally — one card, not a new page).
4. Document metrics in `docs/database/usage-events-rollups.md`.

**Acceptance criteria:**

- Funnel numbers match hand-computed fixtures (seeded multi-account test).
- Operator route audited via `PlatformOperatorAccessAudit`; non-operator gets 403.
- The go/no-go number (converters / active fans) is queryable in one call — this is the Phase 3 gate input.

**Tests:** `tests/tip-beta-funnel-service.test.ts`, operator-route test.

---

## Exit checklist (Phase 2)

- [x] All four items `**done**`; root build green; tip funnel + eligibility tests green.
- [ ] `RELAY_TIPS_BETA` off → zero behavioral change anywhere (regression sweep).
- [ ] End-to-end manual pass on dev stack: grant → blurred tile on Discover **and** artist page → reveal → offer click logged → window expiry re-blur.
- [ ] Ledger/wallet consistency check clean after the manual pass (`recomputeWallet` ops route).
- [ ] Funnel dashboard produces the engagement metric; beta cohort + measurement month agreed with a human when enabling real fans.
- [ ] **Post-release observe:** record converters / active fans; below ~15% → iterate supply density/surfaces/pricing (does not block Phase 3 build).

## Return to (deferred)

- Promo Pool capacity: `CreatorPromoSlot` is 1–5 ranked picks; atlas describes 5–12. Expand slot count when supply density becomes the binding constraint (schema supports it — bump validation, not structure).
- Server-generated blur/watermark derivative (CSS blur is beta-grade; a real derivative prevents devtools peeking) — required before Phase 3 paid launch.
- `tips.reveal.blocked` reason taxonomy review after beta (which 409s do fans actually hit?).
- Storefront listing check (`isStorefrontListed`) — wire when storefronts land.
