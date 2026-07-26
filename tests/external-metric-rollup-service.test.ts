import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  attachDeltaFromPrior,
  buildDailyCandidatesFromSnapshots,
  buildRelayEngagementDailyCandidates,
  buildRelayTelemetryDailyCandidates,
  compareMetricSourcePrecedence,
  computeDailyRollups,
  computeDeltaFromPrior,
  formatMetricRollupDay,
  mapRelayEngagementEventToMetric,
  mapRelayTelemetryEventToMetric,
  mergeDailyRollupCandidates,
  overlayCsvDailyCandidates
} from "../src/analytics/external-metric-rollup-service.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const POST_ID = "post_test_001";

describe("attachDeltaFromPrior", () => {
  it("derives delta from prior-day rows in the same batch", () => {
    const rows = attachDeltaFromPrior(
      [
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "patreon",
          metricType: "likes",
          day: "2026-06-29",
          value: 5,
          source: "extension_dom"
        },
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "patreon",
          metricType: "likes",
          day: "2026-06-30",
          value: 12,
          source: "extension_dom"
        }
      ],
      new Map()
    );

    expect(rows[0]?.deltaFromPrior).toBeNull();
    expect(rows[1]?.deltaFromPrior).toBe(7);
  });

  it("falls back to stored prior-day values outside the batch", () => {
    const priorValues = new Map([
      [`${POST_ID}|patreon|likes|2026-06-29`, 3]
    ]);
    const rows = attachDeltaFromPrior(
      [
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "patreon",
          metricType: "likes",
          day: "2026-06-30",
          value: 10,
          source: "extension_dom"
        }
      ],
      priorValues
    );

    expect(rows[0]?.deltaFromPrior).toBe(7);
  });
});

describe("external metric rollup helpers", () => {
  it("formats UTC calendar days", () => {
    expect(formatMetricRollupDay(new Date("2026-06-30T23:59:59.000Z"))).toBe("2026-06-30");
  });

  it("ranks platform_api above extension_dom and third_party", () => {
    expect(compareMetricSourcePrecedence("platform_api", "extension_dom")).toBeLessThan(0);
    expect(compareMetricSourcePrecedence("extension_dom", "third_party")).toBeLessThan(0);
  });

  it("computes delta from prior day value", () => {
    expect(computeDeltaFromPrior(15, 12)).toBe(3);
    expect(computeDeltaFromPrior(15, null)).toBeNull();
  });
});

describe("buildDailyCandidatesFromSnapshots", () => {
  it("picks the best source and latest capture within a day", () => {
    const candidates = buildDailyCandidatesFromSnapshots(CREATOR_ID, [
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 10,
        source: "extension_dom",
        capturedAt: new Date("2026-06-30T10:00:00.000Z")
      },
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 12,
        source: "platform_api",
        capturedAt: new Date("2026-06-30T09:00:00.000Z")
      },
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 11,
        source: "extension_dom",
        capturedAt: new Date("2026-06-30T18:00:00.000Z")
      }
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      postId: POST_ID,
      destination: "patreon",
      metricType: "likes",
      day: "2026-06-30",
      value: 12,
      source: "platform_api"
    });
  });

  it("ignores snapshots with null values", () => {
    const candidates = buildDailyCandidatesFromSnapshots(CREATOR_ID, [
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "impressions",
        value: null,
        source: "extension_dom",
        capturedAt: new Date("2026-06-30T10:00:00.000Z")
      }
    ]);
    expect(candidates).toHaveLength(0);
  });
});

