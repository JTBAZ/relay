import { describe, expect, it } from "vitest";
import {
  METRIC_STATUS_UI,
  PLATFORM_METRIC_STATUSES,
  isPlatformMetricStatus,
  resolveMetricDisplay,
  summarizeMetricStatuses
} from "../src/platform-metrics/metric-status-taxonomy.js";

describe("platform-metric-status-taxonomy (PMD-001)", () => {
  it("defines all seven statuses with UI specs", () => {
    expect(PLATFORM_METRIC_STATUSES).toHaveLength(7);
    for (const status of PLATFORM_METRIC_STATUSES) {
      expect(METRIC_STATUS_UI[status].badgeLabel.length).toBeGreaterThan(0);
      expect(METRIC_STATUS_UI[status].emptyDisplayValue.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes missing instrumentation from zero activity", () => {
    const missing = resolveMetricDisplay({ status: "not_wired", value: null });
    expect(missing.isMissingInstrumentation).toBe(true);
    expect(missing.isZeroActivity).toBe(false);
    expect(missing.displayValue).toBe("No data yet");

    const zero = resolveMetricDisplay({ status: "live", value: 0 });
    expect(zero.isMissingInstrumentation).toBe(false);
    expect(zero.isZeroActivity).toBe(true);
    expect(zero.displayValue).toBe("0");
    expect(zero.helperText).toContain("No activity");
  });

  it("shows collecting placeholder until value exists", () => {
    const collecting = resolveMetricDisplay({ status: "collecting", value: null });
    expect(collecting.displayValue).toBe("Collecting…");
    expect(collecting.isMissingInstrumentation).toBe(false);

    const withValue = resolveMetricDisplay({ status: "collecting", value: 42 });
    expect(withValue.displayValue).toBe("42");
  });

  it("summarizes coverage buckets", () => {
    const summary = summarizeMetricStatuses([
      "not_wired",
      "pending_instrumentation",
      "collecting",
      "live",
      "estimated",
      "manual_import",
      "deferred"
    ]);
    expect(summary.total).toBe(7);
    expect(summary.live).toBe(1);
    expect(summary.collecting).toBe(1);
    expect(summary.not_wired).toBe(2);
    expect(summary.manual_import).toBe(1);
    expect(summary.deferred).toBe(1);
  });

  it("validates status strings", () => {
    expect(isPlatformMetricStatus("live")).toBe(true);
    expect(isPlatformMetricStatus("bogus")).toBe(false);
  });

  it("applies stale freshness helper for live metrics", () => {
    const stale = resolveMetricDisplay({
      status: "live",
      value: 100,
      freshnessState: "stale"
    });
    expect(stale.helperText).toContain("stale");
  });
});
