import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  externalMetricDailyRollupIntervalFromEnv,
  externalMetricDailyRollupLookbackDaysFromEnv,
  listActiveExternalMetricCreatorIds,
  runExternalMetricDailyRollupOnce
} from "../src/analytics/external-metric-rollup-job.js";
import { computeDailyRollups } from "../src/analytics/external-metric-rollup-service.js";

vi.mock("../src/analytics/external-metric-rollup-service.js", () => ({
  computeDailyRollups: vi.fn().mockResolvedValue({
    creator_id: "rcx_pilot_dev_ava",
    since: "2026-06-28T00:00:00.000Z",
    until: "2026-06-30T23:59:59.000Z",
    upserted: 4
  })
}));

describe("external metric daily rollup job env (Slice 2d-3)", () => {
  it("parses rollup interval", () => {
    expect(externalMetricDailyRollupIntervalFromEnv({})).toBeNull();
    expect(
      externalMetricDailyRollupIntervalFromEnv({
        RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_MS: "86400000"
      })
    ).toBe(86_400_000);
    expect(
      externalMetricDailyRollupIntervalFromEnv({
        RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_MS: "0"
      })
    ).toBeNull();
  });

  it("parses lookback days with cap", () => {
    expect(externalMetricDailyRollupLookbackDaysFromEnv({})).toBe(2);
    expect(
      externalMetricDailyRollupLookbackDaysFromEnv({
        RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS: "7"
      })
    ).toBe(7);
    expect(
      externalMetricDailyRollupLookbackDaysFromEnv({
        RELAY_EXTERNAL_METRIC_DAILY_ROLLUP_LOOKBACK_DAYS: "999"
      })
    ).toBe(31);
  });
});

describe("listActiveExternalMetricCreatorIds", () => {
  it("returns a single creator when scoped", async () => {
    const prisma = {} as PrismaClient;
    await expect(
      listActiveExternalMetricCreatorIds(prisma, new Date(), " creator_a ")
    ).resolves.toEqual(["creator_a"]);
  });

  it("merges creators from snapshots, linked attempts, CSV, and relay events", async () => {
    const prisma = {
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([{ creatorId: "creator_a" }])
      },
      postDistributionAttempt: {
        findMany: vi.fn().mockResolvedValue([{ creatorId: "creator_b" }])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([{ creatorId: "creator_c" }])
      },
      relayEngagementEvent: {
        findMany: vi.fn().mockResolvedValue([{ creatorId: "creator_d" }])
      },
      platformTelemetryEvent: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaClient;

    const ids = await listActiveExternalMetricCreatorIds(
      prisma,
      new Date("2026-06-28T00:00:00.000Z")
    );

    expect(ids).toEqual(["creator_a", "creator_b", "creator_c", "creator_d"]);
  });
});

describe("runExternalMetricDailyRollupOnce", () => {
  it("runs computeDailyRollups for each active creator", async () => {
    const prisma = {
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([{ creatorId: "creator_a" }])
      },
      postDistributionAttempt: {
        findMany: vi.fn().mockResolvedValue([])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([])
      },
      relayEngagementEvent: {
        findMany: vi.fn().mockResolvedValue([])
      },
      platformTelemetryEvent: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaClient;

    const result = await runExternalMetricDailyRollupOnce({
      prisma,
      now: new Date("2026-06-30T12:00:00.000Z"),
      lookbackDays: 2
    });

    expect(result.creators_processed).toBe(1);
    expect(result.total_upserted).toBe(4);
    expect(result.lookback_days).toBe(2);
    expect(computeDailyRollups).toHaveBeenCalledWith(
      prisma,
      "creator_a",
      expect.objectContaining({
        since: new Date("2026-06-28T00:00:00.000Z"),
        until: new Date("2026-06-30T12:00:00.000Z")
      })
    );
  });

  it("honors a single creator override without listing others", async () => {
    const prisma = {} as PrismaClient;

    const result = await runExternalMetricDailyRollupOnce({
      prisma,
      creatorId: "creator_x",
      now: new Date("2026-06-30T12:00:00.000Z")
    });

    expect(result.creators_processed).toBe(1);
    expect(computeDailyRollups).toHaveBeenCalledWith(
      prisma,
      "creator_x",
      expect.any(Object)
    );
  });
});
