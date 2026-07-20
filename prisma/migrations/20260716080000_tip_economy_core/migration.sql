-- Tip economy core (MB-5) — ledgers, wallets, reveals + tip_eligible on promo slots.
-- See docs/TIP_BETA_BUILD_PLAN.md frozen contracts.

CREATE TYPE "TipEntryKind" AS ENUM ('grant', 'purchase', 'spend', 'expire', 'clawback', 'adjust');

ALTER TYPE "PlatformRevenueEventKind" ADD VALUE IF NOT EXISTS 'tip_grant';
ALTER TYPE "PlatformRevenueEventKind" ADD VALUE IF NOT EXISTS 'tip_spend';

ALTER TABLE "creator_promo_slots" ADD COLUMN "tip_eligible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "tip_ledger_entries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "entry_kind" "TipEntryKind" NOT NULL,
    "tips" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "reveal_id" TEXT,
    "stripe_ref" TEXT,
    "period_key" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tip_ledger_entries_idempotency_key_key" ON "tip_ledger_entries"("idempotency_key");
CREATE UNIQUE INDEX "tip_ledger_entries_account_id_entry_kind_period_key_key" ON "tip_ledger_entries"("account_id", "entry_kind", "period_key");
CREATE INDEX "tip_ledger_entries_account_id_created_at_idx" ON "tip_ledger_entries"("account_id", "created_at");

CREATE TABLE "tip_wallets" (
    "account_id" TEXT NOT NULL,
    "granted_balance" INTEGER NOT NULL DEFAULT 0,
    "purchased_balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tip_wallets_pkey" PRIMARY KEY ("account_id")
);

CREATE TABLE "tip_reveals" (
    "id" TEXT NOT NULL,
    "patron_account_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "promo_slot_id" TEXT,
    "offer_id" TEXT,
    "surface" TEXT NOT NULL,
    "tips_spent" INTEGER NOT NULL DEFAULT 1,
    "revealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "tip_reveals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tip_reveals_patron_account_id_expires_at_idx" ON "tip_reveals"("patron_account_id", "expires_at");
CREATE INDEX "tip_reveals_patron_account_id_post_id_idx" ON "tip_reveals"("patron_account_id", "post_id");
CREATE INDEX "tip_reveals_creator_id_revealed_at_idx" ON "tip_reveals"("creator_id", "revealed_at");
-- At most one open reveal per fan+post (concurrency safety for double-spend races).
CREATE UNIQUE INDEX "tip_reveals_open_patron_post_key" ON "tip_reveals"("patron_account_id", "post_id") WHERE "closed_at" IS NULL;
