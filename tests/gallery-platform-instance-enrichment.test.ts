import { describe, expect, it, vi } from "vitest";
import { getGalleryPlatformInstanceSummariesForPosts } from "../src/gallery/platform-instance-enrichment.js";

const CREATOR_ID = "creator_a";
const NOW = new Date("2026-07-01T12:00:00.000Z");

describe("getGalleryPlatformInstanceSummariesForPosts", () => {
  it("returns empty map for empty post ids", async () => {
    const prisma = {
      platformInstance: { findMany: vi.fn() },
      creativeWorkMember: { findMany: vi.fn() }
    };

    const out = await getGalleryPlatformInstanceSummariesForPosts(
      prisma as never,
      CREATOR_ID,
      [],
      NOW
    );
    expect(out.size).toBe(0);
    expect(prisma.platformInstance.findMany).not.toHaveBeenCalled();
  });

  it("returns instance summaries keyed by post with variant role and refresh eligibility", async () => {
    const prisma = {
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_attempt_1",
            creatorId: CREATOR_ID,
            postId: "post_full",
            destination: "patreon",
            externalUrl: "https://patreon.com/posts/1",
            externalId: null,
            attemptId: "attempt_1",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            lastManualRefreshRequestedAt: null
          },
          {
            id: "pi_attempt_2",
            creatorId: CREATOR_ID,
            postId: "post_teaser",
            destination: "x",
            externalUrl: "https://x.com/handle/status/1",
            externalId: "1",
            attemptId: "attempt_2",
            linkSource: "manual_url_confirm",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            lastManualRefreshRequestedAt: new Date("2026-07-01T11:50:00.000Z")
          }
        ])
      },
      creativeWorkMember: {
        findMany: vi.fn().mockResolvedValue([
          { postId: "post_full", variantRole: "full" },
          { postId: "post_teaser", variantRole: "teaser" }
        ])
      }
    };

    const out = await getGalleryPlatformInstanceSummariesForPosts(
      prisma as never,
      CREATOR_ID,
      ["post_full", "post_teaser"],
      NOW
    );

    expect(out.get("post_full")).toEqual([
      {
        platform_instance_id: "pi_attempt_1",
        destination: "patreon",
        external_url: "https://patreon.com/posts/1",
        status: "active",
        last_refreshed_at: "2026-06-30T10:00:00.000Z",
        variant_role: "full",
        refresh_eligible: true
      }
    ]);
    expect(out.get("post_teaser")).toEqual([
      expect.objectContaining({
        platform_instance_id: "pi_attempt_2",
        destination: "x",
        variant_role: "teaser",
        refresh_eligible: false
      })
    ]);
  });
});
