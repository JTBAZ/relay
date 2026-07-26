import { describe, expect, it } from "vitest";
import type { PlatformMetricDefinition } from "../src/platform-metrics/metric-registry-types.js";
import { buildPlatformOperatingReview } from "../src/platform-metrics/platform-operating-review-service.js";

function metric(
  partial: Partial<PlatformMetricDefinition> & Pick<PlatformMetricDefinition, "key">
): PlatformMetricDefinition {
  return {
    label: partial.key,
    section: partial.section ?? "traffic",
    phase: partial.phase ?? "4",
    status: partial.status ?? "not_wired",
    scope: "platform",
    definition: "",
    formula: "",
    source: "",
    value: null,
    displayValue: "—",
    freshnessState: partial.freshnessState ?? "unknown",
    lastUpdatedAt: null,
    priority: partial.priority ?? "P1",
    ...partial
  };
}

describe("platform operating review (PMD-081)", () => {
  it("queues not_wired and pending metrics with recommended actions", () => {
    const review = buildPlatformOperatingReview({
      generatedAt: "2026-05-25T12:00:00.000Z",
      alerts: [],
      metrics: [
        metric({ key: "traffic.page_views", status: "live", freshnessState: "fresh" }),
        metric({
          key: "activity.feed_opens",
          label: "Feed opens",
          status: "pending_instrumentation",
          priority: "P0"
        }),
        metric({
          key: "revenue.gross",
          label: "Gross revenue",
          status: "not_wired",
          priority: "P0"
        }),
        metric({
          key: "traffic.referral_breakdown",
          status: "not_wired",
          priority: "P1"
        })
      ]
    });

    expect(review.totals.needsReview).toBe(3);
    expect(review.totals.pendingInstrumentation).toBe(1);
    expect(review.totals.notWired).toBe(2);
    expect(review.checklist.length).toBe(4);
    expect(
      review.items.find((item) => item.metricKey === "revenue.gross")?.recommendedAction
    ).toBe("wire");
    expect(
      review.items.find((item) => item.metricKey === "traffic.referral_breakdown")
        ?.recommendedAction
    ).toBe("defer");
  });

  it("excludes coverage and alert rollup cards from triage items", () => {
    const review = buildPlatformOperatingReview({
      generatedAt: "2026-05-25T12:00:00.000Z",
      alerts: [],
      metrics: [
        metric({ key: "coverage.not_wired_metrics", status: "not_wired" }),
        metric({ key: "alerts.dau_drop", status: "collecting" })
      ]
    });

    expect(review.items).toHaveLength(0);
  });

  it("groups triage items by dashboard section", () => {
    const review = buildPlatformOperatingReview({
      generatedAt: "2026-05-25T12:00:00.000Z",
      alerts: [{ key: "alerts.dau_drop" } as never],
      metrics: [
        metric({ key: "activity.dau", section: "activity", status: "not_wired", priority: "P0" }),
        metric({
          key: "traffic.page_views",
          section: "traffic",
          status: "deferred",
          freshnessState: "fresh"
        })
      ]
    });

    expect(review.bySection).toHaveLength(2);
    expect(review.totals.activeAlerts).toBe(1);
  });
});
