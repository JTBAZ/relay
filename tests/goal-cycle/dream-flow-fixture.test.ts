import { describe, expect, it } from "vitest";
import {
  GOAL_CYCLE_CONTRACT_VERSION,
  GOAL_CYCLE_MAX_AI_REVISIONS,
  GOAL_CYCLE_MAX_QUESTIONS,
  GOAL_CYCLE_MAX_SLOTS,
  getGoalCycleFeatureFlags,
  validateGoalCyclePlan
} from "../../src/goal-cycle/contracts.js";
import {
  DREAM_ACCEPTANCE_IDS,
  DREAM_ACCEPTANCE_OWNERS,
  DREAM_CONTRACT_FIELD_OWNERS,
  DREAM_FIXTURE_ID,
  DREAM_FLOW_FIXTURE,
  buildDreamCycleDetail,
  createDreamFlowFixture,
  hashDreamFlowFixture
} from "../../src/goal-cycle/fixtures/dream-flow.js";

describe("Goal Cycle Dream fixture (VS0-T03)", () => {
  it("exports a stable fixture id and contract version", () => {
    expect(DREAM_FLOW_FIXTURE.fixture_id).toBe(DREAM_FIXTURE_ID);
    expect(DREAM_FLOW_FIXTURE.contract_version).toBe(GOAL_CYCLE_CONTRACT_VERSION);
    expect(DREAM_FLOW_FIXTURE.creator.active_goal_cycle_id).toBeNull();
  });

  it("matches the QA persona: linked destinations, history, one credit, extension grant", () => {
    const f = DREAM_FLOW_FIXTURE;
    expect(f.creator.linked_destinations).toEqual(
      expect.arrayContaining(["patreon", "x", "bluesky"])
    );
    expect(f.creator.unlinked_destinations).toContain("deviantart");
    expect(f.history.window_months).toBe(6);
    expect(f.history.posts.length).toBeGreaterThanOrEqual(6);
    expect(f.credit.available).toBe(1);
    expect(f.credit.topups_available).toBe(false);
    expect(f.creator.extension_grant.status).toBe("active");
  });

  it("includes strong, weak, unavailable, and adversarial trend cases", () => {
    const strengths = fTrendStrengths();
    expect(strengths).toEqual(
      expect.arrayContaining(["strong", "weak", "unavailable", "adversarial"])
    );
    const adversarial = DREAM_FLOW_FIXTURE.trend_cases.find((c) => c.strength === "adversarial");
    expect(adversarial?.raw_provider_excerpt).toMatch(/ignore previous instructions/i);
    expect(adversarial?.prompt_safe_summary).toMatch(/quarantined/i);
  });

  it("includes deterministic, estimated, zero, and unavailable conversion cases", () => {
    const attrs = DREAM_FLOW_FIXTURE.conversion_cases.map((c) => c.attribution);
    expect(attrs).toEqual(
      expect.arrayContaining(["deterministic", "estimated", "zero", "unavailable"])
    );
    const unavailable = DREAM_FLOW_FIXTURE.conversion_cases.find(
      (c) => c.attribution === "unavailable"
    );
    expect(unavailable?.count).toBeNull();
    const zero = DREAM_FLOW_FIXTURE.conversion_cases.find((c) => c.attribution === "zero");
    expect(zero?.count).toBe(0);
  });

  it("includes DST and month-boundary schedule anchors plus duplicate approval keys", () => {
    const f = DREAM_FLOW_FIXTURE;
    expect(f.schedule.dst_spring_local).toMatch(/^2026-03-08/);
    expect(f.schedule.dst_spring_utc).toMatch(/Z$/);
    expect(f.schedule.month_boundary_local).toMatch(/^2026-07-31/);
    expect(f.approval.approval_key).toBe(f.approval.duplicate_approval_key);
  });

  it("sample Plan validates and keeps missing media + linked destinations only", () => {
    const plan = validateGoalCyclePlan(DREAM_FLOW_FIXTURE.sample_plan, {
      goal_kind: "engagement",
      linked_destination_ids: DREAM_FLOW_FIXTURE.creator.linked_destinations
    });
    expect(plan.slots.length).toBeGreaterThanOrEqual(1);
    expect(plan.slots.length).toBeLessThanOrEqual(GOAL_CYCLE_MAX_SLOTS);
    expect(plan.questions_asked.length).toBeLessThanOrEqual(GOAL_CYCLE_MAX_QUESTIONS);
    expect(plan.ai_revision_count).toBeLessThanOrEqual(GOAL_CYCLE_MAX_AI_REVISIONS);
    expect(plan.slots.some((s) => s.media_state === "missing")).toBe(true);
    for (const slot of plan.slots) {
      for (const dest of slot.destination_ids) {
        expect(DREAM_FLOW_FIXTURE.creator.linked_destinations).toContain(dest);
        expect(DREAM_FLOW_FIXTURE.creator.unlinked_destinations).not.toContain(dest);
      }
    }
  });

  it("rejects inventing an unlinked destination against the fixture linked set", () => {
    expect(() =>
      validateGoalCyclePlan(
        {
          ...DREAM_FLOW_FIXTURE.sample_plan,
          slots: [
            {
              ...DREAM_FLOW_FIXTURE.sample_plan.slots[0],
              destination_ids: ["deviantart"]
            }
          ]
        },
        { linked_destination_ids: DREAM_FLOW_FIXTURE.creator.linked_destinations }
      )
    ).toThrow(expect.objectContaining({ code: "GOAL_CYCLE_DESTINATION_UNLINKED" }));
  });

  it("produces a stable sha256 hash for Delta Out", () => {
    const a = hashDreamFlowFixture(createDreamFlowFixture());
    const b = hashDreamFlowFixture(createDreamFlowFixture());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds GoalCycleDetail without live services", () => {
    const detail = buildDreamCycleDetail();
    expect(detail.plan?.slots.length).toBeGreaterThan(0);
    expect(detail.credit?.available).toBe(1);
    expect(detail.materialization).toBeNull();
  });
});

