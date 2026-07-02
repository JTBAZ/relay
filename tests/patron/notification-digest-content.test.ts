import { describe, expect, it, vi } from "vitest";
import { GalleryVisibility } from "@prisma/client";
import { assembleDigestContentForPatron } from "../../src/patron/notification-digest-content.js";

describe("assembleDigestContentForPatron", () => {
  it("omits hidden and mature posts when patron hide_mature_content is true", async () => {
    const periodStart = new Date("2026-04-01T00:00:00.000Z");
    const periodEnd = new Date("2026-04-30T00:00:00.000Z");
    const posts = [
      {
        id: "post_general",
        creatorId: "rc_a",
        mediaAssets: [],
        versions: [
          {
            title: "General",
            description: null,
            publishedAt: new Date("2026-04-10T00:00:00.000Z")
          }
        ],
        presentation: null
      },
      {
        id: "post_mature",
        creatorId: "rc_a",
        mediaAssets: [],
        versions: [
          {
            title: "Mature",
            description: null,
            publishedAt: new Date("2026-04-11T00:00:00.000Z")
          }
        ],
        presentation: null
      },
      {
        id: "post_hidden",
        creatorId: "rc_a",
        mediaAssets: [],
        versions: [
          {
            title: "Hidden",
            description: null,
            publishedAt: new Date("2026-04-12T00:00:00.000Z")
          }
        ],
        presentation: null
      }
    ];

    const prisma = {
      patronFollow: {
        findMany: vi.fn().mockResolvedValue([{ relayCreatorId: "rc_a" }])
      },
      patronProfile: {
        findUnique: vi.fn().mockResolvedValue({
          tenantMembershipId: "mem1",
          hideMatureContent: true,
          handle: "patron1",
          handleNorm: "patron1"
        })
      },
      creatorProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            tenant: { relayCreatorId: "rc_a" },
            displayName: "Creator A",
            username: null,
            publicSlug: null
          }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue(posts)
      },
      postOverride: {
        findMany: vi.fn().mockResolvedValue([
          {
            creatorId: "rc_a",
            postId: "post_mature",
            mediaId: "",
            visibility: GalleryVisibility.review,
            addTagIds: [],
            removeTagIds: [],
            discoveryEligible: false
          },
          {
            creatorId: "rc_a",
            postId: "post_hidden",
            mediaId: "",
            visibility: GalleryVisibility.hidden,
            addTagIds: [],
            removeTagIds: [],
            discoveryEligible: false
          }
        ])
      }
    };

    const payload = await assembleDigestContentForPatron(prisma as never, {
      patronMembershipId: "mem1",
      periodStart,
      periodEnd,
      webBaseUrl: "https://relay.test"
    });

    expect(payload.total_posts).toBe(1);
    expect(payload.creators).toHaveLength(1);
    expect(payload.creators[0]!.posts.map((p) => p.post_id)).toEqual(["post_general"]);
  });
});
