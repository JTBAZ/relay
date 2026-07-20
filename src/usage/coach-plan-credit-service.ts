/**
 * Coach Plan credit accounting (VS2-T02).
 * Wallet is a reconcilable cache; ledger sum is the source of truth for available credits.
 *
 * Semantics:
 * - grant/admin_grant/correction(+)/release: positive ledger amounts
 * - reserve: -1 available (hold); open reservation increments reserved
 * - consume: settles hold (no additional ledger debit — credit already removed at reserve)
 * - release/expire: +1 ledger, returns credit to available
 */

import { CoachPlanCreditEntryKind, type PrismaClient } from "@prisma/client";
import type { CoachPlanCreditStatus } from "../goal-cycle/contracts.js";
import { getGoalCycleFeatureFlags } from "../goal-cycle/contracts.js";
import {
  appendLedgerEntry,
  countOpenReservations,
  ensureCreditWallet,
  findLedgerByIdempotency,
  findReservationByCycle,
  findReservationByKey,
  sumLedgerAmount,
  type CoachPlanReservationStatus,
  type CreditTx
} from "./coach-plan-credit-store.js";

const DEFAULT_RESERVATION_TTL_DAYS = 7;

export class CoachPlanCreditError extends Error {
  public override readonly name = "CoachPlanCreditError";
  public constructor(
    public readonly code: "GOAL_CYCLE_NO_CREDIT" | "GOAL_CYCLE_INVALID_STATE" | "GOAL_CYCLE_NOT_FOUND",
    message: string,
    public readonly details: Array<{ field: string; issue: string }> = []
  ) {
    super(message);
  }
}

export type CoachPlanReservationWire = {
  reservation_key: string;
  cycle_id: string;
  status: CoachPlanReservationStatus;
  amount: number;
  reserved_at: string;
  settled_at: string | null;
  expires_at: string;
  version: number;
};

export type CoachPlanCreditMutationResult = {
  status: CoachPlanCreditStatus;
  reservation: CoachPlanReservationWire | null;
  idempotent: boolean;
};

/** Silence is free; all other Goal Cycle plans consume one credit. */
export function shouldReserveCoachPlanCredit(input: {
  goal_kind: string;
  break_mode?: string | null;
}): boolean {
  return !(input.goal_kind === "break" && input.break_mode === "complete_silence");
}

export function resolveCoachPlanReservationTtlDays(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_COACH_PLAN_RESERVATION_TTL_DAYS?.trim();
  if (!raw) return DEFAULT_RESERVATION_TTL_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RESERVATION_TTL_DAYS;
  return Math.min(Math.floor(n), 90);
}

/** Nullable config — never invent tier defaults. */
export function resolveIncludedCoachPlanCredits(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_COACH_PLAN_INCLUDED_CREDITS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function wireReservation(row: {
  reservationKey: string;
  cycleId: string;
  status: string;
  amount: number;
  reservedAt: Date;
  settledAt: Date | null;
  expiresAt: Date;
  version: number;
}): CoachPlanReservationWire {
  return {
    reservation_key: row.reservationKey,
    cycle_id: row.cycleId,
    status: row.status as CoachPlanReservationStatus,
    amount: row.amount,
    reserved_at: row.reservedAt.toISOString(),
    settled_at: row.settledAt?.toISOString() ?? null,
    expires_at: row.expiresAt.toISOString(),
    version: row.version
  };
}

async function buildStatus(
  tx: CreditTx,
  creatorId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CoachPlanCreditStatus> {
  const wallet = await ensureCreditWallet(tx, creatorId);
  const flags = getGoalCycleFeatureFlags(env);
  return {
    enabled: flags.enabled,
    available: wallet.availableCredits,
    reserved: wallet.reservedCredits,
    included_per_period: resolveIncludedCoachPlanCredits(env),
    period_started_at: null,
    period_ends_at: null,
    next_grant_at: null,
    topups_available: false
  };
}

async function withCreatorLock<T>(
  prisma: PrismaClient,
  creatorId: string,
  fn: (tx: CreditTx) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await ensureCreditWallet(tx, creatorId);
          await tx.$queryRawUnsafe(
            `SELECT creator_id FROM coach_plan_credit_wallets WHERE creator_id = $1 FOR UPDATE`,
            creatorId
          );
          return fn(tx);
        },
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 }
      );
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/could not serialize|40001|serialization|write conflict/i.test(msg)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

export async function getCoachPlanCreditStatus(
  prisma: PrismaClient,
  creatorId: string
): Promise<CoachPlanCreditStatus> {
  const id = creatorId.trim();
  return prisma.$transaction(async (tx) => buildStatus(tx, id));
}

