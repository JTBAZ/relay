import { describe, expect, it } from "vitest";
import { formatTrendDeltaLabel } from "../../web/lib/platform-metric-trends";

describe("platform metric trend labels (PMD-052)", () => {
  it("formats percent delta when history is sufficient", () => {
    expect(
      formatTrendDeltaLabel({
        direction: "up",
        delta: 5,
        deltaPercent: 12.5,
        priorValue: 40,
        currentValue: 45,
        sufficientHistory: true
      })
    ).toBe("+12.5%");
  });

  it("returns null when history is insufficient", () => {
    expect(
      formatTrendDeltaLabel({
        direction: "unknown",
        delta: null,
        deltaPercent: null,
        priorValue: null,
        currentValue: 10,
        sufficientHistory: false
      })
    ).toBeNull();
  });
});
