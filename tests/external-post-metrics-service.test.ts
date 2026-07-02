import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ExternalPostMetricsValidationError,
  getPostExternalMetrics,
  recordExternalPostMetricSnapshots
} from "../src/distribution/external-post-metrics-service.js";
import { PostDistributionNotFoundError } from "../src/distribution/post-distribution-service.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const POST_ID = "post_test_001";
const ATTEMPT_ID = "pda_6f0d6302-0e6c-4e87-a7b0-a6a6234979e4";
const EXTERNAL_URL = "https://www.patreon.com/RelayTEST/posts/test-162544992";
const EXTERNAL_ID = "162544992";

function postedAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    variantId: "pdv_variant_001",
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "patreon",
    status: "posted",
    externalUrl: EXTERNAL_URL,
    externalId: EXTERNAL_ID,
    ...overrides
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "epms_001",
    attemptId: ATTEMPT_ID,
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "patreon",
    externalUrl: EXTERNAL_URL,
    externalId: EXTERNAL_ID,
    metricType: "likes",
    value: 12,
    raw: { label: "Likes" },
    source: "extension_dom",
    capturedAt: new Date("2026-06-30T18:10:00.000Z"),
    ...overrides
  };
}

describe("recordExternalPostMetricSnapshots", () => {
  it("inserts one snapshot row per metric for a posted linked attempt", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(snapshotRow({ id: "epms_likes", metricType: "likes", value: 12 }))
      .mockResolvedValueOnce(
        snapshotRow({ id: "epms_comments", metricType: "comments", value: 3 })
      );

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt())
      },
      externalPostMetricSnapshot: { create },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))
    } as unknown as PrismaClient;

    const snapshots = await recordExternalPostMetricSnapshots(
      prisma,
      CREATOR_ID,
      ATTEMPT_ID,
      {
        source: "extension_dom",
        metrics: [
          { metric_type: "likes", value: 12, raw: { label: "Likes" } },
          { metric_type: "comments", value: 3, raw: { label: "Comments" } }
        ]
      }
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      snapshot_id: "epms_likes",
      attempt_id: ATTEMPT_ID,
      post_id: POST_ID,
      external_url: EXTERNAL_URL,
      external_id: EXTERNAL_ID,
      metric_type: "likes",
      value: 12,
      source: "extension_dom"
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      attemptId: ATTEMPT_ID,
      postId: POST_ID,
      creatorId: CREATOR_ID,
      destination: "patreon",
      externalUrl: EXTERNAL_URL,
      externalId: EXTERNAL_ID,
      metricType: "likes",
      value: 12,
      source: "extension_dom"
    });
  });

  it("throws when the attempt is not found for the creator", async () => {
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    await expect(
      recordExternalPostMetricSnapshots(prisma, CREATOR_ID, ATTEMPT_ID, {
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      })
    ).rejects.toBeInstanceOf(PostDistributionNotFoundError);
  });

  it("rejects non-posted attempts", async () => {
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt({ status: "fill_succeeded" }))
      }
    } as unknown as PrismaClient;

    await expect(
      recordExternalPostMetricSnapshots(prisma, CREATOR_ID, ATTEMPT_ID, {
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      })
    ).rejects.toBeInstanceOf(ExternalPostMetricsValidationError);
  });

  it("rejects attempts without external_url", async () => {
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt({ externalUrl: null, externalId: null }))
      }
    } as unknown as PrismaClient;

    await expect(
      recordExternalPostMetricSnapshots(prisma, CREATOR_ID, ATTEMPT_ID, {
        source: "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      })
    ).rejects.toBeInstanceOf(ExternalPostMetricsValidationError);
  });

  it("accepts nullable metric values with raw parse diagnostics", async () => {
    const create = vi.fn().mockResolvedValue(
      snapshotRow({ metricType: "views", value: null, raw: { parse_error: "counter_not_found" } })
    );

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt())
      },
      externalPostMetricSnapshot: { create },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))
    } as unknown as PrismaClient;

    const snapshots = await recordExternalPostMetricSnapshots(
      prisma,
      CREATOR_ID,
      ATTEMPT_ID,
      {
        source: "extension_dom",
        metrics: [
          {
            metric_type: "Views",
            value: null,
            raw: { parse_error: "counter_not_found" }
          }
        ]
      }
    );

    expect(snapshots[0]?.metric_type).toBe("views");
    expect(snapshots[0]?.value).toBeNull();
    expect(snapshots[0]?.raw).toEqual({ parse_error: "counter_not_found" });
  });

  it("rejects invalid source values", async () => {
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(postedAttempt())
      }
    } as unknown as PrismaClient;

    await expect(
      recordExternalPostMetricSnapshots(prisma, CREATOR_ID, ATTEMPT_ID, {
        source: "unknown_source" as "extension_dom",
        metrics: [{ metric_type: "likes", value: 1 }]
      })
    ).rejects.toBeInstanceOf(ExternalPostMetricsValidationError);
  });
});

