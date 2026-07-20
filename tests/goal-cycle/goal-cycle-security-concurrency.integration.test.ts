/**
 * VS11-T01 — Security / concurrency verification matrix.
 *
 * Re-validates tenant isolation and concurrent mutation contracts.
 * Real-DB cases skip when tables are absent (no auto-migrate).
 * Concurrent active-scope races use free complete_silence so credit scarcity
 * does not mask the uniqueness contract under test.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import {
  cancelGoalCycle,
  getActiveGoalCycle,
  getGoalCycle,
  GoalCycleNotFoundError,
  patchGoalCycleCheckpoint,
  startGoalCycle
} from "../../src/goal-cycle/goal-cycle-service.js";
import { grantMonthlyCoachPlanCredits } from "../../src/usage/coach-plan-credit-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR_A = `gc_sec_a_${RUN_ID}`;
const CREATOR_B = `gc_sec_b_${RUN_ID}`;

let tablesReady = false;
let skipReason = "not checked";

async function wipe(...ids: string[]): Promise<void> {
  await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: { in: ids } } });
  for (const creatorId of ids) {
    await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId } }).catch(() => undefined);
    await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId } }).catch(() => undefined);
    await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId } }).catch(() => undefined);
  }
}

async function seedCredits(creatorId: string, allowance = 3): Promise<void> {
  await grantMonthlyCoachPlanCredits(prisma, {
    creatorId,
    periodKey: "2026-07",
    allowance,
    idempotencyKey: `grant:${creatorId}:vs11:${Date.now()}`
  });
}

describe("VS11-T01 security matrix (always-on)", () => {
  it("cross-tenant errors remain typed (contract surface)", () => {
    expect(new GoalCycleNotFoundError().name).toBe("GoalCycleNotFoundError");
    expect(new GoalCycleContractError("GOAL_CYCLE_ACTIVE_EXISTS", "busy").code).toBe(
      "GOAL_CYCLE_ACTIVE_EXISTS"
    );
  });
});

describe.skipIf(!hasDatabaseUrl)("VS11-T01 security/concurrency (real DB)", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycles')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady
      ? ""
      : "creator_goal_cycles not present — apply Goal Cycle migrations (human gate)";
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    if (tablesReady) await wipe(CREATOR_A, CREATOR_B);
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await wipe(CREATOR_A, CREATOR_B);
  }, 60_000);

  it("concurrent silence starts: exactly one active cycle", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe(CREATOR_A);
    const results = await Promise.allSettled([
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "break",
        break_mode: "complete_silence",
        now: new Date("2026-07-17T16:00:00.000Z")
      }),
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "break",
        break_mode: "complete_silence",
        now: new Date("2026-07-17T16:00:00.000Z")
      }),
      startGoalCycle(prisma, CREATOR_A, {
        goal_kind: "break",
        break_mode: "complete_silence",
        now: new Date("2026-07-17T16:00:00.000Z")
      })
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);
    for (const r of rejected) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(GoalCycleContractError);
        expect((r.reason as GoalCycleContractError).code).toBe("GOAL_CYCLE_ACTIVE_EXISTS");
      }
    }
    const active = await getActiveGoalCycle(prisma, CREATOR_A);
    expect(active?.cycle_id).toBe(
      (fulfilled[0] as PromiseFulfilledResult<{ cycle_id: string }>).value.cycle_id
    );
  }, 60_000);

  it("cross-tenant get is not found; cancel frees restart", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe(CREATOR_A, CREATOR_B);
    await seedCredits(CREATOR_A, 2);
    const a = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "engagement",
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    await expect(getGoalCycle(prisma, CREATOR_B, a.cycle_id)).rejects.toBeInstanceOf(
      GoalCycleNotFoundError
    );
    await cancelGoalCycle(prisma, CREATOR_A, a.cycle_id, "vs11");
    const next = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "views",
      now: new Date("2026-07-18T12:00:00.000Z")
    });
    expect(next.cycle_id).not.toBe(a.cycle_id);
  }, 60_000);

  it("concurrent checkpoint patches are version-safe", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe(CREATOR_A);
    await seedCredits(CREATOR_A, 1);
    const started = await startGoalCycle(prisma, CREATOR_A, {
      goal_kind: "engagement",
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    const results = await Promise.allSettled([
      patchGoalCycleCheckpoint(prisma, CREATOR_A, started.cycle_id, {
        expected_version: started.version,
        phase: "context",
        context: { topic: "a" }
      }),
      patchGoalCycleCheckpoint(prisma, CREATOR_A, started.cycle_id, {
        expected_version: started.version,
        phase: "context",
        context: { topic: "b" }
      })
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(GoalCycleContractError);
      expect((rejected[0].reason as GoalCycleContractError).code).toBe(
        "GOAL_CYCLE_VERSION_CONFLICT"
      );
    }
  }, 60_000);
});
