import { describe, expect, it, vi } from "vitest";
import { resetInsightJobMetricsForTests } from "../src/analytics/insight-job-metrics.js";
import { resetExportRetrievalMetricsForTests } from "../src/export/export-retrieval-metrics.js";
import type { PlatformMetricDefinition } from "../src/platform-metrics/metric-registry-types.js";
import {
  applyOperatingAlertMetricPatches,
  evaluatePlatformOperatingAlerts
} from "../src/platform-metrics/platform-operating-alert-service.js";

function metric(
  partial: Partial<PlatformMetricDefinition> & Pick<PlatformMetricDefinition, "key">
): PlatformMetricDefinition {
  return {
    label: partial.key,
    section: partial.section ?? "platform_ops",
    phase: "8",
    status: partial.status ?? "live",
    scope: "system",
    definition: "",
    formula: "",
    source: "",
    value: partial.value ?? null,
    displayValue: partial.displayValue ?? "—",
    freshnessState: partial.freshnessState ?? "fresh",
    lastUpdatedAt: partial.lastUpdatedAt ?? null,
    priority: "P1",
    trends: partial.trends,
    ...partial
  };
}

describe("platform operating alerts (PMD-080)", () => {
  it("fires DAU drop when WoW delta exceeds threshold", async () => {
    const alerts = await evaluatePlatformOperatingAlerts({
      prisma: undefined,
      pendingRetryJobs: 0,
      dlqRecordCount: 0,
      metrics: [
        metric({
          key: "activity.dau",
          section: "activity",
          label: "DAU",
          trends: {
            dod: {
              direction: "down",
              delta: -5,
              deltaPercent: -10,
              priorValue: 50,
              currentValue: 45,
              sufficientHistory: true
            },
            wow: {
              direction: "down",
              delta: -30,
              deltaPercent: -30,
              priorValue: 100,
              currentValue: 70,
              sufficientHistory: true
            },
            mom: {
              direction: "unknown",
              delta: null,
              deltaPercent: null,
              priorValue: null,
              currentValue: 70,
              sufficientHistory: false
            }
          }
        })
      ]
    });

    expect(alerts.some((alert) => alert.key === "alerts.dau_drop")).toBe(true);
    expect(alerts.find((alert) => alert.key === "alerts.dau_drop")?.relatedMetricKey).toBe(
      "activity.dau"
    );
  });

  it("fires stale entitlement alert from platform health", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ c: 1 }]),
      oAuthCredential: { count: vi.fn().mockResolvedValue(0) },
      patronOAuthCredential: { count: vi.fn().mockResolvedValue(0) },
      patronEntitlementSnapshot: {
        count: vi.fn().mockResolvedValue(3),
        findFirst: vi.fn().mockResolvedValue({ asOf: new Date("2026-05-01T00:00:00.000Z") })
      }
    } as never;

    const alerts = await evaluatePlatformOperatingAlerts({
      prisma,
      pendingRetryJobs: 0,
      dlqRecordCount: 0,
      metrics: [
        metric({
          key: "ops.stale_entitlements",
          value: 3
        })
      ]
    });

    expect(alerts.some((alert) => alert.key === "alerts.stale_entitlements")).toBe(true);
  });

  it("fires error spike from analytics health gates", async () => {
    resetInsightJobMetricsForTests();
    resetExportRetrievalMetricsForTests();
    process.env.RELAY_INSIGHT_JOB_ALERT_MIN_SAMPLES = "1";
    process.env.RELAY_INSIGHT_JOB_ALERT_MAX_FAILURE_RATIO = "0.01";

    const { recordAnalyticsGenerateFailure, recordAnalyticsGenerateSuccess } = await import(
      "../src/analytics/insight-job-metrics.js"
    );
    recordAnalyticsGenerateSuccess();
    recordAnalyticsGenerateFailure();
    recordAnalyticsGenerateFailure();

    const alerts = await evaluatePlatformOperatingAlerts({
      prisma: undefined,
      pendingRetryJobs: 0,
      dlqRecordCount: 0,
      metrics: [metric({ key: "ops.analytics_job_health", value: 33.3 })]
    });

    expect(alerts.some((alert) => alert.key === "alerts.error_spike")).toBe(true);
  });

  it("patches alert metric cards to active/clear", () => {
    const patched = applyOperatingAlertMetricPatches(
      [
        metric({ key: "alerts.dau_drop", status: "collecting", displayValue: "—" }),
        metric({ key: "alerts.traffic_drop", status: "collecting", displayValue: "—" })
      ],
      [
        {
          key: "alerts.dau_drop",
          severity: "warning",
          title: "DAU drop",
          message: "test",
          relatedMetricKey: "activity.dau",
          relatedSection: "activity",
          sourceContext: "test"
        }
      ],
      "2026-05-25T12:00:00.000Z"
    );

    expect(patched.find((m) => m.key === "alerts.dau_drop")?.displayValue).toBe("active");
    expect(patched.find((m) => m.key === "alerts.traffic_drop")?.displayValue).toBe("clear");
  });
});