/**
 * Recompute wallet from ledger + open reservations. Idempotent repair.
 */
export async function reconcileCoachPlanCreditWallet(
  prisma: PrismaClient,
  creatorId: string
): Promise<CoachPlanCreditStatus> {
  const id = creatorId.trim();
  return withCreatorLock(prisma, id, async (tx) => {
    const ledgerSum = await sumLedgerAmount(tx, id);
    const open = await countOpenReservations(tx, id);
    // Ledger already deducted on reserve; available = ledger sum; reserved = open holds.
    const available = ledgerSum;
    const reserved = open;
    await tx.coachPlanCreditWallet.upsert({
      where: { creatorId: id },
      create: { creatorId: id, availableCredits: available, reservedCredits: reserved },
      update: { availableCredits: available, reservedCredits: reserved }
    });
    return buildStatus(tx, id);
  });
}

export async function grantMonthlyCoachPlanCredits(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    periodKey: string;
    allowance: number;
    idempotencyKey: string;
    kind?: "monthly_grant" | "admin_grant";
    now?: Date;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  const allowance = Math.floor(args.allowance);
  if (!creatorId || allowance <= 0) {
    throw new Error("grantMonthly requires creatorId and positive allowance");
  }
  const kind =
    args.kind === "admin_grant"
      ? CoachPlanCreditEntryKind.admin_grant
      : CoachPlanCreditEntryKind.monthly_grant;
  const idem = args.idempotencyKey.trim().slice(0, 191);

  return withCreatorLock(prisma, creatorId, async (tx) => {
    const prior = await findLedgerByIdempotency(tx, creatorId, idem);
    if (prior) {
      return {
        status: await buildStatus(tx, creatorId),
        reservation: null,
        idempotent: true
      };
    }

    await appendLedgerEntry(tx, {
      creatorId,
      amount: allowance,
      kind,
      idempotencyKey: idem,
      reasonCode: "monthly_grant",
      metadataJson: { period_key: args.periodKey },
      occurredAt: args.now
    });

    await tx.coachPlanCreditWallet.update({
      where: { creatorId },
      data: { availableCredits: { increment: allowance } }
    });

    return {
      status: await buildStatus(tx, creatorId),
      reservation: null,
      idempotent: false
    };
  });
}

export async function applyCoachPlanCreditCorrection(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    amount: number;
    idempotencyKey: string;
    reasonCode: string;
    metadataJson?: Record<string, unknown>;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  const amount = Math.trunc(args.amount);
  if (!creatorId || amount === 0) {
    throw new Error("correction requires creatorId and non-zero amount");
  }
  const idem = args.idempotencyKey.trim().slice(0, 191);

  return withCreatorLock(prisma, creatorId, async (tx) => {
    const prior = await findLedgerByIdempotency(tx, creatorId, idem);
    if (prior) {
      return {
        status: await buildStatus(tx, creatorId),
        reservation: null,
        idempotent: true
      };
    }

    const wallet = await ensureCreditWallet(tx, creatorId);
    if (wallet.availableCredits + amount < 0) {
      throw new CoachPlanCreditError("GOAL_CYCLE_NO_CREDIT", "Correction would make available negative.", [
        { field: "amount", issue: "insufficient" }
      ]);
    }

    await appendLedgerEntry(tx, {
      creatorId,
      amount,
      kind: CoachPlanCreditEntryKind.correction,
      idempotencyKey: idem,
      reasonCode: args.reasonCode.slice(0, 64),
      metadataJson: args.metadataJson
    });

    await tx.coachPlanCreditWallet.update({
      where: { creatorId },
      data: { availableCredits: { increment: amount } }
    });

    return {
      status: await buildStatus(tx, creatorId),
      reservation: null,
      idempotent: false
    };
  });
}