describe("getPostExternalMetrics", () => {
  it("returns latest metric per type for each linked posted destination", async () => {
    const prisma = {
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            attempts: [
              {
                id: ATTEMPT_ID,
                status: "posted",
                externalUrl: EXTERNAL_URL,
                externalId: EXTERNAL_ID
              }
            ]
          }
        ])
      },
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "epms_likes_new",
            attemptId: ATTEMPT_ID,
            metricType: "likes",
            value: 15,
            source: "extension_dom",
            capturedAt: new Date("2026-06-30T19:00:00.000Z")
          },
          {
            id: "epms_likes_old",
            attemptId: ATTEMPT_ID,
            metricType: "likes",
            value: 10,
            source: "extension_dom",
            capturedAt: new Date("2026-06-30T18:00:00.000Z")
          },
          {
            id: "epms_comments",
            attemptId: ATTEMPT_ID,
            metricType: "comments",
            value: 4,
            source: "extension_dom",
            capturedAt: new Date("2026-06-30T18:30:00.000Z")
          }
        ])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaClient;

    const result = await getPostExternalMetrics(prisma, CREATOR_ID, POST_ID);

    expect(result).toEqual({
      post_id: POST_ID,
      destinations: [
        {
          destination: "patreon",
          attempt_id: ATTEMPT_ID,
          external_url: EXTERNAL_URL,
          external_id: EXTERNAL_ID,
          metrics: [
            {
              snapshot_id: "epms_comments",
              metric_type: "comments",
              value: 4,
              source: "extension_dom",
              captured_at: "2026-06-30T18:30:00.000Z"
            },
            {
              snapshot_id: "epms_likes_new",
              metric_type: "likes",
              value: 15,
              source: "extension_dom",
              captured_at: "2026-06-30T19:00:00.000Z"
            }
          ]
        }
      ]
    });
  });

  it("returns empty metrics for linked destinations with no snapshots yet", async () => {
    const prisma = {
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            attempts: [
              {
                id: ATTEMPT_ID,
                status: "posted",
                externalUrl: EXTERNAL_URL,
                externalId: EXTERNAL_ID
              }
            ]
          }
        ])
      },
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaClient;

    const result = await getPostExternalMetrics(prisma, CREATOR_ID, POST_ID);

    expect(result.destinations).toEqual([
      {
        destination: "patreon",
        attempt_id: ATTEMPT_ID,
        external_url: EXTERNAL_URL,
        external_id: EXTERNAL_ID,
        metrics: []
      }
    ]);
  });

  it("excludes non-posted or unlinked destinations", async () => {
    const prisma = {
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            attempts: [
              {
                id: ATTEMPT_ID,
                status: "fill_succeeded",
                externalUrl: null,
                externalId: null
              }
            ]
          },
          {
            destination: "x",
            attempts: [
              {
                id: "pda_x",
                status: "posted",
                externalUrl: "https://x.com/user/status/1",
                externalId: "1"
              }
            ]
          }
        ])
      },
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaClient;

    const result = await getPostExternalMetrics(prisma, CREATOR_ID, POST_ID);

    expect(result.destinations).toEqual([
      {
        destination: "x",
        attempt_id: "pda_x",
        external_url: "https://x.com/user/status/1",
        external_id: "1",
        metrics: []
      }
    ]);
  });

  it("overlays Patreon Insights CSV metrics when snapshots are missing reach counters", async () => {
    const prisma = {
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            attempts: [
              {
                id: ATTEMPT_ID,
                status: "posted",
                externalUrl: EXTERNAL_URL,
                externalId: EXTERNAL_ID
              }
            ]
          }
        ])
      },
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([])
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pim_001",
            patreonPostId: EXTERNAL_ID,
            impressions: 1200,
            seen: 340,
            likes: 12,
            comments: 3,
            asOf: new Date("2026-06-30T12:00:00.000Z"),
            import: { uploadedAt: new Date("2026-06-30T13:00:00.000Z") }
          }
        ])
      }
    } as unknown as PrismaClient;

    const result = await getPostExternalMetrics(prisma, CREATOR_ID, POST_ID);

    expect(result.destinations[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric_type: "impressions", value: 1200, source: "third_party" }),
        expect.objectContaining({ metric_type: "seen", value: 340, source: "third_party" }),
        expect.objectContaining({ metric_type: "likes", value: 12, source: "third_party" }),
        expect.objectContaining({ metric_type: "comments", value: 3, source: "third_party" })
      ])
    );
  });
});