describe("overlayCsvDailyCandidates", () => {
  it("fills patreon metrics only when no snapshot row exists for that day", () => {
    const existing = buildDailyCandidatesFromSnapshots(CREATOR_ID, [
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 8,
        source: "extension_dom",
        capturedAt: new Date("2026-06-30T12:00:00.000Z")
      }
    ]);

    const merged = overlayCsvDailyCandidates(CREATOR_ID, existing, [
      {
        postId: POST_ID,
        impressions: 100,
        seen: 80,
        likes: 99,
        comments: 4,
        asOf: new Date("2026-06-30T00:00:00.000Z"),
        import: { uploadedAt: new Date("2026-06-29T00:00:00.000Z") }
      }
    ]);

    expect(merged.find((row) => row.metricType === "likes")?.value).toBe(8);
    expect(merged.find((row) => row.metricType === "impressions")).toMatchObject({
      value: 100,
      source: "third_party",
      destination: "patreon"
    });
    expect(merged.find((row) => row.metricType === "seen")?.value).toBe(80);
  });

  it("keeps extension_dom snapshot over CSV for the same metric/day", () => {
    const existing = buildDailyCandidatesFromSnapshots(CREATOR_ID, [
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 8,
        source: "extension_dom",
        capturedAt: new Date("2026-06-30T12:00:00.000Z")
      }
    ]);

    const merged = overlayCsvDailyCandidates(CREATOR_ID, existing, [
      {
        postId: POST_ID,
        impressions: null,
        seen: null,
        likes: 99,
        comments: null,
        asOf: new Date("2026-06-30T00:00:00.000Z"),
        import: { uploadedAt: new Date("2026-06-29T00:00:00.000Z") }
      }
    ]);

    expect(merged.find((row) => row.metricType === "likes")).toMatchObject({
      value: 8,
      source: "extension_dom"
    });
  });

  it("replaces third_party snapshot with CSV for the same metric/day", () => {
    const existing = buildDailyCandidatesFromSnapshots(CREATOR_ID, [
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        value: 5,
        source: "third_party",
        capturedAt: new Date("2026-06-30T12:00:00.000Z")
      }
    ]);

    const merged = overlayCsvDailyCandidates(CREATOR_ID, existing, [
      {
        postId: POST_ID,
        impressions: null,
        seen: null,
        likes: 42,
        comments: null,
        asOf: new Date("2026-06-30T00:00:00.000Z"),
        import: { uploadedAt: new Date("2026-06-29T00:00:00.000Z") }
      }
    ]);

    expect(merged.find((row) => row.metricType === "likes")).toMatchObject({
      value: 42,
      source: "third_party"
    });
  });
});

describe("buildRelayEngagementDailyCandidates", () => {
  it("counts post-scoped relay engagement events by day", () => {
    const candidates = buildRelayEngagementDailyCandidates(CREATOR_ID, [
      {
        postId: POST_ID,
        eventType: "gallery_view",
        occurredAt: new Date("2026-06-30T10:00:00.000Z")
      },
      {
        postId: POST_ID,
        eventType: "gallery_view",
        occurredAt: new Date("2026-06-30T18:00:00.000Z")
      },
      {
        postId: null,
        eventType: "gallery_view",
        occurredAt: new Date("2026-06-30T18:00:00.000Z")
      }
    ]);

    expect(candidates).toEqual([
      {
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "relay",
        metricType: "views",
        day: "2026-06-30",
        value: 2,
        source: "manual"
      }
    ]);
  });

  it("maps reveal interactions to reveal_interactions", () => {
    expect(mapRelayEngagementEventToMetric("reveal_interaction")).toBe("reveal_interactions");
  });
});

describe("buildRelayTelemetryDailyCandidates", () => {
  it("counts post_view, post_liked, and comment_created telemetry by post/day", () => {
    const candidates = buildRelayTelemetryDailyCandidates(CREATOR_ID, [
      {
        eventName: "post_view",
        occurredAt: new Date("2026-06-30T10:00:00.000Z"),
        creatorId: CREATOR_ID,
        payload: { post_id: POST_ID }
      },
      {
        eventName: "post_liked",
        occurredAt: new Date("2026-06-30T10:00:00.000Z"),
        creatorId: CREATOR_ID,
        payload: { post_id: POST_ID }
      },
      {
        eventName: "comment_created",
        occurredAt: new Date("2026-06-30T11:00:00.000Z"),
        creatorId: CREATOR_ID,
        payload: { post_id: POST_ID }
      },
      {
        eventName: "post_view",
        occurredAt: new Date("2026-06-30T12:00:00.000Z"),
        creatorId: CREATOR_ID,
        payload: {}
      }
    ]);

    expect(candidates).toEqual([
      {
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "relay",
        metricType: "views",
        day: "2026-06-30",
        value: 1,
        source: "manual"
      },
      {
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "relay",
        metricType: "likes",
        day: "2026-06-30",
        value: 1,
        source: "manual"
      },
      {
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "relay",
        metricType: "comments",
        day: "2026-06-30",
        value: 1,
        source: "manual"
      }
    ]);
  });

  it("maps telemetry event names to rollup metrics", () => {
    expect(mapRelayTelemetryEventToMetric("post_view")).toBe("views");
    expect(mapRelayTelemetryEventToMetric("post_liked")).toBe("likes");
    expect(mapRelayTelemetryEventToMetric("comment_created")).toBe("comments");
  });
});

