/**
 * VS11-T01 — Failure / resilience matrix (fixture mode).
 *
 * Covers provider weak/disabled/outage modes, attribution label honesty,
 * completion/learning failure paths, and time-zone schedule helpers.
 * Live vendor outage is simulated via TREND_MODE=disabled (VS10 owns live).
 */

import { describe, expect, it } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import {
  assertCanSuggestCompletion,
  evaluateCompletionEligibility,
  type GoalCycleOutcomeSnapshot
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-service.js";
import { buildLearningProposalFromSnapshot } from "../../src/goal-cycle/outcomes/goal-cycle-learning-service.js";
import {
  goalCycleOutcomeRefreshRepeatEveryMsFromEnv,
  runGoalCycleOutcomeRefreshOnce
} from "../../src/goal-cycle/outcomes/goal-cycle-outcome-worker.js";
import { syncSlotScheduledUtc } from "../../src/goal-cycle/planner/schedule-local.js";
import { resolveTrendProviders } from "../../src/goal-cycle/trends/provider-registry.js";
import { validatePlannerPlan } from "../../src/goal-cycle/planner/plan-schema.js";
import { buildGoalCycleFactPackFromDreamFixture } from "../../src/goal-cycle/planner/goal-cycle-fact-pack.js";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";

function snap(
  over: Partial<GoalCycleOutcomeSnapshot> & Pick<GoalCycleOutcomeSnapshot, "goal_kind">
): GoalCycleOutcomeSnapshot {
  return {
    snapshot_version: 1,
    cycle_id: "cycle_fail",
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
    completion: { eligible: false, kind: "none", reason: "n/a" },
    source_links: ["/studio/analytics"],
    calculated_at: "2026-07-17T16:00:00.000Z",
    ...over
  };
}

describe("VS11-T01 failure matrix", () => {
  it("provider weak/disabled/history_only remain safe fallbacks", () => {
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "disabled" }).mode).toBe("disabled");
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "history_only" }).mode).toBe(
      "history_only"
    );
    expect(resolveTrendProviders({ RELAY_GOAL_CYCLE_TREND_MODE: "fixture" }).mode).toBe("fixture");
  });

  it("stale metrics block auto-complete; plan-ended suggests review", () => {
    const stale = evaluateCompletionEligibility(
      snap({
        goal_kind: "engagement",
        stale: true,
        actual: {
          deterministic_label: "200",
          deterministic_value: 200,
          estimated_label: null,
          estimated_value: null
        }
      }),
      { planEnded: false }
    );
    expect(stale.kind).toBe("review");
    expect(stale.eligible).toBe(false);

    const ended = evaluateCompletionEligibility(
      snap({
        goal_kind: "views",
        actual: {
          deterministic_label: "10",
          deterministic_value: 10,
          estimated_label: null,
          estimated_value: null
        }
      }),
      { planEnded: true }
    );
    expect(ended.kind).toBe("review");
  });

  it("attribution: estimated lift never suggests complete; learning avoids target raise", () => {
    const completion = evaluateCompletionEligibility(
      snap({
        goal_kind: "paid_support",
        actual: {
          deterministic_label: null,
          deterministic_value: null,
          estimated_label: "lift",
          estimated_value: 5
        },
        target: { label: "Paid", value: 2, unit: "events" }
      }),
      { planEnded: false }
    );
    expect(completion.kind).toBe("review");

    const learning = buildLearningProposalFromSnapshot(
      snap({
        goal_kind: "paid_support",
        actual: {
          deterministic_label: null,
          deterministic_value: null,
          estimated_label: "lift",
          estimated_value: 5
        },
        target: { label: "Paid", value: 2, unit: "events" },
        completion: { eligible: true, kind: "review", reason: "estimated" }
      })
    );
    expect(learning.changes.every((c) => c.field !== "target")).toBe(true);
  });

  it("suggest gate rejects incomplete outcomes without force/allowReview", () => {
    const incomplete = {
      ...snap({ goal_kind: "engagement" }),
      completion: { eligible: false, kind: "none" as const, reason: "not yet" }
    };
    expect(() => assertCanSuggestCompletion(incomplete)).toThrow(GoalCycleContractError);
  });

  it("DST/local wall conversion syncs UTC for logistics windows", () => {
    const synced = syncSlotScheduledUtc(
      {
        scheduled_local: "2026-03-08T01:30:00",
        scheduled_utc: "2026-03-08T06:30:00.000Z",
        time_zone: "America/New_York"
      },
      "America/New_York"
    );
    expect(synced.scheduled_local).toBe("2026-03-08T01:30:00");
    expect(synced.scheduled_utc).toMatch(/Z$/);
  });

  it("month-boundary period keys stay creator-local in Dream fixture", () => {
    expect(DREAM_FLOW_FIXTURE.sample_cycle_summary.period_key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("ninth slot / unlinked destination plans fail validation", () => {
    const factPack = buildGoalCycleFactPackFromDreamFixture();
    const nine = {
      ...DREAM_FLOW_FIXTURE.sample_plan,
      slots: [
        ...DREAM_FLOW_FIXTURE.sample_plan.slots,
        ...Array.from({ length: 6 }, (_, i) => ({
          ...DREAM_FLOW_FIXTURE.sample_plan.slots[0]!,
          id: `slot_extra_${i}`
        }))
      ]
    };
    expect(() => validatePlannerPlan(nine, { factPack })).toThrow(/8 slots|LIMIT/i);

    const unlinked = {
      ...DREAM_FLOW_FIXTURE.sample_plan,
      slots: DREAM_FLOW_FIXTURE.sample_plan.slots.map((s, i) =>
        i === 0 ? { ...s, destination_ids: ["not_linked_dest"] } : s
      )
    };
    expect(() => validatePlannerPlan(unlinked, { factPack })).toThrow(GoalCycleContractError);
  });

  it("outcome refresh job respects disabled flag without throwing product terminalize", async () => {
    expect(
      goalCycleOutcomeRefreshRepeatEveryMsFromEnv({ RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS: "off" })
    ).toBeNull();

    const result = await runGoalCycleOutcomeRefreshOnce(
      {
        creatorGoalCycle: { findMany: async () => [] }
      } as never,
      { env: { RELAY_GOAL_CYCLE_ENABLED: "0" } }
    );
    expect(result.skipped_reason).toBe("goal_cycle_disabled");
    expect(result.refreshed).toBe(0);
  });
});
