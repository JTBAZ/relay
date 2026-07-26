-- Coach Plan credits (VS2-T01). Append-only ledger + reservation + reconcilable wallet.
-- No hardcoded allowance values. No backfill.
-- RLS: ENABLE without permissive policies = deny PostgREST / anon / authenticated.
-- Relay API Prisma uses a role that bypasses RLS.

DO $$ BEGIN
  CREATE TYPE "CoachPlanCreditEntryKind" AS ENUM (
    'monthly_grant',
    'admin_grant',
    'reserve',
    'consume',
    'release',
    'expire',
    'correction'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "coach_plan_credit_ledger" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "kind" "CoachPlanCreditEntryKind" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "cycle_id" TEXT,
  "reservation_key" TEXT,
  "reason_code" TEXT,
  "metadata_json" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "coach_plan_credit_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_plan_credit_ledger_amount_nonzero_check" CHECK ("amount" <> 0),
  CONSTRAINT "coach_plan_credit_ledger_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "coach_plan_credit_ledger_creator_id_idempotency_key_key"
  ON "coach_plan_credit_ledger"("creator_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "coach_plan_credit_ledger_creator_id_occurred_at_idx"
  ON "coach_plan_credit_ledger"("creator_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "coach_plan_credit_ledger_cycle_id_idx"
  ON "coach_plan_credit_ledger"("cycle_id");

CREATE INDEX IF NOT EXISTS "coach_plan_credit_ledger_reservation_key_idx"
  ON "coach_plan_credit_ledger"("reservation_key");

CREATE TABLE IF NOT EXISTS "coach_plan_credit_reservations" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 1,
  "reservation_key" TEXT NOT NULL,
  "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "coach_plan_credit_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_plan_credit_reservations_amount_one_check" CHECK ("amount" = 1),
  CONSTRAINT "coach_plan_credit_reservations_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "creator_goal_cycles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "coach_plan_credit_reservations_cycle_id_key"
  ON "coach_plan_credit_reservations"("cycle_id");

CREATE UNIQUE INDEX IF NOT EXISTS "coach_plan_credit_reservations_reservation_key_key"
  ON "coach_plan_credit_reservations"("reservation_key");

CREATE INDEX IF NOT EXISTS "coach_plan_credit_reservations_creator_id_status_idx"
  ON "coach_plan_credit_reservations"("creator_id", "status");

CREATE INDEX IF NOT EXISTS "coach_plan_credit_reservations_status_expires_at_idx"
  ON "coach_plan_credit_reservations"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "coach_plan_credit_wallets" (
  "creator_id" TEXT NOT NULL,
  "available_credits" INTEGER NOT NULL DEFAULT 0,
  "reserved_credits" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "coach_plan_credit_wallets_pkey" PRIMARY KEY ("creator_id")
);

ALTER TABLE public.coach_plan_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_plan_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_plan_credit_wallets ENABLE ROW LEVEL SECURITY;