describe("mergeDailyRollupCandidates", () => {
  it("dedupes duplicate relay grains by taking the max count", () => {
    const merged = mergeDailyRollupCandidates([
      [
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "relay",
          metricType: "views",
          day: "2026-06-30",
          value: 2,
          source: "manual"
        }
      ],
      [
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "relay",
          metricType: "views",
          day: "2026-06-30",
          value: 5,
          source: "manual"
        }
      ]
    ]);

    expect(merged).toEqual([
      {
        creatorId: CREATOR_ID,
        postId: POST_ID,
        destination: "relay",
        metricType: "views",
        day: "2026-06-30",
        value: 5,
        source: "manual"
      }
    ]);
  });
});

describe("attachDeltaFromPrior", () => {
  it("uses prior-day values from the database map and same batch", () => {
    const priorValues = new Map<string, number>([
      [`${POST_ID}|patreon|likes|2026-06-29`, 5]
    ]);

    const rows = attachDeltaFromPrior(
      [
        {
          creatorId: CREATOR_ID,
          postId: POST_ID,
          destination: "patreon",
          metricType: "likes",
          day: "2026-06-30",
          value: 12,
          source: "platform_api"
        }
      ],
      priorValues
    );

    expect(rows[0]?.deltaFromPrior).toBe(7);
  });
});

describe("computeDailyRollups", () => {
  it("loads sources, merges overlays, and upserts daily rows", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const findManyDaily = vi.fn().mockResolvedValue([
      {
        postId: POST_ID,
        destination: "patreon",
        metricType: "likes",
        day: new Date("2026-06-29T00:00:00.000Z"),
        value: 5
      }
    ]);

    const prisma = {
      externalPostMetricSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            postId: POST_ID,
            destination: "patreon",
            metricType: "likes",
            value: 12,
            source: "extension_dom",
            capturedAt: new Date("2026-06-30T12:00:00.000Z")
          }
        ])
      },
      patreonInsightsImport: {
        findFirst: vi.fn().mockResolvedValue({ id: "import_1" })
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue([
          {
            postId: POST_ID,
            impressions: 200,
            seen: 150,
            likes: null,
            comments: null,
            asOf: new Date("2026-06-30T00:00:00.000Z"),
            import: { uploadedAt: new Date("2026-06-29T00:00:00.000Z") }
          }
        ])
      },
      relayEngagementEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            postId: POST_ID,
            eventType: "gallery_view",
            occurredAt: new Date("2026-06-30T15:00:00.000Z")
          }
        ])
      },
      platformTelemetryEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            eventName: "post_view",
            occurredAt: new Date("2026-06-30T15:00:00.000Z"),
            creatorId: CREATOR_ID,
            payload: { post_id: POST_ID }
          }
        ])
      },
      externalPostMetricDaily: {
        findMany: findManyDaily,
        upsert
      }
    } as unknown as PrismaClient;

    const result = await computeDailyRollups(prisma, CREATOR_ID, {
      since: new Date("2026-06-29T00:00:00.000Z"),
      until: new Date("2026-06-30T23:59:59.000Z"),
      computedAt: new Date("2026-06-30T20:00:00.000Z")
    });

    expect(result.upserted).toBe(4);
    expect(upsert).toHaveBeenCalledTimes(4);

    const likesUpsert = upsert.mock.calls.find(
      (call) => call[0]?.create?.metricType === "likes"
    );
    expect(likesUpsert?.[0]?.create).toMatchObject({
      creatorId: CREATOR_ID,
      postId: POST_ID,
      destination: "patreon",
      metricType: "likes",
      value: 12,
      deltaFromPrior: 7,
      source: "extension_dom"
    });

    const impressionsUpsert = upsert.mock.calls.find(
      (call) => call[0]?.create?.metricType === "impressions"
    );
    expect(impressionsUpsert?.[0]?.create).toMatchObject({
      value: 200,
      source: "third_party"
    });

    const relayUpsert = upsert.mock.calls.find(
      (call) => call[0]?.create?.destination === "relay"
    );
    expect(relayUpsert?.[0]?.create).toMatchObject({
      metricType: "views",
      value: 1
    });
  });

  it("returns zero upserts for blank creator id", async () => {
    const prisma = {} as PrismaClient;
    const result = await computeDailyRollups(prisma, "  ");
    expect(result.upserted).toBe(0);
  });
});
