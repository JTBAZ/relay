import { describe, expect, it, vi } from "vitest";
import {
  getGalleryPlatformInstanceSummariesForPosts,
  mergeActivePlatformInstancesIntoDistributionSummary
} from "../src/gallery/platform-instance-enrichment.js";
import type { DistributionSummaryWire } from "../src/distribution/post-distribution-service.js";
import { summaryToPresence } from "../web/lib/active-post-presence.js";

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

  it("prefers platform instance contentVariantRole over member role", async () => {
    const prisma = {
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_x_promo",
            creatorId: CREATOR_ID,
            postId: "post_standalone",
            destination: "x",
            externalUrl: "https://x.com/handle/status/2",
            externalId: "2",
            attemptId: "attempt_x",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            lastManualRefreshRequestedAt: null,
            contentVariantRole: "promo"
          }
        ])
      },
      creativeWorkMember: {
        findMany: vi.fn().mockResolvedValue([
          { postId: "post_standalone", variantRole: "standalone" }
        ])
      }
    };

    const out = await getGalleryPlatformInstanceSummariesForPosts(
      prisma as never,
      CREATOR_ID,
      ["post_standalone"],
      NOW
    );

    expect(out.get("post_standalone")).toEqual([
      expect.objectContaining({
        platform_instance_id: "pi_x_promo",
        destination: "x",
        variant_role: "promo"
      })
    ]);
  });
});

describe("mergeActivePlatformInstancesIntoDistributionSummary", () => {
  it("fills Patreon external_url from active instance when no distribution rows exist", () => {
    const merged = mergeActivePlatformInstancesIntoDistributionSummary(
      undefined,
      [
        {
          platform_instance_id: "pi_manual_patreon_post_1_patreon",
          destination: "patreon",
          external_url: "https://www.patreon.com/posts/1",
          status: "active",
          last_refreshed_at: null,
          variant_role: "standalone",
          refresh_eligible: true
        }
      ],
      "patreon_post_1"
    );

    expect(merged).toEqual(
      expect.objectContaining({
        post_id: "patreon_post_1",
        destinations: expect.arrayContaining([
          expect.objectContaining({
            destination: "patreon",
            attempt_status: null,
            external_url: "https://www.patreon.com/posts/1"
          })
        ])
      })
    );

    const presence = summaryToPresence(merged);
    expect(presence.present.map((p) => p.destination)).toContain("patreon");
    expect(presence.missing).not.toContain("patreon");
  });

  it("does not overwrite a posted attempt URL", () => {
    const summary: DistributionSummaryWire = {
      post_id: "post_a",
      destinations: [
        {
          destination: "patreon",
          variant_status: "ready",
          attempt_status: "posted",
          attempt_id: "att_1",
          external_url: "https://www.patreon.com/posts/posted",
          external_id: "posted"
        },
        {
          destination: "x",
          variant_status: null,
          attempt_status: null,
          attempt_id: null,
          external_url: null,
          external_id: null
        },
        {
          destination: "deviantart",
          variant_status: null,
          attempt_status: null,
          attempt_id: null,
          external_url: null,
          external_id: null
        },
        {
          destination: "bluesky",
          variant_status: null,
          attempt_status: null,
          attempt_id: null,
          external_url: null,
          external_id: null
        }
      ]
    };

    const merged = mergeActivePlatformInstancesIntoDistributionSummary(
      summary,
      [
        {
          platform_instance_id: "pi_1",
          destination: "patreon",
          external_url: "https://www.patreon.com/posts/instance",
          status: "active",
          last_refreshed_at: null,
          variant_role: "standalone",
          refresh_eligible: true
        }
      ],
      "post_a"
    );

    expect(merged?.destinations.find((d) => d.destination === "patreon")?.external_url).toBe(
      "https://www.patreon.com/posts/posted"
    );
  });

  it("returns null when there is nothing to merge", () => {
    expect(mergeActivePlatformInstancesIntoDistributionSummary(undefined, [], "post_z")).toBeNull();
  });
});