export async function reserveCoachPlanCreditForCycle(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycleId: string;
    idempotencyKey: string;
    reservationKey?: string;
    now?: Date;
    ttlDays?: number;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  const cycleId = args.cycleId.trim();
  const idem = args.idempotencyKey.trim().slice(0, 191);
  const reservationKey =
    (args.reservationKey?.trim() || `cpc_res_${cycleId}`).slice(0, 191);
  const now = args.now ?? new Date();
  const ttlDays = args.ttlDays ?? resolveCoachPlanReservationTtlDays();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  return withCreatorLock(prisma, creatorId, async (tx) => {
    const existingByCycle = await findReservationByCycle(tx, cycleId);
    if (existingByCycle && existingByCycle.status === "reserved") {
      return {
        status: await buildStatus(tx, creatorId),
        reservation: wireReservation(existingByCycle),
        idempotent: true
      };
    }
    if (existingByCycle && existingByCycle.status === "consumed") {
      throw new CoachPlanCreditError(
        "GOAL_CYCLE_INVALID_STATE",
        "Reservation already consumed for this cycle.",
        [{ field: "cycle_id", issue: "consumed" }]
      );
    }

    const priorLedger = await findLedgerByIdempotency(tx, creatorId, idem);
    if (priorLedger) {
      const byKey = await findReservationByKey(tx, reservationKey);
      return {
        status: await buildStatus(tx, creatorId),
        reservation: byKey ? wireReservation(byKey) : null,
        idempotent: true
      };
    }

    if (existingByCycle && (existingByCycle.status === "released" || existingByCycle.status === "expired")) {
      // Fresh reservation after release/expiry — delete settled row so unique cycle_id can reuse.
      await tx.coachPlanCreditReservation.delete({ where: { id: existingByCycle.id } });
    }

    const bumped = await tx.coachPlanCreditWallet.updateMany({
      where: { creatorId, availableCredits: { gte: 1 } },
      data: {
        availableCredits: { decrement: 1 },
        reservedCredits: { increment: 1 }
      }
    });
    if (bumped.count !== 1) {
      throw new CoachPlanCreditError("GOAL_CYCLE_NO_CREDIT", "No Coach Plan credit available.", [
        { field: "available", issue: "zero" }
      ]);
    }

    await appendLedgerEntry(tx, {
      creatorId,
      amount: -1,
      kind: CoachPlanCreditEntryKind.reserve,
      idempotencyKey: idem,
      cycleId,
      reservationKey,
      reasonCode: "reserve",
      occurredAt: now
    });

    const reservation = await tx.coachPlanCreditReservation.create({
      data: {
        creatorId,
        cycleId,
        status: "reserved",
        amount: 1,
        reservationKey,
        reservedAt: now,
        expiresAt,
        version: 1
      }
    });

    return {
      status: await buildStatus(tx, creatorId),
      reservation: wireReservation(reservation),
      idempotent: false
    };
  });
}

