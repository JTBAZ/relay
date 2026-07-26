/**
 * VS1-T05 — Goal Cycle concurrency and tenant isolation against a real DB.
 *
 * Skips when DATABASE_URL is missing or migration `20260717180000_creator_goal_cycles`
 * has not been applied (human gate: do not auto-migrate production).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import {
  cancelGoalCycle,
  confirmGoalCycleCompletion,
  getActiveGoalCycle,
  getGoalCycle,
  GoalCycleNotFoundError,
  listGoalCycles,
  patchGoalCycleCheckpoint,
  startGoalCycle,
  suggestGoalCycleCompletion
} from "../../src/goal-cycle/goal-cycle-service.js";
import { grantMonthlyCoachPlanCredits } from "../../src/usage/coach-plan-credit-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR_A = `gc_iso_a_${RUN_ID}`;
const CREATOR_B = `gc_iso_b_${RUN_ID}`;

let tablesReady = false;
let skipReason = "not checked";

async function wipeCreators(...creatorIds: string[]): Promise<void> {
  await prisma.creatorGoalCycle.deleteMany({
    where: { creatorId: { in: creatorIds } }
  });
  for (const creatorId of creatorIds) {
    await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId } }).catch(() => undefined);
    await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId } }).catch(() => undefined);
    await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId } }).catch(() => undefined);
  }
}

async function seedCredits(creatorId: string, allowance = 5): Promise<void> {
  await grantMonthlyCoachPlanCredits(prisma, {
    creatorId,
    periodKey: "2026-07",
    allowance,
    idempotencyKey: `grant:${creatorId}:iso:${allowance}:${Date.now()}`
  });
}

describe.skipIf(!hasDatabaseUrl)("Goal Cycle isolation (VS1-T05, real DB)", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycles')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady
      ? ""
      : "creator_goal_cycles not present — apply migration 20260717180000_creator_goal_cycles (human gate)";
    if (tablesReady) {
      await wipeCreators(CREATOR_A, CREATOR_B);
    }
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await wipeCreators(CREATOR_A, CREATOR_B);
  }, 60_000);

  it("simultaneous starts yield exactly one active cycle", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipeCreators(CREATOR_A);
    await seedCredits(CREATOR_A);

    const results = await Promise.allSettled([
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "engagement",
        time_zone: "America/New_York",
        now: new Date("2026-07-17T16:00:00.000Z")
      }),
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "views",
        time_zone: "America/New_York",
        now: new Date("2026-07-17T16:00:00.000Z")
      }),
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "paid_support",
        time_zone: "America/New_York",
        now: new Date("2026-07-17T16:00:00.000Z")
      })
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
    for (const r of rejected) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(GoalCycleContractError);
        expect((r.reason as GoalCycleContractError).code).toBe("GOAL_CYCLE_ACTIVE_EXISTS");
      }
    }

    const active = await getActiveGoalCycle(prisma, CREATOR_A);
    expect(active?.cycle_id).toBe(
      (fulfilled[0] as PromiseFulfilledResult<{ cycle_id: string }>).value.cycle_id
    );

    const rows = await prisma.creatorGoalCycle.findMany({ where: { creatorId: CREATOR_A } });
    expect(rows.filter((r) => r.activeScope === "active")).toHaveLength(1);
  }, 60_000);

  it("simultaneous checkpoint patches are version-safe", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipeCreators(CREATOR_A);
    await seedCredits(CREATOR_A);
    const started = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "engagement",
      time_zone: "America/New_York",
      now: new Date("2026-07-17T16:00:00.000Z")
    });

    const results = await Promise.allSettled([
      patchGoalCycleCheckpoint(prisma, CREATOR_A, started.cycle_id, {
        expected_version: 1,
        phase: "context",
        state: "researching",
        context: { lane: "a" },
        progress_message_code: "patch_a"
      }),
      patchGoalCycleCheckpoint(prisma, CREATOR_A, started.cycle_id, {
        expected_version: 1,
        phase: "research",
        state: "researching",
        context: { lane: "b" },
        progress_message_code: "patch_b"
      })
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const conflict = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(conflict).toHaveLength(1);
    if (conflict[0]?.status === "rejected") {
      expect(conflict[0].reason).toMatchObject({ code: "GOAL_CYCLE_VERSION_CONFLICT" });
    }

    const detail = await getGoalCycle(prisma, CREATOR_A, started.cycle_id);
    expect(detail.version).toBe(2);
    expect(detail.progress).toHaveLength(1);
  }, 60_000);

  it("terminal confirm frees active scope for a later same-month cycle", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipeCreators(CREATOR_A);
    await seedCredits(CREATOR_A, 5);
    const first = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "engagement",
      time_zone: "America/New_York",
      now: new Date("2026-07-17T16:00:00.000Z")
    });

    await prisma.creatorGoalCycle.update({
      where: { id: first.cycle_id },
      data: { state: "active", phase: "active" }
    });
    await suggestGoalCycleCompletion(prisma, CREATOR_A, first.cycle_id, { force: true });
    const completed = await confirmGoalCycleCompletion(prisma, CREATOR_A, first.cycle_id);
    expect(completed.state).toBe("completed");
    expect(await getActiveGoalCycle(prisma, CREATOR_A)).toBeNull();

    const second = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "views",
      time_zone: "America/New_York",
      now: new Date("2026-07-25T12:00:00.000Z")
    });
    expect(second.cycle_id).not.toBe(first.cycle_id);
    expect(second.period_key).toBe(first.period_key);
    expect(second.period_key).toBe("2026-07");

    const history = await listGoalCycles(prisma, CREATOR_A, { limit: 10 });
    expect(history.items.map((i) => i.cycle_id).sort()).toEqual(
      [first.cycle_id, second.cycle_id].sort()
    );
  }, 60_000);

  it("cancel then restart is allowed; cross-tenant get is not found", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipeCreators(CREATOR_A, CREATOR_B);
    await seedCredits(CREATOR_A, 5);
    await seedCredits(CREATOR_B, 5);

    const a = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "engagement",
      time_zone: "UTC",
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    const b = await startGoalCycle(prisma, CREATOR_B, {
      goal_kind: "views",
      time_zone: "UTC",
      now: new Date("2026-07-17T16:00:00.000Z")
    });

    await expect(getGoalCycle(prisma, CREATOR_B, a.cycle_id)).rejects.toBeInstanceOf(
      GoalCycleNotFoundError
    );
    await expect(getGoalCycle(prisma, CREATOR_A, b.cycle_id)).rejects.toBeInstanceOf(
      GoalCycleNotFoundError
    );

    await cancelGoalCycle(prisma, CREATOR_A, a.cycle_id, "swap");
    const restarted = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "paid_support",
      time_zone: "UTC",
      now: new Date("2026-07-18T10:00:00.000Z")
    });
    expect(restarted.cycle_id).not.toBe(a.cycle_id);

    const activeA = await getActiveGoalCycle(prisma, CREATOR_A);
    const activeB = await getActiveGoalCycle(prisma, CREATOR_B);
    expect(activeA?.cycle_id).toBe(restarted.cycle_id);
    expect(activeB?.cycle_id).toBe(b.cycle_id);
  }, 60_000);
});
