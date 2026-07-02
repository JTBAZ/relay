import { describe, expect, it, vi } from "vitest";
import {
  listDaysToProcess,
  platformMetricDailyRollupIntervalFromEnv,
  platformMetricDailyRollupLookbackDaysFromEnv,
  runPlatformMetricDailyRollupOnce
} from "../src/platform-metrics/platform-metric-daily-rollup-job.js";
import { upsertPlatformMetricDailyRollup } from "../src/platform-metrics/platform-metric-daily-rollup-service.js";

vi.mock("../src/platform-metrics/platform-metric-daily-rollup-service.js", () => ({
  upsertPlatformMetricDailyRollup: vi.fn().mockResolvedValue({
    id: "rollup_1",
    metricKey: "activity.dau",
    dayUtc: "2026-05-25",
    scope: "system",
    scopeId: "",
    value: 1,
    dimensions: {},
    sourceFreshness: {},
    generatedAt: "2026-05-25T18:00:00.000Z"
  })
}));

describe("platform metric daily rollup job env (PMD-051)", () => {
  it("parses rollup interval", () => {
    expect(platformMetricDailyRollupIntervalFromEnv({})).toBeNull();
    expect(
      platformMetricDailyRollupIntervalFromEnv({
        RELAY_PLATFORM_METRIC_DAILY_ROLLUP_MS: "3600000"
      })
    ).toBe(3_600_000);
    expect(
      platformMetricDailyRollupIntervalFromEnv({
        RELAY_PLATFORM_METRIC_DAILY_ROLLUP_MS: "0"
      })
    ).toBeNull();
  });

  it("parses lookback days with cap", () => {
    expect(platformMetricDailyRollupLookbackDaysFromEnv({})).toBe(1);
    expect(
      platformMetricDailyRollupLookbackDaysFromEnv({
        RELAY_PLATFORM_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS: "7"
      })
    ).toBe(7);
    expect(
      platformMetricDailyRollupLookbackDaysFromEnv({
        RELAY_PLATFORM_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS: "999"
      })
    ).toBe(31);
  });
});

describe("platform metric daily rollup job (PMD-051)", () => {
  it("lists yesterday and today by default", () => {
    const days = listDaysToProcess({
      prisma: {} as never,
      now: new Date("2026-05-25T15:00:00.000Z")
    });
    expect(days).toEqual(["2026-05-24", "2026-05-25"]);
  });

  it("upserts traffic, activity, and revenue metrics per processed day", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ value: 3, raw_row_count: 4, source_updated_at: new Date() }])
      .mockResolvedValueOnce([{ value: 2, raw_row_count: 2, source_updated_at: new Date() }])
      .mockResolvedValueOnce([{ value: 5, raw_row_count: 8, source_updated_at: new Date() }])
      .mockResolvedValueOnce([{ value: 1, raw_row_count: 2, source_updated_at: new Date() }])
      .mockResolvedValueOnce([{ value: 4, raw_row_count: 6, source_updated_at: new Date() }])
      .mockResolvedValueOnce([{ value: 9, raw_row_count: 12, source_updated_at: new Date() }]);

    const aggregate = vi.fn().mockResolvedValue({
      _count: { _all: 0 },
      _max: { occurredAt: null }
    });
    const revenueAggregate = vi
      .fn()
      .mockResolvedValueOnce({
        _count: { _all: 2 },
        _sum: { amountCents: null, netAmountCents: null },
        _max: { occurredAt: new Date("2026-05-25T10:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { amountCents: 1200, netAmountCents: 1000 },
        _max: { occurredAt: new Date("2026-05-25T11:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { amountCents: null, netAmountCents: null },
        _max: { occurredAt: new Date("2026-05-25T12:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { amountCents: 500, netAmountCents: null },
        _max: { occurredAt: new Date("2026-05-25T13:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { amountCents: 300, netAmountCents: null },
        _max: { occurredAt: new Date("2026-05-25T14:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { amountCents: 200, netAmountCents: null },
        _max: { occurredAt: new Date("2026-05-25T15:00:00.000Z") }
      })
      .mockResolvedValueOnce({
        _count: { _all: 2 },
        _sum: { amountCents: 5000, netAmountCents: 4500 },
        _max: { occurredAt: new Date("2026-05-25T16:00:00.000Z") }
      });

    const prisma = {
      $queryRaw: queryRaw,
      platformTelemetryEvent: { aggregate },
      platformRevenueEvent: { aggregate: revenueAggregate },
      platformMetricDailyRollup: { upsert: vi.fn() }
    } as never;

    const result = await runPlatformMetricDailyRollupOnce({
      prisma,
      dayUtc: "2026-05-25",
      now: new Date("2026-05-25T18:00:00.000Z")
    });

    expect(result.days_processed).toBe(1);
    expect(result.metrics_upserted).toBe(15);
    expect(result.days[0]?.metrics.map((metric) => metric.metricKey)).toEqual([
      "traffic.profile_views",
      "traffic.gallery_views",
      "traffic.page_views",
      "traffic.unique_visitors",
      "activity.dau",
      "activity.wau",
      "activity.mau",
      "revenue.gross",
      "revenue.net",
      "revenue.checkout_started",
      "revenue.checkout_completed",
      "revenue.checkout_failed",
      "revenue.upgrades",
      "revenue.downgrades",
      "revenue.refunds"
    ]);
    expect(result.days[0]?.metrics.find((metric) => metric.metricKey === "revenue.gross")?.value).toBe(50);
    expect(result.days[0]?.metrics.find((metric) => metric.metricKey === "revenue.net")?.value).toBe(43);
    expect(result.days[0]?.metrics.find((metric) => metric.metricKey === "revenue.refunds")?.value).toBe(2);
    expect(upsertPlatformMetricDailyRollup).toHaveBeenCalledTimes(15);
  });
});
