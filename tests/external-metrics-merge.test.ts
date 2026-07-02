import { describe, expect, it } from "vitest";
import {
  chooseExternalMetricsSource,
  mergeExternalMetrics
} from "../extension/src/lib/external-metrics-merge.js";

describe("mergeExternalMetrics", () => {
  it("prefers API numeric counters over DOM values", () => {
    const merged = mergeExternalMetrics(
      [
        { metric_type: "likes", value: 3, raw: { source: "extension_dom" } },
        { metric_type: "title", value: null, raw: { text: "Dom title" } }
      ],
      [{ metric_type: "likes", value: 12, raw: { source: "platform_api" } }]
    );

    expect(merged.find((metric) => metric.metric_type === "likes")?.value).toBe(12);
    expect(merged.find((metric) => metric.metric_type === "title")?.raw).toMatchObject({
      text: "Dom title"
    });
  });

  it("adds API-only reach metrics when DOM scrape misses them", () => {
    const merged = mergeExternalMetrics(
      [{ metric_type: "likes", value: 4, raw: {} }],
      [
        { metric_type: "impressions", value: 120, raw: {} },
        { metric_type: "seen", value: 45, raw: {} }
      ]
    );

    expect(merged.map((metric) => metric.metric_type).sort()).toEqual([
      "impressions",
      "likes",
      "seen"
    ]);
  });
});

describe("chooseExternalMetricsSource", () => {
  it("uses platform_api when API returned impressions or seen", () => {
    expect(
      chooseExternalMetricsSource(
        [{ metric_type: "impressions", value: 10, raw: {} }],
        [{ metric_type: "impressions", value: 10, raw: {} }]
      )
    ).toBe("platform_api");
  });

  it("falls back to extension_dom when only DOM counters exist", () => {
    expect(
      chooseExternalMetricsSource(
        [{ metric_type: "likes", value: 2, raw: {} }],
        []
      )
    ).toBe("extension_dom");
  });
});
