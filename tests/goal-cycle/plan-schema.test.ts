import { describe, expect, it } from "vitest";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";
import { buildDeterministicPlanFallback } from "../../src/goal-cycle/planner/deterministic-plan-fallback.js";
import { buildGoalCycleFactPackFromDreamFixture } from "../../src/goal-cycle/planner/goal-cycle-fact-pack.js";
import {
  GOAL_CYCLE_PLAN_SCHEMA_VERSION,
  parsePlannerAiOutput,
  validatePlannerPlan
} from "../../src/goal-cycle/planner/plan-schema.js";

describe("VS5-T02 plan schema + fallback", () => {
  const factPack = buildGoalCycleFactPackFromDreamFixture();

  it("exports schema version and validates Dream sample plan against fact pack", () => {
    expect(GOAL_CYCLE_PLAN_SCHEMA_VERSION).toBe("goal-cycle-plan-schema-v1");
    const plan = validatePlannerPlan(DREAM_FLOW_FIXTURE.sample_plan, { factPack });
    expect(plan.slots).toHaveLength(3);
    expect(plan.logistics.time_zone).toBe(factPack.time_zone);
  });

  it("parses AI JSON envelopes and rejects malformed JSON", () => {
    expect(parsePlannerAiOutput("{")).toBeNull();
    const nested = parsePlannerAiOutput(
      JSON.stringify({ plan: DREAM_FLOW_FIXTURE.sample_plan })
    );
    expect(nested).toMatchObject({ version: 1 });
  });

  it("rejects unknown evidence refs and a ninth slot", () => {
    const badRef = {
      ...DREAM_FLOW_FIXTURE.sample_plan,
      slots: DREAM_FLOW_FIXTURE.sample_plan.slots.map((s, i) =>
        i === 0 ? { ...s, evidence_refs: ["ev_hallucinated"] } : s
      )
    };
    expect(() => validatePlannerPlan(badRef, { factPack })).toThrow(GoalCycleContractError);

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
  });

  it("enforces rest branch format and silence zero-slot rules", () => {
    const silencePack = buildGoalCycleFactPackFromDreamFixture(DREAM_FLOW_FIXTURE, {
      goal_kind: "break",
      break_mode: "complete_silence"
    });
    expect(() =>
      validatePlannerPlan(
        {
          ...DREAM_FLOW_FIXTURE.sample_plan,
          slots: DREAM_FLOW_FIXTURE.sample_plan.slots
        },
        { factPack: silencePack, goal_kind: "break", break_mode: "complete_silence" }
      )
    ).toThrow(/zero slots/i);

    const restPack = buildGoalCycleFactPackFromDreamFixture(DREAM_FLOW_FIXTURE, {
      goal_kind: "break",
      break_mode: "active_rest"
    });
    expect(() =>
      validatePlannerPlan(
        {
          version: 1,
          rationale: "Rest",
          evidence_summary: "History only.",
          warnings: [],
          ai_revision_count: 0,
          questions_asked: [],
          logistics: {
            time_zone: restPack.time_zone,
            linked_destination_ids: ["patreon"],
            notes: null
          },
          slots: [
            {
              id: "slot_bad",
              intent: "active_rest",
              format: "launch_trailer",
              title: "Too energetic",
              draft_body: "Nope",
              destination_ids: ["patreon"],
              scheduled_local: "2026-07-20T19:00:00",
              scheduled_utc: "2026-07-20T23:00:00.000Z",
              time_zone: restPack.time_zone,
              media_state: "missing",
              evidence_refs: ["ev_history_top"]
            }
          ]
        },
        { factPack: restPack, goal_kind: "break", break_mode: "active_rest" }
      )
    ).toThrow(/recovery|format/i);
  });

  it("rejects unsupported metric claims and estimated-as-deterministic language", () => {
    expect(() =>
      validatePlannerPlan(
        {
          ...DREAM_FLOW_FIXTURE.sample_plan,
          rationale: "This Plan will cause a 40% increase in joins.",
          evidence_summary: "Guaranteed 12 joins."
        },
        { factPack }
      )
    ).toThrow(/unsupported metric/i);

    const estimatedPack = {
      ...factPack,
      paid_support: factPack.paid_support
        ? { ...factPack.paid_support, attribution: "estimated" as const }
        : null,
      computed_metrics: {
        ...factPack.computed_metrics,
        paid_support_attribution: "estimated" as const
      }
    };
    expect(() =>
      validatePlannerPlan(
        {
          ...DREAM_FLOW_FIXTURE.sample_plan,
          evidence_summary: "We observed deterministic conversions from the campaign."
        },
        { factPack: estimatedPack }
      )
    ).toThrow(/unsupported metric|deterministic/i);
  });

  it("builds deterministic fallbacks for engagement and rest branches without trend claims", () => {
    const engagement = buildDeterministicPlanFallback({ factPack });
    expect(engagement.slots.length).toBeGreaterThanOrEqual(1);
    expect(engagement.slots.length).toBeLessThanOrEqual(8);
    expect(engagement.evidence_summary.toLowerCase()).toMatch(/history/);
    expect(engagement.evidence_summary.toLowerCase()).not.toMatch(/elevated interest|trending/);
    expect(engagement.warnings.some((w) => /fallback/i.test(w))).toBe(true);

    const silence = buildDeterministicPlanFallback({
      factPack: buildGoalCycleFactPackFromDreamFixture(DREAM_FLOW_FIXTURE, {
        goal_kind: "break",
        break_mode: "complete_silence"
      }),
      goal_kind: "break",
      break_mode: "complete_silence"
    });
    expect(silence.slots).toHaveLength(0);

    const activeRest = buildDeterministicPlanFallback({
      factPack: buildGoalCycleFactPackFromDreamFixture(DREAM_FLOW_FIXTURE, {
        goal_kind: "break",
        break_mode: "active_rest"
      }),
      goal_kind: "break",
      break_mode: "active_rest"
    });
    expect(activeRest.slots.length).toBeGreaterThan(0);
    expect(activeRest.slots.length).toBeLessThanOrEqual(4);
    expect(activeRest.slots.every((s) => /sketch|wip|journal|recovery/i.test(s.format))).toBe(
      true
    );
  });
});
