import { describe, expect, it } from "vitest";
import {
  growthGoalMeta,
  parseGrowthGoal,
} from "../../web/lib/relay-api";

describe("parseGrowthGoal", () => {
  it("returns null for missing or invalid metadata", () => {
    expect(parseGrowthGoal(null)).toBeNull();
    expect(parseGrowthGoal(undefined)).toBeNull();
    expect(parseGrowthGoal({})).toBeNull();
    expect(parseGrowthGoal({ growth_goal: "engagement_optimization" })).toBeNull();
  });

  it("parses onboarding growth_goal ids", () => {
    expect(parseGrowthGoal({ growth_goal: "discovery" })).toBe("discovery");
    expect(parseGrowthGoal({ growth_goal: "conversion" })).toBe("conversion");
    expect(parseGrowthGoal({ growth_goal: "consistency" })).toBe("consistency");
  });

  it("growthGoalMeta returns label and detail", () => {
    expect(growthGoalMeta("discovery").label).toBe("Audience discovery");
    expect(growthGoalMeta("conversion").detail.length).toBeGreaterThan(10);
  });
});
