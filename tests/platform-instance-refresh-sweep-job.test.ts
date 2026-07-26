import { describe, expect, it, vi } from "vitest";

vi.mock("../src/analytics/external-metric-rollup-service.js", () => ({
  computeDailyRollups: vi.fn().mockResolvedValue({
    creator_id: "creator_a",
    upserted: 2,
    since: "2026-06-29T00:00:00.000Z",
    until: "2026-07-01T12:00:00.000Z"
  })
}));

import { runPlatformInstanceRefreshSweepOnce } from "../src/analytics/platform-instance-refresh-sweep-job.js";

describe("runPlatformInstanceRefreshSweepOnce", () => {
  it("refreshes stale relay instances and marks external instances stale", async () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const update = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "pi_relay_post_a",
        creatorId: "creator_a",
        postId: "post_a",
        destination: "relay",
        externalUrl: null,
        externalId: null,
        attemptId: null,
        linkSource: "relay_native",
        status: "active",
        refreshPolicy: "conservative",
        linkedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastRefreshedAt: null,
        lastManualRefreshRequestedAt: null
      },
      {
        id: "pi_attempt_1",
        creatorId: "creator_a",
        postId: "post_a",
        destination: "patreon",
        externalUrl: "https://patreon.com/posts/1",
        externalId: null,
        attemptId: "attempt_1",
        linkSource: "autopost_success",
        status: "active",
        refreshPolicy: "conservative",
        linkedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastRefreshedAt: new Date("2026-06-20T00:00:00.000Z"),
        lastManualRefreshRequestedAt: null
      }
    ]);

    const prisma = {
      platformInstance: { findMany, update, updateMany }
    };

    const result = await runPlatformInstanceRefreshSweepOnce({
      prisma: prisma as never,
      now
    });

    expect(result.instances_scanned).toBe(2);
    expect(result.relay_refreshed).toBe(1);
    expect(result.marked_stale).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pi_attempt_1" },
        data: expect.objectContaining({ status: "stale" })
      })
    );
  });
});
