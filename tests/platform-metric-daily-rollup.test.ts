import { describe, expect, it, vi } from "vitest";
import {
  formatRollupDayUtc,
  normalizeRollupDayUtc,
  normalizeRollupScopeId
} from "../src/platform-metrics/platform-metric-daily-rollup-types.js";
import {
  getLatestPlatformMetricRollupGeneratedAt,
  upsertPlatformMetricDailyRollup
} from "../src/platform-metrics/platform-metric-daily-rollup-service.js";

describe("platform metric daily rollup types (PMD-050)", () => {
  it("normalizes UTC day strings", () => {
    const day = normalizeRollupDayUtc("2026-05-25");
    expect(formatRollupDayUtc(day)).toBe("2026-05-25");
  });

  it("uses empty scope id for system rollups", () => {
    expect(normalizeRollupScopeId(null)).toBe("");
    expect(normalizeRollupScopeId("  creator_a  ")).toBe("creator_a");
  });
});

describe("platform metric daily rollup service (PMD-050)", () => {
  it("upserts idempotently on the same grain", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "rollup_1",
      metricKey: "activity.feed_opens",
      dayUtc: new Date("2026-05-25T00:00:00.000Z"),
      scope: "system",
      scopeId: "",
      value: { toNumber: () => 12, valueOf: () => 12 },
      dimensions: {},
      sourceFreshness: { source_updated_at: "2026-05-25T18:00:00.000Z" },
      generatedAt: new Date("2026-05-25T18:05:00.000Z")
    });

    const prisma = {
      platformMetricDailyRollup: { upsert, findFirst: vi.fn(), findUnique: vi.fn() }
    } as never;

    const row = await upsertPlatformMetricDailyRollup(prisma, {
      metricKey: "activity.feed_opens",
      dayUtc: "2026-05-25",
      scope: "system",
      value: 12,
      sourceFreshness: { source_updated_at: "2026-05-25T18:00:00.000Z", writer: "test" }
    });

    expect(row.metricKey).toBe("activity.feed_opens");
    expect(row.value).toBe(12);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("reads latest generated_at", async () => {
    const generatedAt = new Date("2026-05-25T19:00:00.000Z");
    const prisma = {
      platformMetricDailyRollup: {
        findFirst: vi.fn().mockResolvedValue({ generatedAt })
      }
    } as never;
    const latest = await getLatestPlatformMetricRollupGeneratedAt(prisma);
    expect(latest?.toISOString()).toBe(generatedAt.toISOString());
  });
});
