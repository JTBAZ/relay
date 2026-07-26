import { describe, expect, it } from "vitest";
import {
  actionSignalForPost,
  buildRadarPostMetrics,
  engagementRateFromViews,
  postPerformanceBadge,
  summarizeRadarCohort,
  viewRate
} from "../app/studio/analytics/analytics-radar-signals";

describe("analytics-radar-signals", () => {
  it("derives view and engagement rates", () => {
    expect(viewRate(1000, 420)).toBe(42);
    expect(engagementRateFromViews(100, 12, 8)).toBe(20);
  });

  it("builds mock metrics when live data is sparse", () => {
    const metrics = buildRadarPostMetrics(null, 30);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0]?.viewRate).toBeGreaterThan(0);
    expect(metrics[0]?.signals).toBeGreaterThan(0);
  });

  it("summarizes cohort context", () => {
    const metrics = buildRadarPostMetrics(null, 30);
    const summary = summarizeRadarCohort(metrics);
    expect(summary.postCount).toBe(metrics.length);
    expect(summary.totalReach).toBeGreaterThan(0);
    expect(summary.avgViewRate).toBeGreaterThan(0);
  });

  it("returns explanatory badges and action signals", () => {
    const metrics = buildRadarPostMetrics(null, 30);
    const top = metrics[0];
    expect(top).toBeTruthy();
    const badge = postPerformanceBadge(top!, metrics);
    expect(badge?.label).toBeTruthy();
    expect(actionSignalForPost(top!, metrics).length).toBeGreaterThan(10);
  });
});
