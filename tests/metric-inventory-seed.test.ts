import { describe, expect, it } from "vitest";
import { getMetricRegistrySeed } from "../src/platform-metrics/metric-registry-seed.js";
import { validateMetricInventorySeed } from "../src/platform-metrics/validate-metric-inventory.js";

describe("metric inventory seed (PMD-002)", () => {
  it("validates canonical registry seed contract", () => {
    const result = validateMetricInventorySeed();
    expect(result.valid, result.errors.join("\n")).toBe(true);
    expect(result.metricCount).toBe(82);
    expect(result.p0Count).toBeGreaterThanOrEqual(47);
    expect(result.p1Count).toBeGreaterThanOrEqual(17);
  });

  it("includes scope on every seed entry", () => {
    for (const entry of getMetricRegistrySeed()) {
      expect(entry.scope.length).toBeGreaterThan(0);
    }
  });
});