describe("Dream acceptance map (VS0-T04)", () => {
  it("lists DF-01 through DF-10 with primary owners", () => {
    expect(DREAM_ACCEPTANCE_IDS).toEqual([
      "DF-01",
      "DF-02",
      "DF-03",
      "DF-04",
      "DF-05",
      "DF-06",
      "DF-07",
      "DF-08",
      "DF-09",
      "DF-10"
    ]);
    for (const id of DREAM_ACCEPTANCE_IDS) {
      expect(DREAM_ACCEPTANCE_OWNERS[id].primary).toMatch(/^VS\d+$/);
      expect(DREAM_ACCEPTANCE_OWNERS[id].title.length).toBeGreaterThan(0);
    }
  });

  it("DF-01 — Library entry states are represented by inactive cycle seed", () => {
    // DF-01: no active cycle at start → plan-this-month entry
    expect(DREAM_FLOW_FIXTURE.creator.active_goal_cycle_id).toBeNull();
    expect(DREAM_ACCEPTANCE_OWNERS["DF-01"].primary).toBe("VS6");
  });

  it("DF-02 — bounded goals and break modes exist on the wire contract", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-02"].primary).toBe("VS6");
    expect(["engagement", "views", "paid_support", "break"]).toContain(
      DREAM_FLOW_FIXTURE.sample_cycle_summary.goal_kind
    );
  });

  it("DF-03 — trend cases cover weak evidence without live vendors", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-03"].primary).toBe("VS3");
    expect(DREAM_FLOW_FIXTURE.trend_cases.some((c) => c.strength === "weak")).toBe(true);
    expect(getGoalCycleFeatureFlags({}).trend_mode).toBe("fixture");
  });

  it("DF-04 / DF-05 — questions and revision caps are enforced by sample Plan", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-04"].primary).toBe("VS5");
    expect(DREAM_ACCEPTANCE_OWNERS["DF-05"].primary).toBe("VS5");
    expect(DREAM_FLOW_FIXTURE.sample_plan.questions_asked.length).toBeLessThanOrEqual(2);
    expect(DREAM_FLOW_FIXTURE.sample_plan.ai_revision_count).toBeLessThanOrEqual(2);
    expect(DREAM_FLOW_FIXTURE.sample_plan.slots.length).toBeLessThanOrEqual(8);
  });

  it("DF-06 — logistics include time zone and DST/month anchors", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-06"].primary).toBe("VS6");
    expect(DREAM_FLOW_FIXTURE.sample_plan.logistics.time_zone).toBe("America/New_York");
    expect(DREAM_FLOW_FIXTURE.schedule.dst_spring_utc).toBeTruthy();
  });

  it("DF-07 — duplicate approval keys and missing media are fixture-ready", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-07"].primary).toBe("VS7");
    expect(DREAM_FLOW_FIXTURE.approval.approval_key).toBe(
      DREAM_FLOW_FIXTURE.approval.duplicate_approval_key
    );
    expect(DREAM_FLOW_FIXTURE.credit.available).toBe(1);
  });

  it("DF-08 — extension grant present; no private media URLs in fixture", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-08"].primary).toBe("VS8");
    expect(DREAM_FLOW_FIXTURE.creator.extension_grant.grant_id).toBeTruthy();
    const json = JSON.stringify(DREAM_FLOW_FIXTURE);
    expect(json).not.toMatch(/https:\/\/.*(private|signed)/i);
  });

  it("DF-09 — conversion attribution cases remain separately labeled", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-09"].primary).toBe("VS9");
    const estimated = DREAM_FLOW_FIXTURE.conversion_cases.find((c) => c.attribution === "estimated");
    expect(estimated?.caveat).toMatch(/not individual/i);
  });

  it("DF-10 — one-active-cycle seed and learning owner are present", () => {
    expect(DREAM_ACCEPTANCE_OWNERS["DF-10"].primary).toBe("VS9");
    expect(DREAM_FLOW_FIXTURE.creator.active_goal_cycle_id).toBeNull();
  });

  it("maps every public contract field to an owning slice", () => {
    for (const [field, owner] of Object.entries(DREAM_CONTRACT_FIELD_OWNERS)) {
      expect(field.length).toBeGreaterThan(0);
      expect(owner).toMatch(/^VS\d+$/);
    }
    expect(DREAM_CONTRACT_FIELD_OWNERS.GoalCyclePlan).toBe("VS5");
    expect(DREAM_CONTRACT_FIELD_OWNERS.CoachPlanCreditStatus).toBe("VS2");
    expect(DREAM_CONTRACT_FIELD_OWNERS.trend_evidence_envelope).toBe("VS3");
    expect(DREAM_CONTRACT_FIELD_OWNERS.paid_support_outcome).toBe("VS4");
    expect(DREAM_CONTRACT_FIELD_OWNERS.GoalCycleMaterializationReceiptRef).toBe("VS7");
  });
});

function fTrendStrengths() {
  return DREAM_FLOW_FIXTURE.trend_cases.map((c) => c.strength);
}
