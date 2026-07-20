/**
 * VS2-T02 / VS2-T06 — Coach Plan credit service invariants (DB-backed).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyCoachPlanCreditCorrection,
  CoachPlanCreditError,
  consumeCoachPlanCreditReservation,
  expireAbandonedCoachPlanReservations,
  getCoachPlanCreditStatus,
  grantMonthlyCoachPlanCredits,
  reconcileCoachPlanCreditWallet,
  releaseCoachPlanCreditReservation,
  reserveCoachPlanCreditForCycle,
  shouldReserveCoachPlanCredit
} from "../../src/usage/coach-plan-credit-service.js";
import { prisma } from "../../src/lib/db.js";
import { sumLedgerAmount } from "../../src/usage/coach-plan-credit-store.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN = randomUUID().slice(0, 8);
const CREATOR = `cpc_svc_${RUN}`;

let tablesReady = false;

async function wipe(): Promise<void> {
  await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
}

async function seedCycle(suffix: string): Promise<string> {
  const id = `cycle_${RUN}_${suffix}`;
  await prisma.creatorGoalCycle.create({
    data: {
      id,
      creatorId: CREATOR,
      state: "draft",
      phase: "goal",
      goalKind: "engagement",
      periodKey: "2026-07",
      timeZone: "UTC",
      activeScope: null,
      version: 1,
      contextJson: {}
    }
  });
  return id;
}

describe.skipIf(!hasDatabaseUrl)("Coach Plan credit service (VS2-T02/T06)", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.coach_plan_credit_ledger')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    if (tablesReady) await wipe();
  }, 60_000);

  afterAll(async () => {
    if (tablesReady) await wipe();
  }, 60_000);

  it("silence bypasses reservation; upkeep/active rest require credit", () => {
    expect(
      shouldReserveCoachPlanCredit({ goal_kind: "break", break_mode: "complete_silence" })
    ).toBe(false);
    expect(
      shouldReserveCoachPlanCredit({ goal_kind: "break", break_mode: "social_upkeep" })
    ).toBe(true);
    expect(
      shouldReserveCoachPlanCredit({ goal_kind: "break", break_mode: "active_rest" })
    ).toBe(true);
    expect(shouldReserveCoachPlanCredit({ goal_kind: "engagement" })).toBe(true);
  });

  it("grants are idempotent and wallet reconciles to ledger", async () => {
    if (!tablesReady) return;
    await wipe();
    const a = await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 2,
      idempotencyKey: `grant:${CREATOR}:2026-07`
    });
    expect(a.idempotent).toBe(false);
    expect(a.status.available).toBe(2);

    const b = await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 2,
      idempotencyKey: `grant:${CREATOR}:2026-07`
    });
    expect(b.idempotent).toBe(true);
    expect(b.status.available).toBe(2);

    const reconciled = await reconcileCoachPlanCreditWallet(prisma, CREATOR);
    expect(reconciled.available).toBe(2);
    expect(await sumLedgerAmount(prisma, CREATOR)).toBe(2);
  }, 60_000);

  it("parallel reserves with one credit yield exactly one success", async () => {
    if (!tablesReady) return;
    await wipe();
    await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 1,
      idempotencyKey: `grant:${CREATOR}:one`
    });
    const c1 = await seedCycle("r1");
    const c2 = await seedCycle("r2");
    const c3 = await seedCycle("r3");

    const settled = await Promise.allSettled([
      reserveCoachPlanCreditForCycle(prisma, {
        creatorId: CREATOR,
        cycleId: c1,
        idempotencyKey: `reserve:${c1}`
      }),
      reserveCoachPlanCreditForCycle(prisma, {
        creatorId: CREATOR,
        cycleId: c2,
        idempotencyKey: `reserve:${c2}`
      }),
      reserveCoachPlanCreditForCycle(prisma, {
        creatorId: CREATOR,
        cycleId: c3,
        idempotencyKey: `reserve:${c3}`
      })
    ]);

    const ok = settled.filter((r) => r.status === "fulfilled");
    const bad = settled.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(2);
    for (const r of bad) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(CoachPlanCreditError);
        expect((r.reason as CoachPlanCreditError).code).toBe("GOAL_CYCLE_NO_CREDIT");
      }
    }

    const status = await getCoachPlanCreditStatus(prisma, CREATOR);
    expect(status.available).toBe(0);
    expect(status.reserved).toBe(1);
  }, 60_000);

  it("duplicate reserve/consume/release are idempotent; resume reuses reservation", async () => {
    if (!tablesReady) return;
    await wipe();
    await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 1,
      idempotencyKey: `grant:${CREATOR}:flow`
    });
    const cycleId = await seedCycle("flow");

    const r1 = await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: CREATOR,
      cycleId,
      idempotencyKey: `reserve:${cycleId}`
    });
    const r2 = await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: CREATOR,
      cycleId,
      idempotencyKey: `reserve:${cycleId}:retry`
    });
    expect(r2.idempotent).toBe(true);
    expect(r2.reservation?.reservation_key).toBe(r1.reservation?.reservation_key);
    expect(r2.status.reserved).toBe(1);

    const c1 = await consumeCoachPlanCreditReservation(prisma, {
      creatorId: CREATOR,
      cycleId,
      approvalKey: "approve_flow_1"
    });
    const c2 = await consumeCoachPlanCreditReservation(prisma, {
      creatorId: CREATOR,
      cycleId,
      approvalKey: "approve_flow_1"
    });
    expect(c1.idempotent).toBe(false);
    expect(c2.idempotent).toBe(true);
    expect(c2.reservation?.status).toBe("consumed");
    expect(c2.status.available).toBe(0);
    expect(c2.status.reserved).toBe(0);
    expect(await sumLedgerAmount(prisma, CREATOR)).toBe(0);
  }, 60_000);

  it("release returns credit once; expire recovers abandoned holds", async () => {
    if (!tablesReady) return;
    await wipe();
    await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 1,
      idempotencyKey: `grant:${CREATOR}:rel`
    });
    const cycleId = await seedCycle("rel");
    await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: CREATOR,
      cycleId,
      idempotencyKey: `reserve:${cycleId}`
    });

    const rel1 = await releaseCoachPlanCreditReservation(prisma, {
      creatorId: CREATOR,
      cycleId,
      reason: "cancelled",
      idempotencyKey: `release:${cycleId}`
    });
    const rel2 = await releaseCoachPlanCreditReservation(prisma, {
      creatorId: CREATOR,
      cycleId,
      reason: "cancelled",
      idempotencyKey: `release:${cycleId}`
    });
    expect(rel1.status.available).toBe(1);
    expect(rel2.idempotent).toBe(true);

    const cycleB = await seedCycle("exp");
    await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: CREATOR,
      cycleId: cycleB,
      idempotencyKey: `reserve:${cycleB}`,
      now: new Date("2026-01-01T00:00:00.000Z"),
      ttlDays: 1
    });
    const exp = await expireAbandonedCoachPlanReservations(prisma, {
      now: new Date("2026-01-10T00:00:00.000Z"),
      batchSize: 10
    });
    expect(exp.expired).toBeGreaterThanOrEqual(1);
    const status = await getCoachPlanCreditStatus(prisma, CREATOR);
    expect(status.available).toBe(1);
    expect(status.reserved).toBe(0);

    const corrected = await applyCoachPlanCreditCorrection(prisma, {
      creatorId: CREATOR,
      amount: 1,
      idempotencyKey: `corr:${CREATOR}:1`,
      reasonCode: "ops_adjust"
    });
    expect(corrected.status.available).toBe(2);
    const again = await reconcileCoachPlanCreditWallet(prisma, CREATOR);
    expect(again.available).toBe(await sumLedgerAmount(prisma, CREATOR));
  }, 60_000);
});
