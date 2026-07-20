/**
 * VS2-T05 / remaining T06 — grant worker + DB concurrency integration.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  coachPlanCreditExpiryRepeatEveryMsFromEnv,
  coachPlanCreditGrantRepeatEveryMsFromEnv,
  runCoachPlanCreditExpiryOnce,
  runCoachPlanCreditGrantOnce
} from "../../src/usage/coach-plan-credit-grant-worker.js";
import {
  CoachPlanCreditError,
  grantMonthlyCoachPlanCredits,
  reconcileCoachPlanCreditWallet,
  reserveCoachPlanCreditForCycle
} from "../../src/usage/coach-plan-credit-service.js";
import { sumLedgerAmount } from "../../src/usage/coach-plan-credit-store.js";
import { prisma } from "../../src/lib/db.js";
import { RELAY_JOB_QUEUE_NAMES } from "../../src/jobs/queue-names.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN = randomUUID().slice(0, 8);
const CREATOR = `cpc_it_${RUN}`;

let tablesReady = false;

async function wipe(): Promise<void> {
  await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
}

async function seedCycle(suffix: string): Promise<string> {
  const id = `cycle_it_${RUN}_${suffix}`;
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

describe("coach plan credit grant worker (VS2-T05)", () => {
  it("registers queue names for grant and expiry", () => {
    expect(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_GRANT).toBe("coach_plan_credit_grant");
    expect(RELAY_JOB_QUEUE_NAMES.COACH_PLAN_CREDIT_EXPIRY).toBe("coach_plan_credit_expiry");
  });

  it("does not schedule grants without enabled flag + configured allowance", () => {
    expect(
      coachPlanCreditGrantRepeatEveryMsFromEnv({
        RELAY_GOAL_CYCLE_ENABLED: "1"
      })
    ).toBeNull();
    expect(
      coachPlanCreditGrantRepeatEveryMsFromEnv({
        RELAY_GOAL_CYCLE_ENABLED: "1",
        RELAY_COACH_PLAN_INCLUDED_CREDITS: "2"
      })
    ).toBeGreaterThan(0);
    expect(
      coachPlanCreditExpiryRepeatEveryMsFromEnv({
        RELAY_GOAL_CYCLE_ENABLED: "0"
      })
    ).toBeNull();
  });

  it("grant once skips when allowance unconfigured", async () => {
    const result = await runCoachPlanCreditGrantOnce(prisma, {
      env: { RELAY_GOAL_CYCLE_ENABLED: "1" },
      creatorId: CREATOR
    });
    expect(result.skipped_reason).toBe("allowance_unconfigured");
    expect(result.grants_applied).toBe(0);
  });
});

describe.skipIf(!hasDatabaseUrl)("coach plan credit concurrency integration (VS2-T06)", () => {
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

  it("one credit cannot be reserved twice under concurrency; wallet reconciles", async () => {
    if (!tablesReady) return;
    await wipe();
    await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 1,
      idempotencyKey: `grant:${CREATOR}:it`
    });
    const cycles = await Promise.all([seedCycle("a"), seedCycle("b"), seedCycle("c")]);
    const settled = await Promise.allSettled(
      cycles.map((cycleId) =>
        reserveCoachPlanCreditForCycle(prisma, {
          creatorId: CREATOR,
          cycleId,
          idempotencyKey: `reserve:${cycleId}`
        })
      )
    );
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((r) => r.status === "rejected")).toHaveLength(2);
    for (const r of settled) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(CoachPlanCreditError);
      }
    }
    const reconciled = await reconcileCoachPlanCreditWallet(prisma, CREATOR);
    expect(reconciled.available).toBe(await sumLedgerAmount(prisma, CREATOR));
    expect(reconciled.available + reconciled.reserved).toBe(1);
  }, 60_000);

  it("expiry job recovers abandoned holds", async () => {
    if (!tablesReady) return;
    await wipe();
    await grantMonthlyCoachPlanCredits(prisma, {
      creatorId: CREATOR,
      periodKey: "2026-07",
      allowance: 1,
      idempotencyKey: `grant:${CREATOR}:exp`
    });
    const cycleId = await seedCycle("exp");
    await reserveCoachPlanCreditForCycle(prisma, {
      creatorId: CREATOR,
      cycleId,
      idempotencyKey: `reserve:${cycleId}`,
      now: new Date("2026-01-01T00:00:00.000Z"),
      ttlDays: 1
    });
    const exp = await runCoachPlanCreditExpiryOnce(prisma, {
      now: new Date("2026-01-10T00:00:00.000Z"),
      env: { RELAY_GOAL_CYCLE_ENABLED: "1" },
      batchSize: 20
    });
    expect(exp.expired).toBeGreaterThanOrEqual(1);
    expect(exp.reason_codes).toContain("ttl_expired");
  }, 60_000);

  it("configured grant job is idempotent for one creator", async () => {
    if (!tablesReady) return;
    await wipe();
    const env = {
      RELAY_GOAL_CYCLE_ENABLED: "1",
      RELAY_COACH_PLAN_INCLUDED_CREDITS: "3"
    };
    const first = await runCoachPlanCreditGrantOnce(prisma, {
      creatorId: CREATOR,
      env,
      now: new Date("2026-07-17T12:00:00.000Z")
    });
    const second = await runCoachPlanCreditGrantOnce(prisma, {
      creatorId: CREATOR,
      env,
      now: new Date("2026-07-17T12:00:00.000Z")
    });
    expect(first.grants_applied + first.grants_idempotent).toBe(1);
    expect(second.grants_idempotent).toBe(1);
    expect(second.grants_applied).toBe(0);
    expect(await sumLedgerAmount(prisma, CREATOR)).toBe(3);
  }, 60_000);
});
