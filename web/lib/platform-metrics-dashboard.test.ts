import { describe, expect, it } from "vitest";
import { PLATFORM_METRIC_STATUSES, resolveMetricDisplay } from "./platform-metric-status";
import {
  metricsForSection,
  platformMetricCards,
  platformMetricSections
} from "./platform-metrics-dashboard";

describe("platform metrics dashboard scaffold (PMD-010)", () => {
  it("renders a non-empty metric set for every dashboard section", () => {
    expect(platformMetricSections).toHaveLength(9);
    for (const section of platformMetricSections) {
      expect(metricsForSection(section.key).length).toBeGreaterThan(0);
    }
  });

  it("uses unique metric keys and approved statuses", () => {
    const keys = new Set(platformMetricCards.map((metric) => metric.key));
    expect(keys.size).toBe(platformMetricCards.length);

    const statuses = new Set(PLATFORM_METRIC_STATUSES);
    for (const metric of platformMetricCards) {
      expect(statuses.has(metric.status)).toBe(true);
    }
  });

  it("keeps placeholder cards displayable without live data", () => {
    for (const metric of platformMetricCards) {
      const display = resolveMetricDisplay({
        status: metric.status,
        value: metric.value,
        freshnessState: "unknown"
      });
      expect(display.displayValue.length).toBeGreaterThan(0);
      expect(display.badgeLabel.length).toBeGreaterThan(0);
    }
  });
});
