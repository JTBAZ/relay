-- Fan Premium Phase 3 (MB-10+): artist earnings ledger + payout stubs + enum extensions

ALTER TYPE "PlatformRevenueEventKind" ADD VALUE IF NOT EXISTS 'bill_credit_applied';
ALTER TYPE "PlatformRevenueEventKind" ADD VALUE IF NOT EXISTS 'payout_requested';

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'reveal_expiring';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'tips_granted';

DO $$ BEGIN
  CREATE TYPE "ArtistLedgerEntryKind" AS ENUM (
    'tip_earned',
    'bill_credit',
    'payout',
    'clawback',
    'adjust'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "artist_ledger_entries" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "entry_kind" "ArtistLedgerEntryKind" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "reveal_id" TEXT,
  "payout_id" TEXT,
  "stripe_ref" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_ledger_entries_idempotency_key_key" ON "artist_ledger_entries"("idempotency_key");
CREATE INDEX "artist_ledger_entries_creator_id_created_at_idx" ON "artist_ledger_entries"("creator_id", "created_at");

CREATE TABLE "artist_balances" (
  "creator_id" TEXT NOT NULL,
  "available_cents" INTEGER NOT NULL DEFAULT 0,
  "lifetime_cents" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "artist_balances_pkey" PRIMARY KEY ("creator_id")
);

CREATE TABLE "payout_accounts" (
  "creator_id" TEXT NOT NULL,
  "stripe_connect_account_id" TEXT NOT NULL,
  "onboarding_status" TEXT NOT NULL,
  "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("creator_id")
);

CREATE UNIQUE INDEX "payout_accounts_stripe_connect_account_id_key" ON "payout_accounts"("stripe_connect_account_id");

CREATE TABLE "artist_payouts" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "stripe_transfer_id" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  CONSTRAINT "artist_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artist_payouts_creator_id_requested_at_idx" ON "artist_payouts"("creator_id", "requested_at");
CREATE INDEX "artist_payouts_status_idx" ON "artist_payouts"("status");
