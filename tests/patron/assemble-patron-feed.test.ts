import { describe, expect, it, vi } from "vitest";
import { assemblePatronFeed } from "../../src/patron/assemble-patron-feed.js";

function healthyEntitlementSnapshot(args: {
  relayCreatorId: string;
  patronMembershipId: string;
  entitledTierIds?: string[];
  staleAfter?: Date | null;
}) {
  const {
    relayCreatorId,
    patronMembershipId,
    entitledTierIds = [],
    staleAfter = new Date("2099-01-01T00:00:00.000Z")
  } = args;
  return {
    patronMembershipId,
    relayCreatorId,
    entitledTierIds,
    active: true,
    asOf: new Date("2026-01-01T00:00:00.000Z"),
    staleAfter
  };
}

describe("assemblePatronFeed", () => {
  it("returns empty feed when there are no follows", async () => {
    const prisma = {
      patronFollow: { findMany: vi.fn().mockResolvedValue([]) },
      patronEntitlementSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      creatorProfile: { findMany: vi.fn().mockResolvedValue([]) },
      post: { findMany: vi.fn() },
      patronProfile: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });
    expect(bundle.feedPosts).toEqual([]);
    expect(bundle.followedCreators).toEqual([]);
    expect(bundle.discoverItems).toEqual([]);
    expect(bundle.notifications).toEqual([]);
    expect(bundle.currentViewer.handle).toBe("a");
    expect(bundle.entitlement_degraded).toBe(false);
    expect(bundle.entitlement_stale_since).toBeNull();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  function buildPrismaWithOnePost(opts: {
    mediaId: string | null;
    storageKey: string | null;
    isPublic?: boolean;
  }) {
    const post = {
      id: "post_orbitals",
      creatorId: "rc_relaytest",
      isPublic: opts.isPublic ?? true,
      versions: [
        {
          versionSeq: 1,
          publishedAt: new Date("2026-04-11T20:18:50.000Z"),
          title: "Orbitals",
          description: "Orbitals",
          tierIds: []
        }
      ],
      mediaAssets:
        opts.mediaId == null
          ? []
          : [
              {
                id: opts.mediaId,
                currentMimeType: "image/png",
                currentUpstreamUrl: "https://patreon.example/cdn/should-not-be-used.png",
                currentStorageKey: opts.storageKey
              }
            ]
    };
    return {
      patronFollow: {
        findMany: vi.fn().mockResolvedValue([
          { relayCreatorId: "rc_relaytest", createdAt: new Date() }
        ])
      },
      patronEntitlementSnapshot: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            healthyEntitlementSnapshot({
              relayCreatorId: "rc_relaytest",
              patronMembershipId: "mem1",
              entitledTierIds: []
            })
          ])
      },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      creatorProfile: {
        findMany: vi.fn().mockResolvedValue([
          { tenant: { relayCreatorId: "rc_relaytest" }, publicSlug: "jordanmtaylor93" }
        ])
      },
      post: { findMany: vi.fn().mockResolvedValue([post]) },
      patronProfile: { findUnique: vi.fn().mockResolvedValue(null) }
    };
  }

  it("emits unblurred /content for image card thumb + playback (no visitor /preview)", async () => {
    const prisma = buildPrismaWithOnePost({
      mediaId: "media_xyz",
      storageKey: "media/media_xyz/asset"
    });
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "free@example.com"
    });
    expect(bundle.feedPosts).toHaveLength(1);
    const post = bundle.feedPosts[0]!;
    expect(post.primaryMimeType).toBe("image/png");
    expect(post.coverImageUrl).toBe(
      "/api/v1/export/media/rc_relaytest/media_xyz/content"
    );
    expect(post.highResImageUrl).toBe(
      "/api/v1/export/media/rc_relaytest/media_xyz/content"
    );
    // Defensive: never leak the raw upstream Patreon URL — cross-origin <img> loads
    // would 403/404 because Patreon CDN gates by Patreon session cookie.
    expect(post.coverImageUrl).not.toContain("patreon.example");
    expect(post.highResImageUrl).not.toContain("patreon.example");
    expect(post.feed_item_source).toBe("discover");
    expect(post.kind).toBe("discovery");
  });

  it("omits coverImageUrl for video (UI uses poster or video thumb)", async () => {
    const post = {
      id: "post_vid",
      creatorId: "rc_relaytest",
      isPublic: true,
      versions: [
        {
          versionSeq: 1,
          publishedAt: new Date("2026-04-11T20:18:50.000Z"),
          title: "Clip",
          description: "Clip",
          tierIds: []
        }
      ],
      mediaAssets: [
        {
          id: "media_v1",
          currentMimeType: "video/mp4",
          currentUpstreamUrl: "https://patreon.example/v.mp4",
          currentStorageKey: "media/media_v1/asset"
        }
      ]
    };
    const prisma = {
      patronFollow: {
        findMany: vi.fn().mockResolvedValue([
          { relayCreatorId: "rc_relaytest", createdAt: new Date() }
        ])
      },
      patronEntitlementSnapshot: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            healthyEntitlementSnapshot({
              relayCreatorId: "rc_relaytest",
              patronMembershipId: "mem1",
              entitledTierIds: []
            })
          ])
      },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      creatorProfile: {
        findMany: vi.fn().mockResolvedValue([
          { tenant: { relayCreatorId: "rc_relaytest" }, publicSlug: "slug" }
        ])
      },
      post: { findMany: vi.fn().mockResolvedValue([post]) },
      patronProfile: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });
    const fp = bundle.feedPosts[0]!;
    expect(fp.mediaType).toBe("video");
    expect(fp.primaryMimeType).toBe("video/mp4");
    expect(fp.coverImageUrl).toBeUndefined();
    expect(fp.highResImageUrl).toBe(
      "/api/v1/export/media/rc_relaytest/media_v1/content"
    );
  });

  it("falls back to placeholder when export blob hasn't been materialized yet", async () => {
    const prisma = buildPrismaWithOnePost({
      mediaId: "media_xyz",
      storageKey: null
    });
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "free@example.com"
    });
    expect(bundle.feedPosts).toHaveLength(1);
    const post = bundle.feedPosts[0]!;
    expect(post.coverImageUrl).toMatch(/^\/placeholder\.svg/);
    expect(post.highResImageUrl).toMatch(/^\/placeholder\.svg/);
  });

  it("falls back to placeholder when the post has no media at all", async () => {
    const prisma = buildPrismaWithOnePost({ mediaId: null, storageKey: null });
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "free@example.com"
    });
    const post = bundle.feedPosts[0]!;
    expect(post.coverImageUrl).toMatch(/^\/placeholder\.svg/);
  });

  // PE-C P0 — davoicework's regression: a Free Tier member sees only public posts,
  // sidebar shows "Free", and `relay_tier_all_patrons` posts are hidden from her.
  it("Free Tier member: public visible, all_patrons hidden, sidebar label is Free", async () => {
    const now = new Date("2026-04-11T20:18:50.000Z");
    const publicPost = {
      id: "p_public",
      creatorId: "rc_relaytest",
      isPublic: false,
      versions: [
        {
          versionSeq: 1,
          publishedAt: new Date(now.getTime() + 2000),
          title: "Orbitals",
          description: "Orbitals",
          tierIds: ["relay_tier_public"]
        }
      ],
      mediaAssets: []
    };
    const allPatronsPost = {
      id: "p_all",
      creatorId: "rc_relaytest",
      isPublic: false,
      versions: [
        {
          versionSeq: 1,
          publishedAt: new Date(now.getTime() + 1000),
          title: "Test post 7",
          description: "Members only",
          tierIds: ["relay_tier_all_patrons"]
        }
      ],
      mediaAssets: []
    };
    const advancedPost = {
      id: "p_advanced",
      creatorId: "rc_relaytest",
      isPublic: false,
      versions: [
        {
          versionSeq: 1,
          publishedAt: now,
          title: "Advanced Post",
          description: "$10 only",
          tierIds: ["patreon_tier_advanced"]
        }
      ],
      mediaAssets: []
    };
    const prisma = {
      patronFollow: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ relayCreatorId: "rc_relaytest", createdAt: now }])
      },
      patronEntitlementSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            patronMembershipId: "mem1",
            relayCreatorId: "rc_relaytest",
            entitledTierIds: ["patreon_tier_free"],
            active: true,
            asOf: now,
            staleAfter: new Date("2099-01-01T00:00:00.000Z")
          }
        ])
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            relayTierId: "patreon_tier_free",
            creatorId: "rc_relaytest",
            campaignId: "patreon_campaign_x",
            title: "Free",
            amountCents: 0,
            upstreamUpdatedAt: now,
            versionSeq: 1
          },
          {
            relayTierId: "patreon_tier_advanced",
            creatorId: "rc_relaytest",
            campaignId: "patreon_campaign_x",
            title: "Advanced",
            amountCents: 1000,
            upstreamUpdatedAt: now,
            versionSeq: 1
          }
        ])
      },
      creatorProfile: {
        findMany: vi.fn().mockResolvedValue([
          { tenant: { relayCreatorId: "rc_relaytest" }, publicSlug: "jordanmtaylor93" }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([publicPost, allPatronsPost, advancedPost])
      },
      patronProfile: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "davoicework@example.com"
    });

    const ids = bundle.feedPosts.map((p) => p.id);
    expect(ids).toContain("p_public");
    expect(ids).not.toContain("p_all"); // member_only blocked
    expect(ids).not.toContain("p_advanced"); // tier_gated blocked
    const pub = bundle.feedPosts.find((p) => p.id === "p_public");
    expect(pub?.feed_item_source).toBe("subscribed");
    expect(pub?.kind).toBe("followed");
    expect(bundle.followedCreators).toHaveLength(1);
    expect(bundle.followedCreators[0]!.patronTierLabel).toBe("Free");
  });

  // Companion: paying patron at Advanced sees everything they're entitled to,
  // sidebar shows "Supporter".
  it("Paying patron at Advanced: sees public + all_patrons + advanced; sidebar is Supporter", async () => {
    const now = new Date("2026-04-11T20:18:50.000Z");
    const prisma = {
      patronFollow: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ relayCreatorId: "rc_relaytest", createdAt: now }])
      },
      patronEntitlementSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            patronMembershipId: "mem1",
            relayCreatorId: "rc_relaytest",
            entitledTierIds: ["patreon_tier_advanced"],
            active: true,
            asOf: now,
            staleAfter: new Date("2099-01-01T00:00:00.000Z")
          }
        ])
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            relayTierId: "patreon_tier_advanced",
            creatorId: "rc_relaytest",
            campaignId: "patreon_campaign_x",
            title: "Advanced",
            amountCents: 1000,
            upstreamUpdatedAt: now,
            versionSeq: 1
          }
        ])
      },
      creatorProfile: {
        findMany: vi.fn().mockResolvedValue([
          { tenant: { relayCreatorId: "rc_relaytest" }, publicSlug: "jordanmtaylor93" }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p_all",
            creatorId: "rc_relaytest",
            isPublic: false,
            versions: [
              {
                versionSeq: 1,
                publishedAt: now,
                title: "Test post 7",
                description: "Members only",
                tierIds: ["relay_tier_all_patrons"]
              }
            ],
            mediaAssets: []
          }
        ])
      },
      patronProfile: { findUnique: vi.fn().mockResolvedValue(null) }
    };

    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "supporter@example.com"
    });
    expect(bundle.feedPosts.map((p) => p.id)).toEqual(["p_all"]);
    expect(bundle.feedPosts[0]!.feed_item_source).toBe("subscribed");
    expect(bundle.feedPosts[0]!.kind).toBe("followed");
    expect(bundle.followedCreators[0]!.patronTierLabel).toBe("Supporter");
  });

  it("uses CreatorProfile identity fields for feed cards and sidebar (APD-S2)", async () => {
    const prisma = buildPrismaWithOnePost({
      mediaId: null,
      storageKey: null
    });
    prisma.creatorProfile.findMany = vi.fn().mockResolvedValue([
      {
        tenant: { relayCreatorId: "rc_relaytest" },
        publicSlug: "jordanmtaylor93",
        username: "Studio_Handle",
        usernameNorm: "studio_handle",
        displayName: "Studio Display",
        avatarUrl: "https://cdn.example/avatar.jpg",
        bannerUrl: null,
        bio: "Short bio",
        discipline: "Illustration",
        patreonCampaignId: null,
        id: "cp1",
        tenantId: "t1",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });

    const fc = bundle.followedCreators[0]!;
    expect(fc.handle).toBe("Studio_Handle");
    expect(fc.displayName).toBe("Studio Display");
    expect(fc.avatarUrl).toBe("https://cdn.example/avatar.jpg");
    expect(fc.discipline).toBe("Illustration");

    const post = bundle.feedPosts[0]!.creator;
    expect(post.handle).toBe("Studio_Handle");
    expect(post.displayName).toBe("Studio Display");
    expect(post.avatarUrl).toBe("https://cdn.example/avatar.jpg");
    expect(post.discipline).toBe("Illustration");
  });

  it("falls back to publicSlug then placeholder when identity fields are null", async () => {
    const prisma = buildPrismaWithOnePost({
      mediaId: null,
      storageKey: null
    });
    prisma.creatorProfile.findMany = vi.fn().mockResolvedValue([
      {
        tenant: { relayCreatorId: "rc_relaytest" },
        publicSlug: "onlyslug",
        username: null,
        usernameNorm: null,
        displayName: null,
        avatarUrl: null,
        bannerUrl: null,
        bio: null,
        discipline: null,
        patreonCampaignId: null,
        id: "cp1",
        tenantId: "t1",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });

    const fc = bundle.followedCreators[0]!;
    expect(fc.handle).toBe("onlyslug");
    expect(fc.displayName).toBe("onlyslug");
    expect(fc.avatarUrl).toMatch(/^\/placeholder\.svg/);
    expect(fc.discipline).toBe("");

    const post = bundle.feedPosts[0]!.creator;
    expect(post.handle).toBe("onlyslug");
    expect(post.displayName).toBe("onlyslug");
  });

  it("P6-patron-004: marks entitlement_degraded with null stale_since when a follow has no snapshot", async () => {
    const prisma = buildPrismaWithOnePost({
      mediaId: "media_xyz",
      storageKey: "media/media_xyz/asset"
    });
    prisma.patronEntitlementSnapshot.findMany = vi.fn().mockResolvedValue([]);
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });
    expect(bundle.entitlement_degraded).toBe(true);
    expect(bundle.entitlement_stale_since).toBeNull();
  });

  it("P6-patron-004: sets entitlement_stale_since to earliest overdue stale_after", async () => {
    const past = new Date("2020-06-01T12:00:00.000Z");
    const newerStale = new Date("2021-01-01T00:00:00.000Z");
    const prisma = buildPrismaWithOnePost({
      mediaId: "media_xyz",
      storageKey: "media/media_xyz/asset"
    });
    prisma.patronFollow.findMany = vi.fn().mockResolvedValue([
      { relayCreatorId: "rc_a", createdAt: new Date() },
      { relayCreatorId: "rc_b", createdAt: new Date() }
    ]);
    prisma.patronEntitlementSnapshot.findMany = vi.fn().mockResolvedValue([
      healthyEntitlementSnapshot({
        relayCreatorId: "rc_a",
        patronMembershipId: "mem1",
        entitledTierIds: [],
        staleAfter: newerStale
      }),
      healthyEntitlementSnapshot({
        relayCreatorId: "rc_b",
        patronMembershipId: "mem1",
        entitledTierIds: [],
        staleAfter: past
      })
    ]);
    prisma.creatorProfile.findMany = vi.fn().mockResolvedValue([
      { tenant: { relayCreatorId: "rc_a" }, publicSlug: "a" },
      { tenant: { relayCreatorId: "rc_b" }, publicSlug: "b" }
    ]);
    prisma.post.findMany = vi.fn().mockResolvedValue([]);
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      viewerEmail: "a@b.com"
    });
    expect(bundle.entitlement_degraded).toBe(true);
    expect(bundle.entitlement_stale_since).toBe(past.toISOString());
  });
});
