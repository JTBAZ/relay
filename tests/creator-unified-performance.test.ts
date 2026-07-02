import { describe, expect, it, vi } from "vitest";
import {
  aggregateRollupRows,
  getCreatorUnifiedPerformance,
  parseUnifiedPerformanceRange,
  resolveUnifiedPerformanceWindow
} from "../src/analytics/creator-unified-performance.js";

describe("parseUnifiedPerformanceRange", () => {
  it("defaults to 30d and accepts supported values", () => {
    expect(parseUnifiedPerformanceRange(undefined)).toBe("30d");
    expect(parseUnifiedPerformanceRange("7d")).toBe("7d");
    expect(parseUnifiedPerformanceRange("90d")).toBe("90d");
    expect(parseUnifiedPerformanceRange("invalid")).toBe("30d");
  });
});

describe("aggregateRollupRows", () => {
  it("sums deltas into totals, destinations, daily series, and top posts", () => {
    const aggregated = aggregateRollupRows([
      {
        postId: "post_a",
        destination: "patreon",
        metricType: "likes",
        day: new Date("2026-06-29T00:00:00.000Z"),
        value: 10,
        deltaFromPrior: 5,
        computedAt: new Date("2026-06-29T12:00:00.000Z")
      },
      {
        postId: "post_a",
        destination: "patreon",
        metricType: "impressions",
        day: new Date("2026-06-30T00:00:00.000Z"),
        value: 120,
        deltaFromPrior: 20,
        computedAt: new Date("2026-06-30T12:00:00.000Z")
      },
      {
        postId: "post_b",
        destination: "x",
        metricType: "likes",
        day: new Date("2026-06-30T00:00:00.000Z"),
        value: 8,
        deltaFromPrior: 3,
        computedAt: new Date("2026-06-30T13:00:00.000Z")
      }
    ]);

    expect(aggregated.totals).toEqual({
      impressions: 20,
      seen: 0,
      likes: 8,
      comments: 0,
      views: 0
    });
    expect(aggregated.by_destination).toEqual([
      { destination: "patreon", impressions: 20, seen: 0, likes: 5, comments: 0, views: 0 },
      { destination: "x", impressions: 0, seen: 0, likes: 3, comments: 0, views: 0 }
    ]);
    expect(aggregated.daily_series).toEqual([
      { day: "2026-06-29", impressions: 0, seen: 0, likes: 5, comments: 0, views: 0 },
      { day: "2026-06-30", impressions: 20, seen: 0, likes: 3, comments: 0, views: 0 }
    ]);
    expect(aggregated.top_posts[0]).toMatchObject({
      postId: "post_a",
      totalReach: 20
    });
  });
});

