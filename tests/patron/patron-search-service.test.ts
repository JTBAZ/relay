import { describe, expect, it, vi } from "vitest";
import { GalleryVisibility } from "@prisma/client";
import {
  assemblePatronSearch,
  normalizePatronSearchQuery,
  PatronSearchValidationError
} from "../../src/patron/patron-search-service.js";

function healthyEntitlementSnapshot(args: {
  relayCreatorId: string;
  patronMembershipId: string;
  entitledTierIds?: string[];
}) {
  return {
    patronMembershipId: args.patronMembershipId,
    relayCreatorId: args.relayCreatorId,
    entitledTierIds: args.entitledTierIds ?? [],
    active: true,
    asOf: new Date("2026-01-01T00:00:00.000Z"),
    staleAfter: new Date("2099-01-01T00:00:00.000Z")
  };
}

function buildPrismaWithPosts(
  posts: Array<Record<string, unknown>>,
  opts: {
    entitledTierIds?: string[];
    postOverrideRows?: Array<Record<string, unknown>>;
  } = {}
) {
  const now = new Date();
  return {
    patronFollow: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ relayCreatorId: "rc_relaytest", createdAt: now }])
    },
    patronEntitlementSnapshot: {
      findMany: vi.fn().mockResolvedValue([
        healthyEntitlementSnapshot({
          relayCreatorId: "rc_relaytest",
          patronMembershipId: "mem1",
          entitledTierIds: opts.entitledTierIds ?? []
        })
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
        {
          tenant: { relayCreatorId: "rc_relaytest" },
          publicSlug: "relaytest",
          displayName: "Dev Milo"
        }
      ])
    },
    post: { findMany: vi.fn().mockResolvedValue(posts) },
    postOverride: {
      findMany: vi.fn().mockResolvedValue(opts.postOverrideRows ?? [])
    }
  };
}

describe("normalizePatronSearchQuery", () => {
  it("rejects queries shorter than the minimum length", () => {
    expect(() => normalizePatronSearchQuery("a")).toThrow(PatronSearchValidationError);
    try {
      normalizePatronSearchQuery("a");
    } catch (e) {
      expect(e).toBeInstanceOf(PatronSearchValidationError);
      expect((e as PatronSearchValidationError).code).toBe("QUERY_TOO_SHORT");
    }
  });

  it("rejects queries longer than the maximum length", () => {
    expect(() => normalizePatronSearchQuery("x".repeat(201))).toThrow(
      PatronSearchValidationError
    );
  });

  it("returns trimmed query when valid", () => {
    expect(normalizePatronSearchQuery("  fox art  ")).toBe("fox art");
  });
});

