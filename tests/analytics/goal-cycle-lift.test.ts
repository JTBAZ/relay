import { describe, expect, it } from "vitest";
import {
  calculateCampaignLift,
  CAMPAIGN_LIFT_METHOD_VERSION,
  CAMPAIGN_LIFT_V1_GUARDS
} from "../../src/analytics/goal-cycle-lift.js";

const goodWindow = (events: number) => ({
  start_day: "2026-06-01",
  end_day: "2026-06-14",
  complete_days: 14,
  coverage_ratio: 0.85,
  paid_support_event_count: events
});

describe("Goal Cycle campaign lift method v1 (VS4-T03)", () => {
  it("exports frozen method version and guards", () => {
    expect(CAMPAIGN_LIFT_METHOD_VERSION).toBe("campaign-lift-v1");
    expect(CAMPAIGN_LIFT_V1_GUARDS).toEqual({
      min_complete_days: 14,
      min_coverage_ratio: 0.8,
      min_combined_support_events: 3
    });
  });

  it("returns estimated lift when guards pass", () => {
    const result = calculateCampaignLift({
      baseline: goodWindow(4),
      observation: {
        ...goodWindow(6),
        start_day: "2026-07-01",
        end_day: "2026-07-14"
      },
      reason_deterministic_unavailable: "No Relay Link correlation id."
    });
    expect(result.status).toBe("estimated");
    if (result.status !== "estimated") return;
    expect(result.method).toBe("campaign-lift-v1");
    expect(result.observed_count).toBe(6);
    expect(result.expected_count).toBeCloseTo((4 / 14) * 14, 5);
    expect(result.lift_count).toBeCloseTo(6 - result.expected_count, 5);
    expect(result.caveat).toMatch(/correlation/i);
    expect(result.caveat).not.toMatch(/deterministic/i);
    expect(result.reason_deterministic_unavailable).toMatch(/No Relay Link/);
  });

  it("returns insufficient when day/coverage/event guards fail", () => {
    const short = calculateCampaignLift({
      baseline: { ...goodWindow(2), complete_days: 10 },
      observation: goodWindow(2)
    });
    expect(short.status).toBe("insufficient");
    if (short.status === "insufficient") {
      expect(short.reasons).toEqual(expect.arrayContaining(["baseline_days_below_14"]));
      expect(short.caveat).toMatch(/do not coerce to zero/i);
    }

    const lowCoverage = calculateCampaignLift({
      baseline: { ...goodWindow(2), coverage_ratio: 0.5 },
      observation: goodWindow(2)
    });
    expect(lowCoverage.status).toBe("insufficient");
    if (lowCoverage.status === "insufficient") {
      expect(lowCoverage.reasons).toEqual(expect.arrayContaining(["baseline_coverage_below_80pct"]));
    }

    const fewEvents = calculateCampaignLift({
      baseline: goodWindow(1),
      observation: goodWindow(1)
    });
    expect(fewEvents.status).toBe("insufficient");
    if (fewEvents.status === "insufficient") {
      expect(fewEvents.reasons).toEqual(expect.arrayContaining(["combined_events_below_3"]));
    }
  });

  it("never includes patron identity fields", () => {
    const result = calculateCampaignLift({
      baseline: goodWindow(3),
      observation: goodWindow(3)
    });
    expect(JSON.stringify(result)).not.toMatch(/patron|email|member_id|account_id/i);
  });
});
