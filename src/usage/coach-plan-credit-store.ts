/**
 * Coach Plan credit persistence helpers (VS2-T02).
 * Ledger rows are append-only — never update/delete amounts.
 */

import {
  CoachPlanCreditEntryKind,
  type CoachPlanCreditLedger,
  type CoachPlanCreditReservation,
  type CoachPlanCreditWallet,
  type Prisma,
  type PrismaClient
} from "@prisma/client";

export type CreditTx = Prisma.TransactionClient;
export type CreditDb = PrismaClient | CreditTx;

export const COACH_PLAN_RESERVATION_STATUSES = [
  "reserved",
  "consumed",
  "released",
  "expired"
] as const;
export type CoachPlanReservationStatus = (typeof COACH_PLAN_RESERVATION_STATUSES)[number];

export async function ensureCreditWallet(
  tx: CreditTx,
  creatorId: string
): Promise<CoachPlanCreditWallet> {
  return tx.coachPlanCreditWallet.upsert({
    where: { creatorId },
    create: { creatorId, availableCredits: 0, reservedCredits: 0 },
    update: {}
  });
}

export async function findLedgerByIdempotency(
  tx: CreditTx,
  creatorId: string,
  idempotencyKey: string
): Promise<CoachPlanCreditLedger | null> {
  return tx.coachPlanCreditLedger.findUnique({
    where: {
      creatorId_idempotencyKey: { creatorId, idempotencyKey }
    }
  });
}

export async function sumLedgerAmount(tx: CreditTx, creatorId: string): Promise<number> {
  const agg = await tx.coachPlanCreditLedger.aggregate({
    where: { creatorId },
    _sum: { amount: true }
  });
  return agg._sum.amount ?? 0;
}

export async function countOpenReservations(tx: CreditTx, creatorId: string): Promise<number> {
  return tx.coachPlanCreditReservation.count({
    where: { creatorId, status: "reserved" }
  });
}

export async function appendLedgerEntry(
  tx: CreditTx,
  data: {
    creatorId: string;
    amount: number;
    kind: CoachPlanCreditEntryKind;
    idempotencyKey: string;
    cycleId?: string | null;
    reservationKey?: string | null;
    reasonCode?: string | null;
    metadataJson?: Record<string, unknown>;
    occurredAt?: Date;
  }
): Promise<CoachPlanCreditLedger> {
  if (!Number.isInteger(data.amount) || data.amount === 0) {
    throw new Error("Ledger amount must be a non-zero integer.");
  }
  return tx.coachPlanCreditLedger.create({
    data: {
      creatorId: data.creatorId,
      amount: data.amount,
      kind: data.kind,
      idempotencyKey: data.idempotencyKey,
      cycleId: data.cycleId ?? null,
      reservationKey: data.reservationKey ?? null,
      reasonCode: data.reasonCode ?? null,
      metadataJson: (data.metadataJson ?? {}) as Prisma.InputJsonValue,
      occurredAt: data.occurredAt ?? new Date()
    }
  });
}

export async function findReservationByCycle(
  tx: CreditTx,
  cycleId: string
): Promise<CoachPlanCreditReservation | null> {
  return tx.coachPlanCreditReservation.findUnique({ where: { cycleId } });
}

export async function findReservationByKey(
  tx: CreditTx,
  reservationKey: string
): Promise<CoachPlanCreditReservation | null> {
  return tx.coachPlanCreditReservation.findUnique({ where: { reservationKey } });
}

export { CoachPlanCreditEntryKind };
