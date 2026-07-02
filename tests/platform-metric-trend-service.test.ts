import { describe, expect, it } from "vitest";
import {
  computeTrendDelta,
  computeTrendsFromDailySeries,
  evaluateRollupFreshness
} from "../src/platform-metrics/platform-metric-trend-service.js";

describe("platform metric trend service (PMD-052)", () => {
  it("computes direction and percent delta", () => {
    const delta = computeTrendDelta(120, 100);
    expect(delta.direction).toBe("up");
    expect(delta.delta).toBe(20);
    expect(delta.deltaPercent).toBe(20);
    expect(delta.sufficientHistory).toBe(true);
  });

  it("marks insufficient history when prior day is missing", () => {
    const delta = computeTrendDelta(10, null);
    expect(delta.direction).toBe("unknown");
    expect(delta.sufficientHistory).toBe(false);
  });

  it("computes dod/wow/mom from daily series", () => {
    const series = Array.from({ length: 31 }, (_, index) => ({
      dayUtc: `2026-05-${String(31 - index).padStart(2, "0")}`,
      value: 100 + index
    }));
    const trends = computeTrendsFromDailySeries(series);
    expect(trends.dod.sufficientHistory).toBe(true);
    expect(trends.wow.sufficientHistory).toBe(true);
    expect(trends.mom.sufficientHistory).toBe(true);
    expect(trends.dod.currentValue).toBe(100);
    expect(trends.dod.priorValue).toBe(101);
  });

  it("flags stale rollups when generated_at is old", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    const stale = evaluateRollupFreshness({
      generatedAt: "2026-05-23T00:00:00.000Z",
      sourceUpdatedAt: "2026-05-23T00:00:00.000Z",
      now
    });
    expect(stale).toBe("stale");
  });

  it("stays fresh when rollup and source are recent", () => {
    const now = new Date("2026-05-25T12:00:00.000Z");
    expect(
      evaluateRollupFreshness({
        generatedAt: "2026-05-25T10:00:00.000Z",
        sourceUpdatedAt: "2026-05-25T09:30:00.000Z",
        now
      })
    ).toBe("fresh");
  });
});
