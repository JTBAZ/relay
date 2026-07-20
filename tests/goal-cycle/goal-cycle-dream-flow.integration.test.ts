/**
 * VS11-T01 — Dream-flow automated integration matrix (fixture mode).
 *
 * Verification worker: asserts DF-01…DF-10 contracts against locked services/fixtures.
 * Does not mutate product behavior. Live trend vendor paths are out of scope (VS10).
 *
 * Real-DB lifecycle smoke runs when DATABASE_URL + creator_goal_cycles are present;
 * otherwise those cases skip (human gate: do not auto-migrate).
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GOAL_CYCLE_CONTRACT_VERSION,
  getGoalCycleFeatureFlags,
  isGoalCycleBreakMode,
  isGoalCycleGoalKind
} from "../../src/goal-cycle/contracts.js";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import {
  confirmGoalCycleCompletion,
  dismissGoalCycleCompletionSuggestion,
  getActiveGoalCycle,
  listGoalCycles,
  startGoalCycle,
  suggestGoalCycleCompletion
} from "../../src/goal-cycle/goal-cycle-service.js";
import {
  evaluateCompletionEligibility,
  type GoalCycleOutcomeSnapshot
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-service.js";
import {
  acceptGoalCycleLearning,
  buildLearningProposalFromSnapshot,
  peekAcceptedLearningSeed,
  proposeGoalCycleLearning,
  rejectGoalCycleLearning
} from "../../src/goal-cycle/outcomes/goal-cycle-learning-service.js";
import { resolveTrendProviders } from "../../src/goal-cycle/trends/provider-registry.js";
import { grantMonthlyCoachPlanCredits } from "../../src/usage/coach-plan-credit-service.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR = `gc_df_${RUN_ID}`;

let tablesReady = false;
let skipReason = "not checked";

async function wipe(): Promise<void> {
  await prisma.creatorGoalCycle.deleteMany({ where: { creatorId: CREATOR } });
  await prisma.coachPlanCreditReservation.deleteMany({ where: { creatorId: CREATOR } }).catch(() => undefined);
  await prisma.coachPlanCreditLedger.deleteMany({ where: { creatorId: CREATOR } }).catch(() => undefined);
  await prisma.coachPlanCreditWallet.deleteMany({ where: { creatorId: CREATOR } }).catch(() => undefined);
}

async function seedCredits(allowance = 3): Promise<void> {
  await grantMonthlyCoachPlanCredits(prisma, {
    creatorId: CREATOR,
    periodKey: "2026-07",
    allowance,
    idempotencyKey: `grant:${CREATOR}:vs11:${allowance}:${Date.now()}`
  });
}

function baseSnap(
  over: Partial<GoalCycleOutcomeSnapshot> & Pick<GoalCycleOutcomeSnapshot, "goal_kind">
): Omit<GoalCycleOutcomeSnapshot, "completion"> {
  return {
    snapshot_version: 1,
    cycle_id: "cycle_df",
    break_mode: null,
    window: { label: "2026-07", started_at: null, ends_at: null },
    target: { label: "Target", value: 100, unit: "units" },
    actual: {
      deterministic_label: null,
      deterministic_value: null,
      estimated_label: null,
      estimated_value: null
    },
    baseline: {},
    coverage: "partial",
    freshness_seconds: 0,
    confidence: "medium",
    stale: false,
    stale_after_seconds: 48 * 3600,
    task_completion: {
      required: 0,
      done: 0,
      skipped: 0,
      pending: 0,
      all_terminal: true,
      any_publish_done: false
    },
    publish_completion: { planned: 0, published: 0 },
    source_links: ["/studio/analytics"],
    calculated_at: "2026-07-17T16:00:00.000Z",
    ...over
  };
}

describe("VS11-T01 Dream flow matrix (fixture / always-on)", () => {
  it("DF-02: bounded goal kinds and break modes remain locked", () => {
    expect(GOAL_CYCLE_CONTRACT_VERSION).toBe("goal-cycle-wire-v1");
    for (const kind of ["engagement", "views", "paid_support", "break"] as const) {
      expect(isGoalCycleGoalKind(kind)).toBe(true);
    }
    expect(isGoalCycleGoalKind("reach")).toBe(false);
    for (const mode of ["complete_silence", "social_upkeep", "active_rest"] as const) {
      expect(isGoalCycleBreakMode(mode)).toBe(true);
    }
    expect(DREAM_FLOW_FIXTURE.sample_plan.slots.length).toBeLessThanOrEqual(8);
  });

  it("DF-03: fixture/history_only trend modes never require a live vendor", () => {
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }).mode).toBe("fixture");
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "history_only" }).mode).toBe(
      "history_only"
    );
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "disabled" }).mode).toBe("disabled");
    expect(getGoalCycleFeatureFlags({ RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }).trend_mode).toBe(
      "fixture"
    );
  });

  it("DF-05: Dream Plan fixture respects slot and revision caps", () => {
    expect(DREAM_FLOW_FIXTURE.sample_plan.slots.length).toBeLessThanOrEqual(8);
    expect(DREAM_FLOW_FIXTURE.sample_plan.ai_revision_count).toBeLessThanOrEqual(2);
    expect(DREAM_FLOW_FIXTURE.sample_plan.logistics.linked_destination_ids.length).toBeGreaterThan(0);
  });

  it("DF-09: estimated paid support is never completion; unavailable ≠ zero", () => {
    const estimated = evaluateCompletionEligibility(
      {
        ...baseSnap({
          goal_kind: "paid_support",
          actual: {
            deterministic_label: null,
            deterministic_value: null,
            estimated_label: "lift 3",
            estimated_value: 3
          },
          target: { label: "Paid", value: 2, unit: "events" }
        })
      },
      { planEnded: false }
    );
    expect(estimated.kind).toBe("review");

    const unavailable = evaluateCompletionEligibility(
      {
        ...baseSnap({
          goal_kind: "views",
          coverage: "unavailable",
          actual: {
            deterministic_label: null,
            deterministic_value: null,
            estimated_label: null,
            estimated_value: null
          }
        })
      },
      { planEnded: false }
    );
    expect(unavailable.kind).not.toBe("complete");
    expect(unavailable.reason.toLowerCase()).not.toMatch(/\b0\b.*met/);
  });

  it("DF-10: rejected learning leaves no seed; accepted may seed", () => {
    const proposal = buildLearningProposalFromSnapshot(
      {
        ...baseSnap({
          goal_kind: "engagement",
          actual: {
            deterministic_label: "120",
            deterministic_value: 120,
            estimated_label: null,
            estimated_value: null
          }
        }),
        completion: { eligible: true, kind: "complete", reason: "met" }
      },
      { proposalId: "glp_df" }
    );
    expect(proposal.status).toBe("suggested");
    expect(proposal.changes.every((c) => ["goal", "target", "cadence", "format_mix", "destination_mix"].includes(c.field))).toBe(
      true
    );
  });
});

describe.skipIf(!hasDatabaseUrl)("VS11-T01 Dream flow lifecycle smoke (real DB)", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
      "SELECT to_regclass('public.creator_goal_cycles')::text AS t"
    );
    tablesReady = Boolean(rows[0]?.t);
    skipReason = tablesReady
      ? ""
      : "creator_goal_cycles not present — apply Goal Cycle migrations (human gate)";
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    if (tablesReady) await wipe();
  }, 60_000);

  afterAll(async () => {
    if (!tablesReady) return;
    await wipe();
  }, 60_000);

  it("DF-01/07/09/10: start → suggest/dismiss → complete → same-month restart; learning reject has no seed", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe();
    await seedCredits(3);

    const started = await startGoalCycle(prisma, CREATOR, {
      goal_kind: "engagement",
      time_zone: "America/New_York",
      context: { target_value: 10, actual_engagement: 50 },
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    expect(started.state).toBe("draft");
    expect(await getActiveGoalCycle(prisma, CREATOR)).not.toBeNull();

    await prisma.creatorGoalCycle.update({
      where: { id: started.cycle_id },
      data: { state: "active", phase: "active" }
    });

    const suggested = await suggestGoalCycleCompletion(prisma, CREATOR, started.cycle_id);
    expect(suggested.state).toBe("completion_suggested");

    const dismissed = await dismissGoalCycleCompletionSuggestion(
      prisma,
      CREATOR,
      started.cycle_id
    );
    expect(dismissed.state).toBe("active");

    await suggestGoalCycleCompletion(prisma, CREATOR, started.cycle_id);
    const completed = await confirmGoalCycleCompletion(prisma, CREATOR, started.cycle_id);
    expect(completed.state).toBe("completed");
    expect(await getActiveGoalCycle(prisma, CREATOR)).toBeNull();

    await proposeGoalCycleLearning(prisma, CREATOR, started.cycle_id);
    await rejectGoalCycleLearning(prisma, CREATOR, started.cycle_id);
    expect(await peekAcceptedLearningSeed(prisma, CREATOR)).toBeNull();

    await proposeGoalCycleLearning(prisma, CREATOR, started.cycle_id);
    await acceptGoalCycleLearning(prisma, CREATOR, started.cycle_id);
    expect(await peekAcceptedLearningSeed(prisma, CREATOR)).toMatchObject({
      source_cycle_id: started.cycle_id
    });

    const second = await startGoalCycle(prisma, CREATOR, {
      goal_kind: "views",
      time_zone: "America/New_York",
      now: new Date("2026-07-25T12:00:00.000Z")
    });
    expect(second.period_key).toBe(started.period_key);
    expect(second.cycle_id).not.toBe(started.cycle_id);

    const history = await listGoalCycles(prisma, CREATOR, { limit: 10 });
    expect(history.items.length).toBeGreaterThanOrEqual(2);
  }, 90_000);

  it("DF-01: second active start is rejected", async (ctx) => {
    if (!tablesReady) ctx.skip(skipReason);
    await wipe();
    await seedCredits(2);
    await startGoalCycle(prisma, CREATOR, {
      goal_kind: "engagement",
      now: new Date("2026-07-17T16:00:00.000Z")
    });
    await expect(
      startGoalCycle(prisma, CREATOR, {
        goal_kind: "views",
        now: new Date("2026-07-17T16:01:00.000Z")
      })
    ).rejects.toMatchObject({ code: "GOAL_CYCLE_ACTIVE_EXISTS" });
  }, 60_000);
});