describe("assemblePatronSearch", () => {
  it("returns empty bins when the patron follows no creators", async () => {
    const prisma = {
      patronFollow: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const result = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox"
    });
    expect(result.query).toBe("fox");
    expect(result.accessible.items).toEqual([]);
    expect(result.locked.items).toEqual([]);
  });

  it("matches title and description with AND token semantics", async () => {
    const posts = [
      {
        id: "p_fox",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Red fox sketch",
            description: "Watercolor study of a fox in the forest",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      },
      {
        id: "p_wolf",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-10T20:18:50.000Z"),
            title: "Wolf portrait",
            description: "Ink drawing",
            tierIds: [],
            tagIds: ["wolf"]
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const foxOnly = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox watercolor"
    });
    expect(foxOnly.accessible.items).toHaveLength(1);
    expect(foxOnly.accessible.items[0]!.post_id).toBe("p_fox");
    expect(foxOnly.accessible.items[0]!.match_fields).toEqual(
      expect.arrayContaining(["title", "description"])
    );

    const none = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox wolf"
    });
    expect(none.accessible.items).toHaveLength(0);
  });

  it("matches effective tags from PostVersion and PostOverride deltas", async () => {
    const posts = [
      {
        id: "p_tagged",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Character sheet",
            description: "Luna reference",
            tierIds: [],
            tagIds: ["luna"]
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts, {
      postOverrideRows: [
        {
          creatorId: "rc_relaytest",
          postId: "p_tagged",
          mediaId: "",
          visibility: null,
          addTagIds: ["fox-girl"],
          removeTagIds: []
        }
      ]
    });
    const byAddedTag = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox-girl"
    });
    expect(byAddedTag.accessible.items).toHaveLength(1);
    expect(byAddedTag.accessible.items[0]!.tag_ids).toEqual(
      expect.arrayContaining(["luna", "fox-girl"])
    );
    expect(byAddedTag.accessible.items[0]!.match_fields).toContain("tag");
  });

  it("splits accessible and locked matches by entitlement", async () => {
    const now = new Date();
    const posts = [
      {
        id: "p_public",
        creatorId: "rc_relaytest",
        isPublic: false,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date(now.getTime() + 2000),
            title: "Public sketch",
            description: "Everyone can see this character study",
            tierIds: ["relay_tier_public"],
            tagIds: []
          }
        ],
        mediaAssets: []
      },
      {
        id: "p_advanced",
        creatorId: "rc_relaytest",
        isPublic: false,
        versions: [
          {
            versionSeq: 1,
            publishedAt: now,
            title: "Backstage character notes",
            description: "Advanced tier only character lore",
            tierIds: ["patreon_tier_advanced"],
            tagIds: ["luna"]
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts, {
      entitledTierIds: ["patreon_tier_free"]
    });
    const result = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "character"
    });
    expect(result.accessible.items.map((h) => h.post_id)).toEqual(["p_public"]);
    expect(result.accessible.items[0]!.viewer_entitlement).toBe("visible");
    expect(result.locked.items.map((h) => h.post_id)).toEqual(["p_advanced"]);
    expect(result.locked.items[0]!.viewer_entitlement).toBe("locked");
    expect(result.locked.items[0]!.cover_url_path).toBeNull();
    expect(result.locked.items[0]!.excerpt).toBe("Backstage character notes");
  });

  it("excludes creator-hidden posts from search results", async () => {
    const now = new Date();
    const visiblePost = {
      id: "p_visible",
      creatorId: "rc_relaytest",
      isPublic: true,
      versions: [
        {
          versionSeq: 1,
          publishedAt: now,
          title: "Visible luna art",
          description: "Luna portrait",
          tierIds: [],
          tagIds: ["luna"]
        }
      ],
      mediaAssets: []
    };
    const hiddenPost = {
      id: "p_hidden",
      creatorId: "rc_relaytest",
      isPublic: true,
      versions: [
        {
          versionSeq: 1,
          publishedAt: now,
          title: "Hidden luna art",
          description: "Should not appear",
          tierIds: [],
          tagIds: ["luna"]
        }
      ],
      mediaAssets: [{ id: "media_hidden", currentMimeType: "image/png" }]
    };
    const prisma = buildPrismaWithPosts([visiblePost, hiddenPost], {
      postOverrideRows: [
        {
          creatorId: "rc_relaytest",
          postId: "p_hidden",
          mediaId: "",
          visibility: GalleryVisibility.hidden,
          addTagIds: [],
          removeTagIds: []
        }
      ]
    });
    const result = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "luna"
    });
    expect(result.accessible.items.map((h) => h.post_id)).toEqual(["p_visible"]);
    expect(result.locked.items).toEqual([]);
  });

  it("emits export cover paths for accessible hits only", async () => {
    const posts = [
      {
        id: "p_image",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Fox portrait",
            description: "Fox",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: [
          {
            id: "media_xyz",
            currentMimeType: "image/png",
            currentStorageKey: "media/media_xyz/asset"
          }
        ]
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const result = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox"
    });
    expect(result.accessible.items[0]!.cover_url_path).toBe(
      "/api/v1/export/media/rc_relaytest/media_xyz/content"
    );
  });

  it("matches creator display names and handles even when post text does not contain the query", async () => {
    const posts = [
      {
        id: "p_unrelated_title",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Spring palette study",
            description: "Color notes",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const byCreator = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "dev"
    });
    expect(byCreator.accessible.items).toHaveLength(1);
    expect(byCreator.accessible.items[0]!.match_fields).toContain("creator");
  });

  it("filters results by media type", async () => {
    const posts = [
      {
        id: "p_photo",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Fox portrait",
            description: "Fox",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: [
          {
            id: "media_photo",
            currentMimeType: "image/png",
            currentStorageKey: "media/media_photo/asset"
          }
        ]
      },
      {
        id: "p_writing",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-10T20:18:50.000Z"),
            title: "Fox lore",
            description: "Fox writing",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const photosOnly = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      media_filter: "photo"
    });
    expect(photosOnly.media_filter).toBe("photo");
    expect(photosOnly.accessible.items.map((h) => h.post_id)).toEqual(["p_photo"]);
  });

  it("sorts results oldest-first when requested", async () => {
    const posts = [
      {
        id: "p_new",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-12T20:18:50.000Z"),
            title: "Fox newest",
            description: "Fox",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      },
      {
        id: "p_old",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-10T20:18:50.000Z"),
            title: "Fox oldest",
            description: "Fox",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const oldest = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      sort: "oldest"
    });
    expect(oldest.sort).toBe("oldest");
    expect(oldest.accessible.items.map((h) => h.post_id)).toEqual(["p_old", "p_new"]);
  });

  it("browses recent posts for selected creators without a keyword query", async () => {
    const posts = [
      {
        id: "p_one",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Unrelated title",
            description: "No keyword overlap",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const browse = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "",
      creator_ids: ["rc_relaytest"]
    });
    expect(browse.query).toBe("");
    expect(browse.creator_ids).toEqual(["rc_relaytest"]);
    expect(browse.accessible.items).toHaveLength(1);
    expect(browse.accessible.items[0]!.match_fields).toEqual([]);
  });

  it("scopes keyword search to requested creator ids", async () => {
    const posts = [
      {
        id: "p_match",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Fox portrait",
            description: "Fox",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts);
    const scoped = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      creator_ids: ["rc_relaytest"]
    });
    expect(scoped.creator_ids).toEqual(["rc_relaytest"]);
    expect(scoped.accessible.items).toHaveLength(1);

    const otherCreator = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      creator_ids: ["rc_other"]
    });
    expect(otherCreator.accessible.items).toHaveLength(0);
  });

  it("excludes mature posts when hideMatureContent is true", async () => {
    const posts = [
      {
        id: "post_mature",
        creatorId: "rc_relaytest",
        isPublic: true,
        versions: [
          {
            versionSeq: 1,
            publishedAt: new Date("2026-04-11T20:18:50.000Z"),
            title: "Mature fox",
            description: "Adult content",
            tierIds: [],
            tagIds: []
          }
        ],
        mediaAssets: []
      }
    ];
    const prisma = buildPrismaWithPosts(posts, {
      postOverrideRows: [
        {
          creatorId: "rc_relaytest",
          postId: "post_mature",
          mediaId: "",
          visibility: GalleryVisibility.review,
          addTagIds: [],
          removeTagIds: []
        }
      ]
    });

    const hidden = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      hideMatureContent: true
    });
    expect(hidden.accessible.items).toHaveLength(0);

    const shown = await assemblePatronSearch({
      prisma: prisma as never,
      patronMembershipId: "mem1",
      q: "fox",
      hideMatureContent: false
    });
    expect(shown.accessible.items).toHaveLength(1);
  });
});