export async function consumeCoachPlanCreditReservationInTx(
  tx: CreditTx,
  args: {
    creatorId: string;
    cycleId: string;
    approvalKey: string;
    now?: Date;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  const cycleId = args.cycleId.trim();
  const idem = `consume:${args.approvalKey.trim()}`.slice(0, 191);
  const now = args.now ?? new Date();

  const reservation = await findReservationByCycle(tx, cycleId);
  if (!reservation || reservation.creatorId !== creatorId) {
    throw new CoachPlanCreditError("GOAL_CYCLE_NOT_FOUND", "Reservation not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }

  const prior = await findLedgerByIdempotency(tx, creatorId, idem);
  if (prior || reservation.status === "consumed") {
    const current = await findReservationByCycle(tx, cycleId);
    return {
      status: await buildStatus(tx, creatorId),
      reservation: current ? wireReservation(current) : wireReservation(reservation),
      idempotent: true
    };
  }

  if (reservation.status !== "reserved") {
    throw new CoachPlanCreditError(
      "GOAL_CYCLE_INVALID_STATE",
      `Cannot consume reservation in status ${reservation.status}.`,
      [{ field: "status", issue: reservation.status }]
    );
  }

  await appendLedgerEntry(tx, {
    creatorId,
    amount: 1,
    kind: CoachPlanCreditEntryKind.release,
    idempotencyKey: `${idem}:hold_clear`.slice(0, 191),
    cycleId,
    reservationKey: reservation.reservationKey,
    reasonCode: "consume_hold_clear",
    occurredAt: now
  });
  await appendLedgerEntry(tx, {
    creatorId,
    amount: -1,
    kind: CoachPlanCreditEntryKind.consume,
    idempotencyKey: idem,
    cycleId,
    reservationKey: reservation.reservationKey,
    reasonCode: "consume",
    metadataJson: { approval_present: true },
    occurredAt: now
  });

  const updated = await tx.coachPlanCreditReservation.update({
    where: { id: reservation.id },
    data: {
      status: "consumed",
      settledAt: now,
      version: { increment: 1 }
    }
  });

  await tx.coachPlanCreditWallet.update({
    where: { creatorId },
    data: { reservedCredits: { decrement: 1 } }
  });

  return {
    status: await buildStatus(tx, creatorId),
    reservation: wireReservation(updated),
    idempotent: false
  };
}

export async function consumeCoachPlanCreditReservation(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycleId: string;
    approvalKey: string;
    now?: Date;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  return withCreatorLock(prisma, creatorId, async (tx) =>
    consumeCoachPlanCreditReservationInTx(tx, args)
  );
}

async function settleReleaseLike(
  tx: CreditTx,
  args: {
    creatorId: string;
    reservation: NonNullable<Awaited<ReturnType<typeof findReservationByCycle>>>;
    idempotencyKey: string;
    kind: "release" | "expire";
    reasonCode: string;
    now: Date;
  }
): Promise<CoachPlanCreditMutationResult> {
  const { creatorId, reservation, idempotencyKey, kind, reasonCode, now } = args;

  const prior = await findLedgerByIdempotency(tx, creatorId, idempotencyKey);
  if (prior || reservation.status === "released" || reservation.status === "expired") {
    const current = await findReservationByCycle(tx, reservation.cycleId);
    return {
      status: await buildStatus(tx, creatorId),
      reservation: current ? wireReservation(current) : wireReservation(reservation),
      idempotent: true
    };
  }

  if (reservation.status !== "reserved") {
    throw new CoachPlanCreditError(
      "GOAL_CYCLE_INVALID_STATE",
      `Cannot ${kind} reservation in status ${reservation.status}.`,
      [{ field: "status", issue: reservation.status }]
    );
  }

  await appendLedgerEntry(tx, {
    creatorId,
    amount: 1,
    kind:
      kind === "expire" ? CoachPlanCreditEntryKind.expire : CoachPlanCreditEntryKind.release,
    idempotencyKey,
    cycleId: reservation.cycleId,
    reservationKey: reservation.reservationKey,
    reasonCode,
    occurredAt: now
  });

  const updated = await tx.coachPlanCreditReservation.update({
    where: { id: reservation.id },
    data: {
      status: kind === "expire" ? "expired" : "released",
      settledAt: now,
      version: { increment: 1 }
    }
  });

  await tx.coachPlanCreditWallet.update({
    where: { creatorId },
    data: {
      availableCredits: { increment: 1 },
      reservedCredits: { decrement: 1 }
    }
  });

  return {
    status: await buildStatus(tx, creatorId),
    reservation: wireReservation(updated),
    idempotent: false
  };
}

export async function releaseCoachPlanCreditReservation(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycleId: string;
    reason: string;
    idempotencyKey: string;
    now?: Date;
  }
): Promise<CoachPlanCreditMutationResult> {
  const creatorId = args.creatorId.trim();
  const cycleId = args.cycleId.trim();
  const idem = args.idempotencyKey.trim().slice(0, 191);
  const now = args.now ?? new Date();

  return withCreatorLock(prisma, creatorId, async (tx) => {
    const reservation = await findReservationByCycle(tx, cycleId);
    if (!reservation || reservation.creatorId !== creatorId) {
      throw new CoachPlanCreditError("GOAL_CYCLE_NOT_FOUND", "Reservation not found.", [
        { field: "cycle_id", issue: "not_found" }
      ]);
    }
    return settleReleaseLike(tx, {
      creatorId,
      reservation,
      idempotencyKey: idem,
      kind: "release",
      reasonCode: args.reason.slice(0, 64) || "release",
      now
    });
  });
}

export async function expireAbandonedCoachPlanReservations(
  prisma: PrismaClient,
  args: { now?: Date; batchSize?: number } = {}
): Promise<{ expired: number; reason_codes: string[] }> {
  const now = args.now ?? new Date();
  const batchSize = Math.min(Math.max(args.batchSize ?? 50, 1), 200);
  const due = await prisma.coachPlanCreditReservation.findMany({
    where: { status: "reserved", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: batchSize
  });

  let expired = 0;
  const reason_codes: string[] = [];
  for (const row of due) {
    try {
      await withCreatorLock(prisma, row.creatorId, async (tx) => {
        const fresh = await findReservationByCycle(tx, row.cycleId);
        if (!fresh || fresh.status !== "reserved") return;
        if (fresh.expiresAt > now) return;
        const idem = `expire:${fresh.reservationKey}`.slice(0, 191);
        await settleReleaseLike(tx, {
          creatorId: fresh.creatorId,
          reservation: fresh,
          idempotencyKey: idem,
          kind: "expire",
          reasonCode: "ttl_expired",
          now
        });
        expired += 1;
        reason_codes.push("ttl_expired");
      });
    } catch {
      // Continue batch; next run retries.
    }
  }
  return { expired, reason_codes };
}