describe("getCreatorUnifiedPerformance", () => {
  it("returns NO_TENANT when tenant is missing", async () => {
    const prisma = { tenant: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(getCreatorUnifiedPerformance(prisma as never, "creator_x")).resolves.toEqual({
      ok: false,
      code: "NO_TENANT"
    });
  });

  it("reads rollup rows when present and surfaces relay destination", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          {
            postId: "post_a",
            destination: "patreon",
            metricType: "likes",
            day: new Date("2026-06-30T00:00:00.000Z"),
            value: 12,
            deltaFromPrior: 2,
            computedAt: new Date("2026-06-30T18:00:00.000Z")
          },
          {
            postId: "post_a",
            destination: "relay",
            metricType: "views",
            day: new Date("2026-06-30T00:00:00.000Z"),
            value: 9,
            deltaFromPrior: 9,
            computedAt: new Date("2026-06-30T18:00:00.000Z")
          }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "post_a",
            versions: [{ title: "Alpha" }]
          }
        ])
      }
    };

    const out = await getCreatorUnifiedPerformance(prisma as never, "creator_x", {
      range: "7d",
      asOf: new Date("2026-06-30T20:00:00.000Z")
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.source).toBe("rollup");
    expect(out.report.totals.likes).toBe(2);
    expect(out.report.by_destination).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: "patreon", likes: 2 }),
        expect.objectContaining({ destination: "relay", views: 9 })
      ])
    );
    expect(out.report.top_posts[0]).toMatchObject({
      post_id: "post_a",
      title: "Alpha"
    });
  });

  it("falls back to CSV insights when rollup table is empty", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      externalPostMetricDaily: { findMany: vi.fn().mockResolvedValue([]) },
      patreonInsightsImport: {
        findFirst: vi.fn().mockResolvedValue({ id: "import_1" })
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([
          {
            postId: "post_a",
            impressions: 100,
            seen: 80,
            likes: 10,
            comments: 2
          }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "post_a",
            versions: [{ title: "Alpha" }]
          }
        ])
      }
    };

    const out = await getCreatorUnifiedPerformance(prisma as never, "creator_x");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.source).toBe("csv_fallback");
    expect(out.report.totals.impressions).toBe(100);
    expect(out.report.by_destination[0]).toMatchObject({
      destination: "patreon",
      seen: 80
    });
  });

  it("aggregates multi-destination multi-day rollup rows", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        postId: "post_a",
        destination: "patreon",
        metricType: "impressions",
        day: new Date("2026-06-28T00:00:00.000Z"),
        value: 100,
        deltaFromPrior: 40,
        computedAt: new Date("2026-06-28T12:00:00.000Z")
      },
      {
        postId: "post_a",
        destination: "patreon",
        metricType: "impressions",
        day: new Date("2026-06-29T00:00:00.000Z"),
        value: 150,
        deltaFromPrior: 50,
        computedAt: new Date("2026-06-29T12:00:00.000Z")
      },
      {
        postId: "post_b",
        destination: "x",
        metricType: "likes",
        day: new Date("2026-06-29T00:00:00.000Z"),
        value: 8,
        deltaFromPrior: 3,
        computedAt: new Date("2026-06-29T13:00:00.000Z")
      },
      {
        postId: "post_b",
        destination: "relay",
        metricType: "views",
        day: new Date("2026-06-30T00:00:00.000Z"),
        value: 12,
        deltaFromPrior: 12,
        computedAt: new Date("2026-06-30T18:00:00.000Z")
      }
    ]);

    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      externalPostMetricDaily: { findMany },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_a", versions: [{ title: "Alpha" }] },
          { id: "post_b", versions: [{ title: "Beta" }] }
        ])
      }
    };

    const out = await getCreatorUnifiedPerformance(prisma as never, "creator_x", {
      range: "7d",
      asOf: new Date("2026-06-30T20:00:00.000Z")
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.source).toBe("rollup");
    expect(out.report.rollup_computed_at).toBe("2026-06-30T18:00:00.000Z");
    expect(out.report.totals).toMatchObject({
      impressions: 90,
      likes: 3,
      views: 12
    });
    expect(out.report.by_destination).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: "patreon", impressions: 90 }),
        expect.objectContaining({ destination: "x", likes: 3 }),
        expect.objectContaining({ destination: "relay", views: 12 })
      ])
    );
    expect(out.report.daily_series).toHaveLength(3);
    expect(out.report.top_posts[0]).toMatchObject({
      post_id: "post_a",
      title: "Alpha",
      total_reach: 90
    });
  });

  it("passes destination filter through to rollup query", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      externalPostMetricDaily: { findMany },
      patreonInsightsImport: { findFirst: vi.fn().mockResolvedValue(null) },
      post: { findMany: vi.fn().mockResolvedValue([]) }
    };

    await getCreatorUnifiedPerformance(prisma as never, "creator_x", {
      destination: "patreon"
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destination: "patreon"
        })
      })
    );
  });
});

describe("resolveUnifiedPerformanceWindow", () => {
  it("builds a 7-day UTC window ending at as_of", () => {
    const asOf = new Date("2026-06-30T15:00:00.000Z");
    const { start, end } = resolveUnifiedPerformanceWindow("7d", asOf);
    expect(end.toISOString()).toBe(asOf.toISOString());
    expect(start.toISOString()).toBe("2026-06-23T00:00:00.000Z");
  });
});
