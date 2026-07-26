import { describe, expect, it } from "vitest";
import {
  GOAL_CYCLE_CONTRACT_VERSION,
  GOAL_CYCLE_ERROR_CODES,
  GOAL_CYCLE_MAX_AI_REVISIONS,
  GOAL_CYCLE_MAX_QUESTIONS,
  GOAL_CYCLE_MAX_SLOTS,
  GoalCycleContractError,
  getGoalCycleFeatureFlags,
  validateGoalCyclePlan,
  type GoalCyclePlan
} from "../../src/goal-cycle/contracts.js";

function validSlot(overrides: Partial<GoalCyclePlan["slots"][number]> = {}) {
  return {
    id: "slot_1",
    intent: "engagement_hook",
    format: "image_post",
    title: "Sketch drop",
    draft_body: "A short caption",
    destination_ids: ["patreon"],
    scheduled_local: "2026-07-20T19:00:00",
    scheduled_utc: "2026-07-20T23:00:00.000Z",
    time_zone: "America/New_York",
    media_state: "missing" as const,
    evidence_refs: ["ev_history_1"],
    ...overrides
  };
}

function validPlan(overrides: Partial<GoalCyclePlan> = {}): GoalCyclePlan {
  return {
    version: 1,
    rationale: "Start with one strong piece.",
    slots: [validSlot()],
    questions_asked: [],
    ai_revision_count: 0,
    evidence_summary: "Using creator history only.",
    warnings: [],
    logistics: {
      time_zone: "America/New_York",
      linked_destination_ids: ["patreon"],
      notes: null
    },
    ...overrides
  };
}

describe("Goal Cycle wire contract (VS0-T02)", () => {
  it("exports a frozen contract version and stable error codes", () => {
    expect(GOAL_CYCLE_CONTRACT_VERSION).toBe("goal-cycle-wire-v1");
    expect(GOAL_CYCLE_ERROR_CODES).toContain("GOAL_CYCLE_ACTIVE_EXISTS");
    expect(GOAL_CYCLE_ERROR_CODES).toContain("GOAL_CYCLE_DESTINATION_UNLINKED");
    expect(GOAL_CYCLE_ERROR_CODES).toContain("GOAL_CYCLE_MATERIALIZATION_FAILED");
  });

  it("defaults feature flags to disabled / fixture", () => {
    const flags = getGoalCycleFeatureFlags({});
    expect(flags).toEqual({
      enabled: false,
      ai_enabled: false,
      trend_mode: "fixture",
      materialization_enabled: false
    });
  });

  it("accepts a valid Plan within eight-slot and two-revision bounds", () => {
    const plan = validateGoalCyclePlan(validPlan(), {
      goal_kind: "engagement",
      linked_destination_ids: ["patreon"]
    });
    expect(plan.slots).toHaveLength(1);
    expect(plan.ai_revision_count).toBe(0);
  });

  it("rejects a ninth slot with GOAL_CYCLE_LIMIT_EXCEEDED", () => {
    const slots = Array.from({ length: GOAL_CYCLE_MAX_SLOTS + 1 }, (_, i) =>
      validSlot({ id: `slot_${i + 1}` })
    );
    expect(() =>
      validateGoalCyclePlan(validPlan({ slots }), {
        goal_kind: "engagement",
        linked_destination_ids: ["patreon"]
      })
    ).toThrow(
      expect.objectContaining({
        name: "GoalCycleContractError",
        code: "GOAL_CYCLE_LIMIT_EXCEEDED"
      })
    );
  });

  it("rejects more than two clarification questions", () => {
    const questions = Array.from({ length: GOAL_CYCLE_MAX_QUESTIONS + 1 }, (_, i) => ({
      id: `q_${i + 1}`,
      prompt: `Question ${i + 1}?`,
      options: ["a", "b"],
      bounded_text: null,
      answer: null
    }));
    try {
      validateGoalCyclePlan(validPlan({ questions_asked: questions }), {
        goal_kind: "engagement",
        linked_destination_ids: ["patreon"]
      });
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GoalCycleContractError);
      expect((err as GoalCycleContractError).code).toBe("GOAL_CYCLE_LIMIT_EXCEEDED");
    }
  });

  it("rejects a third AI revision", () => {
    expect(() =>
      validateGoalCyclePlan(
        validPlan({ ai_revision_count: GOAL_CYCLE_MAX_AI_REVISIONS + 1 }),
        { goal_kind: "engagement", linked_destination_ids: ["patreon"] }
      )
    ).toThrow(
      expect.objectContaining({ code: "GOAL_CYCLE_LIMIT_EXCEEDED" })
    );
  });

  it("rejects unlinked destinations with GOAL_CYCLE_DESTINATION_UNLINKED", () => {
    expect(() =>
      validateGoalCyclePlan(
        validPlan({
          slots: [validSlot({ destination_ids: ["x"] })],
          logistics: {
            time_zone: "America/New_York",
            linked_destination_ids: ["patreon"],
            notes: null
          }
        }),
        { linked_destination_ids: ["patreon"] }
      )
    ).toThrow(
      expect.objectContaining({ code: "GOAL_CYCLE_DESTINATION_UNLINKED" })
    );
  });

  it("rejects non-ISO UTC scheduled_utc", () => {
    expect(() =>
      validateGoalCyclePlan(
        validPlan({
          slots: [validSlot({ scheduled_utc: "not-a-timestamp" })]
        }),
        { linked_destination_ids: ["patreon"] }
      )
    ).toThrow(
      expect.objectContaining({ code: "GOAL_CYCLE_PLAN_INVALID" })
    );
  });

  it("enforces complete_silence zero-slot and active_rest four-slot caps", () => {
    expect(() =>
      validateGoalCyclePlan(validPlan({ slots: [validSlot()] }), {
        goal_kind: "break",
        break_mode: "complete_silence",
        linked_destination_ids: ["patreon"]
      })
    ).toThrow(
      expect.objectContaining({ code: "GOAL_CYCLE_PLAN_INVALID" })
    );

    const restSlots = Array.from({ length: 5 }, (_, i) => validSlot({ id: `slot_${i + 1}` }));
    expect(() =>
      validateGoalCyclePlan(validPlan({ slots: restSlots }), {
        goal_kind: "break",
        break_mode: "active_rest",
        linked_destination_ids: ["patreon"]
      })
    ).toThrow(
      expect.objectContaining({ code: "GOAL_CYCLE_LIMIT_EXCEEDED" })
    );
  });

  it("parses trend mode enum and falls back invalid values to fixture", () => {
    expect(getGoalCycleFeatureFlags({ RELAY_GOAL_CYCLE_TREND_MODE: "live" }).trend_mode).toBe(
      "live"
    );
    expect(getGoalCycleFeatureFlags({ RELAY_GOAL_CYCLE_TREND_MODE: "history_only" }).trend_mode).toBe(
      "history_only"
    );
    expect(getGoalCycleFeatureFlags({ RELAY_GOAL_CYCLE_TREND_MODE: "bogus" }).trend_mode).toBe(
      "fixture"
    );
  });
});
